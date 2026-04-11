/**
 * Assessment Chat Service
 *
 * Retrieves relevant assessment data (reports, gaps, session responses, insights)
 * from OpenSearch and builds grounded context for LLM Q&A.
 */

import { opensearchClient, INDICES } from '../config/database';
import { getProjectContext } from './settingsService';
import { fetchInsights } from './insightsService';

export interface AssessmentContext {
    projectContext: string;
    gapSummary: string;
    reportContent: string;
    sessionHighlights: string;
    insights: string;
    metrics: string;
}

/**
 * Build a rich context snapshot from all assessment data sources.
 * The result is injected into the LLM prompt so answers are grounded in real data.
 */
export async function buildAssessmentContext(userQuestion: string): Promise<AssessmentContext> {
    const [projectCtx, gaps, reports, sessions, insightsData, metricsData] = await Promise.all([
        getProjectContext().catch(() => ({ projectName: '', clientName: '', erpPath: '', industry: '' })),
        fetchGapData(),
        fetchReportData(),
        fetchSessionHighlights(),
        fetchInsightsData(),
        fetchMetricsData(),
    ]);

    // Project context
    const projectContext = [
        projectCtx.clientName && `Client: ${projectCtx.clientName}`,
        projectCtx.projectName && `Project: ${projectCtx.projectName}`,
        projectCtx.erpPath && `ERP Migration Path: ${projectCtx.erpPath}`,
        projectCtx.industry && `Industry: ${projectCtx.industry}`,
    ].filter(Boolean).join('\n') || 'No project context configured.';

    // Gap summary — structured for the LLM
    let gapSummary = 'No gap data available yet.';
    if (gaps.length > 0) {
        const byArea = new Map<string, typeof gaps>();
        for (const g of gaps) {
            const area = g.broadAreaName || g.area || 'Unknown';
            if (!byArea.has(area)) byArea.set(area, []);
            byArea.get(area)!.push(g);
        }

        const sections: string[] = [];
        for (const [area, areaGaps] of byArea) {
            const lines = areaGaps.map(g => {
                const parts = [
                    `  - [${(g.impact || 'medium').toUpperCase()}] ${g.gap || g.description}`,
                    g.currentState && `    Current: ${g.currentState}`,
                    g.targetState && `    Target: ${g.targetState}`,
                    g.standard && `    Standard: ${g.standard}`,
                    g.effort && `    Effort: ${g.effort}`,
                    g.fit && `    Fit: ${g.fit}`,
                ];
                return parts.filter(Boolean).join('\n');
            });
            sections.push(`${area} (${areaGaps.length} gaps):\n${lines.join('\n')}`);
        }

        const highCount = gaps.filter(g => (g.impact || '').toLowerCase() === 'high').length;
        const medCount = gaps.filter(g => (g.impact || '').toLowerCase() === 'medium').length;
        const lowCount = gaps.length - highCount - medCount;

        gapSummary = `TOTAL GAPS: ${gaps.length} (High: ${highCount}, Medium: ${medCount}, Low: ${lowCount})\n\n${sections.join('\n\n')}`;
    }

    // Report content — executive summaries, roadmaps, KPIs
    let reportContent = 'No reports generated yet.';
    if (reports.length > 0) {
        const reportSections = reports.map(r => {
            const parts: string[] = [`## ${r.broadAreaName || r.name || 'Report'}`];
            if (r.content?.executiveSummary) parts.push(`Summary: ${r.content.executiveSummary}`);
            if (r.content?.overallScore != null) parts.push(`Overall Score: ${r.content.overallScore}/100`);
            if (r.content?.roadmap?.length > 0) {
                parts.push('Roadmap:');
                for (const phase of r.content.roadmap) {
                    parts.push(`  ${phase.phase}: ${(phase.items || []).join(', ')}`);
                }
            }
            if (r.content?.kpiScores?.length > 0) {
                parts.push('KPI Scores:');
                for (const kpi of r.content.kpiScores) {
                    parts.push(`  ${kpi.category}: ${kpi.score}/100 (benchmark: ${kpi.benchmark})`);
                }
            }
            if (r.content?.risks?.length > 0) {
                parts.push('Key Risks:');
                for (const risk of r.content.risks.slice(0, 3)) {
                    parts.push(`  - ${risk.risk} (Impact: ${risk.impact}, Mitigation: ${risk.mitigation || 'N/A'})`);
                }
            }
            return parts.join('\n');
        });
        reportContent = reportSections.join('\n\n---\n\n');
    }

    // Session highlights — what was discussed
    let sessionHighlights = 'No interview sessions yet.';
    if (sessions.length > 0) {
        const sLines = sessions.map(s => {
            const areas = (s.selectedBroadAreas || []).join(', ') || 'N/A';
            const covered = Object.entries(s.coverage || {})
                .filter(([, c]: any) => c.status === 'covered').length;
            const total = Object.keys(s.coverage || {}).length;
            return `- ${s.title || 'Session'} (${s.status}): Areas: ${areas}, Coverage: ${covered}/${total} sub-areas`;
        });
        sessionHighlights = `${sessions.length} sessions completed:\n${sLines.join('\n')}`;
    }

    // Insights
    let insights = '';
    if (insightsData) {
        const parts: string[] = [];
        if (insightsData.recommendedActions?.length > 0) {
            parts.push('TOP RECOMMENDATIONS:');
            for (const rec of insightsData.recommendedActions.slice(0, 5)) {
                parts.push(`  - ${rec.title}: ${rec.description} (Impact: ${rec.impact}, Effort: ${rec.effort}${rec.estimatedSavings ? `, Savings: ${rec.estimatedSavings}` : ''})`);
            }
        }
        if (insightsData.automationOpportunities?.length > 0) {
            parts.push('AUTOMATION OPPORTUNITIES:');
            for (const opp of insightsData.automationOpportunities.slice(0, 5)) {
                parts.push(`  - ${opp.process}: Est. savings ${opp.savings} (Effort: ${opp.effort})`);
            }
        }
        insights = parts.join('\n') || 'No insights computed yet.';
    }

    // Metrics
    let metrics = '';
    if (metricsData) {
        metrics = [
            `Readiness Score: ${metricsData.readinessScore ?? 'N/A'}`,
            `Total Sessions: ${metricsData.totalSessions ?? 0}`,
            `Completed: ${metricsData.completedSessions ?? 0}`,
            `Discovery Progress: ${metricsData.discoveryPct ?? 0}%`,
            `Automation Quotient: ${metricsData.automationPct ?? 0}%`,
        ].join(' | ');
    }

    return { projectContext, gapSummary, reportContent, sessionHighlights, insights, metrics };
}

