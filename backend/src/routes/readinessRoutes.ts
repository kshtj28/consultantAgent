/**
 * @deprecated This file is no longer registered in the app.
 * All functionality has been migrated to interview routes.
 * Kept for reference during migration period — safe to delete after migration is verified.
 */
import { Router, Request, Response } from 'express';
import {
    createReadinessSession,
    getReadinessSession,
    setSelectedAreas,
    saveAnswer,
    getProgress,
    switchToArea,
    getAllAreas,
    updateContext,
    addDocumentToSession,
    AreaId,
    QuestionAnswer,
} from '../services/readinessSessionService';
import { generateNextQuestion, analyzeAnswer } from '../services/questionEngine';
import { analyzeDocumentsForAutoFill, isValidCategoryOrArea } from '../services/documentAutoFill';
import { searchKnowledgeBase } from '../services/knowledgeBase';
import { getSupportedLanguages, isValidLanguage, LanguageCode } from '../services/languageService';
import {
    getActiveDomainConfig,
    getDomainAreas,
    getDomainArea,
    getAvailableDomains,
    setActiveDomain,
    isValidDomain,
    DomainId,
} from '../services/domainService';
import { triggerGpuWarmup, scheduleScaleDown, isGpuScalingEnabled } from '../services/gpuScalingService';
import { LLMWarmingUpError } from '../services/llmService';
import { getEffectiveModel } from '../services/settingsService';

const router = Router();

/** Ensure the GPU/ECS service is scaling up (idempotent, non-fatal). */
async function ensureGpuWarm(): Promise<void> {
    if (!isGpuScalingEnabled()) return;
    try {
        await triggerGpuWarmup();
        scheduleScaleDown();
    } catch (err) {
        console.error('[readinessRoutes] GPU warmup trigger failed (non-fatal):', err);
    }
}

// ============ CONFIG ENDPOINTS ============

