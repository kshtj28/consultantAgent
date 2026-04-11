import { Router, Request, Response } from 'express';
import { opensearchClient, INDICES } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { addReportSSEClient, broadcastReportStatus } from '../services/reportSseService';
import { generateRTM } from '../services/rtmService';

const router = Router();

/**
 * Format byte size into a human-readable string (e.g. "1.2 MB", "450 KB").
 */
function formatFileSize(bytes: number): string {
    if (bytes >= 1_000_000) {
        return `${(bytes / 1_000_000).toFixed(1)} MB`;
    }
    if (bytes >= 1_000) {
        return `${(bytes / 1_000).toFixed(1)} KB`;
    }
    return bytes > 0 ? '< 1 KB' : '0 KB';
}

/**
 * Format total storage into GB/MB.
 */
function formatStorageUsed(bytes: number): string {
    if (bytes >= 1_000_000_000) {
        return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    }
    if (bytes >= 1_000_000) {
        return `${(bytes / 1_000_000).toFixed(1)} MB`;
    }
    if (bytes >= 1_000) {
        return `${(bytes / 1_000).toFixed(1)} KB`;
    }
    return bytes > 0 ? '< 1 KB' : '0 KB';
}

/**
 * Parse a fileSize string like "1.2 MB" or "450 KB" back to bytes.
 */
function parseSizeToBytes(sizeStr: string | number): number {
    if (!sizeStr) return 0;
    if (typeof sizeStr === 'number') return sizeStr;
    if (typeof sizeStr !== 'string') return 0;
    const match = sizeStr.match(/([\d.]+)\s*(GB|MB|KB)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === 'GB') return value * 1_000_000_000;
    if (unit === 'MB') return value * 1_000_000;
    return value * 1_000;
}

