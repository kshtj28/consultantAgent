import { Router, Request, Response } from 'express';
import { opensearchClient, INDICES } from '../config/database';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { getAvailableModels } from '../config/env';
import { SETTINGS_DOC_ID, SETTINGS_INDEX } from '../services/settingsService';
import { getERPConnectionSettings, saveERPConnectionSettings } from '../services/connectors/connectionSettings';
import { getConnector, listConnectors } from '../services/connectors/registry';

const router = Router();
const READINESS_INDEX = 'readiness_sessions';

const DEFAULT_SETTINGS = {
    projectName: '',
    clientName: '',
    erpPath: '',
    industry: '',
    assessmentPeriod: '',
    timeZone: 'UTC+0',
    notifications: {
        criticalRiskAlerts: true,
        smeResponseUpdates: true,
        weeklySummary: false,
    },
    sessionTimeout: 30,
    defaultModel: '',
};

// GET /api/settings/project
router.get('/project', async (req: Request, res: Response) => {
    try {
        const result = await opensearchClient.get({
            index: SETTINGS_INDEX,
            id: SETTINGS_DOC_ID,
        });
        res.json(result.body._source);
    } catch (err: any) {
        if (err.statusCode === 404) {
            // Return defaults when no settings have been saved yet
            res.json(DEFAULT_SETTINGS);
        } else {
            console.error('Failed to fetch project settings:', err.message);
            res.status(500).json({ error: 'Failed to fetch settings' });
        }
    }
});

