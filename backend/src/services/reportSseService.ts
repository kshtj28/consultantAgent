import { Response } from 'express';

export interface ReportStatusEvent {
  reportId: string;
  sessionId: string;
  broadAreaId?: string;
  broadAreaName?: string;
  type: string;
  status: 'generating' | 'ready' | 'failed';
  pendingRegeneration: boolean;
  updatedAt: string;
}

export interface SMEEngagementEvent {
  users: Array<{
    userId: string;
    username: string;
    role?: string;
    department?: string;
    engagementScore: number;
    participationRate: number;
    responseCount: number;
    sessionsTaken?: number;
    lastActive: string;
  }>;
  updatedAt: string;
}

export interface InsightsEvent {
  sessionId: string;
  recommendedActions: Array<{ title: string; description: string; impact: string; effort: string }>;
  updatedAt: string;
}

export interface ConsolidationEvent {
  consolidationId: string;
  processId: string;
  type: 'generated' | 'step-accepted' | 'step-edited' | 'sme-invited' | 'regenerated' | 'no_data' | 'error';
  stepId?: string;
  metrics?: unknown;
  updatedAt: string;
}

const reportClients = new Set<Response>();
const smeClients = new Set<Response>();
const insightsClients = new Set<Response>();
const consolidationClients = new Map<string, Set<Response>>();

function addClient(set: Set<Response>, res: Response): void {
  set.add(res);
  res.on('close', () => set.delete(res));
}

function broadcast(set: Set<Response>, eventType: string, data: unknown): void {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of set) {
    client.write(payload);
  }
}

export function addReportSSEClient(res: Response): void {
  addClient(reportClients, res);
}

export function addSMESSEClient(res: Response): void {
  addClient(smeClients, res);
}

export function addInsightsSSEClient(res: Response): void {
  addClient(insightsClients, res);
}

export function broadcastReportStatus(event: ReportStatusEvent): void {
  broadcast(reportClients, 'report-status', event);
}

export function broadcastSMEEngagement(event: SMEEngagementEvent): void {
  broadcast(smeClients, 'sme-engagement', event);
}

export function broadcastInsights(event: InsightsEvent): void {
  broadcast(insightsClients, 'insights-updated', event);
}

export function addConsolidationSSEClient(processId: string, res: Response): void {
  let set = consolidationClients.get(processId);
  if (!set) {
    set = new Set<Response>();
    consolidationClients.set(processId, set);
  }
  set.add(res);
  res.on('close', () => {
    set!.delete(res);
    if (set!.size === 0) consolidationClients.delete(processId);
  });
}

export function broadcastConsolidationUpdate(event: ConsolidationEvent): void {
  const set = consolidationClients.get(event.processId);
  if (!set) return;
  broadcast(set, 'consolidation-update', event);
}
