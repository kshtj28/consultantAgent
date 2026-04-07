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
    engagementScore: number;
    participationRate: number;
    responseCount: number;
    lastActive: string;
  }>;
  updatedAt: string;
}

export interface InsightsEvent {
  sessionId: string;
  recommendedActions: Array<{ title: string; description: string; impact: string; effort: string }>;
  updatedAt: string;
}

const reportClients = new Set<Response>();
const smeClients = new Set<Response>();
const insightsClients = new Set<Response>();

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
