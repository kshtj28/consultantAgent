import { opensearchClient, INDICES } from '../config/database';
import { broadcastSMEEngagement, SMEEngagementEvent } from './reportSseService';

export interface SMEEngagementEntry {
  userId: string;
  username: string;
  role: string;
  department: string;
  engagementScore: number;
  participationRate: number;
  responseCount: number;       // count of Q&A pairs answered
  sessionsTaken: number;       // count of distinct assessment sessions
  broadAreaCoverage: Record<string, number>;
  lastActive: string;
  updatedAt: string;
}

export async function computeSMEEngagement(): Promise<SMEEngagementEntry[]> {
  // Pull only real user documents — the USERS index is shared with project-settings
  // and possibly other ad-hoc docs that lack a username/userId. Filter those out.
  const usersRes = await opensearchClient.search({
    index: INDICES.USERS,
    body: {
      size: 500,
      query: {
        bool: {
          must: [{ exists: { field: 'username' } }, { exists: { field: 'userId' } }],
        },
      },
    },
  });
  const users = usersRes.body.hits.hits
    .map((h: any) => h._source)
    .filter((u: any) => u && u.userId && u.username && u.userId !== 'project-settings');

  const sessionsRes = await opensearchClient.search({
    index: INDICES.CONVERSATIONS,
    body: { query: { bool: { must: [{ match: { sessionType: 'interview_session' } }] } }, size: 1000 },
  });
  // Dedupe sessions by sessionId in case stale duplicates exist
  const seenSessionIds = new Set<string>();
  const sessions = sessionsRes.body.hits.hits
    .map((h: any) => h._source)
    .filter((s: any) => {
      if (!s || !s.sessionId) return false;
      if (seenSessionIds.has(s.sessionId)) return false;
      seenSessionIds.add(s.sessionId);
      return true;
    });

  // Synthesize a user record for any sessions whose userId isn't in the USERS index
  // (e.g., the env-admin login which never creates an OpenSearch user record).
  const knownUserIds = new Set(users.map((u: any) => u.userId));
  const orphanUserIds = new Set<string>();
  for (const s of sessions) {
    if (s.userId && !knownUserIds.has(s.userId)) orphanUserIds.add(s.userId);
  }
  for (const orphanId of orphanUserIds) {
    users.push({
      userId: orphanId,
      username: orphanId === 'admin-env-user' ? 'admin' : orphanId,
      role: orphanId === 'admin-env-user' ? 'admin' : 'sme',
      department: 'Unknown',
      createdAt: new Date().toISOString(),
    });
  }

  const totalSessions = sessions.length;
  const now = new Date().toISOString();
  const entries: SMEEngagementEntry[] = [];

  for (const user of users) {
    const allUserSessions = sessions.filter((s: any) => s.userId === user.userId);
    // Only count sessions the user actually engaged with — abandoned/empty
    // in-progress sessions inflate the count (one user can rack up dozens during testing).
    const userSessions = allUserSessions.filter((s: any) => {
      if (s.status === 'completed') return true;
      const responses = s.responses || {};
      const totalAnswers = Object.keys(responses).reduce(
        (sum, k) => sum + (responses[k]?.length || 0), 0
      );
      return totalAnswers > 0;
    });
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
      sessionsTaken: sessionCount,
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
      role: e.role,
      department: e.department,
      engagementScore: e.engagementScore,
      participationRate: e.participationRate,
      responseCount: e.responseCount,
      sessionsTaken: e.sessionsTaken,
      lastActive: e.lastActive,
    })),
    updatedAt: now,
  });
  return entries;
}

export async function fetchSMEEngagement(): Promise<SMEEngagementEntry[]> {
  try {
    const exists = await opensearchClient.indices.exists({ index: INDICES.SME_ENGAGEMENT });
    if (!exists.body) return [];

    const res = await opensearchClient.search({
      index: INDICES.SME_ENGAGEMENT,
      body: { query: { match_all: {} }, size: 500, sort: [{ engagementScore: { order: 'desc', unmapped_type: 'float' } }] },
    });
    return res.body.hits.hits.map((h: any) => h._source);
  } catch (err: any) {
    console.warn('Error fetching SME engagement:', err.message);
    return [];
  }
}
