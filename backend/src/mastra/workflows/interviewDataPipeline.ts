// Pipeline execution - direct imperative approach (no Mastra workflow overhead)
import { opensearchClient, INDICES } from '../../config/database';
import { getInterviewSession } from '../../services/interviewService';
import { generateReadinessReport, generateGapReport, generateConsolidatedReport } from '../../services/reportService';
import { recomputeAndStoreMetrics } from '../../services/metricsService';
import { computeSMEEngagement } from '../../services/smeEngagementService';
import { computeInsights } from '../../services/insightsService';
import { broadcastReportStatus } from '../../services/reportSseService';
import { getBroadArea, getSubAreasForBroadArea } from '../../services/domainService';
import { generateCompletion } from '../../services/llmService';
import { v4 as uuidv4 } from 'uuid';

// --- Core logic functions ---

/** Lane A: Generate gap-analysis reports for each broad area (map/reduce pattern). */
async function runAreaReportGeneration(input: {
  session: any;
  broadAreaIds: string[];
  userId: string;
}): Promise<{ areaReports: any[]; session: any; userId: string }> {
  const { session, broadAreaIds, userId } = input;
  const areaReports: any[] = [];

  for (const broadAreaId of broadAreaIds) {
    try {
      const broadArea = getBroadArea(broadAreaId);
      if (!broadArea) continue;

      // Include sub-areas that have at least 1 answer (covered OR in_progress)
      const subAreas = getSubAreasForBroadArea(broadAreaId);
      const subAreasWithAnswers = subAreas.filter((sa: any) => {
        const hasAnswers = (session.responses?.[sa.id] || []).length > 0;
        const coverageStatus = session.coverage?.[sa.id]?.status;
        const statusOk = !coverageStatus || ['covered', 'in_progress'].includes(coverageStatus);
        return hasAnswers && statusOk;
      });
      if (subAreasWithAnswers.length === 0) {
        console.log(`[pipeline] No answered sub-areas for broadArea ${broadAreaId}, skipping`);
        continue;
      }

      // MAP: Summarize each sub-area in parallel
      const summaryPromises = subAreasWithAnswers.map(async (subArea) => {
        const answers = session.responses?.[subArea.id] || [];
        if (answers.length === 0) return null;

        const qaText = answers.map((a: any) =>
          `Q: ${(a.question || '').slice(0, 300)}\nA: ${String(a.answer || '').slice(0, 600)}`
        ).join('\n\n');

        // Build maturity benchmark context if available
        const benchmarkContext = subArea.benchmarks
          ? `\nMATURITY SCALE for "${subArea.name}":\n` +
            `  Level 1 (Initial): ${subArea.benchmarks.maturity_1}\n` +
            `  Level 2 (Developing): ${subArea.benchmarks.maturity_2}\n` +
            `  Level 3 (Defined): ${subArea.benchmarks.maturity_3}\n` +
            `  Level 4 (Managed): ${subArea.benchmarks.maturity_4}\n` +
            `  Level 5 (Optimized): ${subArea.benchmarks.maturity_5}\n`
          : '';

        const prompt = `You are a senior management consultant analysing discovery interview data for the "${subArea.name}" sub-area within "${broadArea.name}".

## INTERVIEW DATA
${qaText}

${benchmarkContext}

## YOUR TASK
Analyse the interview data above and produce a structured assessment digest. Be specific — reference actual answers, tools, and processes mentioned. Do NOT be generic.

Return ONLY valid JSON in this exact schema:
{
  "keyFindings": ["Finding 1 with specific detail from interview", "Finding 2..."],
  "painPoints": [
    { "description": "Specific pain point", "businessImpact": "Estimated impact (e.g., adds 3 days to close, costs ~$X per month, requires 2 FTEs)", "severity": "high|medium|low" }
  ],
  "maturityLevel": "1|2|3|4|5",
  "maturityJustification": "Why this maturity level — reference specific interview answers",
  "gaps": [
    {
      "gap": "Specific gap description",
      "category": "process|technology|capability|data",
      "impact": "high|medium|low",
      "currentState": "What they do today (from interview)",
      "targetState": "Best practice target",
      "evidence": "Which interview answer revealed this gap"
    }
  ],
  "kpiDataPoints": [
    { "metric": "e.g., DSO, DPO, invoice volume", "currentValue": "value mentioned or inferred", "benchmark": "industry best practice value" }
  ],
  "automationOpportunities": [
    { "opportunity": "What can be automated", "expectedBenefit": "Estimated benefit", "effort": "low|medium|high" }
  ],
  "complianceGaps": ["Any control, audit, or regulatory gaps identified"]
}`;

        try {
          const response = await generateCompletion([
            { role: 'system', content: 'You are a senior management consultant with deep ERP and process transformation expertise. Analyse interview data and produce precise, evidence-based assessments. Return valid JSON only — no markdown, no explanation.' },
            { role: 'user', content: prompt },
          ], { temperature: 0.3 });
          const match = response.content.match(/\{[\s\S]*\}/);
          return match ? { subAreaId: subArea.id, subAreaName: subArea.name, ...JSON.parse(match[0]) } : null;
        } catch {
          return null;
        }
      });

      const summaries = (await Promise.all(summaryPromises)).filter(Boolean);

      // REDUCE: Synthesize into broad area report
      const digestText = summaries.map((s: any) => {
        const painPointsText = Array.isArray(s.painPoints)
          ? s.painPoints.map((p: any) => typeof p === 'string' ? p : `${p.description} (Impact: ${p.businessImpact || 'unknown'}, Severity: ${p.severity || 'medium'})`).join('; ')
          : 'None identified';
        const gapsText = Array.isArray(s.gaps)
          ? s.gaps.map((g: any) => `${g.gap} [${g.category}/${g.impact}] Current: ${g.currentState || 'N/A'} → Target: ${g.targetState || 'N/A'}`).join('; ')
          : 'None identified';
        const kpiText = Array.isArray(s.kpiDataPoints)
          ? s.kpiDataPoints.map((k: any) => `${k.metric}: ${k.currentValue} (benchmark: ${k.benchmark})`).join('; ')
          : '';
        const autoText = Array.isArray(s.automationOpportunities)
          ? s.automationOpportunities.map((a: any) => `${a.opportunity} [effort: ${a.effort}, benefit: ${a.expectedBenefit}]`).join('; ')
          : '';
        return `### Sub-area: ${s.subAreaName}\nMaturity Level: ${s.maturityLevel || 'Unknown'}/5 — ${s.maturityJustification || ''}\nFindings: ${s.keyFindings?.join('; ') || 'None'}\nGaps: ${gapsText}\nPain Points: ${painPointsText}\n${kpiText ? `KPI Data: ${kpiText}` : ''}\n${autoText ? `Automation: ${autoText}` : ''}\n${s.complianceGaps?.length ? `Compliance: ${s.complianceGaps.join('; ')}` : ''}`;
      }).join('\n\n');

      const reducePrompt = `You are a senior management consultant producing a comprehensive gap analysis report for the "${broadArea.name}" area of a client engagement.

## SUB-AREA ASSESSMENT DIGESTS
${digestText}

## YOUR TASK
Synthesize the sub-area digests above into a single, consultant-grade gap analysis report for "${broadArea.name}".

### REQUIREMENTS
1. **Executive Summary**: 3-5 sentences summarising the key findings, overall maturity, and top priorities. Reference specific sub-areas and their maturity levels.
2. **Gaps**: Provide at least 5-10 specific gaps. Each gap MUST have:
   - A clear, specific gap description (not generic)
   - Current state vs. target state (reference interview evidence)
   - Category: process, technology, capability, or data
   - Impact: high/medium/low with quantified estimate where possible (e.g., "saves ~40 hours/month", "reduces close by 2 days")
   - Effort: high/medium/low
   - Fit: gap (major gap), partial (some alignment), or fit (already meets standard)
   - Standard: the best practice being compared against (e.g., "SAP S/4HANA Best Practice", "APQC PCF 8.0", "COBIT 2019", "IFRS 15", "ISO 27001")
   - impactScore: 1-10 numeric score for charting
   - effortScore: 1-10 numeric score for charting
3. **Quick Wins**: Subset of gaps where impact is high and effort is low — these are the first things to implement
4. **Roadmap**: 3 phases:
   - Phase 1 (0-3 months): Quick wins and foundation work. Include expected ROI.
   - Phase 2 (3-6 months): Core transformation. Include expected ROI.
   - Phase 3 (6-12 months): Advanced optimisation. Include expected ROI.
5. **Risk Assessment**: At least 3-5 risks with likelihood, impact, and specific mitigation strategies
6. **KPI Scores**: For each sub-area, provide a current score (0-100) and an industry benchmark score

Return ONLY valid JSON:
{
  "executiveSummary": "...",
  "gaps": [
    { "id": "gap-1", "category": "process", "area": "${broadArea.name}", "currentState": "...", "targetState": "...", "gap": "...", "impact": "high", "effort": "medium", "fit": "gap", "standard": "SAP Best Practice", "priority": 9, "impactScore": 8, "effortScore": 5 }
  ],
  "quickWins": ["gap-1", "gap-3"],
  "roadmap": [
    { "phase": "Phase 1: Quick Wins (0-3 months)", "duration": "3 months", "items": ["item1 — expected ROI: $X or Y% improvement", "item2"] }
  ],
  "riskAssessment": [
    { "risk": "...", "likelihood": "medium", "impact": "high", "mitigation": "..." }
  ],
  "kpiScores": [
    { "category": "Sub-Area Name", "score": 45, "benchmark": 80 }
  ]
}`;

      const reduceResponse = await generateCompletion([
        { role: 'system', content: 'You are a senior management consultant at a Big 4 firm specialising in ERP transformations and process optimisation. Produce precise, evidence-based, consultant-grade gap analysis reports with quantified impacts and industry framework references. Return valid JSON only — no markdown, no explanation.' },
        { role: 'user', content: reducePrompt },
      ], { temperature: 0.3 });

      const reduceMatch = reduceResponse.content.match(/\{[\s\S]*\}/);
      if (!reduceMatch) continue;

      const reportContent = JSON.parse(reduceMatch[0]);

      // Assign IDs and priorities to gaps
      (reportContent.gaps || []).forEach((gap: any, i: number) => {
        gap.id = gap.id || `gap-${broadAreaId}-${i}`;
        const impactScore = gap.impact === 'high' ? 3 : gap.impact === 'medium' ? 2 : 1;
        const effortScore = gap.effort === 'low' ? 3 : gap.effort === 'medium' ? 2 : 1;
        gap.priority = gap.priority || impactScore * effortScore;
      });

      // Map quickWins if they are strings (IDs) back to full gap objects
      if (reportContent.quickWins && Array.isArray(reportContent.quickWins) && reportContent.quickWins.length > 0) {
        reportContent.quickWins = reportContent.quickWins
          .map((qw: any) => typeof qw === 'string' ? reportContent.gaps.find((g: any) => g.id === qw || g.gap === qw) : qw)
          .filter(Boolean);
      } else {
        reportContent.quickWins = (reportContent.gaps || []).filter((g: any) => g.impact === 'high' && g.effort === 'low');
      }

      // Save area report
      const existingRes = await opensearchClient.search({
        index: INDICES.REPORTS,
        body: {
          query: { bool: { must: [
            { match: { sessionId: session.sessionId } },
            { match: { broadAreaId } },
            { match: { type: 'broad_area' } },
          ] } },
          size: 1,
        },
      });

      const existing = existingRes.body.hits.hits[0]?._source;
      const reportId = existing?.reportId || uuidv4();
      const now = new Date().toISOString();
      const content = { ...reportContent, subAreaSummaries: summaries };
      const fileSize = JSON.stringify(content).length;
      const warnings = subAreasWithAnswers
        .filter((sa: any) => !summaries.find((s: any) => s.subAreaId === sa.id))
        .map((sa: any) => `Sub-area "${sa.name}" summary failed`);

      await opensearchClient.index({
        index: INDICES.REPORTS, id: reportId,
        body: {
          reportId, name: `${broadArea.name} — Gap Analysis`, type: 'broad_area',
          sessionId: session.sessionId, broadAreaId, broadAreaName: broadArea.name,
          generatedBy: userId, status: 'ready', pendingRegeneration: false,
          previousContent: null, content, fileSize,
          downloadCount: existing?.downloadCount || 0,
          warnings: warnings.length > 0 ? warnings : undefined,
          createdAt: existing?.createdAt || now, updatedAt: now,
        },
        refresh: 'wait_for',
      });

      broadcastReportStatus({
        reportId, sessionId: session.sessionId, broadAreaId,
        broadAreaName: broadArea.name, type: 'broad_area', status: 'ready',
        pendingRegeneration: false, updatedAt: now,
      });

      areaReports.push({ reportId, broadAreaId, broadAreaName: broadArea.name, content });
    } catch (err) {
      console.error(`Area report generation failed for ${broadAreaId}:`, err);
      // Mark as failed
      try {
        const failRes = await opensearchClient.search({
          index: INDICES.REPORTS,
          body: { query: { bool: { must: [
            { match: { sessionId: session.sessionId } },
            { match: { broadAreaId } },
          ] } }, size: 1 },
        });
        const failExisting = failRes.body.hits.hits[0]?._source;
        if (failExisting) {
          const now = new Date().toISOString();
          await opensearchClient.update({
            index: INDICES.REPORTS, id: failExisting.reportId,
            body: { doc: { status: 'failed', updatedAt: now } },
          });
          broadcastReportStatus({
            reportId: failExisting.reportId, sessionId: session.sessionId,
            broadAreaId, broadAreaName: failExisting.broadAreaName,
            type: 'broad_area', status: 'failed', pendingRegeneration: false, updatedAt: now,
          });
        }
      } catch (innerErr) {
        console.error(`Failed to mark report as failed for ${broadAreaId}:`, innerErr);
      }
    }
  }

  return { areaReports, session, userId };
}

