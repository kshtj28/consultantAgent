import { v4 as uuidv4 } from 'uuid';
import { opensearchClient, INDICES } from '../config/database';
import { generateCompletion, LLMMessage, llmFactory } from './llmService';

// In-memory fallback store for when OpenSearch is unavailable
const inMemoryDocs: Map<string, {
    documentId: string;
    filename: string;
    fileType: string;
    uploadedBy: string;
    uploadedAt: Date;
    content: string;
    totalChunks: number;
    metadata: Record<string, unknown>;
}> = new Map();

// Types for knowledge base
export interface DocumentChunk {
    id: string;
    content: string;
    embedding: number[];
    documentId: string;
    filename: string;
    fileType: string;
    chunkIndex: number;
    totalChunks: number;
    uploadedBy: string;
    uploadedAt: Date;
    entities: Entity[];
    metadata: Record<string, unknown>;
}

export interface Entity {
    name: string;
    type: 'process' | 'system' | 'stakeholder' | 'document' | 'metric' | 'issue';
    relationships: string[];
}

export interface SearchResult {
    content: string;
    score: number;
    filename: string;
    chunkIndex: number;
    entities: Entity[];
}

// Generate embeddings using default LLM provider, with OpenAI fallback
export async function generateEmbedding(text: string): Promise<number[]> {
    const provider = llmFactory.getDefault();

    if (provider.embed) {
        try {
            return await provider.embed(text);
        } catch (err: any) {
            console.warn(`Embedding failed for provider "${provider.name}", trying OpenAI fallback: ${err.message}`);
        }
    }

    // Fallback: try OpenAI embeddings
    const openaiProvider = llmFactory.getProvider('openai');
    if (openaiProvider?.embed && openaiProvider.isAvailable()) {
        return await openaiProvider.embed(text);
    }

    throw new Error(`No embedding provider available. Default provider "${provider.name}" failed and OpenAI is not configured.`);
}

// Split text into chunks with overlap
export function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/);

    let currentChunk = '';
    let overlapBuffer = '';

    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            // Keep overlap from end of current chunk
            const words = currentChunk.split(' ');
            overlapBuffer = words.slice(-Math.floor(overlap / 5)).join(' ');
            currentChunk = overlapBuffer + ' ' + sentence;
        } else {
            currentChunk += (currentChunk ? ' ' : '') + sentence;
        }
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

// Extract entities from text using LLM
export async function extractEntities(text: string): Promise<Entity[]> {
    const systemPrompt = `You are an entity extractor. Extract business entities from the text and return them as JSON.
        
Entity types:
- process: Business processes, workflows, procedures
- system: Software systems, tools, platforms
- stakeholder: People, roles, departments, organizations
- metric: KPIs, measurements, performance indicators
- issue: Problems, challenges, pain points

Return format: [{"name": "entity name", "type": "entity_type", "relationships": ["related entity names"]}]
IMPORTANT: Output ONLY the JSON array, no other text.`;

    const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
    ];

    try {
        const response = await generateCompletion(messages, { temperature: 0 });
        // Parse JSON from the response - handle cases where model adds extra text
        const jsonMatch = response.content.match(/\[[\s\S]*\]/);
        const content = jsonMatch ? jsonMatch[0] : response.content;
        return JSON.parse(content);
    } catch {
        return [];
    }
}

// Index a document chunk
export async function indexDocumentChunk(chunk: DocumentChunk): Promise<void> {
    await opensearchClient.index({
        index: INDICES.DOCUMENTS,
        id: chunk.id,
        body: {
            content: chunk.content,
            embedding: chunk.embedding,
            documentId: chunk.documentId,
            filename: chunk.filename,
            fileType: chunk.fileType,
            chunkIndex: chunk.chunkIndex,
            totalChunks: chunk.totalChunks,
            uploadedBy: chunk.uploadedBy,
            uploadedAt: chunk.uploadedAt,
            entities: chunk.entities,
            metadata: chunk.metadata,
        },
        refresh: true,
    });
}

// Store entity in knowledge graph
export async function storeEntity(
    entity: Entity,
    sourceDocumentId: string,
    description: string
): Promise<void> {
    const entityId = uuidv4();
    await opensearchClient.index({
        index: INDICES.ENTITIES,
        id: entityId,
        body: {
            name: entity.name,
            type: entity.type,
            description,
            sourceDocumentId,
            relationships: entity.relationships.map((rel) => ({
                targetEntity: rel,
                relationshipType: 'related_to',
                description: '',
            })),
            createdAt: new Date(),
        },
        refresh: true,
    });
}

