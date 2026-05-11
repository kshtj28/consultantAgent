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
  type MultiSMEConsolidation,
} from '../services/multiSMEConsolidationService';
import { addConsolidationSSEClient, broadcastConsolidationUpdate } from '../services/reportSseService';
import { getEffectiveModel } from '../services/settingsService';
import { generateCompletion, LLMMessage } from '../services/llmService';

const router = Router();

// ── AI Analysis Helpers ───────────────────────────────────────────────────────

interface FlatStep {
  id: string;
  type: 'startEvent' | 'endEvent' | 'task' | 'userTask' | 'serviceTask' | 'exclusiveGateway' | 'parallelGateway';
  label: string;
}
interface FlatFlow { from: string; to: string; label?: string; }
interface FlatProcess { name: string; steps: FlatStep[]; flows: FlatFlow[]; }

function buildFlatBpmnXml(proc: FlatProcess): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const { steps, flows } = proc;

  // BFS level assignment
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const s of steps) { adj.set(s.id, []); inDeg.set(s.id, 0); }
  for (const f of flows) {
    adj.get(f.from)?.push(f.to);
    inDeg.set(f.to, (inDeg.get(f.to) || 0) + 1);
  }
  const levels = new Map<string, number>();
  const queue = steps.filter(s => (inDeg.get(s.id) || 0) === 0).map(s => s.id);
  queue.forEach(id => levels.set(id, 0));
  const visited = new Set<string>();
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    if (visited.has(cur)) continue;
    visited.add(cur);
    const lv = levels.get(cur) || 0;
    for (const next of (adj.get(cur) || [])) {
      if (!levels.has(next) || levels.get(next)! < lv + 1) levels.set(next, lv + 1);
      if (!visited.has(next)) queue.push(next);
    }
  }
  const maxLv = Math.max(0, ...Array.from(levels.values()));
  for (const s of steps) if (!levels.has(s.id)) levels.set(s.id, maxLv + 1);

  const byLevel = new Map<number, string[]>();
  for (const [id, lv] of levels) {
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv)!.push(id);
  }

  const dim = (t: string) => (t === 'startEvent' || t === 'endEvent') ? { w: 36, h: 36 }
    : (t === 'exclusiveGateway' || t === 'parallelGateway') ? { w: 50, h: 50 }
    : { w: 110, h: 80 };

  const STEP_X = 190, STEP_Y = 130, START_X = 80, CENTER_Y = 220;
  const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const [lv, ids] of byLevel) {
    ids.forEach((id, idx) => {
      const step = steps.find(s => s.id === id)!;
      const d = dim(step.type);
      const offsetY = (idx - (ids.length - 1) / 2) * STEP_Y;
      pos.set(id, { x: START_X + lv * STEP_X, y: CENTER_Y + offsetY - d.h / 2, w: d.w, h: d.h });
    });
  }

  let procXml = '', diagXml = '';
  for (const s of steps) {
    const p = pos.get(s.id)!;
    const label = esc(s.label);
    const tag = s.type === 'exclusiveGateway' ? 'exclusiveGateway'
      : s.type === 'parallelGateway' ? 'parallelGateway'
      : s.type === 'startEvent' ? 'startEvent'
      : s.type === 'endEvent' ? 'endEvent' : 'task';
    procXml += `\n    <bpmn2:${tag} id="${s.id}" name="${label}" />`;
    const isGw = tag.includes('Gateway');
    diagXml += `\n      <bpmndi:BPMNShape id="${s.id}_di" bpmnElement="${s.id}"${isGw ? ' isMarkerVisible="true"' : ''}>
        <dc:Bounds x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" />
        <bpmndi:BPMNLabel><dc:Bounds x="${p.x - 10}" y="${p.y + p.h + 4}" width="${p.w + 20}" height="20" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>`;
  }

  flows.forEach((f, i) => {
    const fid = `flow_${i + 1}`;
    const src = pos.get(f.from), tgt = pos.get(f.to);
    if (!src || !tgt) return;
    const lbl = f.label ? esc(f.label) : '';
    procXml += `\n    <bpmn2:sequenceFlow id="${fid}" sourceRef="${f.from}" targetRef="${f.to}"${lbl ? ` name="${lbl}"` : ''} />`;
    const sx = src.x + src.w, sy = src.y + src.h / 2;
    const tx = tgt.x, ty = tgt.y + tgt.h / 2;
    const mx = (sx + tx) / 2;
    const wp = Math.abs(sy - ty) < 4
      ? `<di:waypoint x="${sx}" y="${sy}" /><di:waypoint x="${tx}" y="${ty}" />`
      : `<di:waypoint x="${sx}" y="${sy}" /><di:waypoint x="${mx}" y="${sy}" /><di:waypoint x="${mx}" y="${ty}" /><di:waypoint x="${tx}" y="${ty}" />`;
    diagXml += `\n      <bpmndi:BPMNEdge id="${fid}_di" bpmnElement="${fid}">
        ${wp}${lbl ? `\n        <bpmndi:BPMNLabel><dc:Bounds x="${mx - 15}" y="${(sy + ty) / 2 - 10}" width="60" height="20" /></bpmndi:BPMNLabel>` : ''}
      </bpmndi:BPMNEdge>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn2:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn2:process id="Process_1" name="${esc(proc.name)}" isExecutable="false">${procXml}
  </bpmn2:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">${diagXml}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn2:definitions>`;
}

import { extractJSON } from '../utils/jsonUtils';

async function llmJson<T>(modelId: string, system: string, user: string): Promise<T> {
  const msgs: LLMMessage[] = [{ role: 'system', content: system }, { role: 'user', content: user }];
  const res = await generateCompletion(modelId, msgs);
  const parsed = extractJSON<T>(res.content);
  if (!parsed) throw new Error('LLM failed to return valid JSON');
  return parsed;
}

async function analyzeIssues(c: MultiSMEConsolidation, modelId: string): Promise<any[]> {
  const stepList = c.steps.map(s => `${s.order}. ${s.label}: ${s.description}`).join('\n');
  const conflicts = c.steps.filter(s => s.status === 'conflict').map(s => s.label).join(', ');
  const system = `You are a banking process excellence expert. Identify key inefficiencies in the process from SME interview data.
Return ONLY a valid JSON array — no markdown, no explanation.
Each element: {"id":"issue_N","title":"...","description":"...","severity":"high"|"medium"|"low","category":"efficiency"|"risk"|"compliance"|"automation"|"cost"|"customer_experience","impact":"specific measurable impact","rootCause":"underlying cause"}
Include 5-8 impactful issues based on banking industry standards.`;
  return llmJson<any[]>(modelId, system,
    `Process: ${c.processName} (${c.department})\n\nSME-identified steps:\n${stepList}\n\nConflict areas (SMEs disagreed): ${conflicts || 'None'}\n\nIdentify the key process issues.`);
}

const FLAT_BPMN_SCHEMA = `{"name":"...","steps":[{"id":"start_1","type":"startEvent","label":"Start"},{"id":"task_1","type":"task","label":"Step"},{"id":"gw_1","type":"exclusiveGateway","label":"Decision?"},{"id":"end_1","type":"endEvent","label":"End"}],"flows":[{"from":"start_1","to":"task_1"},{"from":"gw_1","to":"task_2","label":"Yes"}]}`;

async function generateOptimizedBpmn(c: MultiSMEConsolidation, issues: any[], modelId: string): Promise<{ json: FlatProcess; xml: string }> {
  const issueList = issues.map(i => `- [${i.severity}] ${i.title}: ${i.description}`).join('\n');
  const currentSteps = c.steps.map(s => s.label).join(', ');
  const system = `You are a BPMN2 process optimization expert for banking/financial services. Design an industry best-practice optimized process.
Return ONLY valid JSON matching this schema exactly — no markdown, no explanation:
${FLAT_BPMN_SCHEMA}
Valid types: startEvent, endEvent, task, userTask, serviceTask, exclusiveGateway, parallelGateway.
IDs: unique snake_case. One startEvent, one or more endEvents. Labels ≤5 words.
Optimize using: STP (Straight-Through Processing), digital automation, parallel processing, risk-based routing, and regulatory compliance best practices.`;
  const json = await llmJson<FlatProcess>(modelId, system,
    `Process: ${c.processName}\nDepartment: ${c.department}\n\nCurrent steps: ${currentSteps}\n\nIssues to resolve:\n${issueList}\n\nGenerate the optimized to-be process. Append "(Optimized)" to the name.`);
  return { json, xml: buildFlatBpmnXml(json) };
}

async function generateComparison(c: MultiSMEConsolidation, tobe: FlatProcess, issues: any[], modelId: string): Promise<any> {
  const asisDays = c.steps.length * 2.5;
  const system = `You are a banking process efficiency analyst. Calculate realistic improvement metrics.
Return ONLY valid JSON — no markdown:
{"timeSavings":{"asis":"X days","tobe":"Y days","reduction":"Z%","detail":"..."},"costReduction":{"percentage":"...","detail":"..."},"efficiencyGain":{"percentage":"...","detail":"..."},"automationRate":{"asis":"...","tobe":"...","detail":"..."},"riskReduction":{"percentage":"...","detail":"..."},"customerExperience":{"improvement":"...","detail":"..."},"keyImprovements":["..."]}`;
  return llmJson<any>(modelId, system,
    `Process: ${c.processName}
As-is Metrics:
- Duration: ${asisDays} days
- Manual Steps: ${c.steps.length}
- Conflict areas: ${c.metrics.conflicts}
- SME Consensus: ${c.metrics.consensusPct}%

To-be Metrics:
- Total steps: ${tobe.steps.length} (optimized)

Issues resolved: ${issues.map(i => i.title).join(', ')}

Calculate expected improvements. CRITICAL RULE: The 'tobe' time in timeSavings MUST be significantly lower than the 'asis' time (${asisDays} days) to reflect efficiency gains, and the 'reduction' percentage must be mathematically accurate.`);
}

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
    const { targetState } = req.body || {};
    const result = await generateUnifiedBPMN(id, !!targetState);
    if (!result) return res.status(404).json({ error: 'Consolidation not found' });
    return res.json(result);
  } catch (err: any) {
    console.error('Generate unified BPMN error:', err);
    return res.status(500).json({ error: 'Failed to generate BPMN' });
  }
});

