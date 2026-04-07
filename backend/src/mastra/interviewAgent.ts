import { createTool } from '@mastra/core/tools';
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { opensearchClient, INDICES } from '../config/database';
import { searchKnowledgeBase } from '../services/knowledgeBase';
import { generateCompletion, LLMMessage } from '../services/llmService';
import {
    INTERVIEW_AGENT_SYSTEM_PROMPT,
    buildCategoryCompletionPrompt,
    buildNextQuestionPrompt,
} from '../prompts/interview.prompt';
import { getInterviewCategory } from '../services/domainService';
import type { QuestionType } from '../services/interviewService';

// ─── Tool: get_category_conversation ────────────────────────────────────────

const getCategoryConversationTool = createTool({
    id: 'get_category_conversation',
    description: 'Retrieve the last 10 conversation turns for a specific interview category from a session',
    inputSchema: z.object({
        sessionId: z.string().describe('The interview session ID'),
        categoryId: z.string().describe('The category ID to retrieve conversation for'),
    }),
    execute: async ({ sessionId, categoryId }) => {
        try {
            const result = await opensearchClient.get({
                index: INDICES.CONVERSATIONS,
                id: `interview_${sessionId}`,
            });

            const session = result.body._source as {
                responses?: Record<string, Array<{ question: string; answer: unknown }>>;
                conversationHistory?: Array<{ role: string; content: string }>;
            };

            const categoryAnswers = session?.responses?.[categoryId] || [];

            // Build conversation turns from category-specific answers
            const turns = categoryAnswers.slice(-10).map((a) => ({
                question: a.question,
                answer: typeof a.answer === 'object' ? JSON.stringify(a.answer) : String(a.answer),
            }));

            const formattedHistory = turns
                .map((t) => `Q: ${t.question}\nA: ${t.answer}`)
                .join('\n\n');

            return {
                sessionId,
                categoryId,
                turns,
                formattedHistory,
                totalTurns: turns.length,
            };
        } catch (error: any) {
            if (error.meta?.statusCode === 404) {
                return { sessionId, categoryId, turns: [], formattedHistory: '', totalTurns: 0 };
            }
            throw error;
        }
    },
});

// ─── Tool: search_domain_knowledge ──────────────────────────────────────────

const searchDomainKnowledgeTool = createTool({
    id: 'search_domain_knowledge',
    description: 'Search uploaded company documents for information relevant to a specific interview category',
    inputSchema: z.object({
        query: z.string().describe('The search query to find relevant document chunks'),
        categoryId: z.string().describe('The category ID to filter results for relevance'),
        limit: z.number().optional().default(5).describe('Maximum number of results to return'),
    }),
    execute: async ({ query, categoryId, limit }) => {
        const categoryInfo = getInterviewCategory(categoryId);
        const enrichedQuery = categoryInfo
            ? `${categoryInfo.name}: ${query}`
            : query;

        const results = await searchKnowledgeBase(enrichedQuery, limit || 5);

        // Filter to results with a reasonable relevance score
        const relevant = results.filter((r) => r.score > 0.3);

        const formattedContext = relevant
            .map((r, i) => `[${i + 1}] From "${r.filename}" (score: ${r.score.toFixed(2)}):\n${r.content}`)
            .join('\n\n');

        return {
            categoryId,
            query: enrichedQuery,
            results: relevant,
            formattedContext,
            count: relevant.length,
        };
    },
});

// ─── Tool: evaluate_category_completion ────────────────────────────────────

const evaluateCategoryCompletionTool = createTool({
    id: 'evaluate_category_completion',
    description: 'Use LLM to evaluate whether enough substantive information has been gathered for a category',
    inputSchema: z.object({
        categoryId: z.string().describe('The category ID being evaluated'),
        answeredQuestions: z
            .array(
                z.object({
                    question: z.string(),
                    answer: z.string(),
                })
            )
            .describe('Array of question-answer pairs collected for this category'),
        modelId: z.string().optional().describe('The LLM model ID to use for evaluation'),
    }),
    execute: async ({ categoryId, answeredQuestions, modelId }) => {
        const categoryInfo = getInterviewCategory(categoryId);
        const categoryName = categoryInfo?.name || categoryId;

        if (answeredQuestions.length === 0) {
            return {
                isComplete: false,
                completionReason: 'No questions have been answered yet',
                coverageScore: 0,
                missedTopics: ['All topics — interview not started for this category'],
            };
        }

        const answersText = answeredQuestions
            .map((qa: { question: string; answer: string }, i: number) => `${i + 1}. Q: ${qa.question}\n   A: ${qa.answer}`)
            .join('\n\n');

        const prompt = buildCategoryCompletionPrompt(categoryName, answersText);

        const messages: LLMMessage[] = [
            { role: 'system', content: prompt },
        ];

        const completion = await generateCompletion(modelId || null, messages, { temperature: 0.2 });
        const jsonMatch = completion.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON in LLM response');

        const parsed = JSON.parse(jsonMatch[0]) as {
            isComplete: boolean;
            completionReason: string;
            coverageScore: number;
            missedTopics: string[];
        };

        return {
            isComplete: parsed.isComplete ?? false,
            completionReason: parsed.completionReason ?? '',
            coverageScore: Math.min(100, Math.max(0, parsed.coverageScore ?? 0)),
            missedTopics: Array.isArray(parsed.missedTopics) ? parsed.missedTopics : [],
        };
    },
});

