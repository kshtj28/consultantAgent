import { Router, Request, Response } from 'express';
import { opensearchClient, INDICES } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { getActiveDomainId } from '../services/domainService';

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
    gapCount?: number;
    highGapCount?: number;
    riskScore?: number;
}

// GET /api/sessions/all — list all interview and readiness sessions
router.get('/sessions/all', async (req: Request, res: Response) => {
    try {
        const user = (req as AuthRequest).user;
        const isAdmin = user?.role === 'admin';
        const userId = user?.userId || (user as any)?.id;

        const sessions: SessionSummary[] = [];

        // Pre-fetch report gap data keyed by sessionId for per-session metrics
        const sessionGapData = new Map<string, { total: number; high: number; medium: number }>();
        try {
            const reportsExist = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
            if (reportsExist.body) {
                const reportResult = await opensearchClient.search({
                    index: INDICES.REPORTS,
                    body: {
                        query: { term: { status: 'ready' } },
                        size: 500,
                        _source: ['sessionId', 'content.gaps'],
                    },
                });
                const reportHits = (reportResult.body?.hits?.hits || []) as any[];
                for (const hit of reportHits) {
                    const doc = hit._source;
                    if (!doc?.sessionId) continue;
                    const gaps = doc.content?.gaps || [];
                    const existing = sessionGapData.get(doc.sessionId) || { total: 0, high: 0, medium: 0 };
                    const seenDescs = new Set<string>();
                    for (const gap of gaps) {
                        const desc = (gap.gap || gap.description || '').toLowerCase().trim();
                        if (!desc || seenDescs.has(desc)) continue;
                        seenDescs.add(desc);
                        existing.total++;
                        const impact = (gap.impact || '').toLowerCase();
                        if (impact === 'high') existing.high++;
                        else if (impact === 'medium') existing.medium++;
                    }
                    sessionGapData.set(doc.sessionId, existing);
                }
            }
        } catch {
            // Reports may not exist yet
        }

        // --- Interview sessions (stored in consultant_conversations, tagged with sessionType) ---
        try {
            const activeDomainId = getActiveDomainId();
            const interviewMust: any[] = [
                { match: { sessionType: 'interview_session' } },
                { bool: { should: [
                    { term: { domainId: activeDomainId } },
                    { term: { 'domainId.keyword': activeDomainId } },
                ], minimum_should_match: 1 } },
            ];
            if (!isAdmin && userId) {
                interviewMust.push({ bool: { should: [
                    { term: { userId } },
                    { term: { 'userId.keyword': userId } },
                ], minimum_should_match: 1 } });
            }
            const interviewResult = await opensearchClient.search({
                index: INDICES.CONVERSATIONS,
                body: {
                    query: { bool: { must: interviewMust } },
                    sort: [{ updatedAt: { order: 'desc', unmapped_type: 'date' } }],
                    size: 50,
                },
            });

            const hits = (interviewResult.body?.hits?.hits || []) as any[];
            for (const hit of hits) {
                const doc = hit._source;
                if (!doc) continue;

                // Calculate progress from actual coverage data
                const coverage: Record<string, { status: string; questionsAnswered: number }> =
                    doc.coverage && typeof doc.coverage === 'object' ? doc.coverage : {};
                const coverageEntries = Object.values(coverage);
                const totalAreas = coverageEntries.length || 1;
                const completedAreas = coverageEntries.filter(
                    (c) => c.status === 'covered'
                ).length;

                const sid = doc.sessionId || hit._id.replace('interview_', '');
                const gapInfo = sessionGapData.get(sid);
                const gapCount = gapInfo?.total || 0;
                const highGapCount = gapInfo?.high || 0;
                // Risk score: weighted gap severity, scaled to 0-100
                const riskScore = gapCount > 0
                    ? Math.min(100, Math.round((highGapCount * 3 + (gapInfo?.medium || 0) * 2 + (gapCount - highGapCount - (gapInfo?.medium || 0))) / gapCount * 33))
                    : 0;

                sessions.push({
                    id: sid,
                    type: 'interview',
                    status: doc.status || 'in_progress',
                    startedAt: doc.createdAt || doc.startedAt || new Date().toISOString(),
                    lastActivityAt: doc.updatedAt || doc.lastActivityAt || new Date().toISOString(),
                    currentCategory: doc.currentCategory,
                    progress: {
                        completed: completedAreas,
                        total: totalAreas,
                    },
                    title: `${({ finance: 'Finance', banking: 'Banking', hr: 'HR', supplychain: 'Supply Chain', construction: 'Construction', manufacturing: 'Manufacturing' }[doc.domainId as string] ?? 'Finance')} Interview — ${new Date(doc.createdAt || Date.now()).toLocaleDateString('en-US')}`,
                    gapCount,
                    highGapCount,
                    riskScore,
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
                const readinessQuery: any = !isAdmin && userId
                    ? { bool: { should: [
                        { term: { userId } },
                        { term: { 'userId.keyword': userId } },
                    ], minimum_should_match: 1 } }
                    : { match_all: {} };
                const readinessResult = await opensearchClient.search({
                    index: 'readiness_sessions',
                    body: {
                        query: readinessQuery,
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

                    const rSid = doc.sessionId || hit._id;
                    const rGapInfo = sessionGapData.get(rSid);
                    const rGapCount = rGapInfo?.total || 0;
                    const rHighGapCount = rGapInfo?.high || 0;
                    const rRiskScore = rGapCount > 0
                        ? Math.min(100, Math.round((rHighGapCount * 3 + (rGapInfo?.medium || 0) * 2 + (rGapCount - rHighGapCount - (rGapInfo?.medium || 0))) / rGapCount * 33))
                        : 0;

                    sessions.push({
                        id: rSid,
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
                        gapCount: rGapCount,
                        highGapCount: rHighGapCount,
                        riskScore: rRiskScore,
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

/**
 * POST /api/sessions/recompute-coverage
 * Fixes existing sessions whose coverage statuses are stuck at 'in_progress'
 * because the old logic required aiConfident=true (which the LLM rarely returned).
 * The new rule: sub-area is 'covered' if questionsAnswered >= 3, regardless of aiConfident.
 * No new assessment required — just re-evaluates the existing answer counts.
 */
router.post('/sessions/recompute-coverage', async (req: Request, res: Response) => {
    try {
        const indexExists = await opensearchClient.indices.exists({ index: INDICES.CONVERSATIONS });
        if (!indexExists.body) return res.json({ updated: 0, message: 'No sessions index found' });

        // Fetch all interview sessions
        const result = await opensearchClient.search({
            index: INDICES.CONVERSATIONS,
            body: {
                query: { match: { sessionType: 'interview_session' } },
                size: 500,
            },
        });

        const hits = (result.body.hits.hits as any[]);
        let updated = 0;
        let skipped = 0;

        for (const hit of hits) {
            const doc = hit._source;
            if (!doc?.coverage || typeof doc.coverage !== 'object') { skipped++; continue; }

            let changed = false;
            const updatedCoverage = { ...doc.coverage };

            for (const [subAreaId, cov] of Object.entries(updatedCoverage) as [string, any][]) {
                const questionsAnswered = cov.questionsAnswered ?? (doc.responses?.[subAreaId]?.length ?? 0);
                const oldStatus = cov.status;

                // Apply the same rule as the fixed interviewService:
                // 3+ answers → covered; 2+ with aiConfident → covered; else in_progress
                const coveredByVolume = questionsAnswered >= 3;
                const coveredByAI = questionsAnswered >= 2 && cov.aiConfident === true;
                const newStatus = (coveredByVolume || coveredByAI)
                    ? 'covered'
                    : (questionsAnswered > 0 ? 'in_progress' : 'not_started');

                if (newStatus !== oldStatus) {
                    updatedCoverage[subAreaId] = { ...cov, status: newStatus, questionsAnswered };
                    changed = true;
                }
            }

            if (changed) {
                await opensearchClient.index({
                    index: INDICES.CONVERSATIONS,
                    id: hit._id,
                    body: { ...doc, coverage: updatedCoverage, updatedAt: new Date().toISOString() },
                    refresh: false,
                });
                updated++;
            } else {
                skipped++;
            }
        }

        // Refresh index so next /sessions/all call sees updated data
        await opensearchClient.indices.refresh({ index: INDICES.CONVERSATIONS }).catch(() => {});

        return res.json({
            updated,
            skipped,
            total: hits.length,
            message: `Re-evaluated ${hits.length} sessions. ${updated} updated to reflect correct coverage status.`,
        });
    } catch (error: any) {
        console.error('Error recomputing coverage:', error);
        return res.status(500).json({ error: error.message });
    }
});

export default router;
