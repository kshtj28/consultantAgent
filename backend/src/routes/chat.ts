import { Router, Request, Response } from 'express';
import { getAvailableModels } from '../config/env';
import { getEffectiveModel } from '../services/settingsService';
import { generateCompletion, streamCompletion, LLMMessage } from '../services/llmService';
import {
    createConversation,
    getConversation,
    addMessage,
    getRecentMessages,
    listConversations,
    deleteConversation,
    formatMessagesForLLM
} from '../services/memory';
import { hybridSearch, getRelatedEntities } from '../services/knowledgeBase';
import { generateGapAnalysis, generateProjectPlan, identifyAutomationOpportunities } from '../services/analysisService';
import { getLanguageInstructions, isValidLanguage } from '../services/languageService';
import { LLMWarmingUpError } from '../services/llmService';
import { triggerGpuWarmup, scheduleScaleDown, isGpuScalingEnabled } from '../services/gpuScalingService';
import { buildAssessmentContext, buildAssessmentSystemPrompt } from '../services/assessmentChatService';

const router = Router();

/**
 * Middleware: when GPU scaling is enabled and an LLM call fails with a
 * warming-up error, proactively trigger the scale-up so subsequent retries
 * from the frontend actually have an instance coming online.
 */
async function ensureGpuWarm(): Promise<void> {
    if (!isGpuScalingEnabled()) return;
    try {
        await triggerGpuWarmup();
        scheduleScaleDown();
    } catch (err) {
        console.error('[chat] GPU warmup trigger failed (non-fatal):', err);
    }
}

// Consultant agent system prompt
const SYSTEM_PROMPT = `You are an expert business consultant AI assistant. Your role is to help consultants analyze processes, identify gaps, and recommend improvements.

Your capabilities:
1. Document Analysis - Search and analyze uploaded documents to understand current processes
2. Gap Analysis - Compare current state to best practices and identify improvement opportunities
3. Automation Detection - Identify manual processes that can be automated
4. Project Planning - Create implementation roadmaps

When responding:
- Always base analysis on the provided document context
- Be specific and actionable in recommendations
- Prioritize by impact and feasibility
- Use structured formats for reports
- Ask clarifying questions when needed`;

