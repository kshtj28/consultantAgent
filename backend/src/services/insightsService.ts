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
    body: { query: { bool: { must: [{ match: { sessionType: 'interview_session' } }] } }, size: 1000 },
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
    body: { query: { bool: { must: [{ match: { type: 'broad_area' } }] } }, size: 50, _source: ['broadAreaName', 'content'] },
  });
  const areaReports = reportsRes.body.hits.hits.map((h: any) => h._source);

  // 3. AI analysis
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
      const response = await generateCompletion(modelId || null, [
        { role: 'system', content: 'You are a management consultant analyzing process assessment data. Return valid JSON only.' },
        { role: 'user', content: prompt },
      ], { temperature: 0.3 });

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
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

  const insights: InsightsData = { sessionId, trendData, gapAnalysis, automationOpportunities, recommendedActions, computedAt: now };

  await opensearchClient.index({ index: INDICES.INSIGHTS, id: sessionId, body: insights, refresh: 'wait_for' });
  broadcastInsights({ sessionId, recommendedActions, updatedAt: now });

  return insights;
}

export async function fetchInsights(sessionId?: string): Promise<InsightsData | null> {
  try {
    const exists = await opensearchClient.indices.exists({ index: INDICES.INSIGHTS });
    if (!exists.body) return null;

    const query = sessionId ? { match: { sessionId } } : { match_all: {} };
    const res = await opensearchClient.search({
      index: INDICES.INSIGHTS,
      body: { query, size: 1, sort: [{ computedAt: { order: 'desc', unmapped_type: 'date' } }] },
    });
    const hit = res.body.hits.hits[0];
    return hit ? hit._source : null;
  } catch (err: any) {
    console.warn('Error fetching insights:', err.message);
    return null;
  }
}
