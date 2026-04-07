import { Router, Request, Response } from 'express';
import { opensearchClient, INDICES } from '../config/database';

const router = Router();

interface SessionSummary {
    id: string;
    type: 'interview' | 'readiness';
    status: 'in_progress' | 'completed' | 'abandoned';
    startedAt: string;
    lastActivityAt: string;
    currentCategory?: string;
    progress: {
        completed: number;
        total: number;
    };
    title: string;
}

// GET /api/sessions/all — list all interview and readiness sessions
router.get('/sessions/all', async (req: Request, res: Response) => {
    try {
        const sessions: SessionSummary[] = [];

        // --- Interview sessions (stored in consultant_conversations, tagged with sessionType) ---
        try {
            const interviewResult = await opensearchClient.search({
                index: INDICES.CONVERSATIONS,
                body: {
                    query: {
                        match: { sessionType: 'interview_session' },
                    },
                    sort: [{ updatedAt: { order: 'desc', unmapped_type: 'date' } }],
                    size: 50,
                },
            });

            const hits = (interviewResult.body?.hits?.hits || []) as any[];
            for (const hit of hits) {
                const doc = hit._source;
                if (!doc) continue;

                // Calculate progress from responses
                // responses is { [categoryId]: InterviewAnswer[] }, not an array
                const responses: Record<string, any[]> =
                    doc.responses && !Array.isArray(doc.responses) ? doc.responses : {};
                const depthThresholds: Record<string, number> = { quick: 3, standard: 5, deep: 8 };
                const threshold = depthThresholds[doc.depth] ?? 5;
                const totalCategories = 8;
                const completedCategories = Object.values(responses).filter(
                    (answers) => Array.isArray(answers) && answers.length >= threshold
                ).length;

                sessions.push({
                    id: doc.sessionId || hit._id.replace('interview_', ''),
                    type: 'interview',
                    status: doc.status || 'in_progress',
                    startedAt: doc.createdAt || doc.startedAt || new Date().toISOString(),
                    lastActivityAt: doc.updatedAt || doc.lastActivityAt || new Date().toISOString(),
                    currentCategory: doc.currentCategory,
                    progress: {
                        completed: completedCategories,
                        total: totalCategories,
                    },
                    title: `Finance Interview — ${new Date(doc.createdAt || Date.now()).toLocaleDateString('en-US')}`,
                });
            }
        } catch (err) {
            console.warn('Failed to fetch interview sessions:', err);
        }

        // --- Readiness sessions (stored in a readiness_sessions index) ---
        try {
            const readinessExists = await opensearchClient.indices.exists({
                index: 'readiness_sessions',
            });

            if (readinessExists.body) {
                const readinessResult = await opensearchClient.search({
                    index: 'readiness_sessions',
                    body: {
                        query: { match_all: {} },
                        sort: [{ updatedAt: { order: 'desc', unmapped_type: 'date' } }],
                        size: 50,
                    },
                });

                const hits = (readinessResult.body?.hits?.hits || []) as any[];
                for (const hit of hits) {
                    const doc = hit._source;
                    if (!doc) continue;

                    const selectedAreas: string[] = doc.selectedAreas || [];
                    // responses is { [areaId]: QuestionAnswer[] }, not an array
                    const responses: Record<string, any[]> =
                        doc.responses && !Array.isArray(doc.responses) ? doc.responses : {};
                    const answeredAreas = Object.keys(responses).filter(
                        key => Array.isArray(responses[key]) && responses[key].length > 0
                    ).length;

                    sessions.push({
                        id: doc.sessionId || hit._id,
                        type: 'readiness',
                        status: doc.status || 'in_progress',
                        startedAt: doc.createdAt || new Date().toISOString(),
                        lastActivityAt: doc.updatedAt || new Date().toISOString(),
                        currentCategory: doc.currentArea,
                        progress: {
                            completed: answeredAreas,
                            total: selectedAreas.length || 7,
                        },
                        title: `Readiness Assessment — ${new Date(doc.createdAt || Date.now()).toLocaleDateString('en-US')}`,
                    });
                }
            }
        } catch (err) {
            console.warn('Failed to fetch readiness sessions:', err);
        }

        // Sort all sessions by last activity, most recent first
        sessions.sort(
            (a, b) =>
                new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
        );

        res.json({ sessions });
    } catch (error: any) {
        console.error('Error fetching sessions:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
