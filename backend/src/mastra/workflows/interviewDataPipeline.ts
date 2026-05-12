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
import { getProjectContext } from '../../services/settingsService';
import { getErpStandardsList } from '../../prompts/report.prompt';
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

  // Fetch ERP migration path from project settings once for all areas
  const projectCtx = await getProjectContext().catch(() => ({ erpPath: '' }));
  const erpPath = projectCtx.erpPath || '';
  const targetSystem = erpPath ? (erpPath.split('→').pop()?.trim() ?? erpPath) : null;
  const erpStandards = erpPath ? getErpStandardsList(erpPath) : `   - APQC PCF 8.0 for process benchmarks
   - SAP S/4HANA Best Practice for ERP-specific gaps
   - COBIT 2019 for IT governance gaps
   - IFRS/GAAP for financial reporting gaps
   - ISO 27001 for security/compliance gaps`;

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

        const erpLine = targetSystem
          ? `\nERP Migration Target: ${targetSystem}. Assess gaps and target states against ${targetSystem} capabilities and standard processes.\n`
          : '';

        const prompt = `You are a senior management consultant analysing discovery interview data for the "${subArea.name}" sub-area within "${broadArea.name}".

## INTERVIEW DATA
${qaText}
${erpLine}
${benchmarkContext}

## YOUR TASK
Analyse the interview data above and produce a structured assessment digest. Be specific — reference actual answers, tools, and processes mentioned. Do NOT be generic.${targetSystem ? ` Where relevant, frame the "targetState" against ${targetSystem} standard processes and capabilities.` : ''}

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

      const erpReduceContext = erpPath
        ? `\n## ERP MIGRATION CONTEXT\nThis client is migrating: ${erpPath}. All gaps MUST be benchmarked against ${targetSystem} standard capabilities. Use ${targetSystem}-specific standards in the "standard" field — do NOT reference SAP unless the target is SAP. Prioritise gaps that represent deviations from ${targetSystem} out-of-the-box processes.\n`
        : '';

      const reducePrompt = `You are a senior management consultant producing a comprehensive gap analysis report for the "${broadArea.name}" area of a client engagement.

## SUB-AREA ASSESSMENT DIGESTS
${digestText}
${erpReduceContext}
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
   - Standard: the best practice being compared against — use ONLY these standards:
${erpStandards}
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
    { "id": "gap-1", "category": "process", "area": "${broadArea.name}", "currentState": "...", "targetState": "...", "gap": "...", "impact": "high", "effort": "medium", "fit": "gap", "standard": "${targetSystem ? targetSystem + ' Best Practice' : 'APQC PCF 8.0'}", "priority": 9, "impactScore": 8, "effortScore": 5 }
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
        { role: 'system', content: `You are a senior management consultant at a Big 4 firm specialising in ERP transformations and process optimisation${erpPath ? ` with deep expertise in ${targetSystem} implementations` : ''}. Produce precise, evidence-based, consultant-grade gap analysis reports with quantified impacts and industry framework references. Return valid JSON only — no markdown, no explanation.` },
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
          domainId: session.domainId || 'finance',
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

/**
 * Lane E: For banking domain sessions, extract AS-IS/TO-BE KPIs from the
 * generated gap reports and save them as `content.bankingKpis` on the first
 * ready broad_area report. This is what the `GET /api/dashboard/banking-kpis`
 * endpoint reads — without this, the banking dashboard always shows empty.
 */
export async function runBankingKpiExtraction(input: {
  areaReports: any[];
  session: any;
}): Promise<{ success: boolean }> {
  // Only run for banking domain sessions (check session.domainId, not global active domain)
  if ((input.session.domainId || 'finance') !== 'banking') return { success: true };
  if (input.areaReports.length === 0) return { success: true };

  try {
    // Collect all Q&A from the session for KPI extraction
    const allQA: string[] = [];
    for (const [subAreaId, answers] of Object.entries(input.session.responses || {})) {
      for (const a of (answers as any[])) {
        allQA.push(`Q: ${(a.question || '').slice(0, 200)}\nA: ${String(a.answer || '').slice(0, 400)}`);
      }
    }

    // Build rich context from the gap analysis reports (gaps, scores, executive summary)
    const gapContext = input.areaReports.slice(0, 5).map((r: any) => {
      const summary = (r.content?.executiveSummary || r.broadAreaName || '').slice(0, 400);
      const gaps = (r.content?.gaps || []).slice(0, 6).map((g: any) =>
        `  - ${(g.gap || g.description || g.title || '').slice(0, 150)} (impact: ${g.impact || 'medium'}, effort: ${g.effort || 'medium'})`
      ).join('\n');
      const kpiScores = (r.content?.kpiScores || []).slice(0, 4).map((k: any) =>
        `  - ${k.category}: score ${k.score}/100, benchmark ${k.benchmark}/100`
      ).join('\n');
      return `### ${r.broadAreaName || 'Banking Process'}\n${summary}\nGaps:\n${gaps}\nKPI Scores:\n${kpiScores}`;
    }).join('\n\n');

    const prompt = `You are a senior banking operations analyst specialising in Saudi Arabian banking (SAMA regulated institutions). Your task is to estimate realistic AS-IS and TO-BE KPI values based STRICTLY on the identified gaps and interview data.

## GAP ANALYSIS DATA
${gapContext}

## INTERVIEW Q&A
${allQA.slice(0, 15).join('\n\n') || '(No raw Q&A available — derive estimates from gap severity)'}

## ESTIMATION RULES
1. CORRELATION: If the gaps show "High" impact in "Manual Processing" or "Data Entry", the stpRate should be at the lower end (20-35%) and costPerLoan should be at the higher end (3500-5000 SAR).
2. SPECIFICITY: Avoid returning the same "average" benchmarks. Look for specific tools or bottlenecks mentioned.
3. BENCHMARKS (for guidance only):
   - avgCycleTimeDays: AS-IS 10-25 days, TO-BE 3-7 days
   - costPerLoan: AS-IS 2000-5000 SAR, TO-BE 800-1500 SAR
   - stpRate: AS-IS 15-55%, TO-BE 75-95%
   - npaRatio: AS-IS 1-7%, TO-BE 0.5-2%
4. TO-BE STATE: The TO-BE targets should be aggressive but realistic for a top-tier digital bank in Saudi Arabia.

Return ONLY a valid JSON object following this schema:
{
  "avgCycleTimeDays": { "current": number, "target": number, "unit": "days", "label": "Avg. Cycle Time" },
  "costPerLoan": { "current": number, "target": number, "unit": "SAR", "label": "Cost per Loan" },
  "stpRate": { "current": number, "target": number, "unit": "%", "label": "STP Rate" },
  "npaRatio": { "current": number, "target": number, "unit": "%", "label": "NPA Ratio" }
}`;

    const response = await generateCompletion([
      { role: 'system', content: 'You are a banking operations analyst specialising in Saudi Arabian banking. Return valid JSON only with no markdown formatting.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3 });

    const { extractJSON } = require('../../utils/jsonUtils');
    const bankingKpis = extractJSON(response.content);
    if (!bankingKpis) {
      console.warn('[pipeline] Banking KPI extraction returned invalid JSON');
      return { success: false };
    }

    // Patch the first generated report with the bankingKpis field.
    // NOTE: The content field uses enabled:false mapping in OpenSearch, so
    // nested dot-notation updates don't work. We must fetch and re-index the full doc.
    const firstReport = input.areaReports[0];
    if (!firstReport?.reportId) return { success: true };

    try {
      const existing = await opensearchClient.get({
        index: INDICES.REPORTS,
        id: firstReport.reportId,
      });
      const existingDoc = existing.body._source as any;
      const updatedContent = { ...(existingDoc.content || {}), bankingKpis };

      await opensearchClient.index({
        index: INDICES.REPORTS,
        id: firstReport.reportId,
        body: {
          ...existingDoc,
          content: updatedContent,
          updatedAt: new Date().toISOString(),
        },
        refresh: true,
      });
    } catch (updateErr: any) {
      console.error('[pipeline] Failed to patch report with bankingKpis:', updateErr.message);
      return { success: false };
    }

    console.log('[pipeline] Banking KPIs extracted and saved:', JSON.stringify(bankingKpis));
    return { success: true };
  } catch (err: any) {
    console.error('[pipeline] Banking KPI extraction failed (non-fatal):', err.message);
    return { success: false };
  }
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
          domainId: session.domainId || 'finance',
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

    // Phase 2.5: Recompute metrics AND extract banking KPIs in parallel.
    // Metrics recompute ensures dashboard stats reflect completed reports via SSE.
    // Banking KPI extraction saves the bankingKpis field that the banking dashboard reads.
    runMetricsComputation().catch(err =>
      console.error('[pipeline] Post-report metrics recompute failed (non-fatal):', err.message)
    );
    runBankingKpiExtraction({ areaReports: areaResult.areaReports, session }).catch(err =>
      console.error('[pipeline] Banking KPI extraction failed (non-fatal):', err.message)
    );

    // Phase 3: Check pending regeneration
    await runPendingRegenerationCheck(input).catch(err => { console.error('[pipeline] Pending regeneration check failed (non-fatal):', err.message); });
    console.log('[pipeline] Pipeline completed successfully.');
  } catch (err: any) {
    console.error('[pipeline] Pipeline FAILED:', err.message, err.stack);
  }
}
