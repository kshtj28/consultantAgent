import { Router, Request, Response } from 'express';
import { getConnector, listConnectors } from '../services/connectors/registry';
import { CanonicalEntityName } from '../services/connectors/types';

const router = Router();

/** GET /api/connectors — list all registered ERP connectors with summary. */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const connectors = listConnectors().map(c => c.summary());
    return res.json({ connectors });
  } catch (err: any) {
    console.error('List connectors error:', err);
    return res.status(500).json({ error: 'Failed to list connectors' });
  }
});

/** GET /api/connectors/:id — full details including entity metadata. */
router.get('/:id', async (req: Request, res: Response) => {
  const conn = getConnector(req.params.id);
  if (!conn) return res.status(404).json({ error: 'Connector not found' });
  return res.json({ connector: conn.details() });
});

/** GET /api/connectors/:id/entities/:entityName — fetch dummy rows for an entity. */
router.get('/:id/entities/:entityName', async (req: Request, res: Response) => {
  const conn = getConnector(req.params.id);
  if (!conn) return res.status(404).json({ error: 'Connector not found' });
  const data = conn.getEntityData(req.params.entityName as CanonicalEntityName);
  if (!data) return res.status(404).json({ error: 'Entity not found' });
  return res.json(data);
});

/** POST /api/connectors/:id/connect */
router.post('/:id/connect', async (req: Request, res: Response) => {
  const conn = getConnector(req.params.id);
  if (!conn) return res.status(404).json({ error: 'Connector not found' });
  const { baseUrl } = req.body || {};
  conn.connect(baseUrl);
  return res.json({ connector: conn.summary() });
});

/** POST /api/connectors/:id/disconnect */
router.post('/:id/disconnect', async (req: Request, res: Response) => {
  const conn = getConnector(req.params.id);
  if (!conn) return res.status(404).json({ error: 'Connector not found' });
  conn.disconnect();
  return res.json({ connector: conn.summary() });
});

/** POST /api/connectors/:id/sync */
router.post('/:id/sync', async (req: Request, res: Response) => {
  const conn = getConnector(req.params.id);
  if (!conn) return res.status(404).json({ error: 'Connector not found' });
  conn.sync();
  return res.json({ connector: conn.summary() });
});

export default router;