/** Lane B: Recompute dashboard metrics and SME engagement data. */
async function runMetricsComputation(): Promise<{ success: boolean }> {
  await recomputeAndStoreMetrics();
  await computeSMEEngagement();
  return { success: true };
}

/** Lane C: Generate session-level reports (readiness, consolidated, strategic). */
async function runSessionReportGeneration(input: {
  areaReports: any[];
  session: any;
  userId: string;
}): Promise<{ success: boolean }> {
  const { session, userId, areaReports } = input;
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
        content = await generateGapReport(sessionId);
      }

      const reportId = uuidv4();
      const typeLabels: Record<string, string> = {
        readiness: 'Executive Summary', consolidated: 'Consolidated Report', strategic: 'Strategic Report',
      };

      await opensearchClient.index({
        index: INDICES.REPORTS, id: reportId,
        body: {
          reportId, name: typeLabels[type], type, sessionId,
          generatedBy: userId, status: 'ready', pendingRegeneration: false,
          previousContent: null, content,
          fileSize: JSON.stringify(content).length, downloadCount: 0,
          createdAt: now, updatedAt: now,
        },
        refresh: 'wait_for',
      });

      broadcastReportStatus({
        reportId, sessionId, type, status: 'ready',
        pendingRegeneration: false, updatedAt: now,
      });
    } catch (err) {
      console.error(`Session report ${type} failed:`, err);
    }
  }
  return { success: true };
}

