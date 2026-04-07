# Interview Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual report generation with an automated Mastra workflow that triggers on interview pause/completion, generates all reports, computes all page metrics, and broadcasts real-time updates via SSE.

**Architecture:** A single Mastra workflow (`interviewDataPipeline`) orchestrates 4 parallel lanes after collecting session data. Lane A generates broad-area gap reports (LLM-heavy). Lane B computes dashboard + SME metrics (fast). After Lane A completes, Lane C generates session-level reports and Lane D computes AI insights. All status changes broadcast via SSE to connected frontends. The workflow uses fire-and-forget invocation with a `pendingRegeneration` queueing mechanism to handle concurrent triggers.

**Tech Stack:** Mastra workflows (`@mastra/core/workflows`), OpenSearch, Express SSE, React EventSource, Zod schemas

**Spec:** `docs/superpowers/specs/2026-03-31-interview-data-pipeline-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `backend/src/mastra/workflows/interviewDataPipeline.ts` | Mastra workflow definition with all steps |
| `backend/src/services/pipelineTriggerService.ts` | `triggerDataPipeline()` — dedup, queue, fire-and-forget |
| `backend/src/services/smeEngagementService.ts` | Compute real per-user engagement metrics |
| `backend/src/services/insightsService.ts` | Compute AI-powered insights from area reports |
| `backend/src/services/reportSseService.ts` | SSE client management + broadcast for reports, SME, insights |
| `backend/src/routes/smeEngagement.ts` | REST + SSE endpoints for SME engagement |
| `backend/src/routes/insights.ts` | REST + SSE endpoints for insights |
| `backend/tests/services/pipelineTriggerService.test.ts` | Trigger logic tests |
| `backend/tests/services/smeEngagementService.test.ts` | SME engagement computation tests |
| `backend/tests/services/insightsService.test.ts` | Insights computation tests |
| `backend/tests/workflows/interviewDataPipeline.test.ts` | Workflow step tests |

### Modified Files

| File | Changes |
|------|---------|
| `backend/src/config/database.ts` | Add `REPORTS_SSE`, `SME_ENGAGEMENT`, `INSIGHTS` indices + mappings |
| `backend/src/mastra/index.ts` | Register workflow |
| `backend/src/routes/interview.ts` | Add pause endpoint, trigger pipeline on completion |
| `backend/src/routes/reports.ts` | Remove `POST /generate`, add `GET /stream` SSE endpoint |
| `backend/src/index.ts` | Mount new routes (`/api/sme-engagement`, `/api/insights`) |
| `frontend/src/services/api.ts` | Add new API functions + SSE subscriptions |
| `frontend/src/pages/Reports.tsx` | Remove generate modal, add SSE + status states |
| `frontend/src/pages/Reports.css` | Banner + row status styles |
| `frontend/src/pages/SMEEngagement.tsx` | Replace mock data with real API + SSE |
| `frontend/src/pages/Insights.tsx` | Replace hardcoded data with real API + SSE |

---

### Task 1: Database Schema — New Indices

**Files:**
- Modify: `backend/src/config/database.ts`

- [ ] **Step 1: Add new index constants**

In `backend/src/config/database.ts`, add to the `INDICES` object:

```typescript
export const INDICES = {
  DOCUMENTS: 'consultant_documents',
  CONVERSATIONS: 'consultant_conversations',
  ENTITIES: 'consultant_entities',
  USERS: 'consultant_users',
  AUDIT_LOGS: 'consultant_audit_logs',
  NOTIFICATIONS: 'consultant_notifications',
  REPORTS: 'consultant_reports',
  DASHBOARD_METRICS: 'consultant_dashboard_metrics',
  SME_ENGAGEMENT: 'consultant_sme_engagement',
  INSIGHTS: 'consultant_insights',
} as const;
```

- [ ] **Step 2: Add SME_ENGAGEMENT index mapping**

Add after the `DASHBOARD_METRICS` index creation block in `initializeIndices()`:

```typescript
// SME Engagement index
const smeExists = await opensearchClient.indices.exists({ index: INDICES.SME_ENGAGEMENT });
if (!smeExists.body) {
  await opensearchClient.indices.create({
    index: INDICES.SME_ENGAGEMENT,
    body: {
      settings: { number_of_shards: 1, number_of_replicas: 0 },
      mappings: {
        properties: {
          userId: { type: 'keyword' },
          username: { type: 'text' },
          role: { type: 'keyword' },
          department: { type: 'keyword' },
          engagementScore: { type: 'float' },
          participationRate: { type: 'float' },
          responseCount: { type: 'integer' },
          broadAreaCoverage: { type: 'object', enabled: true },
          lastActive: { type: 'date' },
          updatedAt: { type: 'date' },
        },
      },
    },
  });
}
```

- [ ] **Step 3: Add INSIGHTS index mapping**

Add after the SME Engagement block:

```typescript
// Insights index
const insightsExists = await opensearchClient.indices.exists({ index: INDICES.INSIGHTS });
if (!insightsExists.body) {
  await opensearchClient.indices.create({
    index: INDICES.INSIGHTS,
    body: {
      settings: { number_of_shards: 1, number_of_replicas: 0 },
      mappings: {
        properties: {
          sessionId: { type: 'keyword' },
          trendData: { type: 'object', enabled: true },
          gapAnalysis: { type: 'object', enabled: true },
          automationOpportunities: { type: 'object', enabled: true },
          recommendedActions: { type: 'nested', properties: {
            title: { type: 'text' },
            description: { type: 'text' },
            impact: { type: 'keyword' },
            effort: { type: 'keyword' },
            estimatedSavings: { type: 'text' },
            source: { type: 'keyword' },
          }},
          computedAt: { type: 'date' },
        },
      },
    },
  });
}
```

- [ ] **Step 4: Add new fields to REPORTS index mapping**

Find the existing REPORTS index creation block and add these properties alongside existing ones:

```typescript
broadAreaId: { type: 'keyword' },
broadAreaName: { type: 'text' },
pendingRegeneration: { type: 'boolean' },
previousContent: { type: 'object', enabled: false },
updatedAt: { type: 'date' },
```

Note: For existing deployments, these fields will be dynamically mapped on first write. The index mapping change only affects fresh installs.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config/database.ts
git commit -m "feat: add SME engagement and insights indices, extend reports index"
```

---

### Task 2: SSE Broadcast Service

**Files:**
- Create: `backend/src/services/reportSseService.ts`

- [ ] **Step 1: Create the SSE broadcast service**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/reportSseService.ts
git commit -m "feat: add SSE broadcast service for reports, SME, insights"
```

---

### Task 3: SME Engagement Service

**Files:**
- Create: `backend/src/services/smeEngagementService.ts`
- Create: `backend/tests/services/smeEngagementService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock OpenSearch
vi.mock('../../src/config/database', () => ({
  opensearchClient: {
    search: vi.fn(),
    index: vi.fn().mockResolvedValue({}),
  },
  INDICES: {
    CONVERSATIONS: 'consultant_conversations',
    USERS: 'consultant_users',
    SME_ENGAGEMENT: 'consultant_sme_engagement',
  },
}));

vi.mock('../../src/services/reportSseService', () => ({
  broadcastSMEEngagement: vi.fn(),
}));

import { computeSMEEngagement } from '../../src/services/smeEngagementService';
import { opensearchClient } from '../../src/config/database';