// Get available models (grouped by provider)
router.get('/models', async (req: Request, res: Response) => {
    try {
        const models = getAvailableModels();
        const effectiveModel = await getEffectiveModel();
        res.json({
            models,
            defaultModel: effectiveModel?.id || null,
        });
    } catch (error: any) {
        console.error('Error getting models:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create new conversation
router.post('/conversations', async (req: Request, res: Response) => {
    try {
        const userId = req.body.userId || 'default-user';
        const username = (req as any).user?.username || 'unknown';
        const conversationId = await createConversation(userId, username);
        res.status(201).json({ conversationId });
    } catch (error: any) {
        console.error('Error creating conversation:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get conversation history
router.get('/conversations/:conversationId', async (req: Request, res: Response) => {
    try {
        const { conversationId } = req.params;
        const conversation = await getConversation(conversationId);

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        res.json(conversation);
    } catch (error: any) {
        console.error('Error getting conversation:', error);
        res.status(500).json({ error: error.message });
    }
});

// List user conversations
router.get('/conversations', async (req: Request, res: Response) => {
    try {
        const userId = req.query.userId as string || 'default-user';
        const conversations = await listConversations(userId);
        res.json({ conversations });
    } catch (error: any) {
        console.error('Error listing conversations:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete conversation
router.delete('/conversations/:conversationId', async (req: Request, res: Response) => {
    try {
        const { conversationId } = req.params;
        await deleteConversation(conversationId);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting conversation:', error);
        res.status(500).json({ error: error.message });
    }
});

// Send chat message (with RAG)
router.post('/message', async (req: Request, res: Response) => {
    try {
        const { conversationId, message, userId = 'default-user', model: requestedModel, language } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Validate model selection (format: provider:model)
        const modelConfig = await getEffectiveModel(requestedModel);
        if (!modelConfig) {
            return res.status(400).json({ error: 'Invalid or no model configured' });
        }

        // Create conversation if not provided
        let activeConversationId = conversationId;
        if (!activeConversationId) {
            const username = (req as any).user?.username || 'unknown';
            activeConversationId = await createConversation(userId, username);
        }

        // Save user message
        await addMessage(activeConversationId, 'user', message);

        // Get recent conversation history
        const recentMessages = await getRecentMessages(activeConversationId, 10);

        // Search knowledge base for relevant context
        const searchResults = await hybridSearch(message, 5);
        const documentContext = searchResults
            .map((r, i) => `[Source ${i + 1}: ${r.filename}]\n${r.content}`)
            .join('\n\n---\n\n');

        // Build messages for LLM
        const langInstructions = getLanguageInstructions(isValidLanguage(language) ? language : 'en');
        const llmMessages: LLMMessage[] = [
            { role: 'system', content: `${SYSTEM_PROMPT}\n\n${langInstructions}` },
        ];

        // Add conversation history
        const formattedHistory = formatMessagesForLLM(recentMessages.slice(0, -1));
        llmMessages.push(...formattedHistory.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content })));

        // Add current message with context
        const contextualMessage = documentContext
            ? `Context from uploaded documents:\n${documentContext}\n\n---\n\nUser question: ${message}`
            : message;

        llmMessages.push({ role: 'user', content: contextualMessage });

        // Get response from LLM
        const response = await generateCompletion(modelConfig.id, llmMessages);

        // Save assistant message
        await addMessage(activeConversationId, 'assistant', response.content);

        res.json({
            conversationId: activeConversationId,
            message: response.content,
            model: response.model,
            provider: response.provider,
            sources: searchResults.map((r) => ({
                filename: r.filename,
                score: r.score,
            })),
        });
    } catch (error: any) {
        console.error('Error processing chat message:', error);
        if (error instanceof LLMWarmingUpError) {
            await ensureGpuWarm();
            return res.status(503).json({ error: error.message, code: 'LLM_WARMING_UP' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Stream chat message
router.post('/message/stream', async (req: Request, res: Response) => {
    try {
        const { conversationId, message, userId = 'default-user', model: requestedModel, language } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Validate model selection
        const modelConfig = await getEffectiveModel(requestedModel);
        if (!modelConfig) {
            return res.status(400).json({ error: 'Invalid or no model configured' });
        }

        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');


        // Create conversation if not provided
        let activeConversationId = conversationId;
        if (!activeConversationId) {
            const username = (req as any).user?.username || 'unknown';
            activeConversationId = await createConversation(userId, username);
        }

        // Save user message
        await addMessage(activeConversationId, 'user', message);

        // Get recent conversation history
        const recentMessages = await getRecentMessages(activeConversationId, 10);

        // Search knowledge base
        const searchResults = await hybridSearch(message, 5);
        const documentContext = searchResults
            .map((r, i) => `[Source ${i + 1}: ${r.filename}]\n${r.content}`)
            .join('\n\n---\n\n');

        // Build messages
        const streamLangInstructions = getLanguageInstructions(isValidLanguage(language) ? language : 'en');
        const llmMessages: LLMMessage[] = [
            { role: 'system', content: `${SYSTEM_PROMPT}\n\n${streamLangInstructions}` },
        ];

        const formattedHistory = formatMessagesForLLM(recentMessages.slice(0, -1));
        llmMessages.push(...formattedHistory.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content })));

        const contextualMessage = documentContext
            ? `Context from uploaded documents:\n${documentContext}\n\n---\n\nUser question: ${message}`
            : message;

        llmMessages.push({ role: 'user', content: contextualMessage });

        // Stream response
        let fullResponse = '';

        for await (const chunk of streamCompletion(modelConfig.id, llmMessages)) {
            if (chunk.error) {
                res.write(`data: ${JSON.stringify({ error: chunk.error })}\n\n`);
                break;
            }
            if (chunk.content) {
                fullResponse += chunk.content;
                res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
            }
            if (chunk.done) {
                // Save complete response
                await addMessage(activeConversationId, 'assistant', fullResponse);
                res.write(`data: ${JSON.stringify({ done: true, conversationId: activeConversationId })}\n\n`);
            }
        }

        res.end();
    } catch (error: any) {
        console.error('Error streaming chat message:', error);
        if (error instanceof LLMWarmingUpError) {
            await ensureGpuWarm();
            res.write(`data: ${JSON.stringify({ error: error.message, code: 'LLM_WARMING_UP' })}\n\n`);
        } else {
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        }
        res.end();
    }
});

// Generate gap analysis
router.post('/analyze/gap', async (req: Request, res: Response) => {
    try {
        const { focusArea, context = '', model: requestedModel, language } = req.body;

        if (!focusArea) {
            return res.status(400).json({ error: 'focusArea is required' });
        }

        const resolvedModel = await getEffectiveModel(requestedModel);
        const report = await generateGapAnalysis(focusArea, context, resolvedModel?.id, language);
        res.json({ report });
    } catch (error: any) {
        console.error('Error generating gap analysis:', error);
        if (error instanceof LLMWarmingUpError) {
            await ensureGpuWarm();
            return res.status(503).json({ error: error.message, code: 'LLM_WARMING_UP' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Generate project plan
router.post('/analyze/plan', async (req: Request, res: Response) => {
    try {
        const { gaps, timeline = 'medium', model: requestedModel, language } = req.body;

        if (!gaps || !Array.isArray(gaps)) {
            return res.status(400).json({ error: 'gaps array is required' });
        }

        const resolvedModel = await getEffectiveModel(requestedModel);
        const plan = await generateProjectPlan(gaps, timeline, resolvedModel?.id, language);
        res.json({ plan });
    } catch (error: any) {
        console.error('Error generating project plan:', error);
        if (error instanceof LLMWarmingUpError) {
            await ensureGpuWarm();
            return res.status(503).json({ error: error.message, code: 'LLM_WARMING_UP' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Identify automation opportunities
router.post('/analyze/automation', async (req: Request, res: Response) => {
    try {
        const { processDescription, model: requestedModel, language } = req.body;

        if (!processDescription) {
            return res.status(400).json({ error: 'processDescription is required' });
        }

        const resolvedModel = await getEffectiveModel(requestedModel);
        const opportunities = await identifyAutomationOpportunities(processDescription, resolvedModel?.id, language);
        res.json({ opportunities });
    } catch (error: any) {
        console.error('Error identifying automation opportunities:', error);
        if (error instanceof LLMWarmingUpError) {
            await ensureGpuWarm();
            return res.status(503).json({ error: error.message, code: 'LLM_WARMING_UP' });
        }
        res.status(500).json({ error: error.message });
    }
});

// ── Assessment Chat — data-grounded Q&A over assessment results ──

router.post('/assessment/stream', async (req: Request, res: Response) => {
    try {
        const { message, conversationId, model: requestedModel, language } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const modelConfig = await getEffectiveModel(requestedModel);
        if (!modelConfig) {
            return res.status(400).json({ error: 'Invalid or no model configured' });
        }

        // SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Manage conversation
        let activeConversationId = conversationId;
        if (!activeConversationId) {
            const username = (req as any).user?.username || 'unknown';
            activeConversationId = await createConversation('assessment-chat', username);
        }

        await addMessage(activeConversationId, 'user', message);
        const recentMessages = await getRecentMessages(activeConversationId, 10);

        // Build grounded context from all assessment data
        const assessmentCtx = await buildAssessmentContext(message);
        const systemPrompt = buildAssessmentSystemPrompt(assessmentCtx);

        // Signal context loaded (so frontend can show "Analyzing...")
        res.write(`data: ${JSON.stringify({ status: 'context_loaded' })}\n\n`);

        const langInstructions = getLanguageInstructions(isValidLanguage(language) ? language : 'en');
        const llmMessages: LLMMessage[] = [
            { role: 'system', content: `${systemPrompt}\n\n${langInstructions}` },
        ];

        // Add conversation history (without the latest message we just added)
        const formattedHistory = formatMessagesForLLM(recentMessages.slice(0, -1));
        llmMessages.push(...formattedHistory.map((m: any) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        })));

        llmMessages.push({ role: 'user', content: message });

        // Stream
        let fullResponse = '';
        for await (const chunk of streamCompletion(modelConfig.id, llmMessages)) {
            if (chunk.error) {
                res.write(`data: ${JSON.stringify({ error: chunk.error })}\n\n`);
                break;
            }
            if (chunk.content) {
                fullResponse += chunk.content;
                res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
            }
            if (chunk.done) {
                await addMessage(activeConversationId, 'assistant', fullResponse);
                res.write(`data: ${JSON.stringify({ done: true, conversationId: activeConversationId })}\n\n`);
            }
        }

        res.end();
    } catch (error: any) {
        console.error('Error in assessment chat:', error);
        if (error instanceof LLMWarmingUpError) {
            await ensureGpuWarm();
            res.write(`data: ${JSON.stringify({ error: error.message, code: 'LLM_WARMING_UP' })}\n\n`);
        } else {
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        }
        res.end();
    }
});

export default router;