// ─── Tool: generate_next_question ───────────────────────────────────────────

const generateNextQuestionTool = createTool({
    id: 'generate_next_question',
    description: 'Generate the most relevant next interview question for a category given what has already been covered',
    inputSchema: z.object({
        categoryId: z.string().describe('The category ID'),
        categoryName: z.string().describe('The human-readable category name'),
        coveredTopics: z.array(z.string()).describe('Topics already discussed'),
        context: z.string().describe('Additional context from knowledge base or conversation'),
        previousQuestions: z.array(z.string()).describe('Questions already asked (to avoid repetition)'),
        modelId: z.string().optional().describe('The LLM model ID to use for generation'),
    }),
    execute: async ({ categoryId, categoryName, coveredTopics, context, previousQuestions, modelId }) => {
        const categoryInfo = getInterviewCategory(categoryId);
        const description = categoryInfo?.description || '';

        // Determine remaining topics by removing covered ones from expected topics
        const allExpectedTopics = getCategoryExpectedTopics(categoryId);
        const remainingTopics = allExpectedTopics.filter(
            (t) => !coveredTopics.some((c: string) => c.toLowerCase().includes(t.toLowerCase()))
        );

        const prompt = buildNextQuestionPrompt(categoryName, coveredTopics, remainingTopics, context);

        const systemContext = `You are generating the next question for a finance discovery interview.
Category: ${categoryName} — ${description}
Already asked questions (DO NOT repeat or rephrase):
${previousQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n') || 'None yet'}`;

        const messages: LLMMessage[] = [
            { role: 'system', content: systemContext },
            { role: 'user', content: prompt },
        ];

        try {
            const completion = await generateCompletion(modelId || null, messages, { temperature: 0.4 });
            const jsonMatch = completion.content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON in LLM response');

            const parsed = JSON.parse(jsonMatch[0]) as {
                question: string;
                type: string;
                options?: string[];
                reasoning: string;
                topicsCovered: string[];
            };

            const validTypes: QuestionType[] = ['single_choice', 'multi_choice', 'scale', 'open_ended', 'yes_no'];
            const questionType: QuestionType = validTypes.includes(parsed.type as QuestionType)
                ? (parsed.type as QuestionType)
                : 'open_ended';

            let options = parsed.options || [];
            if (questionType === 'scale') options = ['1', '2', '3', '4', '5'];
            if (questionType === 'yes_no') options = ['Yes', 'No'];
            if (questionType === 'open_ended') options = [];

            return {
                question: parsed.question,
                type: questionType,
                options: options.length > 0 ? options : undefined,
                reasoning: parsed.reasoning || '',
                topicsCovered: Array.isArray(parsed.topicsCovered) ? parsed.topicsCovered : [],
            };
        } catch (error) {
            console.error('generate_next_question LLM error:', error);
            // Fallback to a generic open-ended question
            const uncovered = remainingTopics[0] || 'current processes';
            return {
                question: `Can you describe your current ${uncovered} process in ${categoryName}?`,
                type: 'open_ended' as QuestionType,
                options: undefined,
                reasoning: 'Fallback question due to LLM error',
                topicsCovered: [uncovered],
            };
        }
    },
});

// ─── Helper: expected topics per category ───────────────────────────────────

function getCategoryExpectedTopics(categoryId: string): string[] {
    const topicsMap: Record<string, string[]> = {
        company_overview: ['industry', 'company size', 'ERP systems', 'team structure', 'revenue range'],
        order_to_cash: ['order creation', 'invoicing', 'credit checks', 'DSO', 'cash application', 'payment matching'],
        accounts_payable: ['invoice volume', 'invoice receipt', 'approval workflow', '3-way matching', 'payment methods', 'DPO'],
        accounts_receivable: ['billing', 'payment terms', 'collections', 'aging receivables', 'credit management'],
        general_ledger: ['chart of accounts', 'journal entries', 'month-end close', 'close timeline', 'automation level'],
        reconciliation: ['bank reconciliation', 'frequency', 'automation', 'intercompany', 'subledger matching'],
        financial_reporting: ['report types', 'reporting tools', 'manual effort', 'consolidation', 'analytics'],
        compliance_controls: ['SOX', 'audit findings', 'segregation of duties', 'access controls', 'regulatory requirements'],
    };
    return topicsMap[categoryId] || ['current process', 'pain points', 'systems used', 'volumes', 'automation level'];
}

// ─── Interview Agent ─────────────────────────────────────────────────────────

export const interviewAgent = new Agent({
    id: 'interview-agent',
    name: 'Interview Agent',
    instructions: INTERVIEW_AGENT_SYSTEM_PROMPT,
    model: openai('gpt-4o'),
    tools: {
        getCategoryConversation: getCategoryConversationTool,
        searchDomainKnowledge: searchDomainKnowledgeTool,
        evaluateCategoryCompletion: evaluateCategoryCompletionTool,
        generateNextQuestion: generateNextQuestionTool,
    },
});