// Search knowledge base with semantic search
export async function searchKnowledgeBase(
    query: string,
    limit: number = 5
): Promise<SearchResult[]> {
    try {
        const queryEmbedding = await generateEmbedding(query);

        const response = await opensearchClient.search({
            index: INDICES.DOCUMENTS,
            body: {
                size: limit,
                query: {
                    knn: {
                        embedding: {
                            vector: queryEmbedding,
                            k: limit,
                        },
                    },
                },
                _source: ['content', 'filename', 'chunkIndex', 'entities'],
            },
        });

        return response.body.hits.hits.map((hit: any) => ({
            content: hit._source.content,
            score: hit._score,
            filename: hit._source.filename,
            chunkIndex: hit._source.chunkIndex,
            entities: hit._source.entities || [],
        }));
    } catch (error) {
        console.warn('OpenSearch search unavailable, using in-memory fallback');
        const queryLower = query.toLowerCase();
        const results: SearchResult[] = [];
        for (const doc of inMemoryDocs.values()) {
            if (doc.content.toLowerCase().includes(queryLower)) {
                results.push({
                    content: doc.content.slice(0, 1000),
                    score: 0.8,
                    filename: doc.filename,
                    chunkIndex: 0,
                    entities: [],
                });
            }
        }
        return results.slice(0, limit);
    }
}

// Search documents scoped to a specific interview session (attachment retrieval)
// Combines KNN with a metadata.sessionId filter so only that session's attached
// files are surfaced — used to prime the next-question prompt.
export async function searchSessionAttachments(
    sessionId: string,
    query: string,
    limit: number = 4
): Promise<SearchResult[]> {
    try {
        const queryEmbedding = await generateEmbedding(query);
        const response = await opensearchClient.search({
            index: INDICES.DOCUMENTS,
            body: {
                size: limit,
                query: {
                    bool: {
                        must: [{ knn: { embedding: { vector: queryEmbedding, k: limit * 2 } } }],
                        filter: [{ term: { 'metadata.sessionId': sessionId } }],
                    },
                },
                _source: ['content', 'filename', 'chunkIndex', 'entities', 'metadata'],
            },
        });
        return response.body.hits.hits.map((hit: any) => ({
            content: hit._source.content,
            score: hit._score,
            filename: hit._source.filename,
            chunkIndex: hit._source.chunkIndex,
            entities: hit._source.entities || [],
        }));
    } catch (err) {
        console.warn('[KB] session attachment search failed:', (err as Error).message);
        // In-memory fallback: linear scan
        const results: SearchResult[] = [];
        for (const doc of inMemoryDocs.values()) {
            if ((doc.metadata as any)?.sessionId === sessionId) {
                results.push({
                    content: doc.content.slice(0, 1500),
                    score: 0.7,
                    filename: doc.filename,
                    chunkIndex: 0,
                    entities: [],
                });
            }
        }
        return results.slice(0, limit);
    }
}

// Hybrid search (semantic + keyword)
export async function hybridSearch(
    query: string,
    limit: number = 5
): Promise<SearchResult[]> {
    try {
        const queryEmbedding = await generateEmbedding(query);

        const response = await opensearchClient.search({
            index: INDICES.DOCUMENTS,
            body: {
                size: limit,
                query: {
                    bool: {
                        should: [
                            {
                                knn: {
                                    embedding: {
                                        vector: queryEmbedding,
                                        k: limit * 2,
                                    },
                                },
                            },
                            {
                                match: {
                                    content: {
                                        query: query,
                                        boost: 0.3,
                                    },
                                },
                            },
                        ],
                    },
                },
                _source: ['content', 'filename', 'chunkIndex', 'entities'],
            },
        });

        return response.body.hits.hits.map((hit: any) => ({
            content: hit._source.content,
            score: hit._score,
            filename: hit._source.filename,
            chunkIndex: hit._source.chunkIndex,
            entities: hit._source.entities || [],
        }));
    } catch (error) {
        console.warn('Hybrid search unavailable, using in-memory fallback');
        const queryLower = query.toLowerCase();
        const results: SearchResult[] = [];
        for (const doc of inMemoryDocs.values()) {
            if (doc.content.toLowerCase().includes(queryLower)) {
                results.push({
                    content: doc.content.slice(0, 1000),
                    score: 0.8,
                    filename: doc.filename,
                    chunkIndex: 0,
                    entities: [],
                });
            }
        }
        return results.slice(0, limit);
    }
}

