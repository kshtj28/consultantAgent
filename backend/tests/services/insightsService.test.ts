import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/database', () => ({
  opensearchClient: { search: vi.fn(), index: vi.fn().mockResolvedValue({}) },
  INDICES: { CONVERSATIONS: 'consultant_conversations', REPORTS: 'consultant_reports', INSIGHTS: 'consultant_insights' },
}));

vi.mock('../../src/services/llmService', () => ({
  generateCompletion: vi.fn().mockResolvedValue({
    content: JSON.stringify({
      topGaps: [{ area: 'O2C', gap: 'Manual credit checks', severity: 'high', impact: '$2.4M' }],
      automationOpportunities: [{ process: 'Invoice matching', savings: '$1.2M', effort: 'medium' }],
      recommendedActions: [{ title: 'Automate credit checks', description: 'Implement rules engine', impact: 'High', effort: 'Medium', estimatedSavings: '$2.4M' }],
    }),
    model: 'mock',
    provider: 'mock',
  }),
}));

vi.mock('../../src/services/reportSseService', () => ({ broadcastInsights: vi.fn() }));

import { computeInsights } from '../../src/services/insightsService';
import { opensearchClient } from '../../src/config/database';

describe('computeInsights', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes insights from area reports and session history', async () => {
    (opensearchClient.search as any)
      .mockResolvedValueOnce({
        body: { hits: { hits: [
          { _source: { sessionType: 'interview', status: 'completed', createdAt: '2026-03-01T10:00:00Z' } },
          { _source: { sessionType: 'interview', status: 'in_progress', createdAt: '2026-03-15T10:00:00Z' } },
        ] } },
      })
      .mockResolvedValueOnce({
        body: { hits: { hits: [
          { _source: { type: 'broad_area', broadAreaName: 'Order-to-Cash', content: { gaps: [{ gap: 'Manual credit checks' }] } } },
        ] } },
      });

    const result = await computeInsights('session-1');
    expect(result.trendData).toBeDefined();
    expect(result.recommendedActions.length).toBeGreaterThan(0);
    expect(result.recommendedActions[0].title).toBe('Automate credit checks');
  });
});
