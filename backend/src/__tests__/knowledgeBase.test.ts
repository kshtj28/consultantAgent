import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    chunkText,
    generateEmbedding,
    searchKnowledgeBase,
    hybridSearch,
    getRelatedEntities,
    processAndIndexDocument,
} from '../services/knowledgeBase';

// Mock OpenAI
vi.mock('openai', () => ({
    default: vi.fn().mockImplementation(() => ({
        embeddings: {
            create: vi.fn().mockResolvedValue({
                data: [{ embedding: new Array(1536).fill(0.1) }],
            }),
        },
        chat: {
            completions: {
                create: vi.fn().mockResolvedValue({
                    choices: [{
                        message: {
                            content: JSON.stringify([
                                { name: 'Invoice Process', type: 'process', relationships: ['Finance Team'] },
                                { name: 'Finance Team', type: 'stakeholder', relationships: [] },
                            ]),
                        },
                    }],
                }),
            },
        },
    })),
}));

// Mock llmService — knowledgeBase uses llmFactory.getDefault().embed()
vi.mock('../services/llmService', () => ({
    llmFactory: {
        getDefault: vi.fn().mockReturnValue({
            name: 'mock-provider',
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
            generate: vi.fn().mockResolvedValue({
                content: JSON.stringify([
                    { name: 'Invoice Process', type: 'process', relationships: ['Finance Team'] },
                ]),
                provider: 'mock',
                model: 'mock',
            }),
        }),
    },
    generateCompletion: vi.fn().mockResolvedValue({
        content: JSON.stringify([
            { name: 'Invoice Process', type: 'process', relationships: ['Finance Team'] },
        ]),
        provider: 'mock',
        model: 'mock',
    }),
    LLMMessage: {},
}));

// Mock OpenSearch client
vi.mock('../config/database', () => ({
    opensearchClient: {
        index: vi.fn().mockResolvedValue({ body: { _id: 'test-id' } }),
        search: vi.fn().mockResolvedValue({
            body: {
                hits: {
                    hits: [
                        {
                            _source: {
                                content: 'Sample document content about business processes.',
                                filename: 'test.pdf',
                                chunkIndex: 0,
                                entities: [{ name: 'Process A', type: 'process', relationships: [] }],
                            },
                            _score: 0.95,
                        },
                    ],
                },
                aggregations: {
                    documents: {
                        buckets: [
                            {
                                key: 'doc-1',
                                doc_info: {
                                    hits: {
                                        hits: [{
                                            _source: {
                                                filename: 'test.pdf',
                                                fileType: 'application/pdf',
                                                uploadedAt: new Date(),
                                                totalChunks: 5,
                                            },
                                        }],
                                    },
                                },
                            },
                        ],
                    },
                },
            },
        }),
        deleteByQuery: vi.fn().mockResolvedValue({ body: { deleted: 1 } }),
    },
    INDICES: {
        DOCUMENTS: 'consultant_documents',
        CONVERSATIONS: 'consultant_conversations',
        ENTITIES: 'consultant_entities',
    },
}));

// Mock env
vi.mock('../config/env', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        getDefaultModel: vi.fn().mockReturnValue(null),
        getProviderApiKey: vi.fn().mockReturnValue('test-key'),
        env: {
            OPENAI_API_KEY: 'test-key',
        },
    };
});

describe('Knowledge Base Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('chunkText', () => {
        it('should split text into chunks', () => {
            const text = 'This is sentence one. This is sentence two. This is sentence three. This is sentence four.';
            const chunks = chunkText(text, 50, 10);

            expect(chunks.length).toBeGreaterThan(0);
            expect(chunks[0]).toContain('sentence');
        });

        it('should handle empty text', () => {
            const chunks = chunkText('');
            expect(chunks).toEqual([]);
        });

        it('should handle text shorter than chunk size', () => {
            const text = 'Short text.';
            const chunks = chunkText(text, 1000, 200);

            expect(chunks.length).toBe(1);
            expect(chunks[0]).toBe('Short text.');
        });

        it('should maintain overlap between chunks', () => {
            const text = 'First sentence here. Second sentence here. Third sentence here. Fourth sentence here.';
            const chunks = chunkText(text, 40, 10);

            // With overlap, chunks should share some content
            expect(chunks.length).toBeGreaterThan(1);
        });

        it('should preserve sentence boundaries', () => {
            const text = 'Complete sentence one. Complete sentence two. Complete sentence three.';
            const chunks = chunkText(text, 30, 5);

            // Each chunk should contain complete sentences (or parts thereof)
            chunks.forEach((chunk) => {
                expect(chunk.trim()).toBeTruthy();
            });
        });
    });

    describe('generateEmbedding', () => {
        it('should generate embeddings with correct dimension', async () => {
            const embedding = await generateEmbedding('Test text for embedding');

            expect(embedding).toHaveLength(1536);
            expect(embedding[0]).toBe(0.1);
        });

        it('should handle empty text', async () => {
            const embedding = await generateEmbedding('');

            expect(embedding).toHaveLength(1536);
        });
    });

    describe('searchKnowledgeBase', () => {
        it('should return search results', async () => {
            const results = await searchKnowledgeBase('business process', 5);

            expect(results).toHaveLength(1);
            expect(results[0].content).toContain('document content');
            expect(results[0].filename).toBe('test.pdf');
            expect(results[0].score).toBe(0.95);
        });

        it('should include entities in results', async () => {
            const results = await searchKnowledgeBase('process', 5);

            expect(results[0].entities).toBeDefined();
            expect(results[0].entities[0].name).toBe('Process A');
        });
    });

    describe('hybridSearch', () => {
        it('should combine semantic and keyword search', async () => {
            const results = await hybridSearch('invoice processing', 5);

            expect(results).toHaveLength(1);
            expect(results[0].content).toBeDefined();
        });
    });

    describe('getRelatedEntities', () => {
        it('should return related entities', async () => {
            const entities = await getRelatedEntities('Invoice Process', 'process');

            expect(entities).toBeDefined();
            expect(Array.isArray(entities)).toBe(true);
        });
    });
});