/**
 * Build the system prompt for assessment chat
 */
export function buildAssessmentSystemPrompt(ctx: AssessmentContext): string {
    return `You are an expert ERP transformation consultant embedded in an assessment platform. You have complete access to this client's assessment data — gaps, reports, KPIs, session transcripts, and insights.

YOUR KNOWLEDGE BASE:
═══════════════════

PROJECT CONTEXT:
${ctx.projectContext}

METRICS SNAPSHOT:
${ctx.metrics || 'Not yet computed.'}

GAP REGISTER:
${ctx.gapSummary}

GENERATED REPORTS:
${ctx.reportContent}

ASSESSMENT SESSIONS:
${ctx.sessionHighlights}

RECOMMENDATIONS & INSIGHTS:
${ctx.insights || 'Not yet computed.'}

═══════════════════

INSTRUCTIONS:
1. Answer ONLY based on the assessment data above. Never fabricate gaps, scores, or recommendations not present in the data.
2. When referencing specific gaps, cite the process area and impact level.
3. When asked for summaries, be concise but include quantitative data (counts, scores, percentages).
4. When asked for comparisons, structure the answer as a table or ranked list.
5. If asked about something not covered in the assessment, say so clearly rather than guessing.
6. For "what-if" questions, explain your reasoning based on the scoring methodology.
7. Use markdown formatting for readability — tables, bold, bullet points.
8. Be direct and actionable — this is for decision-makers, not academics.`;
}

// ── Data fetchers ────────────────────────────────────────────

async function fetchGapData(): Promise<any[]> {
    try {
        const exists = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
        if (!exists.body) return [];

        const result = await opensearchClient.search({
            index: INDICES.REPORTS,
            body: {
                query: { bool: { must: [{ term: { status: 'ready' } }] } },
                size: 200,
                sort: [{ createdAt: { order: 'desc' } }],
            },
        });

        const hits = (result.body.hits.hits || []) as any[];
        const latestByArea = new Map<string, any>();
        for (const hit of hits) {
            const doc = hit._source;
            const key = doc.broadAreaId || doc.sessionId || hit._id;
            if (!latestByArea.has(key)) latestByArea.set(key, doc);
        }

        const allGaps: any[] = [];
        for (const doc of latestByArea.values()) {
            const gaps = doc.content?.gaps || [];
            const seen = new Set<string>();
            for (const gap of gaps) {
                const desc = (gap.gap || gap.description || '').toLowerCase().trim();
                if (!desc || seen.has(desc)) continue;
                seen.add(desc);
                allGaps.push({ ...gap, broadAreaName: doc.broadAreaName, broadAreaId: doc.broadAreaId });
            }
        }
        return allGaps;
    } catch {
        return [];
    }
}