/** Lane D: Compute cross-area insights. */
async function runInsightsComputation(sessionId: string): Promise<{ success: boolean }> {
  await computeInsights(sessionId);
  return { success: true };
}

/** Check if any reports were flagged for regeneration during this run. */
async function runPendingRegenerationCheck(initData: {
  sessionId: string;
  broadAreaIds: string[];
  userId: string;
}): Promise<{ success: boolean }> {
  const pendingRes = await opensearchClient.search({
    index: INDICES.REPORTS,
    body: {
      query: { bool: { must: [
        { match: { sessionId: initData.sessionId } },
        { match: { pendingRegeneration: true } },
      ] } },
      size: 100,
    },
  });

  const pendingReports = pendingRes.body.hits.hits;
  if (pendingReports.length > 0) {
    for (const hit of pendingReports) {
      await opensearchClient.update({
        index: INDICES.REPORTS, id: hit._id,
        body: { doc: { pendingRegeneration: false } },
      });
    }
    const { triggerDataPipeline } = await import('../../services/pipelineTriggerService');
    const session = await getInterviewSession(initData.sessionId);
    if (session) {
      triggerDataPipeline(session).catch(err =>
        console.error('Re-trigger after pending regeneration failed:', err)
      );
    }
  }
  return { success: true };
}

