import { v4 as uuidv4 } from 'uuid';
import { opensearchClient, INDICES } from '../config/database';
import { InterviewSession } from './interviewService';
import { broadcastReportStatus } from './reportSseService';
import { getBroadAreaForSubArea, getBroadArea } from './domainService';

export async function triggerDataPipeline(session: InterviewSession): Promise<void> {
  const { sessionId, userId, selectedBroadAreas, coverage, responses } = session;

  console.log('[triggerDataPipeline] Starting for session:', sessionId);
  console.log('[triggerDataPipeline] Selected broad areas:', selectedBroadAreas);
  console.log('[triggerDataPipeline] Coverage keys:', Object.keys(coverage || {}));
  console.log('[triggerDataPipeline] Response keys:', Object.keys(responses || {}));

  // Determine which broad areas have at least one sub-area with answers
  const qualifyingAreas: string[] = [];
  for (const broadAreaId of selectedBroadAreas) {
    const hasCoverage = Object.entries(coverage).some(([subAreaId, cov]) => {
      const parentArea = getBroadAreaForSubArea(subAreaId);
      return parentArea?.id === broadAreaId && (cov.status === 'covered' || cov.status === 'in_progress');
    });
    // Also check if we have any responses for sub-areas under this broad area
    const hasResponses = Object.entries(responses || {}).some(([subAreaId, answers]) => {
      const parentArea = getBroadAreaForSubArea(subAreaId);
      return parentArea?.id === broadAreaId && (answers as any[]).length > 0;
    });
    if (hasCoverage || hasResponses) {
      qualifyingAreas.push(broadAreaId);
    }
  }

  console.log('[triggerDataPipeline] Qualifying areas:', qualifyingAreas);

  if (qualifyingAreas.length === 0) {
    console.log('[triggerDataPipeline] No qualifying areas, exiting');
    return;
  }

  // For each qualifying area, set status to 'generating' and add to generation queue
  const areasToGenerate: string[] = [];

  for (const broadAreaId of qualifyingAreas) {
    const broadArea = getBroadArea(broadAreaId);
    const broadAreaName = broadArea?.name || broadAreaId;

    // Check if a report doc already exists
    let existingReportId: string | null = null;
    let existingDoc: any = null;
    try {
      const existingRes = await opensearchClient.search({
        index: INDICES.REPORTS,
        body: {
          query: {
            bool: {
              must: [
                { match: { sessionId } },
                { match: { broadAreaId } },
                { match: { type: 'broad_area' } },
              ],
            },
          },
          size: 1,
        },
      });
      const hit = existingRes.body.hits.hits[0];
      if (hit) {
        existingReportId = hit._id;
        existingDoc = hit._source;
      }
    } catch { /* index might not exist yet */ }

    const reportId = existingReportId || uuidv4();
    const now = new Date().toISOString();

    // Always reset to 'generating' and add to queue
    await opensearchClient.index({
      index: INDICES.REPORTS,
      id: reportId,
      body: {
        reportId, name: `${broadAreaName} — Gap Analysis`,
        type: 'broad_area', sessionId, broadAreaId, broadAreaName,
        generatedBy: userId, status: 'generating', pendingRegeneration: false,
        previousContent: existingDoc?.status === 'ready' ? existingDoc.content : null,
        fileSize: existingDoc?.fileSize || 0, downloadCount: existingDoc?.downloadCount || 0,
        content: null, createdAt: existingDoc?.createdAt || now, updatedAt: now,
      },
      refresh: 'wait_for',
    });

    broadcastReportStatus({
      reportId, sessionId, broadAreaId, broadAreaName,
      type: 'broad_area', status: 'generating', pendingRegeneration: false,
      updatedAt: now,
    });

    areasToGenerate.push(broadAreaId);
  }

  console.log('[triggerDataPipeline] Areas to generate:', areasToGenerate);

  if (areasToGenerate.length === 0) {
    console.log('[triggerDataPipeline] No areas to generate after filtering, exiting');
    return;
  }

  // Fire-and-forget pipeline execution
  console.log('[triggerDataPipeline] Calling executeDataPipeline...');
  const { executeDataPipeline } = await import('../mastra/workflows/interviewDataPipeline');
  executeDataPipeline({ sessionId, broadAreaIds: areasToGenerate, userId }).catch(err => {
    console.error('[triggerDataPipeline] Pipeline execution failed:', err);
  });
}
