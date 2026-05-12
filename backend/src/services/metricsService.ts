import { Response } from 'express';
import { opensearchClient, INDICES } from '../config/database';
import { getAllSubAreas } from './domainService';

// ── Types ──────────────────────────────────────────────────

export interface ProcessFlowStep {
    name: string;
    stepNumber: number;
    status: 'normal' | 'critical';
    avgDuration: number;
    durationUnit: 'hrs' | 'days';
}

export interface ProcessTypeEntry {
    name: string;
    value: number;
    percent: number;
}

export interface ProcessEfficiencyEntry {
    name: string;
    efficiency: number;
}

export interface DashboardMetrics {
    projectId: string;
    updatedAt: string;
    gapSeverity: {
        level: 'Low Risk' | 'Medium Risk' | 'High Risk' | 'Critical';
        avgRisk: number;
        maxRisk: number;
    };
    criticalIssues: {
        count: number;
        trend: 'up' | 'down' | 'stable';
    };
    automationQuotient: {
        currentPct: number;
        improvementDelta: number;
        trend: 'up' | 'down' | 'stable';
    };
    discoveryProgress: {
        pct: number;
        estCompletion: string;
    };
    processFlow: {
        title: string;
        steps: ProcessFlowStep[];
        totalCycleTime: number;
        cycleTimeUnit: string;
        criticalBottlenecks: number;
        automationOpportunity: 'Low' | 'Medium' | 'High';
    };
    processTypeDistribution: ProcessTypeEntry[];
    processEfficiency: ProcessEfficiencyEntry[];
    totalSessions: number;
    completedSessions: number;
}

// ── SSE client tracking for dashboard metrics ──────────────

const metricsSseClients = new Set<Response>();

export function addMetricsSSEClient(res: Response): void {
    metricsSseClients.add(res);
    res.on('close', () => {
        metricsSseClients.delete(res);
    });
}

function broadcastMetricsUpdate(metrics: DashboardMetrics): void {
    const data = JSON.stringify({ type: 'metrics_update', metrics });
    for (const client of metricsSseClients) {
        client.write(`data: ${data}\n\n`);
    }
}

// ── Default project ID ─────────────────────────────────────

const DEFAULT_PROJECT_ID = 'default';

// ── CRUD ───────────────────────────────────────────────────

export async function getMetrics(projectId = DEFAULT_PROJECT_ID): Promise<DashboardMetrics | null> {
    try {
        const exists = await opensearchClient.indices.exists({ index: INDICES.DASHBOARD_METRICS });
        if (!exists.body) return null;

        const result = await opensearchClient.search({
            index: INDICES.DASHBOARD_METRICS,
            body: {
                query: { term: { projectId } },
                size: 1,
            },
        });

        const hits = result.body.hits.hits || [];
        if (hits.length === 0) return null;

        return hits[0]._source as DashboardMetrics;
    } catch (err: any) {
        console.warn('Error fetching dashboard metrics:', err.message);
        return null;
    }
}

export async function upsertMetrics(metrics: Partial<DashboardMetrics>, projectId = DEFAULT_PROJECT_ID): Promise<DashboardMetrics> {
    const existing = await getMetrics(projectId);

    const merged: DashboardMetrics = {
        projectId,
        updatedAt: new Date().toISOString(),
        gapSeverity: metrics.gapSeverity ?? existing?.gapSeverity ?? { level: 'Low Risk', avgRisk: 0, maxRisk: 100 },
        criticalIssues: metrics.criticalIssues ?? existing?.criticalIssues ?? { count: 0, trend: 'stable' },
        automationQuotient: metrics.automationQuotient ?? existing?.automationQuotient ?? { currentPct: 0, improvementDelta: 0, trend: 'stable' },
        discoveryProgress: metrics.discoveryProgress ?? existing?.discoveryProgress ?? { pct: 0, estCompletion: '' },
        processFlow: metrics.processFlow ?? existing?.processFlow ?? {
            title: 'Process Flow',
            steps: [],
            totalCycleTime: 0,
            cycleTimeUnit: 'days',
            criticalBottlenecks: 0,
            automationOpportunity: 'Low',
        },
        processTypeDistribution: metrics.processTypeDistribution ?? existing?.processTypeDistribution ?? [],
        processEfficiency: metrics.processEfficiency ?? existing?.processEfficiency ?? [],
        totalSessions: metrics.totalSessions ?? existing?.totalSessions ?? 0,
        completedSessions: metrics.completedSessions ?? existing?.completedSessions ?? 0,
    };

    // Upsert by deleting old + inserting new (OpenSearch doesn't support upsert by field easily)
    try {
        await opensearchClient.deleteByQuery({
            index: INDICES.DASHBOARD_METRICS,
            body: { query: { term: { projectId } } },
            refresh: true,
        });
    } catch {
        // Index may not have the doc yet
    }

    await opensearchClient.index({
        index: INDICES.DASHBOARD_METRICS,
        body: merged,
        refresh: true,
    });

    // Broadcast to all SSE subscribers
    broadcastMetricsUpdate(merged);

    return merged;
}

