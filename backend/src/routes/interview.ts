import { Router, Request, Response } from 'express';
import {
    createInterviewSession,
    getInterviewSession,
    updateInterviewSession,
    getInterviewProgress,
    processInterviewMessage,
    submitInterviewAnswer,
    generateNextInterviewQuestion,
    getNextIncompleteCategory,
    switchCategory,
    generateFinanceGapReport,
    getInterviewStartMessage,
    detectVagueAnswer,
    calculateReadinessScore,
    submitWrapUpReflection,
    getTotalAnswerCount,
    DEPTH_THRESHOLDS,
    CategoryId,
    InterviewDepth,
    BroadAreaProgress,
    SubAreaCoverage,
} from '../services/interviewService';
import { isValidLanguage, LanguageCode } from '../services/languageService';
import { getBroadAreas, getSubAreasForBroadArea, getBroadArea, getActiveDomainConfig } from '../services/domainService';
import { getInterviewCategories } from '../services/domainService';
import { LLMWarmingUpError } from '../services/llmService';
import { triggerGpuWarmup, scheduleScaleDown, isGpuScalingEnabled } from '../services/gpuScalingService';
import { getEffectiveModel } from '../services/settingsService';
import { translateInterviewHistory } from '../services/translationService';

const router = Router();

/** Ensure the GPU/ECS service is scaling up (idempotent, non-fatal). */
async function ensureGpuWarm(): Promise<void> {
    if (!isGpuScalingEnabled()) return;
    try {
        await triggerGpuWarmup();
        scheduleScaleDown();
    } catch (err) {
        console.error('[interviewRoutes] GPU warmup trigger failed (non-fatal):', err);
    }
}

// ─── Static routes (BEFORE /:sessionId to avoid param capture) ───────────────

// Get category / broad-area list
router.get('/categories/list', async (_req: Request, res: Response) => {
    try {
        const broadAreas = getBroadAreas().map(ba => ({
            id: ba.id,
            name: ba.name,
            description: ba.description,
            order: ba.order,
            icon: ba.icon,
            subAreas: ba.subAreas.map(s => ({
                id: s.id,
                name: s.name,
                description: s.description,
            })),
        }));
        res.json({ broadAreas });
    } catch (err) {
        console.error('Failed to get broad areas:', err);
        res.status(500).json({ error: 'Failed to load broad areas' });
    }
});

// Config: supported languages
router.get('/config/languages', async (_req: Request, res: Response) => {
    try {
        const { getSupportedLanguages } = await import('../services/languageService');
        res.json({ languages: getSupportedLanguages() });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load languages' });
    }
});

// Config: available domains
router.get('/config/domains', async (_req: Request, res: Response) => {
    try {
        const { getAvailableDomains } = await import('../services/domainService');
        res.json({ domains: getAvailableDomains() });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load domains' });
    }
});

