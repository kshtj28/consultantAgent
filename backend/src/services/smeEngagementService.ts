import { opensearchClient, INDICES } from '../config/database';
import { broadcastSMEEngagement, SMEEngagementEvent } from './reportSseService';

export interface SMEEngagementEntry {
  userId: string;
  username: string;
  role: string;
  department: string;
  engagementScore: number;
  participationRate: number;
  responseCount: number;
  broadAreaCoverage: Record<string, number>;
  lastActive: string;
  updatedAt: string;
}

export async function computeSMEEngagement(): Promise<SMEEngagementEntry[]> {
  const usersRes = await opensearchClient.search({
    index: INDICES.USERS,
    body: { query: { match_all: {} }, size: 500 },
  });
  const users = usersRes.body.hits.hits.map((h: any) => h._source);

  const sessionsRes = await opensearchClient.search({
    index: INDICES.CONVERSATIONS,
    body: { query: { bool: { must: [{ match: { sessionType: 'interview' } }] } }, size: 1000 },
  });
  const sessions = sessionsRes.body.hits.hits.map((h: any) => h._source);

  const totalSessions = sessions.length;
  const now = new Date().toISOString();
  const entries: SMEEngagementEntry[] = [];

  for (const user of users) {
    const userSessions = sessions.filter((s: any) => s.userId === user.userId);
    const sessionCount = userSessions.length;
    let responseCount = 0;
    let lastActive = '';
    const areaCoverage: Record<string, number> = {};

    for (const session of userSessions) {
      const responses = session.responses || {};
      for (const subAreaId of Object.keys(responses)) {
        responseCount += (responses[subAreaId] || []).length;
      }
      for (const areaId of (session.selectedBroadAreas || [])) {
        const coverage = session.coverage || {};
        const coveredCount = Object.keys(coverage).filter(
          (saId: string) => coverage[saId]?.status === 'covered'
        ).length;
        areaCoverage[areaId] = (areaCoverage[areaId] || 0) + coveredCount;
      }
      if (session.updatedAt && session.updatedAt > lastActive) {
        lastActive = session.updatedAt;
      }
    }

    const participationRate = totalSessions > 0 ? sessionCount / totalSessions : 0;
    const responseScore = Math.min(responseCount / 10, 1);
    const completionBonus = userSessions.filter((s: any) => s.status === 'completed').length * 0.2;
    const engagementScore =
      Math.min(100, Math.round((participationRate * 40 + responseScore * 40 + completionBonus * 20) * 100) / 100);

    const entry: SMEEngagementEntry = {
      userId: user.userId,
      username: user.username,
      role: user.role || 'sme',
      department: user.department || 'Unknown',
      engagementScore,
      participationRate: Math.round(participationRate * 100) / 100,
      responseCount,
      broadAreaCoverage: areaCoverage,
      lastActive: lastActive || user.createdAt || now,
      updatedAt: now,
    };
    entries.push(entry);
    await opensearchClient.index({
      index: INDICES.SME_ENGAGEMENT,
      id: user.userId,
      body: entry,
      refresh: 'wait_for',
    });
  }

  broadcastSMEEngagement({
    users: entries.map(e => ({
      userId: e.userId,
      username: e.username,
      engagementScore: e.engagementScore,
      participationRate: e.participationRate,
      responseCount: e.responseCount,
      lastActive: e.lastActive,
    })),
    updatedAt: now,
  });
  return entries;
}

export async function fetchSMEEngagement(): Promise<SMEEngagementEntry[]> {
  const res = await opensearchClient.search({
    index: INDICES.SME_ENGAGEMENT,
    body: { query: { match_all: {} }, size: 500, sort: [{ engagementScore: 'desc' }] },
  });
  return res.body.hits.hits.map((h: any) => h._source);
}