async function fetchReportData(): Promise<any[]> {
    try {
        const exists = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
        if (!exists.body) return [];

        const result = await opensearchClient.search({
            index: INDICES.REPORTS,
            body: {
                query: { bool: { must: [{ term: { type: 'broad_area' } }, { term: { status: 'ready' } }] } },
                size: 20,
                sort: [{ createdAt: { order: 'desc' } }],
                _source: ['broadAreaName', 'broadAreaId', 'content'],
            },
        });

        const hits = (result.body.hits.hits || []) as any[];
        // De-dup by area
        const latest = new Map<string, any>();
        for (const hit of hits) {
            const doc = hit._source;
            const key = doc.broadAreaId || 'unknown';
            if (!latest.has(key)) latest.set(key, doc);
        }
        return Array.from(latest.values());
    } catch {
        return [];
    }
}

async function fetchSessionHighlights(): Promise<any[]> {
    try {
        const exists = await opensearchClient.indices.exists({ index: INDICES.CONVERSATIONS });
        if (!exists.body) return [];

        const result = await opensearchClient.search({
            index: INDICES.CONVERSATIONS,
            body: {
                query: { match: { sessionType: 'interview_session' } },
                size: 20,
                sort: [{ updatedAt: { order: 'desc' } }],
                _source: ['sessionId', 'status', 'selectedBroadAreas', 'coverage', 'createdAt'],
            },
        });

        return (result.body.hits.hits || []).map((h: any) => {
            const doc = h._source;
            return {
                ...doc,
                title: `Interview — ${new Date(doc.createdAt || Date.now()).toLocaleDateString('en-US')}`,
            };
        });
    } catch {
        return [];
    }
}

async function fetchInsightsData(): Promise<any | null> {
    try {
        return await fetchInsights();
    } catch {
        return null;
    }
}

async function fetchMetricsData(): Promise<any | null> {
    try {
        // Fetch from executive summary logic — readiness score + metrics
        const [execData, metricsData] = await Promise.all([
            fetchExecScores(),
            fetchDashMetrics(),
        ]);
        return { ...metricsData, ...execData };
    } catch {
        return null;
    }
}

async function fetchExecScores(): Promise<any> {
    try {
        const exists = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
        if (!exists.body) return {};

        const result = await opensearchClient.search({
            index: INDICES.REPORTS,
            body: {
                query: { bool: { must: [{ term: { type: 'broad_area' } }, { term: { status: 'ready' } }] } },
                size: 100,
                sort: [{ createdAt: { order: 'desc' } }],
            },
        });

        const hits = (result.body.hits.hits || []) as any[];
        const latestByArea = new Map<string, any>();
        for (const hit of hits) {
            const doc = hit._source;
            const areaId = doc.broadAreaId || 'unknown';
            if (!latestByArea.has(areaId)) latestByArea.set(areaId, doc);
        }

        let totalGaps = 0, highGaps = 0, fitCount = 0, partialCount = 0;
        for (const doc of latestByArea.values()) {
            const gaps = doc.content?.gaps || [];
            const seen = new Set<string>();
            for (const gap of gaps) {
                const desc = (gap.gap || '').toLowerCase().trim();
                if (seen.has(desc)) continue;
                seen.add(desc);
                totalGaps++;
                if ((gap.impact || '').toLowerCase() === 'high') highGaps++;
                if ((gap.fit || '').toLowerCase() === 'fit') fitCount++;
                else if ((gap.fit || '').toLowerCase() === 'partial') partialCount++;
            }
        }

        let readinessScore = 100 - highGaps * 4 - (totalGaps - highGaps) * 1.5 + fitCount + partialCount * 0.5;
        readinessScore = Math.max(0, Math.min(100, Math.round(readinessScore)));

        return { readinessScore, totalGaps, highGaps, fitCount };
    } catch {
        return {};
    }
}

async function fetchDashMetrics(): Promise<any> {
    try {
        const exists = await opensearchClient.indices.exists({ index: INDICES.DASHBOARD_METRICS });
        if (!exists.body) return {};

        const result = await opensearchClient.search({
            index: INDICES.DASHBOARD_METRICS,
            body: { query: { match_all: {} }, size: 1 },
        });

        const hits = result.body.hits.hits || [];
        if (hits.length === 0) return {};
        const m = hits[0]._source;
        return {
            totalSessions: m.totalSessions,
            completedSessions: m.completedSessions,
            discoveryPct: m.discoveryProgress?.pct,
            automationPct: m.automationQuotient?.currentPct,
        };
    } catch {
        return {};
    }
}
