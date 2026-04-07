import { Router, Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getMetrics, upsertMetrics, recomputeAndStoreMetrics, addMetricsSSEClient } from '../services/metricsService';
import { opensearchClient, INDICES } from '../config/database';

const router = Router();

// GET /api/dashboard/stats — read stored metrics (recompute if none exist)
router.get('/stats', async (_req: Request, res: Response) => {
    try {
        let metrics = await getMetrics();

        // If no stored metrics yet, compute from session data and store
        if (!metrics) {
            metrics = await recomputeAndStoreMetrics();
        }

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

// GET /api/dashboard/cumulative-gaps — aggregate gaps across all ready broad_area reports
router.get('/cumulative-gaps', async (_req: Request, res: Response) => {
    try {
        const indexExists = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
        if (!indexExists.body) {
            return res.json({ broadAreas: [], totalGaps: 0, gapsBySeverity: {}, gapsByCategory: {} });
        }

        // Fetch all ready broad_area reports with content
        const result = await opensearchClient.search({
            index: INDICES.REPORTS,
            body: {
                query: { bool: { must: [
                    { term: { type: 'broad_area' } },
                    { term: { status: 'ready' } },
                ] } },
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
                else if (impact === 'medium') entry.highCount++;
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

export default router;