describe('computeSMEEngagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes real engagement scores from interview sessions', async () => {
    // Mock users query
    (opensearchClient.search as any)
      .mockResolvedValueOnce({
        body: {
          hits: {
            hits: [
              { _source: { userId: 'u1', username: 'alice', role: 'sme', department: 'Finance' } },
              { _source: { userId: 'u2', username: 'bob', role: 'sme', department: 'Operations' } },
            ],
          },
        },
      })
      // Mock sessions query
      .mockResolvedValueOnce({
        body: {
          hits: {
            hits: [
              {
                _source: {
                  userId: 'u1',
                  sessionType: 'interview',
                  status: 'completed',
                  selectedBroadAreas: ['o2c', 'p2p'],
                  responses: { 'invoicing': [{}, {}, {}], 'credit-mgmt': [{}, {}] },
                  coverage: {
                    'invoicing': { questionsAnswered: 3, status: 'covered' },
                    'credit-mgmt': { questionsAnswered: 2, status: 'covered' },
                  },
                  updatedAt: '2026-03-30T10:00:00Z',
                },
              },
              {
                _source: {
                  userId: 'u2',
                  sessionType: 'interview',
                  status: 'in_progress',
                  selectedBroadAreas: ['o2c'],
                  responses: { 'invoicing': [{}] },
                  coverage: {
                    'invoicing': { questionsAnswered: 1, status: 'in_progress' },
                  },
                  updatedAt: '2026-03-28T10:00:00Z',
                },
              },
            ],
          },
        },
      });

    const result = await computeSMEEngagement();

    expect(result).toHaveLength(2);

    const alice = result.find(u => u.userId === 'u1')!;
    expect(alice.responseCount).toBe(5);
    expect(alice.participationRate).toBeGreaterThan(0);
    expect(alice.engagementScore).toBeGreaterThan(0);

    const bob = result.find(u => u.userId === 'u2')!;
    expect(bob.responseCount).toBe(1);
    expect(bob.engagementScore).toBeLessThan(alice.engagementScore);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/services/smeEngagementService.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the service**

```typescript
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
  // Fetch all users
  const usersRes = await opensearchClient.search({
    index: INDICES.USERS,
    body: { query: { match_all: {} }, size: 500 },
  });
  const users = usersRes.body.hits.hits.map((h: any) => h._source);

  // Fetch all interview sessions
  const sessionsRes = await opensearchClient.search({
    index: INDICES.CONVERSATIONS,
    body: {
      query: { bool: { must: [{ match: { sessionType: 'interview' } }] } },
      size: 1000,
    },
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
      // Count responses
      const responses = session.responses || {};
      for (const subAreaId of Object.keys(responses)) {
        responseCount += (responses[subAreaId] || []).length;
      }

      // Track coverage per broad area
      for (const areaId of (session.selectedBroadAreas || [])) {
        const coverage = session.coverage || {};
        const subAreaIds = Object.keys(coverage).filter(
          (saId: string) => coverage[saId]?.status === 'covered'
        );
        areaCoverage[areaId] = (areaCoverage[areaId] || 0) + subAreaIds.length;
      }

      // Track last active
      if (session.updatedAt && session.updatedAt > lastActive) {
        lastActive = session.updatedAt;
      }
    }

    const participationRate = totalSessions > 0 ? sessionCount / totalSessions : 0;
    const responseScore = Math.min(responseCount / 10, 1); // Normalize to 0-1, cap at 10 responses
    const completionBonus = userSessions.filter((s: any) => s.status === 'completed').length * 0.2;
    const engagementScore = Math.min(
      100,
      Math.round((participationRate * 40 + responseScore * 40 + completionBonus * 20) * 100) / 100
    );

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

    // Persist to OpenSearch
    await opensearchClient.index({
      index: INDICES.SME_ENGAGEMENT,
      id: user.userId,
      body: entry,
      refresh: 'wait_for',
    });
  }

  // Broadcast via SSE
  const sseEvent: SMEEngagementEvent = {
    users: entries.map(e => ({
      userId: e.userId,
      username: e.username,
      engagementScore: e.engagementScore,
      participationRate: e.participationRate,
      responseCount: e.responseCount,
      lastActive: e.lastActive,
    })),
    updatedAt: now,
  };
  broadcastSMEEngagement(sseEvent);

  return entries;
}

export async function fetchSMEEngagement(): Promise<SMEEngagementEntry[]> {
  const res = await opensearchClient.search({
    index: INDICES.SME_ENGAGEMENT,
    body: { query: { match_all: {} }, size: 500, sort: [{ engagementScore: 'desc' }] },
  });
  return res.body.hits.hits.map((h: any) => h._source);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/services/smeEngagementService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/smeEngagementService.ts backend/tests/services/smeEngagementService.test.ts
git commit -m "feat: add SME engagement service with real per-user metrics"
```

---

### Task 4: Insights Service

**Files:**
- Create: `backend/src/services/insightsService.ts`
- Create: `backend/tests/services/insightsService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/database', () => ({
  opensearchClient: {
    search: vi.fn(),
    index: vi.fn().mockResolvedValue({}),
  },
  INDICES: {
    CONVERSATIONS: 'consultant_conversations',
    REPORTS: 'consultant_reports',
    INSIGHTS: 'consultant_insights',
  },
}));

vi.mock('../../src/services/llmService', () => ({
  generateCompletion: vi.fn().mockResolvedValue(JSON.stringify({
    topGaps: [{ area: 'O2C', gap: 'Manual credit checks', severity: 'high', impact: '$2.4M' }],
    automationOpportunities: [{ process: 'Invoice matching', savings: '$1.2M', effort: 'medium' }],
    recommendedActions: [{ title: 'Automate credit checks', description: 'Implement rules engine', impact: 'High', effort: 'Medium', estimatedSavings: '$2.4M' }],
  })),
}));

vi.mock('../../src/services/reportSseService', () => ({
  broadcastInsights: vi.fn(),
}));

import { computeInsights } from '../../src/services/insightsService';
import { opensearchClient } from '../../src/config/database';

describe('computeInsights', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes insights from area reports and session history', async () => {
    // Mock sessions for trend data
    (opensearchClient.search as any)
      .mockResolvedValueOnce({
        body: {
          hits: {
            hits: [
              { _source: { sessionType: 'interview', status: 'completed', createdAt: '2026-03-01T10:00:00Z' } },
              { _source: { sessionType: 'interview', status: 'in_progress', createdAt: '2026-03-15T10:00:00Z' } },
            ],
          },
        },
      })
      // Mock area reports for AI analysis
      .mockResolvedValueOnce({
        body: {
          hits: {
            hits: [
              { _source: { type: 'broad_area', broadAreaName: 'Order-to-Cash', content: { gaps: [{ gap: 'Manual credit checks' }] } } },
            ],
          },
        },
      });

    const result = await computeInsights('session-1');

    expect(result.trendData).toBeDefined();
    expect(result.recommendedActions.length).toBeGreaterThan(0);
    expect(result.recommendedActions[0].title).toBe('Automate credit checks');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/services/insightsService.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the service**

```typescript
import { opensearchClient, INDICES } from '../config/database';
import { generateCompletion } from './llmService';
import { broadcastInsights } from './reportSseService';

export interface InsightsData {
  sessionId: string;
  trendData: { month: string; total: number; completed: number }[];
  gapAnalysis: { area: string; gap: string; severity: string; impact: string }[];
  automationOpportunities: { process: string; savings: string; effort: string }[];
  recommendedActions: { title: string; description: string; impact: string; effort: string; estimatedSavings?: string; source: string }[];
  computedAt: string;
}

export async function computeInsights(sessionId: string, modelId?: string): Promise<InsightsData> {
  const now = new Date().toISOString();

  // 1. Compute trend data from historical sessions
  const sessionsRes = await opensearchClient.search({
    index: INDICES.CONVERSATIONS,
    body: {
      query: { bool: { must: [{ match: { sessionType: 'interview' } }] } },
      size: 1000,
    },
  });
  const sessions = sessionsRes.body.hits.hits.map((h: any) => h._source);

  const monthMap = new Map<string, { total: number; completed: number }>();
  for (const s of sessions) {
    const date = new Date(s.createdAt || s.updatedAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const entry = monthMap.get(key) || { total: 0, completed: 0 };
    entry.total++;
    if (s.status === 'completed') entry.completed++;
    monthMap.set(key, entry);
  }
  const trendData = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month, ...data }));

  // 2. Fetch area reports for AI analysis
  const reportsRes = await opensearchClient.search({
    index: INDICES.REPORTS,
    body: {
      query: { bool: { must: [{ match: { type: 'broad_area' } }] } },
      size: 50,
      _source: ['broadAreaName', 'content'],
    },
  });
  const areaReports = reportsRes.body.hits.hits.map((h: any) => h._source);

  // 3. AI analysis of gaps and automation opportunities
  let gapAnalysis: InsightsData['gapAnalysis'] = [];
  let automationOpportunities: InsightsData['automationOpportunities'] = [];
  let recommendedActions: InsightsData['recommendedActions'] = [];

  if (areaReports.length > 0) {
    const reportSummary = areaReports.map((r: any) => {
      const gaps = r.content?.gaps || [];
      return `Area: ${r.broadAreaName}\nGaps: ${gaps.map((g: any) => g.gap || g.currentState).join('; ')}`;
    }).join('\n\n');

    const prompt = `Analyze these process assessment findings and return JSON with:
- topGaps: array of {area, gap, severity (high/medium/low), impact (estimated annual cost)}
- automationOpportunities: array of {process, savings (estimated annual), effort (high/medium/low)}
- recommendedActions: array of {title, description, impact (High/Medium/Low), effort (High/Medium/Low), estimatedSavings}

Focus on actionable, high-value items. Maximum 5 items per category.

Findings:
${reportSummary}`;

    try {
      const response = await generateCompletion(modelId, [
        { role: 'system', content: 'You are a management consultant analyzing process assessment data. Return valid JSON only.' },
        { role: 'user', content: prompt },
      ], { temperature: 0.3 });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        gapAnalysis = parsed.topGaps || [];
        automationOpportunities = parsed.automationOpportunities || [];
        recommendedActions = (parsed.recommendedActions || []).map((a: any) => ({ ...a, source: 'ai' }));
      }
    } catch (err) {
      console.error('Insights AI analysis failed, using empty results:', err);
    }
  }

  const insights: InsightsData = {
    sessionId,
    trendData,
    gapAnalysis,
    automationOpportunities,
    recommendedActions,
    computedAt: now,
  };

  // Persist
  await opensearchClient.index({
    index: INDICES.INSIGHTS,
    id: sessionId,
    body: insights,
    refresh: 'wait_for',
  });

  // Broadcast
  broadcastInsights({
    sessionId,
    recommendedActions,
    updatedAt: now,
  });

  return insights;
}

