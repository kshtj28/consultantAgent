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

const mockExecute = vi.fn().mockResolvedValue({ result: { success: true } });
vi.mock('../../src/mastra/workflows/interviewDataPipeline', () => ({
  executeDataPipeline: mockExecute,
}));

vi.mock('../../src/services/domainService', () => ({
  getBroadAreaForSubArea: vi.fn().mockImplementation((subAreaId: string) => {
    if (subAreaId === 'invoicing' || subAreaId === 'credit-mgmt') return { id: 'o2c' };
    if (subAreaId === 'purchase-orders') return { id: 'p2p' };
    return null;
  }),
  getBroadArea: vi.fn().mockImplementation((id: string) => {
    if (id === 'o2c') return { id: 'o2c', name: 'Order-to-Cash' };
    if (id === 'p2p') return { id: 'p2p', name: 'Procure-to-Pay' };
    return null;
  }),
}));

import { triggerDataPipeline } from '../../src/services/pipelineTriggerService';
import { opensearchClient } from '../../src/config/database';
import { broadcastReportStatus } from '../../src/services/reportSseService';

describe('triggerDataPipeline', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates report records as generating and starts workflow for areas with coverage', async () => {
    (opensearchClient.search as any).mockResolvedValue({ body: { hits: { hits: [] } } });

    const session = {
      sessionId: 'sess-1', userId: 'user-1',
      selectedBroadAreas: ['o2c', 'p2p'],
      coverage: {
        'invoicing': { questionsAnswered: 3, status: 'covered' },
        'credit-mgmt': { questionsAnswered: 2, status: 'covered' },
        'purchase-orders': { questionsAnswered: 0, status: 'not_started' },
      },
    };

    await triggerDataPipeline(session as any);

    expect(opensearchClient.index).toHaveBeenCalled();
    expect(broadcastReportStatus).toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'sess-1' }));
  });

  it('sets pendingRegeneration when report is already generating', async () => {
    (opensearchClient.search as any).mockResolvedValue({
      body: { hits: { hits: [{
        _id: 'report-1',
        _source: { reportId: 'report-1', sessionId: 'sess-1', broadAreaId: 'o2c', status: 'generating', pendingRegeneration: false },
      }] } },
    });

    const session = {
      sessionId: 'sess-1', userId: 'user-1',
      selectedBroadAreas: ['o2c'],
      coverage: { 'invoicing': { questionsAnswered: 3, status: 'covered' } },
    };

    await triggerDataPipeline(session as any);

    expect(opensearchClient.update).toHaveBeenCalledWith(
      expect.objectContaining({ body: { doc: { pendingRegeneration: true } } })
    );
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('stashes previousContent when regenerating a ready report', async () => {
    (opensearchClient.search as any).mockResolvedValue({
      body: { hits: { hits: [{
        _id: 'report-1',
        _source: { reportId: 'report-1', sessionId: 'sess-1', broadAreaId: 'o2c', status: 'ready', content: { gaps: ['existing data'] } },
      }] } },
    });

    const session = {
      sessionId: 'sess-1', userId: 'user-1',
      selectedBroadAreas: ['o2c'],
      coverage: { 'invoicing': { questionsAnswered: 3, status: 'covered' } },
    };

    await triggerDataPipeline(session as any);

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