// Config: active domain + broad areas
router.get('/config/domain', async (_req: Request, res: Response) => {
    try {
        const config = getActiveDomainConfig();
        const broadAreas = getBroadAreas();
        res.json({
            domain: { id: config.id, name: config.name, description: config.description },
            broadAreas,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load domain config' });
    }
});

// Config: set active domain
router.put('/config/domain', async (req: Request, res: Response) => {
    try {
        const { setActiveDomain } = await import('../services/domainService');
        const { domainId } = req.body;
        setActiveDomain(domainId);
        const config = getActiveDomainConfig();
        res.json({ success: true, domain: { id: config.id, name: config.name, description: config.description } });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

// ─── Session routes ──────────────────────────────────────────────────────────

// Start new interview session
router.post('/start', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId || req.body.userId;
        const depth = req.body.depth || 'standard';
        const language = req.body.language;
        const selectedBroadAreas = req.body.selectedBroadAreas;
        const selectedSubAreas = req.body.selectedSubAreas;

        await ensureGpuWarm();

        const session = await createInterviewSession(userId, depth, language, selectedBroadAreas, selectedSubAreas);
        const progress = getInterviewProgress(session);
        const question = await generateNextInterviewQuestion(session);
        const message = getInterviewStartMessage();

        res.json({
            sessionId: session.sessionId,
            message,
            question,
            progress,
            currentSubArea: session.currentSubArea,
            selectedBroadAreas: session.selectedBroadAreas,
        });
    } catch (err: any) {
        if (err instanceof LLMWarmingUpError) {
            return res.status(503).json({ error: err.message, code: 'LLM_WARMING_UP', retryAfter: 30 });
        }
        console.error('Failed to start interview:', err);
        res.status(500).json({ error: 'Failed to start interview session' });
    }
});

// Get next question for current category
router.get('/:sessionId/next-question', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const subAreaId = (req.query.subAreaId || req.query.categoryId) as string | undefined;
        const resolvedModel = await getEffectiveModel(req.query.model as string | undefined);
        const modelId = resolvedModel?.id;
        const requestedLanguage = req.query.language as string | undefined;
        const session = await getInterviewSession(sessionId);

        if (!session) {
            return res.status(404).json({ error: 'Interview session not found' });
        }

        // If the client passes a new language (user changed language in settings),
        // update the session so all future question generation uses the new language.
        if (requestedLanguage && isValidLanguage(requestedLanguage) && requestedLanguage !== session.language) {
            session.language = requestedLanguage;
            await updateInterviewSession(session);
        }

        const question = await generateNextInterviewQuestion(session, subAreaId, modelId);

        res.json({
            question,
            progress: getInterviewProgress(session),
            currentSubArea: session.currentSubArea,
        });
    } catch (error: any) {
        console.error('Error generating next question:', error);
        if (error instanceof LLMWarmingUpError) {
            await ensureGpuWarm();
            return res.status(503).json({ error: error.message, code: 'LLM_WARMING_UP' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Translate interview history (batch)
router.post('/:sessionId/translate-history', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { language, model } = req.body;

        if (!isValidLanguage(language)) {
            return res.status(400).json({ error: 'Invalid target language' });
        }

        const session = await getInterviewSession(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Interview session not found' });
        }

        const resolvedModel = await getEffectiveModel(model);
        const translatedResponses = await translateInterviewHistory(session.responses, language, resolvedModel?.id);
        
        session.responses = translatedResponses;
        session.language = language;
        await updateInterviewSession(session);

        res.json({ success: true, responses: translatedResponses });
    } catch (err: any) {
        console.error('Failed to translate history:', err);
        res.status(500).json({ error: 'Failed to translate interview history' });
    }
});

// Submit structured answer
router.post('/:sessionId/answer', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { questionId, question, answer, type, mode, categoryId, subAreaId, model, aiConfident, language, attachments } = req.body;

        const session = await getInterviewSession(sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        // Update session language if user changed it in settings
        if (language && isValidLanguage(language) && language !== session.language) {
            session.language = language;
        }

        const targetSubArea = subAreaId || categoryId;

        // submitInterviewAnswer runs the audit-defensibility classifier on
        // narrative answers and attaches the result to the persisted answer.
        const submitResult = await submitInterviewAnswer(session, {
            questionId,
            question,
            answer,
            type: type || 'open_ended',
            mode: mode || 'discovery',
            subAreaId: targetSubArea,
            aiConfident: aiConfident || false,
            attachments: Array.isArray(attachments) ? attachments : undefined,
            modelId: model,
        });
        const sufficiency = submitResult.sufficiency;

        const progress = getInterviewProgress(session);
        const readinessScore = calculateReadinessScore(session);
        const allCovered = progress.every(ba => ba.overallStatus === 'covered');

        if (allCovered) {
            session.status = 'completed';
            await updateInterviewSession(session);

            const { triggerDataPipeline } = await import('../services/pipelineTriggerService');
            triggerDataPipeline(session).catch(err =>
                console.error('Pipeline trigger failed on completion:', err)
            );

            return res.json({
                progress,
                currentSubArea: session.currentSubArea,
                completed: true,
                readinessScore,
                sufficiency,
            });
        }

        // When the classifier says the answer fell short, route the next
        // question as a targeted dimensional probe (Pattern 1). For
        // structured (non-narrative) answer types we have no classifier
        // output — keep the legacy regex check as a backstop.
        let vagueContext;
        let isFollowUp = false;
        let vagueWarning: string | undefined;

        if (sufficiency && !sufficiency.passed) {
            isFollowUp = true;
            const dim = sufficiency.missingDimension;
            vagueContext = {
                question,
                answer: typeof answer === 'string' ? answer : String(answer),
                reason: sufficiency.reasoning || 'Insufficient process detail to document.',
                missingDimension: dim ?? undefined,
                recommendedProbe: sufficiency.recommendedProbe,
                overallScore: sufficiency.overall,
            };
            vagueWarning = dim
                ? `Your answer needs more detail on **${dim}** to be audit-ready. The next question will probe that specifically.`
                : `Your answer needs more detail to be audit-ready (sufficiency ${sufficiency.overall}/100). The next question will probe for specifics.`;
        } else if (!sufficiency) {
            // Narrative classifier didn't run (structured-type answer or
            // skipped). Fall back to the regex heuristic so non-narrative
            // free text still gets some scrutiny.
            const answerText = typeof answer === 'string' ? answer : null;
            const vagueCheck = (type === 'open_ended' && answerText)
                ? detectVagueAnswer(answerText)
                : { isVague: false, reason: '' };
            if (vagueCheck.isVague && answerText) {
                isFollowUp = true;
                vagueContext = { question, answer: answerText, reason: vagueCheck.reason };
                vagueWarning = `Your answer needs more detail — ${vagueCheck.reason.toLowerCase()}.`;
            }
        }

        // If we're following up, keep the next question on the same sub-area.
        const nextSubAreaHint = vagueContext ? (targetSubArea || session.currentSubArea || undefined) : undefined;
        const nextQuestion = await generateNextInterviewQuestion(session, nextSubAreaHint, model, vagueContext);
        const updatedProgress = getInterviewProgress(session);

        res.json({
            nextQuestion,
            progress: updatedProgress,
            currentSubArea: session.currentSubArea,
            readinessScore,
            isFollowUp,
            vagueWarning,
            sufficiency,
        });
    } catch (err: any) {
        if (err instanceof LLMWarmingUpError) {
            return res.status(503).json({ error: err.message, code: 'LLM_WARMING_UP', retryAfter: 30 });
        }
        console.error('Failed to submit answer:', err);
        res.status(500).json({ error: 'Failed to submit answer' });
    }
});

// Get interview progress
router.get('/:sessionId/progress', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const session = await getInterviewSession(sessionId);

        if (!session) {
            return res.status(404).json({ error: 'Interview session not found' });
        }

        res.json({
            progress: getInterviewProgress(session),
            currentSubArea: session.currentSubArea,
            status: session.status,
        });
    } catch (error: any) {
        console.error('Error getting interview progress:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get full interview session
router.get('/:sessionId', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const session = await getInterviewSession(sessionId);

        if (!session) {
            return res.status(404).json({ error: 'Interview session not found' });
        }

        res.json({
            sessionId: session.sessionId,
            progress: getInterviewProgress(session),
            currentSubArea: session.currentSubArea,
            status: session.status,
            conversationHistory: session.conversationHistory,
            responses: session.responses,
            coverage: session.coverage,
            selectedBroadAreas: session.selectedBroadAreas,
        });
    } catch (error: any) {
        console.error('Error getting interview session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Send free-text message in interview (legacy/fallback)
router.post('/:sessionId/message', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { message, model: requestedModel } = req.body;
        const resolvedModel = await getEffectiveModel(requestedModel);
        const modelId = resolvedModel?.id;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const session = await getInterviewSession(sessionId);

        if (!session) {
            return res.status(404).json({ error: 'Interview session not found' });
        }

        const { response, extractedData } = await processInterviewMessage(session, message, modelId);
        const updatedSession = await getInterviewSession(sessionId);

        res.json({
            message: response,
            progress: getInterviewProgress(updatedSession!),
            currentCategory: updatedSession!.currentCategory,
            extractedData,
        });
    } catch (error: any) {
        console.error('Error processing interview message:', error);
        if (error instanceof LLMWarmingUpError) {
            await ensureGpuWarm();
            return res.status(503).json({ error: error.message, code: 'LLM_WARMING_UP' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Switch interview category / sub-area
router.post('/:sessionId/category', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const targetId = req.body.subAreaId || req.body.categoryId;
        const { model: requestedModel } = req.body;
        const resolvedModel = await getEffectiveModel(requestedModel);
        const modelId = resolvedModel?.id;

        if (!targetId) {
            return res.status(400).json({ error: 'subAreaId or categoryId is required' });
        }

        const session = await getInterviewSession(sessionId);

        if (!session) {
            return res.status(404).json({ error: 'Interview session not found' });
        }

        const response = await switchCategory(session, targetId as CategoryId);
        session.conversationHistory.push({ role: 'assistant', content: response });

        const updatedSession = await getInterviewSession(sessionId);

        // Generate next question for the new category
        const nextQuestion = await generateNextInterviewQuestion(updatedSession!, undefined, modelId);

        res.json({
            message: response,
            question: nextQuestion,
            progress: getInterviewProgress(updatedSession!),
            currentSubArea: updatedSession!.currentSubArea,
        });
    } catch (error: any) {
        console.error('Error switching category:', error);
        if (error instanceof LLMWarmingUpError) {
            await ensureGpuWarm();
            return res.status(503).json({ error: error.message, code: 'LLM_WARMING_UP' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Pause interview session and trigger data pipeline
router.post('/:sessionId/pause', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const session = await getInterviewSession(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (session.status === 'completed') {
            return res.status(400).json({ error: 'Session is already completed' });
        }

        session.updatedAt = new Date().toISOString();
        await updateInterviewSession(session);

        // Trigger data pipeline fire-and-forget
        const { triggerDataPipeline } = await import('../services/pipelineTriggerService');
        triggerDataPipeline(session).catch(err =>
            console.error('Pipeline trigger failed on pause:', err)
        );

        const progress = getInterviewProgress(session);
        return res.json({
            message: 'Session paused, reports generating',
            progress,
            currentSubArea: session.currentSubArea,
        });
    } catch (err: any) {
        console.error('Pause session error:', err);
        return res.status(500).json({ error: 'Failed to pause session' });
    }
});

// Mark interview session as explicitly completed
const MIN_READINESS_TO_COMPLETE = 15; // soft floor — overridable with force=true
const ABSOLUTE_MIN_ANSWERS = 1;       // hard floor — never overridable

router.post('/:sessionId/complete', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { force } = req.body || {};
        const session = await getInterviewSession(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const readinessScore = calculateReadinessScore(session);
        const totalAnswers = getTotalAnswerCount(session);

        // HARD floor: at least one substantive answer is required to
        // generate any report. force=true cannot bypass this — wrap-up
        // reflections are explicitly excluded so an empty session can't
        // be passed off as "complete" with only a free-text comment.
        if (totalAnswers < ABSOLUTE_MIN_ANSWERS) {
            return res.status(400).json({
                canComplete: false,
                readinessScore,
                error: `You haven't answered any questions yet. Please answer at least ${ABSOLUTE_MIN_ANSWERS} interview question before finishing — wrap-up reflections alone are not enough to generate meaningful reports.`,
            });
        }

        if (!force && readinessScore < MIN_READINESS_TO_COMPLETE) {
            return res.status(400).json({
                canComplete: false,
                readinessScore,
                error: `Assessment is too incomplete (${readinessScore}% readiness). Please answer at least a few more questions so the reports and BPMN diagrams will be meaningful.`,
            });
        }

        if (session.status !== 'completed') {
            session.status = 'completed';
            session.updatedAt = new Date().toISOString();
            await updateInterviewSession(session);

            const { triggerDataPipeline } = await import('../services/pipelineTriggerService');
            triggerDataPipeline(session).catch(err =>
                console.error('Pipeline trigger failed on explicit completion:', err)
            );
        }

        const progress = getInterviewProgress(session);
        return res.json({
            message: 'Session completed successfully',
            progress,
            currentSubArea: session.currentSubArea,
            completed: true,
            readinessScore,
        });
    } catch (err: any) {
        console.error('Complete session error:', err);
        return res.status(500).json({ error: 'Failed to complete session' });
    }
});

// Submit the wrap-up "anything we missed?" reflection. Optional step
// invoked from the finish modal — captures free-text the structured
// interview didn't surface. Stored on the session and injected into the
// gap report synthesis.
router.post('/:sessionId/wrap-up', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { reflection, model } = req.body || {};

        if (typeof reflection !== 'string' || !reflection.trim()) {
            return res.status(400).json({ error: 'reflection text is required' });
        }

        const session = await getInterviewSession(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const resolvedModel = await getEffectiveModel(model);
        const saved = await submitWrapUpReflection(session, reflection, resolvedModel?.id);

        return res.json({ wrapUpReflection: saved });
    } catch (err: any) {
        if (err instanceof LLMWarmingUpError) {
            return res.status(503).json({ error: err.message, code: 'LLM_WARMING_UP' });
        }
        console.error('Failed to submit wrap-up reflection:', err);
        return res.status(500).json({ error: 'Failed to save reflection' });
    }
});

// Generate GAP analysis report from interview
router.post('/:sessionId/report', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const { model: requestedModel } = req.body;
        const resolvedModel = await getEffectiveModel(requestedModel);
        const modelId = resolvedModel?.id;
        const session = await getInterviewSession(sessionId);

        if (!session) {
            return res.status(404).json({ error: 'Interview session not found' });
        }

        const report = await generateFinanceGapReport(session, modelId);

        // Build flat Q&A history with category names for the Overview tab
        const categories = getInterviewCategories();
        const categoryNameMap: Record<string, string> = Object.fromEntries(
            categories.map(c => [c.id, c.name])
        );
        const qaHistory = Object.entries(session.responses).flatMap(([catId, answers]) =>
            answers.map(a => ({
                categoryId: catId,
                categoryName: categoryNameMap[catId] ?? catId,
                question: a.question,
                answer: a.answer,
                type: a.type,
            }))
        );

        res.json({
            report,
            qaHistory,
            interviewProgress: getInterviewProgress(session),
        });
    } catch (error: any) {
        console.error('Error generating report:', error);
        if (error instanceof LLMWarmingUpError) {
            await ensureGpuWarm();
            return res.status(503).json({ error: error.message, code: 'LLM_WARMING_UP' });
        }
        res.status(500).json({ error: error.message });
    }
});

export default router;