// Get supported languages
router.get('/config/languages', (req: Request, res: Response) => {
    try {
        const languages = getSupportedLanguages();
        res.json({ languages });
    } catch (error: any) {
        console.error('Error getting languages:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get available domains
router.get('/config/domains', (req: Request, res: Response) => {
    try {
        const domains = getAvailableDomains();
        res.json({ domains });
    } catch (error: any) {
        console.error('Error getting domains:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get active domain configuration
router.get('/config/domain', (req: Request, res: Response) => {
    try {
        const config = getActiveDomainConfig();
        const areas = getDomainAreas();
        res.json({
            domain: {
                id: config.id,
                name: config.name,
                description: config.description,
            },
            areas,
        });
    } catch (error: any) {
        console.error('Error getting domain config:', error);
        res.status(500).json({ error: error.message });
    }
});

// Set active domain
router.put('/config/domain', (req: Request, res: Response) => {
    try {
        const { domainId } = req.body;

        if (!domainId || !isValidDomain(domainId)) {
            return res.status(400).json({
                error: 'Invalid domain ID',
                availableDomains: getAvailableDomains().map(d => d.id),
            });
        }

        setActiveDomain(domainId as DomainId);
        const config = getActiveDomainConfig();

        res.json({
            success: true,
            domain: {
                id: config.id,
                name: config.name,
                description: config.description,
            },
        });
    } catch (error: any) {
        console.error('Error setting domain:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ AREA ENDPOINTS ============

// Get all available areas (from active domain)
router.get('/areas', (req: Request, res: Response) => {
    try {
        const areas = getAllAreas();
        res.json({ areas });
    } catch (error: any) {
        console.error('Error getting areas:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create new readiness session
router.post('/start', async (req: Request, res: Response) => {
    try {
        // GPU on-demand: proactively spin up g5 instance before session is created.
        // Returns 503 if scale-up fails so the user can retry.
        if (isGpuScalingEnabled()) {
            try {
                await triggerGpuWarmup();
                scheduleScaleDown(); // reset 1-hour keep-alive timer
            } catch (gpuErr: any) {
                console.error('[readinessRoutes] GPU scale-up failed:', gpuErr);
                return res.status(503).json({
                    error: 'GPU instance could not be started. Please try again.',
                    code: 'GPU_SCALE_UP_FAILED',
                });
            }
        }

        const { userId = 'anonymous', language = 'en' } = req.body;

        const validLanguage: LanguageCode = isValidLanguage(language) ? language : 'en';

        const session = await createReadinessSession(userId, validLanguage);
        const areas = getAllAreas();
        const languages = getSupportedLanguages();

        res.json({
            session: {
                sessionId: session.sessionId,
                status: session.status,
                language: session.language,
                createdAt: session.createdAt,
            },
            areas,
            languages,
        });
    } catch (error: any) {
        console.error('Error creating session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get session details
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const session = await getReadinessSession(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const progress = getProgress(session);

        res.json({
            session: {
                sessionId: session.sessionId,
                status: session.status,
                selectedAreas: session.selectedAreas,
                currentArea: session.currentArea,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
            },
            progress,
            context: session.conversationContext,
            documents: session.documents,
        });
    } catch (error: any) {
        console.error('Error getting session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Set selected areas
router.put('/:id/areas', async (req: Request, res: Response) => {
    try {
        const { areas } = req.body;
        if (!areas || !Array.isArray(areas) || areas.length === 0) {
            return res.status(400).json({ error: 'Areas array is required' });
        }

        // Validate area IDs against active domain
        const validAreaIds = getDomainAreas().map(a => a.id);
        const invalidAreas = areas.filter((a: string) => !validAreaIds.includes(a));
        if (invalidAreas.length > 0) {
            return res.status(400).json({
                error: `Invalid areas: ${invalidAreas.join(', ')}`,
                validAreas: validAreaIds,
            });
        }

        const session = await setSelectedAreas(req.params.id, areas as AreaId[]);
        const progress = getProgress(session);

        res.json({
            session: {
                sessionId: session.sessionId,
                status: session.status,
                selectedAreas: session.selectedAreas,
                currentArea: session.currentArea,
            },
            progress,
        });
    } catch (error: any) {
        console.error('Error setting areas:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get next AI-generated question
router.get('/:id/next-question', async (req: Request, res: Response) => {
    try {
        const { areaId, model: requestedModel } = req.query;
        const resolvedModel = await getEffectiveModel(requestedModel as string | undefined);
        const question = await generateNextQuestion(
            req.params.id,
            areaId as AreaId | undefined,
            resolvedModel?.id
        );

        res.json({ question });
    } catch (error: any) {
        console.error('Error generating question:', error);
        if (error instanceof LLMWarmingUpError) {
            await ensureGpuWarm();
            return res.status(503).json({ error: error.message, code: 'LLM_WARMING_UP' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Submit answer
router.post('/:id/answer', async (req: Request, res: Response) => {
    try {
        const { questionId, question, answer, type, mode, areaId, model: requestedModel } = req.body;

        if (!question || answer === undefined || !type || !areaId) {
            return res.status(400).json({
                error: 'Required fields: questionId, question, answer, type, areaId'
            });
        }

        const questionAnswer: QuestionAnswer = {
            questionId,
            question,
            answer,
            type,
            mode: mode || 'foundation',
            timestamp: new Date(),
            source: 'user',
        };

        const session = await saveAnswer(req.params.id, areaId, questionAnswer);

        const resolvedModel = await getEffectiveModel(requestedModel as string | undefined);
        const answerText = typeof answer === 'string' ? answer : JSON.stringify(answer);
        const insights = await analyzeAnswer(session, areaId, question, answerText, resolvedModel?.id);

        if (insights.gaps.length > 0 || insights.opportunities.length > 0 || insights.painPoints.length > 0) {
            await updateContext(req.params.id, {
                identifiedGaps: insights.gaps,
                transformationOpportunities: insights.opportunities,
                painPoints: insights.painPoints,
            });
        }

        const progress = getProgress(session);

        res.json({
            success: true,
            insights,
            progress,
        });
    } catch (error: any) {
        console.error('Error saving answer:', error);
        if (error instanceof LLMWarmingUpError) {
            await ensureGpuWarm();
            return res.status(503).json({ error: error.message, code: 'LLM_WARMING_UP' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Get progress
router.get('/:id/progress', async (req: Request, res: Response) => {
    try {
        const session = await getReadinessSession(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const progress = getProgress(session);

        res.json({
            progress,
            currentArea: session.currentArea,
            context: session.conversationContext,
        });
    } catch (error: any) {
        console.error('Error getting progress:', error);
        res.status(500).json({ error: error.message });
    }
});

// Switch to different area
router.put('/:id/area/:areaId', async (req: Request, res: Response) => {
    try {
        const { areaId } = req.params;

        if (!getDomainArea(areaId)) {
            return res.status(400).json({ error: 'Invalid area ID' });
        }

        const session = await switchToArea(req.params.id, areaId as AreaId);
        const progress = getProgress(session);

        res.json({
            currentArea: session.currentArea,
            progress,
        });
    } catch (error: any) {
        console.error('Error switching area:', error);
        res.status(500).json({ error: error.message });
    }
});

// Associate document with session area
router.post('/:id/documents', async (req: Request, res: Response) => {
    try {
        const { documentId, areaId, filename } = req.body;

        if (!documentId || !areaId || !filename) {
            return res.status(400).json({
                error: 'Required fields: documentId, areaId, filename'
            });
        }

        if (!getDomainArea(areaId)) {
            return res.status(400).json({ error: 'Invalid area ID' });
        }

        await addDocumentToSession(req.params.id, documentId, areaId as AreaId, filename);

        res.json({
            success: true,
            message: 'Document associated with session',
        });
    } catch (error: any) {
        console.error('Error associating document:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get auto-fill suggestions from documents for an area
router.get('/:id/autofill/:areaId', async (req: Request, res: Response) => {
    try {
        const { areaId } = req.params;

        if (!isValidCategoryOrArea(areaId)) {
            return res.status(400).json({ error: 'Invalid area ID' });
        }

        const suggestions = await analyzeDocumentsForAutoFill(
            req.params.id,
            areaId
        );

        res.json({
            suggestions,
            count: suggestions.length,
        });
    } catch (error: any) {
        console.error('Error generating auto-fill:', error);
        if (error instanceof LLMWarmingUpError) {
            await ensureGpuWarm();
            return res.status(503).json({ error: error.message, code: 'LLM_WARMING_UP' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Search documents for context
router.get('/:id/documents/search', async (req: Request, res: Response) => {
    try {
        const { query, limit = 5 } = req.query;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Query parameter required' });
        }

        const results = await searchKnowledgeBase(query, Number(limit));

        res.json({
            results,
            count: results.length,
        });
    } catch (error: any) {
        console.error('Error searching documents:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate readiness report
router.get('/:id/report/readiness', async (req: Request, res: Response) => {
    try {
        const requestedModel = req.query.model as string | undefined;
        const resolvedModel = await getEffectiveModel(requestedModel);
        const { generateReadinessReport } = await import('../services/reportService');
        const report = await generateReadinessReport(req.params.id, resolvedModel?.id);
        const session = await getReadinessSession(req.params.id);
        const areas = getDomainAreas();
        const areaMap = Object.fromEntries(areas.map(a => [a.id, a.name]));
        const qaHistory = session ? Object.entries(session.responses).flatMap(([areaId, answers]) =>
            (answers as any[]).map(qa => ({ area: areaMap[areaId] || areaId, question: qa.question, answer: qa.answer, type: qa.type }))
        ) : [];
        const gaps = session?.conversationContext?.identifiedGaps || [];
        const painPoints = session?.conversationContext?.painPoints || [];
        res.json({ report, qaHistory, gaps, painPoints });
    } catch (error: any) {
        console.error('Error generating readiness report:', error);
        if (error instanceof LLMWarmingUpError) {
            await ensureGpuWarm();
            return res.status(503).json({ error: error.message, code: 'LLM_WARMING_UP' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Generate gap analysis report
router.get('/:id/report/gap', async (req: Request, res: Response) => {
    try {
        const requestedModel = req.query.model as string | undefined;
        const resolvedModel = await getEffectiveModel(requestedModel);
        const { generateGapReport } = await import('../services/reportService');
        const report = await generateGapReport(req.params.id, resolvedModel?.id);
        const session = await getReadinessSession(req.params.id);
        const areas = getDomainAreas();
        const areaMap = Object.fromEntries(areas.map(a => [a.id, a.name]));
        const qaHistory = session ? Object.entries(session.responses).flatMap(([areaId, answers]) =>
            (answers as any[]).map(qa => ({ area: areaMap[areaId] || areaId, question: qa.question, answer: qa.answer, type: qa.type }))
        ) : [];
        const gaps = session?.conversationContext?.identifiedGaps || [];
        const painPoints = session?.conversationContext?.painPoints || [];
        res.json({ report, qaHistory, gaps, painPoints });
    } catch (error: any) {
        console.error('Error generating gap report:', error);
        if (error instanceof LLMWarmingUpError) {
            await ensureGpuWarm();
            return res.status(503).json({ error: error.message, code: 'LLM_WARMING_UP' });
        }
        res.status(500).json({ error: error.message });
    }
});

export default router;