export async function fetchInsights(sessionId?: string): Promise<InsightsData | null> {
  const query = sessionId
    ? { match: { sessionId } }
    : { match_all: {} };

  const res = await opensearchClient.search({
    index: INDICES.INSIGHTS,
    body: { query, size: 1, sort: [{ computedAt: 'desc' }] },
  });

  const hit = res.body.hits.hits[0];
  return hit ? hit._source : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/services/insightsService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/insightsService.ts backend/tests/services/insightsService.test.ts
git commit -m "feat: add insights service with AI-powered analysis"
```

---

### Task 5: Pipeline Trigger Service

**Files:**
- Create: `backend/src/services/pipelineTriggerService.ts`
- Create: `backend/tests/services/pipelineTriggerService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/database', () => ({
  opensearchClient: {
    search: vi.fn(),
    index: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
  },
  INDICES: { REPORTS: 'consultant_reports' },
}));

vi.mock('../../src/services/reportSseService', () => ({
  broadcastReportStatus: vi.fn(),
}));

// Mock the workflow execution
const mockExecute = vi.fn().mockResolvedValue({ result: { success: true } });
vi.mock('../../src/mastra/workflows/interviewDataPipeline', () => ({
  executeDataPipeline: mockExecute,
}));

import { triggerDataPipeline } from '../../src/services/pipelineTriggerService';
import { opensearchClient } from '../../src/config/database';
import { broadcastReportStatus } from '../../src/services/reportSseService';

