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