// --- Direct execution (bypasses Mastra workflow framework) ---

export async function executeDataPipeline(input: {
  sessionId: string;
  broadAreaIds: string[];
  userId: string;
}): Promise<void> {
  console.log('[pipeline] Starting data pipeline for session:', input.sessionId, 'areas:', input.broadAreaIds);

  // Phase 0: Load session
  const session = await getInterviewSession(input.sessionId);
  if (!session) {
    console.error('[pipeline] Session not found:', input.sessionId);
    return;
  }
  console.log('[pipeline] Session loaded. Responses keys:', Object.keys(session.responses || {}));
  console.log('[pipeline] Coverage keys:', Object.keys(session.coverage || {}));

  // Phase 1: Area reports + metrics in parallel
  console.log('[pipeline] Phase 1: Generating area reports + metrics...');
  try {
    const [areaResult] = await Promise.all([
      runAreaReportGeneration({ session, broadAreaIds: input.broadAreaIds, userId: input.userId }),
      runMetricsComputation().catch(err => { console.error('[pipeline] Metrics computation failed (non-fatal):', err.message); return { success: false }; }),
    ]);
    console.log('[pipeline] Phase 1 complete. Area reports generated:', areaResult.areaReports.length);

    // Phase 2: Session reports + insights in parallel
    console.log('[pipeline] Phase 2: Generating session reports + insights...');
    await Promise.all([
      runSessionReportGeneration(areaResult).catch(err => { console.error('[pipeline] Session report generation failed (non-fatal):', err.message); }),
      runInsightsComputation(session.sessionId).catch(err => { console.error('[pipeline] Insights computation failed (non-fatal):', err.message); }),
    ]);
    console.log('[pipeline] Phase 2 complete.');

    // Phase 3: Check pending regeneration
    await runPendingRegenerationCheck(input).catch(err => { console.error('[pipeline] Pending regeneration check failed (non-fatal):', err.message); });
    console.log('[pipeline] Pipeline completed successfully.');
  } catch (err: any) {
    console.error('[pipeline] Pipeline FAILED:', err.message, err.stack);
  }
}