/**
 * Compute metrics from existing session data and store them.
 * This bridges the old computed approach with the new stored approach.
 */
export async function recomputeAndStoreMetrics(projectId = DEFAULT_PROJECT_ID): Promise<DashboardMetrics> {
    let totalSessions = 0;
    let completedSessions = 0;

    // Coverage tracking from actual interview sessions
    let totalSubAreas = 0;
    let coveredSubAreas = 0;
    let inProgressSubAreas = 0;
    let totalAnswered = 0;
    let totalQuestions = 0;

    // Per-area tracking for charts (keyed by sub-area ID)
    const areaSelectionCounts: Record<string, number> = {};
    const areaAnswerCounts: Record<string, number> = {};
    const areaQuestionCounts: Record<string, number> = {};
    const areaGapCounts: Record<string, number> = {};

    try {
        // Legacy readiness sessions
        const sessExists = await opensearchClient.indices.exists({ index: 'readiness_sessions' });
        if (sessExists.body) {
            const result = await opensearchClient.search({
                index: 'readiness_sessions',
                body: { query: { match_all: {} }, size: 100 },
            });

            const hits = (result.body.hits.hits || []) as any[];
            totalSessions += hits.length;

            for (const hit of hits) {
                const doc = hit._source;
                if (!doc) continue;
                if (doc.status === 'completed') completedSessions++;

                const responses: Record<string, any[]> = doc.responses && !Array.isArray(doc.responses) ? doc.responses : {};
                const selectedAreas: string[] = doc.selectedAreas || [];

                for (const areaId of selectedAreas) {
                    areaSelectionCounts[areaId] = (areaSelectionCounts[areaId] || 0) + 1;

                    const areaAnswers = responses[areaId];
                    const answerCount = Array.isArray(areaAnswers) ? areaAnswers.length : 0;
                    totalAnswered += answerCount;
                    areaAnswerCounts[areaId] = (areaAnswerCounts[areaId] || 0) + answerCount;
                    areaQuestionCounts[areaId] = (areaQuestionCounts[areaId] || 0) + Math.max(answerCount, 1);
                    totalQuestions += Math.max(answerCount, 1);
                }
            }
        }

        // Interview sessions — use actual coverage data
        const convExists = await opensearchClient.indices.exists({ index: INDICES.CONVERSATIONS });
        if (convExists.body) {
            const intResult = await opensearchClient.search({
                index: INDICES.CONVERSATIONS,
                body: { query: { match: { sessionType: 'interview_session' } }, size: 100 },
            });
            const intHits = (intResult.body.hits.hits || []) as any[];
            totalSessions += intHits.length;

            for (const hit of intHits) {
                const doc = hit._source;
                if (!doc) continue;
                if (doc.status === 'completed') completedSessions++;

                // Use real coverage data from interview sessions
                const coverage: Record<string, { status: string; questionsAnswered: number }> = doc.coverage || {};
                const coverageEntries = Object.entries(coverage);

                if (coverageEntries.length > 0) {
                    totalSubAreas += coverageEntries.length;
                    for (const [subAreaId, cov] of coverageEntries) {
                        if (cov.status === 'covered') coveredSubAreas++;
                        else if (cov.status === 'in_progress') inProgressSubAreas++;

                        areaSelectionCounts[subAreaId] = (areaSelectionCounts[subAreaId] || 0) + 1;
                        areaQuestionCounts[subAreaId] = (areaQuestionCounts[subAreaId] || 0) + Math.max(cov.questionsAnswered, 1);
                        totalQuestions += Math.max(cov.questionsAnswered, 1);
                    }
                }

                // Count actual answers from responses
                const responses: Record<string, any[]> = doc.responses && !Array.isArray(doc.responses) ? doc.responses : {};
                for (const [subAreaId, answers] of Object.entries(responses)) {
                    const answerCount = Array.isArray(answers) ? answers.length : 0;
                    totalAnswered += answerCount;
                    areaAnswerCounts[subAreaId] = (areaAnswerCounts[subAreaId] || 0) + answerCount;
                }
            }
        }
    } catch (err: any) {
        console.warn('Error computing metrics from sessions:', err.message);
    }

    // ── Pull gap data from generated reports (the actual source of truth) ──
    let totalGaps = 0;
    let highGaps = 0;
    let mediumGaps = 0;
    let lowGaps = 0;

    try {
        const reportsExist = await opensearchClient.indices.exists({ index: INDICES.REPORTS });
        if (reportsExist.body) {
            const reportResult = await opensearchClient.search({
                index: INDICES.REPORTS,
                body: {
                    query: { bool: { must: [
                        { term: { status: 'ready' } },
                    ] } },
                    size: 200,
                    sort: [{ createdAt: { order: 'desc' } }],
                },
            });

            const reportHits = (reportResult.body.hits.hits || []) as any[];

            // De-duplicate: keep only the latest report per broadAreaId (or sessionId for sub-area reports)
            const latestByKey = new Map<string, any>();
            for (const hit of reportHits) {
                const doc = hit._source;
                if (!doc?.content) continue;
                const key = doc.broadAreaId || doc.sessionId || hit._id;
                if (!latestByKey.has(key)) latestByKey.set(key, doc);
            }

            for (const doc of latestByKey.values()) {
                const gaps = doc.content?.gaps || [];
                const seenDescs = new Set<string>();

                for (const gap of gaps) {
                    const desc = (gap.gap || gap.description || '').toLowerCase().trim();
                    if (!desc || seenDescs.has(desc)) continue;
                    seenDescs.add(desc);

                    totalGaps++;
                    const impact = (gap.impact || '').toLowerCase();
                    if (impact === 'high') highGaps++;
                    else if (impact === 'medium') mediumGaps++;
                    else lowGaps++;

                    // Distribute gap to the relevant broad area for chart data
                    const areaId = doc.broadAreaId;
                    if (areaId) {
                        areaGapCounts[areaId] = (areaGapCounts[areaId] || 0) + 1;
                    }
                }
            }
        }
    } catch (err: any) {
        console.warn('Error fetching gap data from reports:', err.message);
    }

    // Discovery progress: based on actual sub-area coverage
    let discoveryPct = 0;
    if (totalSubAreas > 0) {
        const weightedProgress = coveredSubAreas * 100 + inProgressSubAreas * 50;
        discoveryPct = Math.round(weightedProgress / totalSubAreas);
    } else if (totalQuestions > 0) {
        discoveryPct = Math.round((totalAnswered / totalQuestions) * 100);
    }

    // Risk computation from actual report gaps
    const criticalIssues = totalGaps;
    let gapLevel: DashboardMetrics['gapSeverity']['level'];
    if (highGaps >= 10 || (highGaps >= 5 && totalGaps >= 20)) gapLevel = 'Critical';
    else if (highGaps >= 5 || (highGaps >= 3 && totalGaps >= 15)) gapLevel = 'High Risk';
    else if (highGaps >= 2 || totalGaps >= 8) gapLevel = 'Medium Risk';
    else gapLevel = 'Low Risk';

    // Avg risk: weighted score based on gap severity
    const avgRisk = totalGaps > 0
        ? Math.round((highGaps * 3 + mediumGaps * 2 + lowGaps * 1) / totalGaps * 33)
        : 0;

    const automationPct = totalSessions > 0
        ? Math.min(100, Math.round((totalAnswered / Math.max(totalQuestions, 1)) * 60 + 20))
        : 0;
    const automationDelta = Math.round(automationPct * 0.15);

    const now = new Date();
    const daysLeft = discoveryPct > 0 ? Math.round(((100 - discoveryPct) / discoveryPct) * 14) : 30;
    const estCompletion = new Date(now.getTime() + daysLeft * 86400000);

    // ── Build Process Flow from actual Consolidated Data ──────────────────
    const domainAreas = getAllSubAreas();
    let processFlow: DashboardMetrics['processFlow'] = {
        title: 'Global Process Flow',
        steps: [],
        totalCycleTime: 0,
        cycleTimeUnit: 'days',
        criticalBottlenecks: 0,
        automationOpportunity: 'Low',
    };

    try {
        const consolidationRes = await opensearchClient.search({
            index: INDICES.MULTI_SME_CONSOLIDATIONS,
            body: {
                query: { match_all: {} },
                sort: [{ updatedAt: { order: 'desc' } }],
                size: 1,
            },
        });

        const latestConsolidation = consolidationRes.body.hits.hits[0]?._source;
        if (latestConsolidation && Array.isArray(latestConsolidation.steps) && latestConsolidation.steps.length > 0) {
            processFlow = {
                title: `${latestConsolidation.processName} Flow`,
                steps: latestConsolidation.steps.slice(0, 8).map((s: any, i: number) => ({
                    name: s.label,
                    stepNumber: i + 1,
                    status: s.status === 'conflict' ? 'critical' : 'normal',
                    avgDuration: 0, // Duration could be derived from ERP evidence in future
                    durationUnit: 'hrs',
                })),
                totalCycleTime: 0,
                cycleTimeUnit: 'days',
                criticalBottlenecks: latestConsolidation.metrics?.conflicts || 0,
                automationOpportunity: latestConsolidation.metrics?.consensusPct > 70 ? 'High' : 'Medium',
            };
        } else {
            // Fallback: build from domain areas if no consolidation yet
            processFlow = {
                title: `${domainAreas.length > 0 ? domainAreas[0].name : 'Process'} Flow`,
                steps: domainAreas.slice(0, 6).map((a, i) => ({
                    name: a.name,
                    stepNumber: i + 1,
                    status: 'normal' as const,
                    avgDuration: 0,
                    durationUnit: 'hrs' as const,
                })),
                totalCycleTime: 0,
                cycleTimeUnit: 'days',
                criticalBottlenecks: 0,
                automationOpportunity: 'Low',
            };
        }
    } catch (err: any) {
        console.warn('[metrics] Failed to build flow from consolidation:', err.message);
    }

    const metrics: Partial<DashboardMetrics> = {
        gapSeverity: { level: gapLevel, avgRisk, maxRisk: 100 },
        criticalIssues: { count: criticalIssues, trend: criticalIssues > 0 ? 'down' : 'stable' },
        automationQuotient: { currentPct: automationPct, improvementDelta: automationDelta, trend: automationPct > 20 ? 'up' : 'stable' },
        discoveryProgress: {
            pct: discoveryPct,
            estCompletion: estCompletion.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        },
        processFlow,
        processTypeDistribution: computeProcessTypeDistribution(areaSelectionCounts),
        processEfficiency: computeProcessEfficiency(areaAnswerCounts, areaQuestionCounts, areaGapCounts),
        totalSessions,
        completedSessions,
    };

    return upsertMetrics(metrics, projectId);
}