// PUT /api/settings/project (admin only)
router.put('/project', requireAdmin, async (req: Request, res: Response) => {
    try {
        const { projectName, clientName, erpPath, industry, assessmentPeriod, timeZone, notifications, sessionTimeout, defaultModel } = req.body;

        if (defaultModel && !getAvailableModels().find((m) => m.id === defaultModel)) {
            return res.status(400).json({ error: `Unknown model: ${defaultModel}` });
        }

        let existingSettings = {};
        try {
            const existingDoc = await opensearchClient.get({
                index: SETTINGS_INDEX,
                id: SETTINGS_DOC_ID,
            });
            existingSettings = existingDoc.body._source || {};
        } catch (_) {
            // Document might not exist yet, that's fine
        }

        const settings = {
            ...existingSettings,
            settingsType: 'project-settings',
            projectName: projectName !== undefined ? projectName : (existingSettings as any).projectName || '',
            clientName: clientName !== undefined ? clientName : (existingSettings as any).clientName || '',
            erpPath: erpPath !== undefined ? erpPath : (existingSettings as any).erpPath || '',
            industry: industry !== undefined ? industry : (existingSettings as any).industry || '',
            assessmentPeriod: assessmentPeriod !== undefined ? assessmentPeriod : (existingSettings as any).assessmentPeriod || '',
            timeZone: timeZone !== undefined ? timeZone : (existingSettings as any).timeZone || 'UTC+0',
            notifications: notifications !== undefined ? notifications : (existingSettings as any).notifications || DEFAULT_SETTINGS.notifications,
            sessionTimeout: sessionTimeout !== undefined ? sessionTimeout : (existingSettings as any).sessionTimeout || 30,
            defaultModel: typeof defaultModel === 'string' ? defaultModel : (existingSettings as any).defaultModel || '',
            updatedBy: (req as any).user?.userId || 'unknown',
            updatedAt: new Date().toISOString(),
        };

        await opensearchClient.index({
            index: SETTINGS_INDEX,
            id: SETTINGS_DOC_ID,
            body: settings,
            refresh: true,
        });

        res.json(settings);
    } catch (err: any) {
        console.error('Failed to update project settings:', err.message);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// PUT /api/settings/model (all authenticated users)
router.put('/model', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { defaultModel } = req.body;

        if (typeof defaultModel !== 'string' || defaultModel.length === 0) {
            return res.status(400).json({ error: 'defaultModel is required' });
        }

        const available = getAvailableModels();
        if (!available.find((m) => m.id === defaultModel)) {
            return res.status(400).json({ error: `Unknown model: ${defaultModel}` });
        }

        await opensearchClient.update({
            index: SETTINGS_INDEX,
            id: SETTINGS_DOC_ID,
            body: {
                doc: {
                    defaultModel,
                    updatedBy: (req as any).user?.userId || 'unknown',
                    updatedAt: new Date().toISOString(),
                },
                doc_as_upsert: true,
            },
            refresh: true,
        });

        res.json({ success: true, defaultModel });
    } catch (err: any) {
        console.error('Failed to update model setting:', err.message);
        res.status(500).json({ error: 'Failed to update model setting' });
    }
});

// ─── Data Management ───────────────────────────────────────

// Helper: scroll through all documents in an index
async function getAllDocs(index: string, excludeFields?: string[]): Promise<any[]> {
    const exists = await opensearchClient.indices.exists({ index });
    if (!exists.body) return [];

    const results: any[] = [];
    let searchBody: any = { size: 1000, query: { match_all: {} } };
    if (excludeFields && excludeFields.length > 0) {
        searchBody._source = { excludes: excludeFields };
    }

    const initial = await opensearchClient.search({ index, body: searchBody, scroll: '1m' });
    let hits = initial.body.hits.hits;
    let scrollId = initial.body._scroll_id;

    for (const hit of hits) {
        results.push({ _id: hit._id, ...hit._source });
    }

    while (hits.length > 0) {
        const scrollRes = await opensearchClient.scroll({ scroll_id: scrollId, scroll: '1m' });
        hits = scrollRes.body.hits.hits;
        scrollId = scrollRes.body._scroll_id;
        for (const hit of hits) {
            results.push({ _id: hit._id, ...hit._source });
        }
    }

    // Clear scroll context
    if (scrollId) {
        try { await opensearchClient.clearScroll({ scroll_id: scrollId }); } catch (_) { /* ignore */ }
    }

    return results;
}

// GET /api/settings/export (admin only)
router.get('/export', requireAdmin, async (req: Request, res: Response) => {
    try {
        const [sessions, users, documents, reports] = await Promise.all([
            getAllDocs(READINESS_INDEX),
            getAllDocs(INDICES.USERS, ['passwordHash']),
            getAllDocs(INDICES.DOCUMENTS, ['content', 'embedding']),
            getAllDocs(INDICES.REPORTS),
        ]);

        res.json({
            exportedAt: new Date().toISOString(),
            sessions,
            users,
            documents,
            reports,
        });
    } catch (err: any) {
        console.error('Failed to export project data:', err.message);
        res.status(500).json({ error: 'Failed to export project data' });
    }
});

// POST /api/settings/archive (admin only)
router.post('/archive', requireAdmin, async (req: Request, res: Response) => {
    try {
        const exists = await opensearchClient.indices.exists({ index: READINESS_INDEX });
        if (!exists.body) {
            return res.json({ archived: 0, message: '0 completed assessments archived' });
        }

        // Find all completed, non-archived sessions
        const searchRes = await opensearchClient.search({
            index: READINESS_INDEX,
            body: {
                size: 10000,
                query: {
                    bool: {
                        must: [{ term: { status: 'completed' } }],
                        must_not: [{ term: { archived: true } }],
                    },
                },
            },
        });

        const hits = searchRes.body.hits.hits;
        if (hits.length === 0) {
            return res.json({ archived: 0, message: '0 completed assessments archived' });
        }

        // Bulk update to add archived: true
        const bulkBody: any[] = [];
        for (const hit of hits) {
            bulkBody.push({ update: { _index: READINESS_INDEX, _id: hit._id } });
            bulkBody.push({ doc: { archived: true, archivedAt: new Date().toISOString() } });
        }

        await opensearchClient.bulk({ body: bulkBody, refresh: true });

        const count = hits.length;
        res.json({ archived: count, message: `${count} completed assessment${count !== 1 ? 's' : ''} archived` });
    } catch (err: any) {
        console.error('Failed to archive assessments:', err.message);
        res.status(500).json({ error: 'Failed to archive assessments' });
    }
});

// DELETE /api/settings/data (admin only)
router.delete('/data', requireAdmin, async (req: Request, res: Response) => {
    try {
        const { confirmName } = req.body || {};

        // Fetch current project name for validation
        let projectName = '';
        try {
            const settingsDoc = await opensearchClient.get({
                index: SETTINGS_INDEX,
                id: SETTINGS_DOC_ID,
            });
            projectName = settingsDoc.body._source?.projectName || '';
        } catch (_) {
            // Settings may not exist yet
        }

        if (!confirmName || confirmName !== projectName) {
            return res.status(400).json({
                error: 'Confirmation name does not match the project name',
            });
        }

        // Delete all documents from data indices (NOT users or audit logs)
        const indicesToClear = [
            READINESS_INDEX,
            INDICES.REPORTS,
            INDICES.DOCUMENTS,
            INDICES.NOTIFICATIONS,
        ];

        for (const index of indicesToClear) {
            const exists = await opensearchClient.indices.exists({ index });
            if (exists.body) {
                await opensearchClient.deleteByQuery({
                    index,
                    body: { query: { match_all: {} } },
                    refresh: true,
                });
            }
        }

        res.json({ deleted: true, message: 'All project data has been deleted' });
    } catch (err: any) {
        console.error('Failed to delete project data:', err.message);
        res.status(500).json({ error: 'Failed to delete project data' });
    }
});

// ─── ERP Connection Settings ────────────────────────────────────────────────

// GET /api/settings/erp-connection
router.get('/erp-connection', authenticateToken, async (req: Request, res: Response) => {
  try {
    const config = await getERPConnectionSettings();
    const available = listConnectors().map(c => {
      const s = c.summary();
      return { id: s.id, name: s.name, vendor: s.vendor, protocol: s.protocol };
    });
    // Mask password in response
    res.json({ config: { ...config, password: config.password ? '••••••••' : '' }, availableConnectors: available });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch ERP connection settings' });
  }
});

// PUT /api/settings/erp-connection (admin only)
router.put('/erp-connection', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { activeConnectorId, mode, baseUrl, username, password } = req.body;
    if (!activeConnectorId || !mode) {
      return res.status(400).json({ error: 'activeConnectorId and mode are required' });
    }
    if (!['demo', 'live'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "demo" or "live"' });
    }
    if (!getConnector(activeConnectorId)) {
      return res.status(400).json({ error: `Unknown connector: ${activeConnectorId}` });
    }
    // Only update password if a real value is provided (not the masked placeholder)
    const update: any = { activeConnectorId, mode, baseUrl: baseUrl || '', username: username || '' };
    if (password && password !== '••••••••') update.password = password;

    const saved = await saveERPConnectionSettings(update);
    res.json({ config: { ...saved, password: saved.password ? '••••••••' : '' } });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save ERP connection settings' });
  }
});

// POST /api/settings/erp-connection/test
// In demo mode: confirms the connector is in the registry.
// In live mode: would ping the actual OData endpoint (stubbed for now).
router.post('/erp-connection/test', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { activeConnectorId, mode, baseUrl } = req.body;
    const connector = getConnector(activeConnectorId);
    if (!connector) {
      return res.status(404).json({ success: false, message: `Connector "${activeConnectorId}" not found in registry.` });
    }

    if (mode === 'demo') {
      const s = connector.summary();
      return res.json({
        success: true,
        message: `✓ Demo connector "${s.name}" is available. ${s.entityCount} entities, ${s.totalRows} rows ready.`,
        connectorName: s.name,
      });
    }

    // Live mode: attempt a lightweight OData ping
    // For now returns a structured "not yet implemented" rather than silently failing
    if (!baseUrl) {
      return res.status(400).json({ success: false, message: 'Base URL is required for live mode.' });
    }
    // TODO: replace with real fetch() ping when live OData adapters are wired
    return res.json({
      success: false,
      message: `Live OData connection to ${baseUrl} — real network calls are not yet implemented. Switch to Demo mode to use fixture data, or implement the OData fetch layer in the adapter.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
