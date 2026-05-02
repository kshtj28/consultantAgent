import { Router, Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getMetrics, upsertMetrics, recomputeAndStoreMetrics, addMetricsSSEClient } from '../services/metricsService';
import { fetchInsights } from '../services/insightsService';
import { getProjectContext } from '../services/settingsService';
import { opensearchClient, INDICES } from '../config/database';

const router = Router();

// GET /api/dashboard/stats — always recompute from live data
router.get('/stats', async (req: Request, res: Response) => {
    const user = (req as AuthRequest).user;
    if (user?.role !== 'admin') {
        // Non-admin users: return stats scoped to their own sessions/reports
        try {
            const uid = user?.userId || (user as any)?.id;
            const userFilter = uid ? { bool: { should: [
                { term: { generatedBy: uid } },
                { term: { 'generatedBy.keyword': uid } },
            ], minimum_should_match: 1 } } : { match_all: {} };

            let totalSessions = 0;
            let completedSessions = 0;
            try {
                const sessRes = await opensearchClient.search({
                    index: INDICES.CONVERSATIONS,
                    body: {
                        query: uid ? { bool: { must: [
                            { match: { sessionType: 'interview_session' } },
                            { bool: { should: [{ term: { userId: uid } }, { term: { 'userId.keyword': uid } }], minimum_should_match: 1 } },
                        ] } } : { match: { sessionType: 'interview_session' } },
                        size: 0,
                        aggs: {
                            total: { value_count: { field: 'sessionId' } },
                            completed: { filter: { term: { status: 'completed' } } },
                        },
                    },
                });
                totalSessions = sessRes.body.hits.total?.value || 0;
                completedSessions = sessRes.body.aggregations?.completed?.doc_count || 0;
            } catch { /* sessions may not exist */ }

            let criticalIssues = 0;
            let mediumGaps = 0;
            let lowGaps = 0;
            try {
                const reportIndexExists = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
                if (reportIndexExists.body) {
                    const gapRes = await opensearchClient.search({
                        index: INDICES.REPORTS,
                        body: {
                            query: { bool: { must: [{ term: { status: 'ready' } }, userFilter] } },
                            size: 200,
                            _source: ['content.gaps'],
                        },
                    });
                    for (const hit of gapRes.body.hits.hits as any[]) {
                        const gaps = hit._source?.content?.gaps || [];
                        for (const g of gaps) {
                            const impact = (g.impact || '').toLowerCase();
                            if (impact === 'high') criticalIssues++;
                            else if (impact === 'medium') mediumGaps++;
                            else lowGaps++;
                        }
                    }
                }
            } catch { /* reports may not exist */ }

            const totalGaps = criticalIssues + mediumGaps + lowGaps;
            const avgRisk = totalGaps > 0
                ? Math.round((criticalIssues * 3 + mediumGaps * 2 + lowGaps * 1) / totalGaps * 33)
                : 0;

            return res.json({
                totalSessions,
                completedSessions,
                criticalIssues,
                criticalIssuesTrend: 'stable',
                discoveryPct: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
                gapSeverity: criticalIssues >= 5 ? 'High Risk' : criticalIssues >= 2 ? 'Medium Risk' : 'Low Risk',
                avgRisk,
                maxRisk: 100,
                automationPct: 0,
                automationDelta: 0,
                automationTrend: 'stable',
                estCompletion: 'N/A',
                processFlow: null,
                processTypeDistribution: [],
                processEfficiency: [],
            });
        } catch (err: any) {
            console.error('Error fetching user dashboard stats:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    try {
        const metrics = await recomputeAndStoreMetrics();

        // Return in the shape the frontend expects
        res.json({
            totalSessions: metrics.totalSessions,
            completedSessions: metrics.completedSessions,
            criticalIssues: metrics.criticalIssues.count,
            criticalIssuesTrend: metrics.criticalIssues.trend,
            discoveryPct: metrics.discoveryProgress.pct,
            gapSeverity: metrics.gapSeverity.level,
            avgRisk: metrics.gapSeverity.avgRisk,
            maxRisk: metrics.gapSeverity.maxRisk,
            automationPct: metrics.automationQuotient.currentPct,
            automationDelta: metrics.automationQuotient.improvementDelta,
            automationTrend: metrics.automationQuotient.trend,
            estCompletion: metrics.discoveryProgress.estCompletion,
            processFlow: metrics.processFlow,
            processTypeDistribution: metrics.processTypeDistribution,
            processEfficiency: metrics.processEfficiency,
        });
    } catch (err: any) {
        console.error('Error fetching dashboard stats:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/dashboard/metrics — update stored metrics (admin only)
router.put('/metrics', async (req: Request, res: Response) => {
    const user = (req as AuthRequest).user;
    if (!user || user.role !== 'admin') {
        return res.sendStatus(403);
    }

    try {
        const updated = await upsertMetrics(req.body);
        res.json(updated);
    } catch (err: any) {
        console.error('Error updating dashboard metrics:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/dashboard/metrics/recompute — recompute from session data
router.post('/metrics/recompute', async (req: Request, res: Response) => {
    const user = (req as AuthRequest).user;
    if (!user || user.role !== 'admin') {
        return res.sendStatus(403);
    }

    try {
        const metrics = await recomputeAndStoreMetrics();
        res.json(metrics);
    } catch (err: any) {
        console.error('Error recomputing metrics:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/dashboard/stream — SSE for real-time metric updates
router.get('/stream', (req: Request, res: Response) => {
    const user = (req as AuthRequest).user;
    if (!user) return res.sendStatus(401);

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });

    res.write('data: {"type":"connected"}\n\n');

    addMetricsSSEClient(res);

    const keepAlive = setInterval(() => {
        res.write(': keepalive\n\n');
    }, 30000);

    req.on('close', () => {
        clearInterval(keepAlive);
    });
});

// GET /api/dashboard/executive-summary — high-level CXO data: readiness score, recommendations, impact
router.get('/executive-summary', async (req: Request, res: Response) => {
    const user = (req as AuthRequest).user;
    const uid = user?.role !== 'admin' ? (user?.userId || (user as any)?.id) : null;

    try {
        // 1. Fetch cumulative gap data to compute readiness score
        let totalGaps = 0;
        let highGaps = 0;
        let mediumGaps = 0;
        let lowGaps = 0;
        let fitCount = 0;
        let partialCount = 0;

        const indexExists = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
        if (indexExists.body) {
            const reportsFilter: any[] = [
                { term: { type: 'broad_area' } },
                { term: { status: 'ready' } },
            ];
            if (uid) {
                reportsFilter.push({ bool: { should: [
                    { term: { generatedBy: uid } },
                    { term: { 'generatedBy.keyword': uid } },
                ], minimum_should_match: 1 } });
            }
            const result = await opensearchClient.search({
                index: INDICES.REPORTS,
                body: {
                    query: { bool: { must: reportsFilter } },
                    size: 200,
                    sort: [{ createdAt: { order: 'desc' } }],
                },
            });

            const hits = (result.body.hits.hits || []) as any[];
            const latestByArea = new Map<string, any>();
            for (const hit of hits) {
                const doc = hit._source;
                const areaId = doc.broadAreaId || 'unknown';
                if (!latestByArea.has(areaId)) latestByArea.set(areaId, doc);
            }

            for (const doc of latestByArea.values()) {
                const gaps = doc.content?.gaps || [];
                const seen = new Set<string>();
                for (const gap of gaps) {
                    const desc = (gap.gap || '').toLowerCase().trim();
                    if (seen.has(desc)) continue;
                    seen.add(desc);
                    totalGaps++;
                    const impact = (gap.impact || '').toLowerCase();
                    if (impact === 'high') highGaps++;
                    else if (impact === 'medium') mediumGaps++;
                    else lowGaps++;
                    const fit = (gap.fit || '').toLowerCase();
                    if (fit === 'fit') fitCount++;
                    else if (fit === 'partial') partialCount++;
                }
            }
        }

        // 2. Compute readiness score (0-100)
        // Formula: start at 100, deduct for gaps weighted by severity
        // High gaps: -4 each, Medium: -2 each, Low: -0.5 each
        // Bonus for fit items: +1 each, partial: +0.5 each
        let readinessScore = 100;
        readinessScore -= highGaps * 4;
        readinessScore -= mediumGaps * 2;
        readinessScore -= lowGaps * 0.5;
        readinessScore += fitCount * 1;
        readinessScore += partialCount * 0.5;
        readinessScore = Math.max(0, Math.min(100, Math.round(readinessScore)));

        // 3. Determine risk level from actual gap counts
        let riskLevel: string;
        if (highGaps >= 10 || (highGaps >= 5 && totalGaps >= 20)) riskLevel = 'Critical';
        else if (highGaps >= 5 || (highGaps >= 3 && totalGaps >= 15)) riskLevel = 'High Risk';
        else if (highGaps >= 2 || totalGaps >= 8) riskLevel = 'Medium Risk';
        else riskLevel = 'Low Risk';

        // 4. Fetch recommendations from insights
        let recommendations: any[] = [];
        let automationSavings: string[] = [];
        try {
            const insights = await fetchInsights();
            if (insights) {
                recommendations = (insights.recommendedActions || []).slice(0, 5);
                automationSavings = (insights.automationOpportunities || []).map((o: any) => o.savings).filter(Boolean);
            }
        } catch {
            // insights may not exist yet
        }

        // 5. Fetch ERP path for context
        const projectCtx = await getProjectContext().catch(() => ({ erpPath: '', clientName: '', projectName: '', industry: '' }));

        res.json({
            readinessScore,
            riskLevel,
            totalGaps,
            highGaps,
            mediumGaps,
            lowGaps,
            fitCount,
            partialCount,
            recommendations,
            automationSavings,
            erpPath: projectCtx.erpPath || '',
            clientName: projectCtx.clientName || '',
        });
    } catch (err: any) {
        console.error('Error computing executive summary:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/dashboard/cumulative-gaps — aggregate gaps across all ready broad_area reports
router.get('/cumulative-gaps', async (req: Request, res: Response) => {
    const user = (req as AuthRequest).user;
    const uid = user?.role !== 'admin' ? (user?.userId || (user as any)?.id) : null;

    try {
        const indexExists = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
        if (!indexExists.body) {
            return res.json({ broadAreas: [], totalGaps: 0, gapsBySeverity: {}, gapsByCategory: {} });
        }

        // Fetch all ready broad_area reports with content
        const gapsFilter: any[] = [
            { term: { type: 'broad_area' } },
            { term: { status: 'ready' } },
        ];
        if (uid) {
            gapsFilter.push({ bool: { should: [
                { term: { generatedBy: uid } },
                { term: { 'generatedBy.keyword': uid } },
            ], minimum_should_match: 1 } });
        }
        const result = await opensearchClient.search({
            index: INDICES.REPORTS,
            body: {
                query: { bool: { must: gapsFilter } },
                size: 200,
                sort: [{ createdAt: { order: 'desc' } }],
            },
        });

        const hits = (result.body.hits.hits || []) as any[];

        // De-duplicate: keep only the single latest report per broadAreaId
        // (sorted desc by createdAt, so first hit per area wins)
        const latestByArea = new Map<string, any>();
        for (const hit of hits) {
            const doc = hit._source;
            const areaId = doc.broadAreaId || 'unknown';
            if (!latestByArea.has(areaId)) {
                latestByArea.set(areaId, doc);
            }
        }

        const allGaps: any[] = [];
        const broadAreaMap = new Map<string, { name: string; gapCount: number; criticalCount: number; highCount: number; mediumCount: number; lowCount: number; fitScore: number }>();

        for (const doc of latestByArea.values()) {
            const gaps = doc.content?.gaps || [];
            const areaId = doc.broadAreaId || 'unknown';
            const areaName = doc.broadAreaName || areaId;

            if (!broadAreaMap.has(areaId)) {
                broadAreaMap.set(areaId, { name: areaName, gapCount: 0, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0, fitScore: 0 });
            }
            const entry = broadAreaMap.get(areaId)!;

            // Deduplicate gaps within the report by normalized description
            const seenDescriptions = new Set<string>();
            let gapSeq = 1;
            for (const gap of gaps) {
                const normalizedDesc = (gap.gap || gap.description || '').toLowerCase().trim();
                if (seenDescriptions.has(normalizedDesc)) continue;
                seenDescriptions.add(normalizedDesc);

                // Assign consistent sequential IDs
                const gapWithId = { ...gap, id: `GAP-${String(gapSeq).padStart(3, '0')}`, broadAreaId: areaId, broadAreaName: areaName };
                gapSeq++;

                allGaps.push(gapWithId);
                entry.gapCount++;
                const impact = (gap.impact || '').toLowerCase();
                if (impact === 'high') entry.criticalCount++;
                else if (impact === 'medium') entry.mediumCount++;
                else entry.lowCount++;
            }

            if (doc.content?.overallScore != null) {
                entry.fitScore = Math.max(entry.fitScore, doc.content.overallScore);
            }
        }

        // Aggregate totals
        const gapsBySeverity: Record<string, number> = {};
        const gapsByCategory: Record<string, number> = {};
        for (const gap of allGaps) {
            const impact = gap.impact || 'low';
            gapsBySeverity[impact] = (gapsBySeverity[impact] || 0) + 1;
            const category = gap.category || 'process';
            gapsByCategory[category] = (gapsByCategory[category] || 0) + 1;
        }

        const broadAreas = Array.from(broadAreaMap.entries()).map(([id, data]) => ({ id, ...data }));

        res.json({
            broadAreas,
            totalGaps: allGaps.length,
            gapsBySeverity,
            gapsByCategory,
            gaps: allGaps,
        });
    } catch (err: any) {
        console.error('Error fetching cumulative gaps:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/dashboard/maturity-trend?days=90
// Aggregates broad_area report scores over time so the dashboard can show
// "system improvement" — a measurable delta between a baseline period and now.
router.get('/maturity-trend', async (req: Request, res: Response) => {
    const user = (req as AuthRequest).user;
    const uid = user?.role !== 'admin' ? (user?.userId || (user as any)?.id) : null;

    try {
        const days = Math.max(7, Math.min(365, parseInt(String(req.query.days ?? '90'), 10) || 90));
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const indexExists = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
        if (!indexExists.body) {
            return res.json({ days, points: [], baseline: null, current: null, deltaPct: 0, sampleCount: 0 });
        }

        const trendMust: any[] = [
            { term: { type: 'broad_area' } },
            { term: { status: 'ready' } },
            { range: { createdAt: { gte: since } } },
        ];
        if (uid) {
            trendMust.push({ bool: { should: [
                { term: { generatedBy: uid } },
                { term: { 'generatedBy.keyword': uid } },
            ], minimum_should_match: 1 } });
        }
        const result = await opensearchClient.search({
            index: INDICES.REPORTS,
            body: {
                size: 500,
                query: { bool: { must: trendMust } },
                sort: [{ createdAt: { order: 'asc' } }],
                _source: ['createdAt', 'content.overallScore', 'broadAreaId'],
            },
        });

        // Bucket by week (ISO week start, Monday). Average overallScore per bucket.
        const buckets = new Map<string, { sum: number; count: number; ts: number }>();
        for (const hit of result.body.hits.hits as any[]) {
            const score = hit._source?.content?.overallScore;
            const created = hit._source?.createdAt;
            if (typeof score !== 'number' || !created) continue;
            const d = new Date(created);
            // Snap to Monday 00:00 UTC
            const day = d.getUTCDay();
            const diffToMon = (day + 6) % 7;
            const weekStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMon));
            const key = weekStart.toISOString().slice(0, 10);
            const b = buckets.get(key) || { sum: 0, count: 0, ts: weekStart.getTime() };
            b.sum += score;
            b.count += 1;
            buckets.set(key, b);
        }

        const points = Array.from(buckets.entries())
            .sort(([, a], [, b]) => a.ts - b.ts)
            .map(([week, b]) => ({ week, avgScore: Math.round((b.sum / b.count) * 10) / 10, samples: b.count }));

        const baseline = points.length > 0 ? points[0].avgScore : null;
        const current = points.length > 0 ? points[points.length - 1].avgScore : null;
        const deltaPct =
            baseline != null && current != null && baseline > 0
                ? Math.round(((current - baseline) / baseline) * 1000) / 10
                : 0;
        const sampleCount = points.reduce((s, p) => s + p.samples, 0);

        return res.json({ days, points, baseline, current, deltaPct, sampleCount });
    } catch (err: any) {
        console.error('Error computing maturity trend:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

export default router;
