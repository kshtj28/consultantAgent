import { Router, Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  generateMultiSMEConsolidation,
  fetchMultiSMEConsolidation,
  acceptStep,
  editStepVersion,
  inviteSMEToConsolidation,
  generateUnifiedBPMN,
  listAvailableProcesses,
} from '../services/multiSMEConsolidationService';
import { addConsolidationSSEClient, broadcastConsolidationUpdate } from '../services/reportSseService';

const router = Router();

// GET /api/multi-sme-consolidation/processes — list every interviewable process and how much SME data exists
router.get('/processes', async (_req: Request, res: Response) => {
  try {
    const processes = await listAvailableProcesses();
    return res.json({ processes });
  } catch (err: any) {
    console.error('List consolidation processes error:', err);
    return res.status(500).json({ error: 'Failed to list processes' });
  }
});

// GET /api/multi-sme-consolidation/:processId — fetch the latest consolidation, auto-generate if missing
router.get('/:processId', async (req: Request, res: Response) => {
  const { processId } = req.params;
  let consolidation: any = null;

  try {
    consolidation = await fetchMultiSMEConsolidation(processId);
  } catch (err: any) {
    console.warn(`[multi-sme] fetch failed for ${processId}: ${err.message}`);
  }

  // The user must explicitly request real pipeline generation via POST /generate.
  // We ONLY automatically mock the demo process to keep the demo instant.
  if (!consolidation && processId === 'loan-origination') {
    try {
      const res = await generateMultiSMEConsolidation({ processId, forceMock: true });
      if (res) consolidation = res;
    } catch (err: any) {
      console.error(`[multi-sme] forceMock generate failed for ${processId}:`, err);
      return res.status(500).json({ error: 'Failed to fetch consolidation', detail: err.message });
    }
  }

  return res.json({ consolidation });
});

// POST /api/multi-sme-consolidation/:processId/generate — re-run the pipeline
// Returns 202 immediately; result arrives via the SSE stream (/:processId/stream).
router.post('/:processId/generate', async (req: Request, res: Response) => {
  const { processId } = req.params;
  const { sessionIds, forceMock } = req.body || {};

  // Acknowledge immediately so nginx / the client don't time out waiting for the LLM
  res.status(202).json({ generating: true, processId });

  // Run the (potentially slow) pipeline in the background
  generateMultiSMEConsolidation({ processId, sessionIds, forceMock: !!forceMock })
    .then((consolidation) => {
      // SSE broadcast is already handled inside generateMultiSMEConsolidation on success.
      // If consolidation is null (no data) broadcast a "no_data" event so the frontend
      // can update the empty-state without polling.
      if (!consolidation) {
        broadcastConsolidationUpdate({
          consolidationId: `consol-${processId}`,
          processId,
          type: 'no_data',
          metrics: null as any,
          updatedAt: new Date().toISOString(),
        });
      }
    })
    .catch((err) => {
      console.error('[multi-sme] background generation failed:', err.message);
      broadcastConsolidationUpdate({
        consolidationId: `consol-${processId}`,
        processId,
        type: 'error',
        metrics: null as any,
        updatedAt: new Date().toISOString(),
      });
    });
});

// POST /api/multi-sme-consolidation/:id/steps/:stepId/accept — facilitator accepts a step
router.post('/:id/steps/:stepId/accept', async (req: Request, res: Response) => {
  try {
    const { id, stepId } = req.params;
    const user = (req as AuthRequest).user;
    const userId = user?.userId || user?.id || 'facilitator';
    const consolidation = await acceptStep(id, stepId, userId);
    if (!consolidation) return res.status(404).json({ error: 'Consolidation or step not found' });
    return res.json({ consolidation });
  } catch (err: any) {
    console.error('Accept step error:', err);
    return res.status(500).json({ error: 'Failed to accept step' });
  }
});

// POST /api/multi-sme-consolidation/:id/steps/:stepId/edit — accept-with-edit on a step
router.post('/:id/steps/:stepId/edit', async (req: Request, res: Response) => {
  try {
    const { id, stepId } = req.params;
    const { description } = req.body || {};
    if (typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ error: 'description is required' });
    }
    const user = (req as AuthRequest).user;
    const userId = user?.userId || user?.id || 'facilitator';
    const consolidation = await editStepVersion(id, stepId, description.trim(), userId);
    if (!consolidation) return res.status(404).json({ error: 'Consolidation or step not found' });
    return res.json({ consolidation });
  } catch (err: any) {
    console.error('Edit step error:', err);
    return res.status(500).json({ error: 'Failed to edit step' });
  }
});

// POST /api/multi-sme-consolidation/:id/invite-sme — add an invited SME to the roster
router.post('/:id/invite-sme', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, role, seniority } = req.body || {};
    if (!username || !role) {
      return res.status(400).json({ error: 'username and role are required' });
    }
    const consolidation = await inviteSMEToConsolidation(id, { username, role, seniority });
    if (!consolidation) return res.status(404).json({ error: 'Consolidation not found' });
    return res.json({ consolidation });
  } catch (err: any) {
    console.error('Invite SME error:', err);
    return res.status(500).json({ error: 'Failed to invite SME' });
  }
});

// POST /api/multi-sme-consolidation/:id/generate-bpmn — stub for the BPMN follow-up
router.post('/:id/generate-bpmn', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await generateUnifiedBPMN(id);
    if (!result) return res.status(404).json({ error: 'Consolidation not found' });
    return res.json(result);
  } catch (err: any) {
    console.error('Generate unified BPMN error:', err);
    return res.status(500).json({ error: 'Failed to generate BPMN' });
  }
});

// GET /api/multi-sme-consolidation/:processId/stream — SSE for real-time updates per process
router.get('/:processId/stream', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  if (!user) return res.sendStatus(401);

  const { processId } = req.params;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.write('data: {"type":"connected"}\n\n');
  addConsolidationSSEClient(processId, res);

  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => clearInterval(keepAlive));
});

export default router;