// POST /api/multi-sme-consolidation/:processId/ai-analysis — SSE stream: issues → TO-BE BPMN → comparison
router.post('/:processId/ai-analysis', async (req: Request, res: Response) => {
  const { processId } = req.params;

  let consolidation: MultiSMEConsolidation | null = null;
  try {
    consolidation = await fetchMultiSMEConsolidation(processId);
  } catch {}

  if (!consolidation && processId === 'loan-origination') {
    try {
      consolidation = await generateMultiSMEConsolidation({ processId, forceMock: true });
    } catch {}
  }

  if (!consolidation) {
    return res.status(404).json({ error: 'No consolidation data found. Complete at least one interview first.' });
  }

  const modelConfig = await getEffectiveModel();
  if (!modelConfig) {
    return res.status(400).json({ error: 'No AI model configured' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (d: object) => res.write(`data: ${JSON.stringify(d)}\n\n`);

  try {
    send({ phase: 'issues_start' });
    const issues = await analyzeIssues(consolidation, modelConfig.id);
    send({ phase: 'issues', issues });

    send({ phase: 'tobe_start' });
    const { json: tobeJson, xml: tobeBpmn } = await generateOptimizedBpmn(consolidation, issues, modelConfig.id);
    send({ phase: 'tobe', bpmnXml: tobeBpmn });

    send({ phase: 'comparison_start' });
    const metrics = await generateComparison(consolidation, tobeJson, issues, modelConfig.id);
    send({ phase: 'comparison', metrics });

    send({ phase: 'done' });
  } catch (err: any) {
    console.error('[ai-analysis]', err);
    send({ phase: 'error', error: err.message || 'AI analysis failed' });
  }

  res.end();
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