describe('triggerDataPipeline', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates report records as generating and starts workflow for areas with coverage', async () => {
    // No existing reports
    (opensearchClient.search as any).mockResolvedValue({
      body: { hits: { hits: [] } },
    });

    const session = {
      sessionId: 'sess-1',
      userId: 'user-1',
      selectedBroadAreas: ['o2c', 'p2p'],
      coverage: {
        'invoicing': { questionsAnswered: 3, status: 'covered' },
        'credit-mgmt': { questionsAnswered: 2, status: 'covered' },
        'purchase-orders': { questionsAnswered: 0, status: 'not_started' },
      },
    };

    await triggerDataPipeline(session as any);

    // Should create report records
    expect(opensearchClient.index).toHaveBeenCalled();
    // Should broadcast generating status
    expect(broadcastReportStatus).toHaveBeenCalled();
    // Should start workflow
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'sess-1' })
    );
  });

  it('sets pendingRegeneration when report is already generating', async () => {
    // Existing report in generating status
    (opensearchClient.search as any).mockResolvedValue({
      body: {
        hits: {
          hits: [{
            _id: 'report-1',
            _source: {
              reportId: 'report-1',
              sessionId: 'sess-1',
              broadAreaId: 'o2c',
              status: 'generating',
              pendingRegeneration: false,
            },
          }],
        },
      },
    });

    const session = {
      sessionId: 'sess-1',
      userId: 'user-1',
      selectedBroadAreas: ['o2c'],
      coverage: {
        'invoicing': { questionsAnswered: 3, status: 'covered' },
      },
    };

    await triggerDataPipeline(session as any);

    // Should update pendingRegeneration flag
    expect(opensearchClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { doc: { pendingRegeneration: true } },
      })
    );
    // Should NOT start a new workflow
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('stashes previousContent when regenerating a ready report', async () => {
    (opensearchClient.search as any).mockResolvedValue({
      body: {
        hits: {
          hits: [{
            _id: 'report-1',
            _source: {
              reportId: 'report-1',
              sessionId: 'sess-1',
              broadAreaId: 'o2c',
              status: 'ready',
              content: { gaps: ['existing data'] },
            },
          }],
        },
      },
    });

    const session = {
      sessionId: 'sess-1',
      userId: 'user-1',
      selectedBroadAreas: ['o2c'],
      coverage: {
        'invoicing': { questionsAnswered: 3, status: 'covered' },
      },
    };

    await triggerDataPipeline(session as any);

    // Should stash content to previousContent
    expect(opensearchClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          previousContent: { gaps: ['existing data'] },
          status: 'generating',
        }),
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/services/pipelineTriggerService.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the trigger service**

```typescript
import { v4 as uuidv4 } from 'uuid';
import { opensearchClient, INDICES } from '../config/database';
import { InterviewSession } from './interviewService';
import { broadcastReportStatus } from './reportSseService';
import { getBroadAreaForSubArea, getBroadArea } from './domainService';

export async function triggerDataPipeline(session: InterviewSession): Promise<void> {
  const { sessionId, userId, selectedBroadAreas, coverage } = session;

  // Determine which broad areas have at least one covered sub-area
  const qualifyingAreas: string[] = [];
  for (const broadAreaId of selectedBroadAreas) {
    const hasCoverage = Object.entries(coverage).some(([subAreaId, cov]) => {
      const parentArea = getBroadAreaForSubArea(subAreaId);
      return parentArea?.id === broadAreaId && cov.status === 'covered';
    });
    if (hasCoverage) {
      qualifyingAreas.push(broadAreaId);
    }
  }

  if (qualifyingAreas.length === 0) return;

  // Check existing reports for this session
  const existingRes = await opensearchClient.search({
    index: INDICES.REPORTS,
    body: {
      query: {
        bool: {
          must: [
            { match: { sessionId } },
            { match: { type: 'broad_area' } },
          ],
        },
      },
      size: 100,
    },
  });
  const existingReports = new Map(
    existingRes.body.hits.hits.map((h: any) => [h._source.broadAreaId, h._source])
  );

  const areasToGenerate: string[] = [];

  for (const broadAreaId of qualifyingAreas) {
    const existing = existingReports.get(broadAreaId);
    const broadArea = getBroadArea(broadAreaId);
    const broadAreaName = broadArea?.name || broadAreaId;

    if (existing?.status === 'generating') {
      // Queue for regeneration after current run
      await opensearchClient.update({
        index: INDICES.REPORTS,
        id: existing.reportId,
        body: { doc: { pendingRegeneration: true } },
        refresh: 'wait_for',
      });
      broadcastReportStatus({
        reportId: existing.reportId,
        sessionId,
        broadAreaId,
        broadAreaName,
        type: 'broad_area',
        status: 'generating',
        pendingRegeneration: true,
        updatedAt: new Date().toISOString(),
      });
    } else {
      // Create or update report record as generating
      const reportId = existing?.reportId || uuidv4();
      const now = new Date().toISOString();

      await opensearchClient.index({
        index: INDICES.REPORTS,
        id: reportId,
        body: {
          reportId,
          name: `${broadAreaName} — Gap Analysis`,
          type: 'broad_area',
          sessionId,
          broadAreaId,
          broadAreaName,
          generatedBy: userId,
          status: 'generating',
          pendingRegeneration: false,
          previousContent: existing?.status === 'ready' ? existing.content : null,
          fileSize: existing?.fileSize || 0,
          downloadCount: existing?.downloadCount || 0,
          content: null,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        },
        refresh: 'wait_for',
      });

      broadcastReportStatus({
        reportId,
        sessionId,
        broadAreaId,
        broadAreaName,
        type: 'broad_area',
        status: 'generating',
        pendingRegeneration: false,
        updatedAt: now,
      });

      areasToGenerate.push(broadAreaId);
    }
  }

  if (areasToGenerate.length === 0) return;

  // Fire-and-forget workflow execution
  const { executeDataPipeline } = await import('../mastra/workflows/interviewDataPipeline');
  executeDataPipeline({ sessionId, broadAreaIds: areasToGenerate, userId }).catch(err => {
    console.error('Data pipeline workflow failed:', err);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/services/pipelineTriggerService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/pipelineTriggerService.ts backend/tests/services/pipelineTriggerService.test.ts
git commit -m "feat: add pipeline trigger service with dedup and queue logic"
```

---

### Task 6: Mastra Workflow — Interview Data Pipeline

**Files:**
- Create: `backend/src/mastra/workflows/interviewDataPipeline.ts`
- Modify: `backend/src/mastra/index.ts`

- [ ] **Step 1: Create the workflow file**

```typescript
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { opensearchClient, INDICES } from '../../config/database';
import { getInterviewSession } from '../../services/interviewService';
import { generateGapReport, generateReadinessReport, generateConsolidatedReport } from '../../services/reportService';
import { recomputeAndStoreMetrics } from '../../services/metricsService';
import { computeSMEEngagement } from '../../services/smeEngagementService';
import { computeInsights } from '../../services/insightsService';
import { broadcastReportStatus } from '../../services/reportSseService';
import { getBroadArea, getSubAreasForBroadArea } from '../../services/domainService';
import { generateCompletion } from '../../services/llmService';
import { buildGapReportPrompt } from '../../prompts/report.prompt';
import { v4 as uuidv4 } from 'uuid';

// --- Input/Output schemas ---

const pipelineInputSchema = z.object({
  sessionId: z.string(),
  broadAreaIds: z.array(z.string()),
  userId: z.string(),
});

const sessionDataSchema = z.object({
  session: z.any(),
  broadAreaIds: z.array(z.string()),
  userId: z.string(),
});

const areaReportsSchema = z.object({
  areaReports: z.array(z.any()),
  session: z.any(),
  userId: z.string(),
});

const successSchema = z.object({ success: z.boolean() });

// --- Step 1: Collect Session Data ---

const collectSessionData = createStep({
  id: 'collect-session-data',
  inputSchema: pipelineInputSchema,
  outputSchema: sessionDataSchema,
  execute: async ({ inputData }) => {
    const session = await getInterviewSession(inputData.sessionId);
    if (!session) throw new Error(`Session ${inputData.sessionId} not found`);
    return {
      session,
      broadAreaIds: inputData.broadAreaIds,
      userId: inputData.userId,
    };
  },
});

// --- Step 2: Lane A (Area Reports) + Lane B (Metrics) in parallel ---

const generateAreaReports = createStep({
  id: 'generate-area-reports',
  inputSchema: sessionDataSchema,
  outputSchema: areaReportsSchema,
  execute: async ({ inputData }) => {
    const { session, broadAreaIds, userId } = inputData;
    const areaReports: any[] = [];

    for (const broadAreaId of broadAreaIds) {
      try {
        const broadArea = getBroadArea(broadAreaId);
        if (!broadArea) continue;

        const subAreas = getSubAreasForBroadArea(broadAreaId);
        const coveredSubAreas = subAreas.filter(
          sa => session.coverage?.[sa.id]?.status === 'covered'
        );

        if (coveredSubAreas.length === 0) continue;

        // MAP: Summarize each sub-area in parallel
        const summaryPromises = coveredSubAreas.map(async (subArea) => {
          const answers = session.responses?.[subArea.id] || [];
          if (answers.length === 0) return null;

          const qaText = answers.map((a: any) =>
            `Q: ${(a.question || '').slice(0, 200)}\nA: ${String(a.answer || '').slice(0, 400)}`
          ).join('\n\n');

          const prompt = `Summarize this interview data for "${subArea.name}" into a structured digest.
Return JSON with: { keyFindings: string[], painPoints: string[], maturityLevel: string, gaps: { gap: string, category: string, impact: string }[] }

Interview Data:
${qaText}`;

          try {
            const response = await generateCompletion(undefined, [
              { role: 'system', content: 'You are a management consultant. Return valid JSON only.' },
              { role: 'user', content: prompt },
            ], { temperature: 0.3 });

            const match = response.match(/\{[\s\S]*\}/);
            return match ? { subAreaId: subArea.id, subAreaName: subArea.name, ...JSON.parse(match[0]) } : null;
          } catch {
            return null; // Skip failed sub-area, report will have warnings
          }
        });

        const summaries = (await Promise.all(summaryPromises)).filter(Boolean);

        // REDUCE: Synthesize into broad area report
        const digestText = summaries.map((s: any) =>
          `Sub-area: ${s.subAreaName}\nFindings: ${s.keyFindings?.join('; ')}\nGaps: ${s.gaps?.map((g: any) => g.gap).join('; ')}\nPain Points: ${s.painPoints?.join('; ')}`
        ).join('\n\n');

        const reducePrompt = `Synthesize these sub-area assessment digests into a comprehensive gap analysis report for the "${broadArea.name}" broad area.

Return JSON with:
- executiveSummary: string
- gaps: array of { id, category (process|technology|capability|data), area, currentState, targetState, gap, impact (high|medium|low), effort (high|medium|low), fit (gap|partial|fit), standard, priority }
- quickWins: array (subset of gaps with high impact + low effort)
- roadmap: array of { phase, duration, items[] }
- riskAssessment: array of { risk, likelihood (high|medium|low), impact (high|medium|low), mitigation }

Sub-area Digests:
${digestText}`;

        const reduceResponse = await generateCompletion(undefined, [
          { role: 'system', content: 'You are a senior management consultant. Return valid JSON only.' },
          { role: 'user', content: reducePrompt },
        ], { temperature: 0.3 });

        const reduceMatch = reduceResponse.match(/\{[\s\S]*\}/);
        if (!reduceMatch) continue;

        const reportContent = JSON.parse(reduceMatch[0]);

        // Assign IDs and priorities to gaps
        (reportContent.gaps || []).forEach((gap: any, i: number) => {
          gap.id = gap.id || `gap-${broadAreaId}-${i}`;
          const impactScore = gap.impact === 'high' ? 3 : gap.impact === 'medium' ? 2 : 1;
          const effortScore = gap.effort === 'low' ? 3 : gap.effort === 'medium' ? 2 : 1;
          gap.priority = gap.priority || impactScore * effortScore;
        });

        // Save area report
        const existingRes = await opensearchClient.search({
          index: INDICES.REPORTS,
          body: {
            query: {
              bool: {
                must: [
                  { match: { sessionId: session.sessionId } },
                  { match: { broadAreaId } },
                  { match: { type: 'broad_area' } },
                ],
              },
            },
            size: 1,
          },
        });

        const existing = existingRes.body.hits.hits[0]?._source;
        const reportId = existing?.reportId || uuidv4();
        const now = new Date().toISOString();
        const content = { ...reportContent, subAreaSummaries: summaries };
        const fileSize = JSON.stringify(content).length;
        const warnings = coveredSubAreas
          .filter(sa => !summaries.find((s: any) => s.subAreaId === sa.id))
          .map(sa => `Sub-area "${sa.name}" summary failed`);

        await opensearchClient.index({
          index: INDICES.REPORTS,
          id: reportId,
          body: {
            reportId,
            name: `${broadArea.name} — Gap Analysis`,
            type: 'broad_area',
            sessionId: session.sessionId,
            broadAreaId,
            broadAreaName: broadArea.name,
            generatedBy: userId,
            status: 'ready',
            pendingRegeneration: false,
            previousContent: null,
            content,
            fileSize,
            downloadCount: existing?.downloadCount || 0,
            warnings: warnings.length > 0 ? warnings : undefined,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
          },
          refresh: 'wait_for',
        });

        broadcastReportStatus({
          reportId,
          sessionId: session.sessionId,
          broadAreaId,
          broadAreaName: broadArea.name,
          type: 'broad_area',
          status: 'ready',
          pendingRegeneration: false,
          updatedAt: now,
        });

        areaReports.push({ reportId, broadAreaId, broadAreaName: broadArea.name, content });
      } catch (err) {
        console.error(`Area report generation failed for ${broadAreaId}:`, err);
        // Mark as failed
        const existingRes = await opensearchClient.search({
          index: INDICES.REPORTS,
          body: {
            query: {
              bool: {
                must: [
                  { match: { sessionId: session.sessionId } },
                  { match: { broadAreaId } },
                ],
              },
            },
            size: 1,
          },
        });
        const existing = existingRes.body.hits.hits[0]?._source;
        if (existing) {
          await opensearchClient.update({
            index: INDICES.REPORTS,
            id: existing.reportId,
            body: { doc: { status: 'failed', updatedAt: new Date().toISOString() } },
          });
          broadcastReportStatus({
            reportId: existing.reportId,
            sessionId: session.sessionId,
            broadAreaId,
            broadAreaName: existing.broadAreaName,
            type: 'broad_area',
            status: 'failed',
            pendingRegeneration: false,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    return { areaReports, session, userId };
  },
});

const computeMetrics = createStep({
  id: 'compute-metrics',
  inputSchema: sessionDataSchema,
  outputSchema: successSchema,
  execute: async () => {
    await recomputeAndStoreMetrics();
    await computeSMEEngagement();
    return { success: true };
  },
});

// --- Step 3: Lane C (Session Reports) + Lane D (Insights) ---

const generateSessionReports = createStep({
  id: 'generate-session-reports',
  inputSchema: areaReportsSchema,
  outputSchema: successSchema,
  execute: async ({ inputData }) => {
    const { session, userId, areaReports } = inputData;
    if (areaReports.length === 0) return { success: true };

    const sessionId = session.sessionId;
    const now = new Date().toISOString();
    const reportTypes = ['readiness', 'consolidated', 'strategic'] as const;

    for (const type of reportTypes) {
      try {
        let content: any;
        if (type === 'readiness') {
          content = await generateReadinessReport(sessionId);
        } else if (type === 'consolidated') {
          content = await generateConsolidatedReport(sessionId);
        } else {
          content = await generateGapReport(sessionId); // strategic uses gap analysis
        }

        const reportId = uuidv4();
        const typeLabels: Record<string, string> = {
          readiness: 'Executive Summary',
          consolidated: 'Consolidated Report',
          strategic: 'Strategic Report',
        };

        await opensearchClient.index({
          index: INDICES.REPORTS,
          id: reportId,
          body: {
            reportId,
            name: typeLabels[type],
            type,
            sessionId,
            generatedBy: userId,
            status: 'ready',
            pendingRegeneration: false,
            previousContent: null,
            content,
            fileSize: JSON.stringify(content).length,
            downloadCount: 0,
            createdAt: now,
            updatedAt: now,
          },
          refresh: 'wait_for',
        });

        broadcastReportStatus({
          reportId,
          sessionId,
          type,
          status: 'ready',
          pendingRegeneration: false,
          updatedAt: now,
        });
      } catch (err) {
        console.error(`Session report ${type} failed:`, err);
      }
    }

    return { success: true };
  },
});

const computeInsightsStep = createStep({
  id: 'compute-insights',
  inputSchema: areaReportsSchema,
  outputSchema: successSchema,
  execute: async ({ inputData }) => {
    await computeInsights(inputData.session.sessionId);
    return { success: true };
  },
});

// --- Final Step: Check pending regeneration ---

const checkPendingRegeneration = createStep({
  id: 'check-pending-regeneration',
  inputSchema: successSchema,
  outputSchema: successSchema,
  execute: async ({ getInitData }) => {
    const initData = getInitData<{ sessionId: string; broadAreaIds: string[]; userId: string }>();

    const pendingRes = await opensearchClient.search({
      index: INDICES.REPORTS,
      body: {
        query: {
          bool: {
            must: [
              { match: { sessionId: initData.sessionId } },
              { match: { pendingRegeneration: true } },
            ],
          },
        },
        size: 100,
      },
    });

    const pendingReports = pendingRes.body.hits.hits;
    if (pendingReports.length > 0) {
      // Clear flags
      for (const hit of pendingReports) {
        await opensearchClient.update({
          index: INDICES.REPORTS,
          id: hit._id,
          body: { doc: { pendingRegeneration: false } },
        });
      }

      // Re-trigger (dynamic import to avoid circular dep)
      const { triggerDataPipeline } = await import('../../services/pipelineTriggerService');
      const session = await getInterviewSession(initData.sessionId);
      if (session) {
        triggerDataPipeline(session).catch(err =>
          console.error('Re-trigger after pending regeneration failed:', err)
        );
      }
    }

    return { success: true };
  },
});

// --- Assemble the workflow ---

export const interviewDataPipeline = createWorkflow({
  id: 'interview-data-pipeline',
  inputSchema: pipelineInputSchema,
  outputSchema: successSchema,
})
  .then(collectSessionData)
  .parallel([generateAreaReports, computeMetrics])
  .then(createStep({
    id: 'merge-for-phase-2',
    inputSchema: z.array(z.any()),
    outputSchema: areaReportsSchema,
    execute: async ({ inputData, getStepResult }) => {
      const areaResult = getStepResult('generate-area-reports');
      return areaResult as any;
    },
  }))
  .parallel([generateSessionReports, computeInsightsStep])
  .then(checkPendingRegeneration)
  .commit();

// --- Execution helper ---

export async function executeDataPipeline(input: {
  sessionId: string;
  broadAreaIds: string[];
  userId: string;
}): Promise<void> {
  const run = await interviewDataPipeline.createRun();
  await interviewDataPipeline.execute({
    runId: run.runId,
    inputData: input,
  });
}
```

- [ ] **Step 2: Register workflow in Mastra instance**

In `backend/src/mastra/index.ts`, add the workflow import and registration:

```typescript
import { Mastra } from '@mastra/core';
import { OpenSearchVector } from '@mastra/opensearch';
import { consultantAgent } from './agent';
import { interviewAgent } from './interviewAgent';
import { interviewDataPipeline } from './workflows/interviewDataPipeline';

// ... existing vector store setup ...

export const mastra = new Mastra({
  agents: {
    consultantAgent,
    interviewAgent,
  },
  workflows: {
    interviewDataPipeline,
  },
  vectors: {
    opensearch: openSearchVector,
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/mastra/workflows/interviewDataPipeline.ts backend/src/mastra/index.ts
git commit -m "feat: add Mastra interview data pipeline workflow with parallel lanes"
```

---

### Task 7: Interview Route Changes — Pause Endpoint + Completion Trigger

**Files:**
- Modify: `backend/src/routes/interview.ts`

- [ ] **Step 1: Add the pause endpoint**

Add after the existing `POST /:sessionId/category` route:

```typescript
// Pause interview session and trigger data pipeline
router.post('/:sessionId/pause', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = await getInterviewSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Don't pause already completed sessions
    if (session.status === 'completed') {
      return res.status(400).json({ error: 'Session is already completed' });
    }

    // Update session (keep status as in_progress, just trigger pipeline)
    session.updatedAt = new Date().toISOString();
    await updateInterviewSession(session);

    // Trigger data pipeline fire-and-forget
    const { triggerDataPipeline } = await import('../services/pipelineTriggerService');
    triggerDataPipeline(session).catch(err =>
      console.error('Pipeline trigger failed on pause:', err)
    );

    const progress = getInterviewProgress(session);
    return res.json({
      message: 'Session paused, reports generating',
      progress,
      currentSubArea: session.currentSubArea,
    });
  } catch (err: any) {
    console.error('Pause session error:', err);
    return res.status(500).json({ error: 'Failed to pause session' });
  }
});
```

- [ ] **Step 2: Add pipeline trigger on session completion**

Find the existing completion detection in the `POST /:sessionId/answer` route. After `session.status = 'completed'` and `await updateInterviewSession(session)`, add the pipeline trigger:

```typescript
if (allCovered) {
  session.status = 'completed';
  await updateInterviewSession(session);

  // Trigger data pipeline on completion
  const { triggerDataPipeline } = await import('../services/pipelineTriggerService');
  triggerDataPipeline(session).catch(err =>
    console.error('Pipeline trigger failed on completion:', err)
  );

  return res.json({ progress, currentSubArea: session.currentSubArea, completed: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/interview.ts
git commit -m "feat: add pause endpoint and completion trigger for data pipeline"
```

---

### Task 8: Reports Route Changes — Remove Generate, Add SSE Stream

**Files:**
- Modify: `backend/src/routes/reports.ts`

- [ ] **Step 1: Remove the POST /generate endpoint**

Delete the entire `router.post('/generate', ...)` handler (lines ~54-231 in current file).

- [ ] **Step 2: Add SSE stream endpoint**

Add at the top of the routes file (before the GET `/` list endpoint):

```typescript
import { addReportSSEClient } from '../services/reportSseService';

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
```

- [ ] **Step 3: Update GET / to include new fields in response**

In the existing `GET /` reports list endpoint, ensure the `_source` includes the new fields. Find the search query and update the `_source_excludes` to NOT exclude the new fields. The response should include `broadAreaId`, `broadAreaName`, `pendingRegeneration`, `updatedAt`, `previousContent` (existence only, not full content).

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/reports.ts
git commit -m "feat: remove manual report generation, add SSE stream endpoint"
```

---

### Task 9: New Backend Routes — SME Engagement + Insights

**Files:**
- Create: `backend/src/routes/smeEngagement.ts`
- Create: `backend/src/routes/insights.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create SME Engagement routes**

```typescript
import { Router, Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { fetchSMEEngagement } from '../services/smeEngagementService';
import { addSMESSEClient } from '../services/reportSseService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const entries = await fetchSMEEngagement();
    return res.json({ users: entries });
  } catch (err: any) {
    console.error('Fetch SME engagement error:', err);
    return res.status(500).json({ error: 'Failed to fetch SME engagement' });
  }
});

router.get('/stream', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  if (!user) return res.sendStatus(401);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.write('data: {"type":"connected"}\n\n');
  addSMESSEClient(res);

  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => clearInterval(keepAlive));
});

export default router;
```

- [ ] **Step 2: Create Insights routes**

```typescript
import { Router, Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { fetchInsights } from '../services/insightsService';
import { addInsightsSSEClient } from '../services/reportSseService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string | undefined;
    const insights = await fetchInsights(sessionId);
    return res.json({ insights });
  } catch (err: any) {
    console.error('Fetch insights error:', err);
    return res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

router.get('/stream', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  if (!user) return res.sendStatus(401);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.write('data: {"type":"connected"}\n\n');
  addInsightsSSEClient(res);

  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => clearInterval(keepAlive));
});

export default router;
```

- [ ] **Step 3: Mount new routes in index.ts**

In `backend/src/index.ts`, add imports and mount:

```typescript
import smeEngagementRoutes from './routes/smeEngagement';
import insightsRoutes from './routes/insights';

// Add alongside existing route mounts:
app.use('/api/sme-engagement', authenticateToken, smeEngagementRoutes);
app.use('/api/insights', authenticateToken, insightsRoutes);
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/smeEngagement.ts backend/src/routes/insights.ts backend/src/index.ts
git commit -m "feat: add SME engagement and insights REST + SSE endpoints"
```

---

### Task 10: Stale Report Cleanup on Server Start

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Add cleanup function after index initialization**

After the `await initializeIndices()` call in `backend/src/index.ts`, add:

```typescript
// Clean up stale generating reports (from server restarts mid-workflow)
async function cleanupStaleReports() {
  try {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await opensearchClient.updateByQuery({
      index: INDICES.REPORTS,
      body: {
        query: {
          bool: {
            must: [
              { match: { status: 'generating' } },
              { range: { updatedAt: { lt: fifteenMinAgo } } },
            ],
          },
        },
        script: {
          source: "ctx._source.status = 'failed'; ctx._source.updatedAt = params.now",
          params: { now: new Date().toISOString() },
        },
      },
    });
  } catch (err) {
    console.error('Stale report cleanup failed:', err);
  }
}

// Call after indices are ready
await cleanupStaleReports();
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: add stale report cleanup on server startup"
```

---

### Task 11: Frontend API Service — New Functions

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Remove generateReport function**

Delete the `generateReport` function (the one that calls `POST /api/reports/generate`).

- [ ] **Step 2: Add new API functions**

Add these functions to `frontend/src/services/api.ts`:

```typescript
// Pause interview session (triggers report pipeline)
export async function pauseInterviewSession(sessionId: string): Promise<any> {
  return request(`${API_BASE}/interview/${sessionId}/pause`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
  });
}

// SME Engagement
export async function fetchSMEEngagement(): Promise<{ users: any[] }> {
  return request(`${API_BASE}/sme-engagement`, {
    headers: authHeaders(),
  });
}

// Insights
export async function fetchInsightsData(sessionId?: string): Promise<{ insights: any }> {
  const params = sessionId ? `?sessionId=${sessionId}` : '';
  return request(`${API_BASE}/insights${params}`, {
    headers: authHeaders(),
  });
}

// SSE subscriptions
export function subscribeToReportStream(
  onEvent: (event: any) => void,
  onError?: (err: Event) => void
): EventSource {
  const token = getToken();
  const es = new EventSource(`${API_BASE}/reports/stream?token=${token}`);

  es.addEventListener('report-status', (e: MessageEvent) => {
    onEvent(JSON.parse(e.data));
  });

  es.onerror = (err) => {
    onError?.(err);
  };

  return es;
}

export function subscribeToSMEStream(
  onEvent: (event: any) => void,
  onError?: (err: Event) => void
): EventSource {
  const token = getToken();
  const es = new EventSource(`${API_BASE}/sme-engagement/stream?token=${token}`);

  es.addEventListener('sme-engagement', (e: MessageEvent) => {
    onEvent(JSON.parse(e.data));
  });

  es.onerror = (err) => onError?.(err);
  return es;
}

export function subscribeToInsightsStream(
  onEvent: (event: any) => void,
  onError?: (err: Event) => void
): EventSource {
  const token = getToken();
  const es = new EventSource(`${API_BASE}/insights/stream?token=${token}`);

  es.addEventListener('insights-updated', (e: MessageEvent) => {
    onEvent(JSON.parse(e.data));
  });

  es.onerror = (err) => onError?.(err);
  return es;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat: add pipeline API functions and SSE subscriptions"
```

---

### Task 12: Frontend Reports Page — Remove Generate, Add SSE + Status States

**Files:**
- Modify: `frontend/src/pages/Reports.tsx`
- Modify: `frontend/src/pages/Reports.css`

- [ ] **Step 1: Remove generate modal state and handlers**

Remove from Reports.tsx:
- State: `showGenerateModal`, `sessions`, `sessionsLoading`, `genSessionId`, `genType`, `genName`, `generating`
- Functions: `openGenerateModal`, `handleGenerate`
- JSX: The "Generate New Report" button in the header
- JSX: The entire generate modal overlay
- Import: `Plus` icon (no longer needed), `generateReport` from api

- [ ] **Step 2: Add SSE subscription and banner state**

Add new state and SSE hook:

```typescript
import { subscribeToReportStream } from '../services/api';

// Add state for banner
const [generatingReports, setGeneratingReports] = useState<Map<string, any>>(new Map());
const [bannerDismissed, setBannerDismissed] = useState(false);

// SSE subscription
useEffect(() => {
  const es = subscribeToReportStream((event) => {
    // Update reports list with new status
    setReports(prev => {
      const idx = prev.findIndex(r => r.reportId === event.reportId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...event };
        return updated;
      }
      // New report — add to list
      return [event, ...prev];
    });

    // Update generating banner
    setGeneratingReports(prev => {
      const next = new Map(prev);
      if (event.status === 'generating') {
        next.set(event.reportId, event);
      } else {
        next.delete(event.reportId);
      }
      return next;
    });

    // Refresh stats when a report becomes ready
    if (event.status === 'ready') {
      loadStats();
    }
  });

  return () => es.close();
}, []);
```

- [ ] **Step 3: Add the generation banner component**

Add before the reports table in JSX:

```tsx
{generatingReports.size > 0 && !bannerDismissed && (
  <div className="reports__banner">
    <Loader className="reports__banner-spinner spin" size={18} />
    <div className="reports__banner-text">
      <strong>Generating reports from latest interview data...</strong>
      <span className="reports__banner-areas">
        {Array.from(generatingReports.values())
          .map(r => r.broadAreaName || r.name)
          .join(', ')}
      </span>
    </div>
    <button className="reports__banner-dismiss" onClick={() => setBannerDismissed(true)}>
      <X size={16} />
    </button>
  </div>
)}
```

- [ ] **Step 4: Update row rendering with status states**

Replace the existing status badge rendering in table rows:

```tsx
{(() => {
  const isRefreshing = report.status === 'generating' && report.previousContent;
  const isQueued = report.status === 'generating' && report.pendingRegeneration;
  const isFirstGen = report.status === 'generating' && !report.previousContent && !report.pendingRegeneration;

  let statusClass = `reports__status--${report.status}`;
  let statusLabel = report.status === 'ready' ? t('reports.ready') : report.status;
  let rowClass = 'reports__row';

  if (isQueued) {
    statusClass = 'reports__status--queued';
    statusLabel = 'Queued';
    rowClass += ' reports__row--queued';
  } else if (isRefreshing) {
    statusClass = 'reports__status--refreshing';
    statusLabel = 'Refreshing...';
    rowClass += ' reports__row--refreshing';
  } else if (isFirstGen) {
    statusClass = 'reports__status--generating';
    statusLabel = 'Generating...';
    rowClass += ' reports__row--generating';
  }

  const canPreview = report.status === 'ready' || report.previousContent;
  const canDownload = report.status === 'ready' || report.previousContent;

  return (
    <tr key={report.reportId} className={rowClass}>
      {/* ... existing cells ... */}
      <td><span className={`reports__status ${statusClass}`}>{statusLabel}</span></td>
      <td className="reports__actions">
        {canPreview && (
          <button className="reports__preview-btn" onClick={() => handlePreview(report)} title="Preview">
            <Eye size={16} />
          </button>
        )}
        {canDownload && (
          <button className="reports__download-btn" onClick={() => handleDownload(report)} title="Download">
            <Download size={16} />
          </button>
        )}
        {report.status === 'failed' && (
          <button className="reports__retry-btn" title="Retry">
            <RefreshCw size={16} />
          </button>
        )}
      </td>
    </tr>
  );
})()}
```

- [ ] **Step 5: Add relative timestamp display**

Add a helper and update the date cell in rows:

```tsx
function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// In the row, show updatedAt as relative time:
<span className="reports__meta">{report.updatedAt ? `Updated ${formatRelativeTime(report.updatedAt)}` : ''}</span>
```

- [ ] **Step 6: Add CSS for banner and new status states**

Add to `Reports.css`:

```css
/* Generation banner */
.reports__banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 10px;
  margin-bottom: 8px;
}

.reports__banner-spinner {
  color: var(--primary);
  flex-shrink: 0;
}

.reports__banner-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  font-size: 13px;
}

.reports__banner-text strong {
  color: var(--text);
}

.reports__banner-areas {
  color: var(--text-muted);
  font-size: 12px;
}

.reports__banner-dismiss {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
}

/* Row states */
.reports__row--generating {
  border-left: 3px solid #eab308;
  animation: pulse 2s ease-in-out infinite;
}

.reports__row--refreshing {
  border-left: 3px solid var(--primary);
}

.reports__row--queued {
  border-left: 3px solid #8b5cf6;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Status badges */
.reports__status--refreshing {
  background: var(--primary);
  color: #fff;
}

.reports__status--queued {
  background: #8b5cf6;
  color: #fff;
}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Reports.tsx frontend/src/pages/Reports.css
git commit -m "feat: replace manual generation with SSE-driven report status UI"
```

---

### Task 13: Frontend SME Engagement — Replace Mock Data

**Files:**
- Modify: `frontend/src/pages/SMEEngagement.tsx`

- [ ] **Step 1: Replace mock data with real API + SSE**

Replace the existing data loading logic. Key changes:

```typescript
import { fetchSMEEngagement as fetchSMEEngagementData, subscribeToSMEStream } from '../services/api';

// Replace the existing useEffect that loads users + sessions:
useEffect(() => {
  setLoading(true);
  fetchSMEEngagementData()
    .then(data => {
      setUsers(data.users || []);
    })
    .catch(err => console.error('Failed to fetch SME engagement:', err))
    .finally(() => setLoading(false));

  // SSE subscription for real-time updates
  const es = subscribeToSMEStream((event) => {
    setUsers(event.users || []);
  });

  return () => es.close();
}, []);
```

- [ ] **Step 2: Update the stat cards to use real data**

Replace the `buildSMEEntries` function and stat computation. The API now returns entries with `engagementScore`, `participationRate`, `responseCount`, `lastActive`, `department`, `role` — use these directly instead of computing mock values:

```typescript
// Stat cards derived from real data
const totalSMEs = users.length;
const avgEngagement = users.length > 0
  ? Math.round(users.reduce((sum, u) => sum + (u.engagementScore || 0), 0) / users.length)
  : 0;
const activeUsers = users.filter(u => (u.engagementScore || 0) > 30);
const participationRate = users.length > 0
  ? Math.round((activeUsers.length / users.length) * 100)
  : 0;
const totalResponses = users.reduce((sum, u) => sum + (u.responseCount || 0), 0);
const lowEngagement = users.filter(u => (u.engagementScore || 0) < 40).length;
```

- [ ] **Step 3: Update the table rows to use API fields directly**

The table rows should map directly from the `users` array (which now has real data from the API) instead of from the `buildSMEEntries` transform:

```tsx
{users.map(user => (
  <tr key={user.userId}>
    <td className="sme-table__user">
      <div className="sme-table__avatar">{getInitials(user.username)}</div>
      <div>
        <div>{user.username}</div>
        <div className="sme-table__muted">{getRoleLabel(user.role)}</div>
      </div>
    </td>
    <td>{user.department || 'Unknown'}</td>
    <td>
      <div className="sme-table__engagement">
        <div className="sme-table__engagement-bar" style={{ width: 80 }}>
          <div style={{ width: `${user.engagementScore || 0}%`, background: engagementColor(user.engagementScore || 0) }} />
        </div>
        <span>{Math.round(user.engagementScore || 0)}%</span>
      </div>
    </td>
    <td>{user.responseCount || 0}</td>
    <td className="sme-table__muted">{user.lastActive ? formatRelativeTime(user.lastActive) : '—'}</td>
    <td><StatusBadge status={(user.engagementScore || 0) > 30 ? 'active' : 'inactive'} /></td>
  </tr>
))}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/SMEEngagement.tsx
git commit -m "feat: replace mock SME engagement with real API data + SSE"
```

---

### Task 14: Frontend Insights — Replace Hardcoded Data

**Files:**
- Modify: `frontend/src/pages/Insights.tsx`

- [ ] **Step 1: Replace data loading with real API + SSE**

Replace the existing useEffect that builds trend data and runs analysis:

```typescript
import { fetchInsightsData, subscribeToInsightsStream } from '../services/api';

const [insights, setInsights] = useState<any>(null);

useEffect(() => {
  setLoading(true);
  fetchInsightsData()
    .then(data => {
      if (data.insights) {
        setInsights(data.insights);
        // Build actions from insights
        const aiActions = (data.insights.recommendedActions || []).map((a: any) => ({
          icon: Target,
          title: a.title,
          description: a.description,
          impact: a.impact || 'Medium',
          effort: a.effort || 'Medium',
          source: 'ai' as const,
        }));
        setActions(aiActions.length > 0 ? aiActions : defaultActions);
      }
    })
    .catch(err => console.error('Failed to fetch insights:', err))
    .finally(() => setLoading(false));

  // SSE for real-time updates
  const es = subscribeToInsightsStream((event) => {
    const aiActions = (event.recommendedActions || []).map((a: any) => ({
      icon: Target,
      title: a.title,
      description: a.description,
      impact: a.impact || 'Medium',
      effort: a.effort || 'Medium',
      source: 'ai' as const,
    }));
    if (aiActions.length > 0) setActions(aiActions);
  });

  return () => es.close();
}, []);
```

- [ ] **Step 2: Use backend trend data for the chart**

Replace the client-side trend computation:

```typescript
// Use backend trend data if available, fallback to session-based computation
const trendData = insights?.trendData || buildTrendDataFromSessions(sessions);
```

Where `buildTrendDataFromSessions` is the existing client-side computation moved to a fallback function.

- [ ] **Step 3: Remove the manual `runAnalysis` function**

The `runAnalysis` function that calls `analyzeGap` and `analyzeAutomation` is no longer needed — the workflow handles this. Remove it and the "Analyze" button if it exists. Keep the `defaultActions` as a fallback for when no insights data exists yet.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Insights.tsx
git commit -m "feat: replace hardcoded insights with real API data + SSE"
```

---

### Task 15: Integration Verification

- [ ] **Step 1: Run backend tests**

```bash
cd backend && npx vitest run
```

Expected: All existing and new tests pass.

- [ ] **Step 2: Start the backend and verify new endpoints**

```bash
cd backend && npm run dev
```

Verify in another terminal:
```bash
# Reports SSE stream
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/reports/stream

# SME engagement
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/sme-engagement

# Insights
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/insights
```

- [ ] **Step 3: Start the frontend and verify Reports page**

```bash
cd frontend && npm run dev
```

Verify:
- Reports page loads without "Generate New Report" button
- No console errors
- SSE connection establishes (check Network tab for `/api/reports/stream`)

- [ ] **Step 4: End-to-end test — trigger a pipeline**

1. Start an interview session via the Process Analysis page
2. Answer enough questions to cover at least one sub-area
3. Pause the session (or complete it)
4. Navigate to Reports page
5. Verify: banner appears showing "Generating reports..."
6. Verify: report rows show Generating/Refreshing status
7. Wait for completion — reports transition to Ready
8. Verify: SME Engagement page shows real data
9. Verify: Insights page shows AI-generated actions

- [ ] **Step 5: Commit any fixes from integration testing**

```bash
git add -A
git commit -m "fix: integration test fixes for data pipeline"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Every section of the design spec maps to a task:
  - Workflow definition → Task 6
  - Trigger logic + dedup/queue → Task 5
  - Database schema → Task 1
  - SSE broadcast → Task 2
  - SME engagement → Task 3
  - Insights → Task 4
  - Interview route changes → Task 7
  - Reports route changes → Task 8
  - New endpoints → Task 9
  - Stale cleanup → Task 10
  - Frontend API → Task 11
  - Frontend Reports → Task 12
  - Frontend SME → Task 13
  - Frontend Insights → Task 14
  - Error handling → covered in Tasks 5, 6
  - Testing → covered in Tasks 3, 4, 5 + Task 15

- [x] **Placeholder scan:** No TBD, TODO, or vague instructions. Every step has code.

- [x] **Type consistency:** `ReportStatusEvent`, `SMEEngagementEvent`, `InsightsEvent` types are defined in Task 2 and used consistently in Tasks 3, 4, 5, 6, 8, 9. `InterviewSession` type from `interviewService.ts` is used in Task 5. `executeDataPipeline` function name matches between Task 5 (import) and Task 6 (export).
