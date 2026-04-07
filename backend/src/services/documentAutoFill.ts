import { getSubArea, getBroadArea } from './domainService';
import { searchKnowledgeBase } from './knowledgeBase';
import { generateCompletion, LLMMessage } from './llmService';

export interface AutoFillSuggestion {
    questionId: string;
    suggestedQuestion: string;
    suggestedAnswer: string;
    type: 'single_choice' | 'multi_choice' | 'scale' | 'open_ended' | 'yes_no';
    confidence: number;
    source: string;
    excerpts: string[];
}

// Mapping from interview category IDs to area descriptors (checks both readiness areas and interview categories)
function getCategoryDescriptor(categoryId: string): { name: string; description: string } | null {
    const area = getSubArea(categoryId);
    if (area) return { name: area.name, description: area.description };

    const broadArea = getBroadArea(categoryId);
    if (broadArea) return { name: broadArea.name, description: broadArea.description };

    return null;
}

// Check if a category/area ID is valid (from either system)
export function isValidCategoryOrArea(id: string): boolean {
    return getCategoryDescriptor(id) !== null;
}

// Analyze documents for any category/area and generate auto-fill suggestions
export async function analyzeDocumentsForAutoFill(
    sessionId: string,
    categoryOrAreaId: string
): Promise<AutoFillSuggestion[]> {
    const descriptor = getCategoryDescriptor(categoryOrAreaId);
    if (!descriptor) throw new Error('Invalid category/area ID');

    // Search for documents related to this area
    const searchQueries = [
        `${descriptor.name} process workflow`,
        `${descriptor.name} procedures`,
        `${descriptor.name} current state`,
        `${descriptor.name} challenges issues problems`,
    ];

    // Collect all relevant document excerpts
    const excerpts: { content: string; filename: string }[] = [];
    for (const query of searchQueries) {
        try {
            const results = await searchKnowledgeBase(query, 3);
            for (const result of results) {
                excerpts.push({
                    content: result.content,
                    filename: result.filename,
                });
            }
        } catch (error) {
            console.warn('Search error:', error);
        }
    }

    if (excerpts.length === 0) {
        return [];
    }

    // Use LLM to generate auto-fill suggestions
    const documentContext = excerpts
        .slice(0, 5)
        .map((e, i) => `[Source ${i + 1}: ${e.filename}]\n${e.content}`)
        .join('\n\n---\n\n');

    const prompt = `You are a finance process consultant. Based on the following document excerpts, generate interview questions and answers that can be auto-filled for the "${descriptor.name}" assessment area.

Document Excerpts:
${documentContext}

Generate 3-5 interview questions with answers that can be derived from these documents. Focus on:
- Current processes and workflows
- Tools and systems used
- Pain points or challenges mentioned
- Automation levels
- Compliance requirements

Return JSON array:
[
  {
    "questionId": "auto_1",
    "suggestedQuestion": "Question text",
    "suggestedAnswer": "Answer derived from documents",
    "type": "open_ended|single_choice|yes_no|scale",
    "confidence": 0.0-1.0,
    "source": "Filename where answer was found",
    "excerpts": ["relevant quote 1", "relevant quote 2"]
  }
]

Only include answers that have supporting evidence in the documents. Set confidence based on how clear the answer is from the documents.`;

    try {
        const messages: LLMMessage[] = [
            { role: 'user', content: prompt }
        ];
        const response = await generateCompletion(messages, { temperature: 0.3 });

        const jsonMatch = response.content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]) as AutoFillSuggestion[];
        }
    } catch (error) {
        console.error('Auto-fill analysis error:', error);
    }

    return [];
}

// Get document context for question generation
export async function getDocumentContextForArea(
    sessionId: string,
    categoryOrAreaId: string
): Promise<string> {
    const descriptor = getCategoryDescriptor(categoryOrAreaId);
    if (!descriptor) return '';

    // Search for relevant document content
    try {
        const results = await searchKnowledgeBase(`${descriptor.name} process`, 5);
        return results.map(r => r.content).join('\n\n---\n\n');
    } catch (error) {
        console.warn('Could not get document context:', error);
        return '';
    }
}

// Validate auto-fill suggestion against session
export function shouldApplyAutoFill(
    session: any,
    areaId: string,
    suggestion: AutoFillSuggestion
): boolean {
    // Check if question is already answered
    const areaResponses = session.responses[areaId] || [];
    const existingAnswer = areaResponses.find(
        (a: any) => a.question.toLowerCase().includes(suggestion.suggestedQuestion.toLowerCase().slice(0, 30))
    );

    if (existingAnswer) return false;

    // Only auto-fill if confidence is high enough
    return suggestion.confidence >= 0.7;
}
