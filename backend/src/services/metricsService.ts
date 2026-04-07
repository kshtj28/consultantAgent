import { Response } from 'express';
import { opensearchClient, INDICES } from '../config/database';
import { getSubArea, getAllSubAreas } from './domainService';

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
    let totalAnswered = 0;
    let totalQuestions = 0;
    let totalGaps = 0;
    let totalPainPoints = 0;
    let automationOpportunities = 0;

    // Per-area tracking for charts (keyed by area ID)
    const areaSelectionCounts: Record<string, number> = {};  // how many sessions selected this area
    const areaAnswerCounts: Record<string, number> = {};     // total answers per area
    const areaQuestionCounts: Record<string, number> = {};   // total questions per area
    const areaGapCounts: Record<string, number> = {};        // gaps attributable to area

    try {
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

                const context = doc.conversationContext || doc.context || {};
                const gaps = context.identifiedGaps || [];
                const painPoints = context.painPoints || [];
                totalGaps += gaps.length;
                totalPainPoints += painPoints.length;
                automationOpportunities += (context.automationOpportunities || context.transformationOpportunities || []).length;

                const responses: Record<string, any[]> = doc.responses && !Array.isArray(doc.responses) ? doc.responses : {};
                const selectedAreas: string[] = doc.selectedAreas || [];

                for (const areaId of selectedAreas) {
                    // Count area selections for process type distribution
                    areaSelectionCounts[areaId] = (areaSelectionCounts[areaId] || 0) + 1;

                    totalQuestions += 5;
                    areaQuestionCounts[areaId] = (areaQuestionCounts[areaId] || 0) + 5;

                    const areaAnswers = responses[areaId];
                    if (Array.isArray(areaAnswers)) {
                        totalAnswered += areaAnswers.length;
                        areaAnswerCounts[areaId] = (areaAnswerCounts[areaId] || 0) + areaAnswers.length;
                    }
                }

                // Distribute gaps evenly across selected areas (gaps are flat strings, not area-attributed)
                if (selectedAreas.length > 0 && gaps.length > 0) {
                    const gapsPerArea = gaps.length / selectedAreas.length;
                    for (const areaId of selectedAreas) {
                        areaGapCounts[areaId] = (areaGapCounts[areaId] || 0) + gapsPerArea;
                    }
                }
            }
        }

        const convExists = await opensearchClient.indices.exists({ index: 'consultant_conversations' });
        if (convExists.body) {
            const intResult = await opensearchClient.search({
                index: 'consultant_conversations',
                body: { query: { match: { sessionType: 'interview_session' } }, size: 100 },
            });
            const intHits = (intResult.body.hits.hits || []) as any[];
            totalSessions += intHits.length;
            for (const hit of intHits) {
                const doc = hit._source;
                if (!doc) continue;
                if (doc.status === 'completed') completedSessions++;
                const messages = doc.messages || [];
                totalAnswered += messages.filter((m: any) => m.role === 'user').length;
                totalQuestions += 8;
            }
        }
    } catch (err: any) {
        console.warn('Error computing metrics from sessions:', err.message);
    }

    const criticalIssues = totalGaps + totalPainPoints;
    const discoveryPct = totalQuestions > 0 ? Math.round((totalAnswered / totalQuestions) * 100) : 0;
    const avgRisk = totalSessions > 0 ? Math.round((criticalIssues / Math.max(totalSessions, 1)) * 10) : 0;

    let gapLevel: DashboardMetrics['gapSeverity']['level'];
    if (avgRisk >= 30) gapLevel = 'Critical';
    else if (avgRisk >= 15) gapLevel = 'High Risk';
    else if (avgRisk >= 5) gapLevel = 'Medium Risk';
    else gapLevel = 'Low Risk';

    const automationPct = totalSessions > 0
        ? Math.min(100, Math.round((automationOpportunities / Math.max(totalSessions, 1)) * 35 + 20))
        : 0;
    const automationDelta = Math.round(automationPct * 0.15);

    const now = new Date();
    const daysLeft = discoveryPct > 0 ? Math.round(((100 - discoveryPct) / discoveryPct) * 14) : 30;
    const estCompletion = new Date(now.getTime() + daysLeft * 86400000);

    // Preserve existing process flow if stored, otherwise build from domain areas
    const existing = await getMetrics(projectId);
    const domainAreas = getAllSubAreas();

    const processFlow = existing?.processFlow ?? {
        title: `${domainAreas.length > 0 ? domainAreas[0].name : 'Process'} Flow`,
        steps: domainAreas.slice(0, 5).map((a, i) => ({
            name: a.name,
            stepNumber: i + 1,
            status: 'normal' as const,
            avgDuration: 0,
            durationUnit: 'hrs' as const,
        })),
        totalCycleTime: 0,
        cycleTimeUnit: 'days',
        criticalBottlenecks: 0,
        automationOpportunity: 'Low' as const,
    };

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

    const total = entries.reduce((s, e) => s + e.value, 0) || 1;
    return entries.map((e) => ({
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