// SSE stream for real-time report status updates
router.get('/stream', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  if (!user) return res.sendStatus(401);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.write('data: {"type":"connected"}\n\n');
  addReportSSEClient(res);

  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

// GET /api/reports
router.get('/', async (req: Request, res: Response) => {
    try {
        const user = (req as AuthRequest).user;
        const { type, page = '1', limit = '20' } = req.query;
        const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
        const from = (pageNum - 1) * limitNum;

        const indexExists = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
        if (!indexExists.body) {
            return res.json({ reports: [], total: 0, page: pageNum, limit: limitNum });
        }

        // Build query
        const must: any[] = [];

        if (type) {
            must.push({ term: { type } });
        }

        const query = must.length > 0 ? { bool: { must } } : { match_all: {} };

        const result = await opensearchClient.search({
            index: INDICES.REPORTS,
            body: {
                query,
                sort: [{ createdAt: { order: 'desc' } }],
                from,
                size: limitNum,
                _source: { excludes: ['content'] },
            },
        });

        const hits = (result.body.hits.hits || []) as any[];
        const total = typeof result.body.hits.total === 'object'
            ? result.body.hits.total.value
            : result.body.hits.total;

        const reports = hits.map((hit: any) => hit._source);

        res.json({ reports, total, page: pageNum, limit: limitNum });
    } catch (error: any) {
        console.error('Error in GET /reports:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/reports/stats
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const indexExists = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
        if (!indexExists.body) {
            return res.json({ totalReports: 0, thisMonth: 0, totalDownloads: 0, storageUsed: '0 KB' });
        }

        // Total reports count
        const countResult = await opensearchClient.count({
            index: INDICES.REPORTS,
            body: { query: { match_all: {} } },
        });
        const totalReports = countResult.body.count || 0;

        // This month's reports
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthCountResult = await opensearchClient.count({
            index: INDICES.REPORTS,
            body: {
                query: {
                    range: {
                        createdAt: { gte: startOfMonth },
                    },
                },
            },
        });
        const thisMonth = monthCountResult.body.count || 0;

        // Total downloads (sum of downloadCount) and storage calculation
        const aggResult = await opensearchClient.search({
            index: INDICES.REPORTS,
            body: {
                query: { match_all: {} },
                size: 0,
                aggs: {
                    totalDownloads: {
                        sum: { field: 'downloadCount' },
                    },
                },
            },
        });
        const totalDownloads = aggResult.body.aggregations?.totalDownloads?.value || 0;

        // Calculate storage used by fetching all fileSize values
        const allReports = await opensearchClient.search({
            index: INDICES.REPORTS,
            body: {
                query: { match_all: {} },
                size: 10000,
                _source: ['fileSize'],
            },
        });

        const allHits = (allReports.body.hits.hits || []) as any[];
        let totalBytes = 0;
        for (const hit of allHits) {
            const sizeStr = hit._source?.fileSize;
            if (sizeStr) {
                totalBytes += parseSizeToBytes(sizeStr);
            }
        }
        const storageUsed = formatStorageUsed(totalBytes);

        res.json({ totalReports, thisMonth, totalDownloads, storageUsed });
    } catch (error: any) {
        console.error('Error in GET /reports/stats:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/reports/:id/download
router.get('/:id/download', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const indexExists = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
        if (!indexExists.body) {
            return res.status(404).json({ error: 'Report not found' });
        }

        // Fetch the report
        let reportDoc: any;
        try {
            const result = await opensearchClient.get({
                index: INDICES.REPORTS,
                id,
            });
            reportDoc = result.body._source;
        } catch (getErr: any) {
            return res.status(404).json({ error: 'Report not found' });
        }

        if (!reportDoc) {
            return res.status(404).json({ error: 'Report not found' });
        }

        if (reportDoc.status !== 'ready') {
            return res.status(400).json({ error: `Report is not ready. Current status: ${reportDoc.status}` });
        }

        // Increment downloadCount
        await opensearchClient.update({
            index: INDICES.REPORTS,
            id,
            body: {
                script: {
                    source: 'ctx._source.downloadCount += 1',
                    lang: 'painless',
                },
            },
            refresh: true,
        });

        res.json(reportDoc.content);
    } catch (error: any) {
        console.error('Error in GET /reports/:id/download:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/reports/:id
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const user = (req as AuthRequest).user;

        const indexExists = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
        if (!indexExists.body) {
            return res.status(404).json({ error: 'Report not found' });
        }

        // Fetch the report to verify ownership
        let reportDoc: any;
        try {
            const result = await opensearchClient.get({
                index: INDICES.REPORTS,
                id,
            });
            reportDoc = result.body._source;
        } catch (getErr: any) {
            return res.status(404).json({ error: 'Report not found' });
        }

        if (!reportDoc) {
            return res.status(404).json({ error: 'Report not found' });
        }

        // Only allow admin or the report owner to delete
        const userId = user?.userId || user?.id;
        if (user?.role !== 'admin' && reportDoc.generatedBy !== userId) {
            return res.status(403).json({ error: 'Not authorized to delete this report' });
        }

        await opensearchClient.delete({
            index: INDICES.REPORTS,
            id,
            refresh: true,
        });

        res.json({ success: true });
    } catch (error: any) {
        console.error('Error in DELETE /reports/:id:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/reports/:sessionId/rtm
router.get('/:sessionId/rtm', async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const rtm = await generateRTM(sessionId);
        res.json({ rtm });
    } catch (error: any) {
        console.error('Error generating RTM:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/reports/:reportId/retry — re-trigger pipeline for a stuck/failed report
router.post('/:reportId/retry', async (req: Request, res: Response) => {
    try {
        const { reportId } = req.params;

        const indexExists = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
        if (!indexExists.body) return res.status(404).json({ error: 'Report not found' });

        let reportDoc: any;
        try {
            const result = await opensearchClient.get({ index: INDICES.REPORTS, id: reportId });
            reportDoc = result.body._source;
        } catch {
            return res.status(404).json({ error: 'Report not found' });
        }

        const { getInterviewSession } = await import('../services/interviewService');
        const session = await getInterviewSession(reportDoc.sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        // Reset status to generating for UI
        const now = new Date().toISOString();
        await opensearchClient.update({
            index: INDICES.REPORTS,
            id: reportId,
            body: { doc: { status: 'generating', updatedAt: now } },
            refresh: 'wait_for',
        });

        // Re-trigger pipeline for just this broad area
        const { triggerDataPipeline } = await import('../services/pipelineTriggerService');
        triggerDataPipeline(session).catch((err: any) =>
            console.error('Retry pipeline failed:', err)
        );

        res.json({ success: true, message: 'Report regeneration started' });
    } catch (error: any) {
        console.error('Error retrying report:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/reports/:reportId/regenerate — regenerate a report with optional settings overrides
router.post('/:reportId/regenerate', async (req: Request, res: Response) => {
    try {
        const { reportId } = req.params;
        const { erpPath, modelId } = req.body || {};

        const indexExists = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
        if (!indexExists.body) return res.status(404).json({ error: 'Report not found' });

        let reportDoc: any;
        try {
            const result = await opensearchClient.get({ index: INDICES.REPORTS, id: reportId });
            reportDoc = result.body._source;
        } catch {
            return res.status(404).json({ error: 'Report not found' });
        }

        const { getInterviewSession } = await import('../services/interviewService');
        const session = await getInterviewSession(reportDoc.sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        // If erpPath or modelId overrides provided, update project settings before regeneration
        if (erpPath !== undefined || modelId !== undefined) {
            const { SETTINGS_DOC_ID, SETTINGS_INDEX } = await import('../services/settingsService');
            try {
                const updateDoc: any = {};
                if (erpPath !== undefined) updateDoc.erpPath = erpPath;
                if (modelId !== undefined) updateDoc.defaultModel = modelId;
                await opensearchClient.update({
                    index: SETTINGS_INDEX,
                    id: SETTINGS_DOC_ID,
                    body: { doc: updateDoc },
                    refresh: 'wait_for',
                });
            } catch (err) {
                console.warn('[regenerate] Could not update settings for regeneration:', err);
            }
        }

        // Save previous content and reset status to generating
        const now = new Date().toISOString();
        await opensearchClient.update({
            index: INDICES.REPORTS,
            id: reportId,
            body: {
                doc: {
                    status: 'generating',
                    previousContent: reportDoc.status === 'ready' ? reportDoc.content : null,
                    updatedAt: now,
                },
            },
            refresh: 'wait_for',
        });

        // Also reset all related session-level reports (readiness, consolidated, strategic) to generating
        try {
            const relatedRes = await opensearchClient.search({
                index: INDICES.REPORTS,
                body: {
                    query: {
                        bool: {
                            must: [{ match: { sessionId: reportDoc.sessionId } }],
                            must_not: [{ term: { reportId } }],
                        },
                    },
                    size: 50,
                },
            });
            for (const hit of relatedRes.body.hits.hits) {
                await opensearchClient.update({
                    index: INDICES.REPORTS,
                    id: hit._id,
                    body: {
                        doc: {
                            status: 'generating',
                            previousContent: hit._source.status === 'ready' ? hit._source.content : null,
                            updatedAt: now,
                        },
                    },
                });
            }
        } catch (err) {
            console.warn('[regenerate] Could not reset related reports:', err);
        }

        broadcastReportStatus({
            reportId, sessionId: reportDoc.sessionId,
            broadAreaId: reportDoc.broadAreaId, broadAreaName: reportDoc.broadAreaName,
            type: reportDoc.type, status: 'generating', pendingRegeneration: false, updatedAt: now,
        });

        // Re-trigger full pipeline
        const { triggerDataPipeline } = await import('../services/pipelineTriggerService');
        triggerDataPipeline(session).catch((err: any) =>
            console.error('Regenerate pipeline failed:', err)
        );

        res.json({ success: true, message: 'Report regeneration started with updated settings' });
    } catch (error: any) {
        console.error('Error regenerating report:', error.message);
        res.status(500).json({ error: error.message });
    }
});

export default router;