// ── Process Analysis chart helpers ──────────────────────────

/**
 * Build process type distribution from actual area selection counts.
 * Resolves area IDs to human-readable names via domain config.
 */
function computeProcessTypeDistribution(areaSelectionCounts: Record<string, number>): ProcessTypeEntry[] {
    const domainAreas = getAllSubAreas();
    const entries: { name: string; value: number }[] = [];

    // Build entries from domain areas, using actual counts where available
    for (const area of domainAreas) {
        entries.push({
            name: area.name,
            value: areaSelectionCounts[area.id] || 0,
        });
    }

    // Include any area IDs in counts not in domain config (shouldn't happen, but be safe)
    const knownIds = new Set(domainAreas.map((a) => a.id));
    for (const [areaId, value] of Object.entries(areaSelectionCounts)) {
        if (!knownIds.has(areaId)) {
            entries.push({ name: areaId, value });
        }
    }

    // Filter out zero-value entries so pie chart renders correctly
    const nonZero = entries.filter((e) => e.value > 0);
    const total = nonZero.reduce((s, e) => s + e.value, 0) || 1;
    return nonZero.map((e) => ({
        name: e.name,
        value: e.value,
        percent: Math.round((e.value / total) * 100),
    }));
}

/**
 * Compute efficiency per area from actual answer completion and gap data.
 * Efficiency = (answers / expected questions) * 100, penalised by gap density.
 */
function computeProcessEfficiency(
    areaAnswerCounts: Record<string, number>,
    areaQuestionCounts: Record<string, number>,
    areaGapCounts: Record<string, number>,
): ProcessEfficiencyEntry[] {
    const domainAreas = getAllSubAreas();

    return domainAreas.map((area) => {
        const answers = areaAnswerCounts[area.id] || 0;
        const questions = areaQuestionCounts[area.id] || 0;
        const gaps = areaGapCounts[area.id] || 0;

        if (questions === 0) {
            // Area not yet assessed
            return { name: area.name, efficiency: 0 };
        }

        // Base efficiency: what percentage of questions were answered
        const completionRatio = Math.min(answers / questions, 1);
        // Gap penalty: each gap reduces efficiency (capped)
        const gapPenalty = Math.min(gaps * 10, 50);
        const efficiency = Math.max(0, Math.min(100, Math.round(completionRatio * 100 - gapPenalty)));

        return { name: area.name, efficiency };
    });
}