// Get related entities from knowledge graph
export async function getRelatedEntities(
    entityName: string,
    entityType?: string
): Promise<any[]> {
    const query: any = {
        bool: {
            should: [
                { match: { 'name': entityName } },
                {
                    nested: {
                        path: 'relationships',
                        query: {
                            match: { 'relationships.targetEntity': entityName },
                        },
                    },
                },
            ],
        },
    };

    if (entityType) {
        query.bool.filter = [{ term: { type: entityType } }];
    }

    const response = await opensearchClient.search({
        index: INDICES.ENTITIES,
        body: {
            size: 20,
            query,
            _source: ['name', 'type', 'description', 'relationships'],
        },
    });

    return response.body.hits.hits.map((hit: any) => ({
        name: hit._source.name,
        type: hit._source.type,
        description: hit._source.description,
        relationships: hit._source.relationships,
        score: hit._score,
    }));
}

// Process and index a full document
export async function processAndIndexDocument(
    content: string,
    filename: string,
    fileType: string,
    uploadedBy: string,
    metadata: Record<string, unknown> = {}
): Promise<string> {
    const documentId = uuidv4();
    const chunks = chunkText(content);

    try {
        for (let i = 0; i < chunks.length; i++) {
            const chunkContent = chunks[i];
            const [embedding, entities] = await Promise.all([
                generateEmbedding(chunkContent),
                extractEntities(chunkContent),
            ]);

            const chunk: DocumentChunk = {
                id: `${documentId}_chunk_${i}`,
                content: chunkContent,
                embedding,
                documentId,
                filename,
                fileType,
                chunkIndex: i,
                totalChunks: chunks.length,
                uploadedBy,
                uploadedAt: new Date(),
                entities,
                metadata,
            };

            await indexDocumentChunk(chunk);

            // Store entities in knowledge graph
            for (const entity of entities) {
                await storeEntity(entity, documentId, chunkContent.slice(0, 200));
            }
        }
    } catch (error) {
        console.warn('OpenSearch indexing unavailable, storing document in memory:', (error as Error).message);
        // Store in memory as fallback
        inMemoryDocs.set(documentId, {
            documentId,
            filename,
            fileType,
            uploadedBy,
            uploadedAt: new Date(),
            content,
            totalChunks: chunks.length,
            metadata,
        });
    }

    return documentId;
}

// Delete document and its chunks
export async function deleteDocument(documentId: string): Promise<void> {
    // Remove from in-memory fallback
    inMemoryDocs.delete(documentId);

    try {
        await opensearchClient.deleteByQuery({
            index: INDICES.DOCUMENTS,
            body: {
                query: {
                    term: { documentId },
                },
            },
            refresh: true,
        });

        await opensearchClient.deleteByQuery({
            index: INDICES.ENTITIES,
            body: {
                query: {
                    term: { sourceDocumentId: documentId },
                },
            },
            refresh: true,
        });
    } catch (error) {
        console.warn('OpenSearch delete unavailable:', (error as Error).message);
    }
}

// Get all documents
export async function listDocuments(uploadedBy?: string): Promise<any[]> {
    try {
        const query: any = uploadedBy
            ? { term: { uploadedBy } }
            : { match_all: {} };

        const response = await opensearchClient.search({
            index: INDICES.DOCUMENTS,
            body: {
                size: 0,
                query,
                aggs: {
                    documents: {
                        terms: {
                            field: 'documentId',
                            size: 100,
                        },
                        aggs: {
                            doc_info: {
                                top_hits: {
                                    size: 1,
                                    _source: ['filename', 'fileType', 'uploadedAt', 'totalChunks'],
                                },
                            },
                        },
                    },
                },
            },
        });

        const osDocs = response.body.aggregations.documents.buckets.map((bucket: any) => {
            const source = bucket.doc_info.hits.hits[0]._source;
            return {
                documentId: bucket.key,
                filename: source.filename,
                fileType: source.fileType,
                uploadedAt: source.uploadedAt,
                totalChunks: source.totalChunks,
            };
        });

        // Merge with in-memory docs
        const inMemList = Array.from(inMemoryDocs.values())
            .filter(d => !uploadedBy || d.uploadedBy === uploadedBy)
            .map(d => ({
                documentId: d.documentId,
                filename: d.filename,
                fileType: d.fileType,
                uploadedAt: d.uploadedAt,
                totalChunks: d.totalChunks,
            }));

        return [...osDocs, ...inMemList];
    } catch (error) {
        console.warn('OpenSearch list unavailable, using in-memory fallback');
        return Array.from(inMemoryDocs.values())
            .filter(d => !uploadedBy || d.uploadedBy === uploadedBy)
            .map(d => ({
                documentId: d.documentId,
                filename: d.filename,
                fileType: d.fileType,
                uploadedAt: d.uploadedAt,
                totalChunks: d.totalChunks,
            }));
    }
}
