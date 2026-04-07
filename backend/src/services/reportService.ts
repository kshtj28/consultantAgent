import { getInterviewSession } from './interviewService';
import { getSubArea } from './domainService';
import { generateCompletion } from './llmService';
import { buildReadinessReportPrompt, buildGapReportPrompt } from '../prompts/report.prompt';
import { getLanguageInstructions } from './languageService';

// Readiness Report Types
export interface ReadinessScore {
    areaId: string;
    areaName: string;
    score: number; // 0-100
    maturityLevel: 'initial' | 'developing' | 'defined' | 'managed' | 'optimized';
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
}

export interface ReadinessReport {
    sessionId: string;
    generatedAt: Date;
    overallScore: number;
    overallMaturity: string;
    executiveSummary: string;
    areaScores: ReadinessScore[];
    keyFindings: string[];
    priorityRecommendations: string[];
    chartData: {
        pieChart: { name: string; value: number }[];
        maturityRadar: { area: string; current: number; target: number }[];
    };
}

// Gap Analysis Types
export interface GapItem {
    id: string;
    category: 'process' | 'technology' | 'capability' | 'data';
    area: string;            // e.g. "Order to Cash", "Procure to Pay", "Record to Report"
    currentState: string;
    targetState: string;
    gap: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'high' | 'medium' | 'low';
    fit: 'gap' | 'partial' | 'fit';   // Fit vs best practice
    standard: string;        // e.g. "SAP Best Practice", "APQC Framework"
    priority: number;
}

export interface GapReport {
    sessionId: string;
    generatedAt: Date;
    executiveSummary: string;
    gaps: GapItem[];
    quickWins: GapItem[];
    roadmap: {
        phase: string;
        duration: string;
        items: string[];
    }[];
    riskAssessment: {
        risk: string;
        likelihood: 'high' | 'medium' | 'low';
        impact: 'high' | 'medium' | 'low';
        mitigation: string;
    }[];
    chartData: {
        /** Radar chart: current maturity vs target per area */
        maturityRadar: Array<{ area: string; current: number; target: number; fullMark: number }>;
        /** Bubble/scatter chart: gaps plotted by Impact vs Effort */
        impactEffortBubble: Array<{ name: string; impact: number; effort: number; priority: number; category: string }>;
        /** Grouped bar chart: score vs benchmark per category */
        kpiBarChart: Array<{ category: string; score: number; benchmark: number }>;
        /** Stacked bar: gap count per category (total + high-impact) */
        gapsByCategory: Array<{ name: string; count: number; highImpact: number }>;
        /** Knowledge graph: nodes and edges linking areas, gaps, and recommendations */
        knowledgeGraph?: {
            nodes: Array<{ id: string; label: string; type: 'area' | 'gap' | 'recommendation' | 'category'; impact?: string; description?: string }>;
            edges: Array<{ source: string; target: string; type: string }>;
        };
        /** Heatmap: severity of gaps per area/category combination */
        heatmapData?: Array<{ area: string; category: string; severity: number; count: number }>;
        /** Sankey diagram: flow from current state areas through gap categories to target states */
        sankeyData?: {
            nodes: Array<{ id: string; name: string; column: 0 | 1 | 2; value: number }>;
            links: Array<{ source: string; target: string; value: number; color?: string }>;
        };
        /** Treemap: gap count and impact breakdown per area */
        treemapData?: Array<{ name: string; value: number; avgImpact: number; highCount: number; mediumCount: number; lowCount: number }>;
        /** Gauge chart: current vs target maturity per area */
        gaugeData?: Array<{ area: string; current: number; target: number; max: number }>;
    };
}

// Consolidated Report Types
export interface ConsolidatedReport {
    sessionId: string;
    generatedAt: Date;
    // From ReadinessReport
    overallScore: number;
    overallMaturity: string;
    executiveSummary: string;
    areaScores: ReadinessScore[];
    keyFindings: string[];
    priorityRecommendations: string[];
    // From GapReport
    gaps: GapItem[];
    quickWins: GapItem[];
    roadmap: {
        phase: string;
        duration: string;
        items: string[];
    }[];
    riskAssessment: {
        risk: string;
        likelihood: 'high' | 'medium' | 'low';
        impact: 'high' | 'medium' | 'low';
        mitigation: string;
    }[];
    // Merged chartData
    chartData: {
        pieChart: { name: string; value: number }[];
        maturityRadar: { area: string; current: number; target: number; fullMark?: number }[];
        impactEffortBubble: { name: string; impact: number; effort: number; priority: number; category: string }[];
        kpiBarChart: { category: string; score: number; benchmark: number }[];
        gapsByCategory: { name: string; count: number; highImpact: number }[];
        knowledgeGraph?: {
            nodes: { id: string; label: string; type: 'area' | 'gap' | 'recommendation' | 'category'; impact?: string; description?: string }[];
            edges: { source: string; target: string; type: string }[];
        };
        heatmapData?: { area: string; category: string; severity: number; count: number }[];
        sankeyData?: {
            nodes: { id: string; name: string; column: 0 | 1 | 2; value: number }[];
            links: { source: string; target: string; value: number; color?: string }[];
        };
        treemapData?: { name: string; value: number; avgImpact: number; highCount: number; mediumCount: number; lowCount: number }[];
        gaugeData?: { area: string; current: number; target: number; max: number }[];
    };
}

// Calculate maturity level from score
function getMaturityLevel(score: number): ReadinessScore['maturityLevel'] {
    if (score >= 80) return 'optimized';
    if (score >= 60) return 'managed';
    if (score >= 40) return 'defined';
    if (score >= 20) return 'developing';
    return 'initial';
}

// Generate readiness report
export async function generateReadinessReport(sessionId: string, modelId?: string): Promise<ReadinessReport> {
    const session: any = await getInterviewSession(sessionId);
    if (!session) throw new Error('Session not found');

    // Build context from answers
    const answerContext = buildAnswerContext(session);
    const languageInstructions = getLanguageInstructions(session.language ?? 'en');

    const prompt = `${languageInstructions}\n\n${buildReadinessReportPrompt(
        answerContext,
        session.conversationContext.identifiedGaps.join(', '),
        session.conversationContext.painPoints.join(', '),
        session.conversationContext.transformationOpportunities.join(', ')
    )}`;

    const response = await generateCompletion(modelId || null, [
        { role: 'user', content: prompt }
    ], { temperature: 0.4 });

    let parsed: any = { areas: [], executiveSummary: '', keyFindings: [], priorityRecommendations: [] };
    try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
        }
    } catch (error) {
        console.error('Failed to parse readiness response:', error);
    }

    // Build area scores
    const areaScores: ReadinessScore[] = session.selectedAreas.map((areaId: string) => {
        const area = getSubArea(areaId);
        const areaData = parsed.areas?.find((a: any) => a.areaId === areaId) || {};
        const score = areaData.score || calculateDefaultScore(session, areaId);

        return {
            areaId,
            areaName: area?.name ?? areaId,
            score,
            maturityLevel: getMaturityLevel(score),
            strengths: areaData.strengths || [],
            weaknesses: areaData.weaknesses || [],
            recommendations: areaData.recommendations || [],
        };
    });

    const overallScore = Math.round(
        areaScores.reduce((sum, a) => sum + a.score, 0) / areaScores.length
    );

    return {
        sessionId,
        generatedAt: new Date(),
        overallScore,
        overallMaturity: getMaturityLevel(overallScore),
        executiveSummary: parsed.executiveSummary || 'Assessment completed.',
        areaScores,
        keyFindings: parsed.keyFindings || [],
        priorityRecommendations: parsed.priorityRecommendations || [],
        chartData: {
            pieChart: areaScores.map(a => ({ name: a.areaName, value: a.score })),
            maturityRadar: areaScores.map(a => ({
                area: a.areaName,
                current: a.score,
                target: 80,
            })),
        },
    };
}

// Generate gap analysis report
export async function generateGapReport(sessionId: string, modelId?: string): Promise<GapReport> {
    const session: any = await getInterviewSession(sessionId);
    if (!session) throw new Error('Session not found');

    const answerContext = buildAnswerContext(session);
    const languageInstructions = getLanguageInstructions(session.language ?? 'en');

    const prompt = `${languageInstructions}\n\n${buildGapReportPrompt(
        answerContext,
        session.conversationContext.identifiedGaps.join(', '),
        session.conversationContext.painPoints.join(', ')
    )}`;

    const response = await generateCompletion(modelId || null, [
        { role: 'user', content: prompt }
    ], { temperature: 0.4 });

    let parsed: any = { executiveSummary: '', gaps: [], quickWins: [], roadmap: [], risks: [] };
    try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
        }
    } catch (error) {
        console.error('Failed to parse gap response:', error);
    }

    // Process gaps with priority
    const gaps: GapItem[] = (parsed.gaps || []).map((g: any, i: number) => ({
        ...g,
        priority: calculatePriority(g.impact, g.effort),
    }));

    const sortedGaps = gaps.sort((a, b) => b.priority - a.priority);

    // Build chart data from gaps
    const categoryNames: Record<string, string> = {
        process: 'Process',
        technology: 'Technology',
        capability: 'Capability',
        data: 'Data',
    };

    const gapsByCategory = Object.entries(categoryNames).map(([key, name]) => {
        const catGaps = gaps.filter(g => g.category === key);
        return {
            name,
            count: catGaps.length,
            highImpact: catGaps.filter(g => g.impact === 'high').length,
        };
    });

    const impactEffortBubble = gaps.map((g: any) => ({
        name: g.gap.length > 30 ? g.gap.substring(0, 30) + '…' : g.gap,
        impact: g.impactScore ?? (g.impact === 'high' ? 8 : g.impact === 'medium' ? 5 : 2),
        effort: g.effortScore ?? (g.effort === 'high' ? 8 : g.effort === 'medium' ? 5 : 2),
        priority: g.priority,
        category: categoryNames[g.category] || g.category,
    }));

    const kpiBarChart = (parsed.kpiScores || []).length > 0
        ? parsed.kpiScores
        : session.selectedAreas.map((areaId: string) => ({
            category: getSubArea(areaId)?.name || areaId,
            score: Math.max(10, 70 - gaps.filter(g => g.category === 'process').length * 5),
            benchmark: 80,
        }));

    const maturityRadar = session.selectedAreas.map((areaId: string) => ({
        area: getSubArea(areaId)?.name || areaId,
        current: Math.max(10, 70 - gaps.filter(g => g.category !== 'data').length * 3),
        target: 80,
        fullMark: 100,
    }));

    // ── Knowledge Graph ──────────────────────────────────────────────────────────
    type KGNodeType = { id: string; label: string; type: 'area' | 'gap' | 'recommendation' | 'category'; impact?: string; description?: string };
    type KGEdgeType = { source: string; target: string; type: string };
    const kgNodes: KGNodeType[] = [];
    const kgEdges: KGEdgeType[] = [];

    // Add category nodes
    const gapCategories = ['process', 'technology', 'capability', 'data'];
    gapCategories.forEach(cat => {
        kgNodes.push({ id: `cat_${cat}`, label: cat.charAt(0).toUpperCase() + cat.slice(1), type: 'category' });
    });

    // Add area nodes + gap nodes + edges
    session.selectedAreas.forEach((areaId: string) => {
        const area = getSubArea(areaId);
        const areaNodeId = `area_${areaId}`;
        kgNodes.push({ id: areaNodeId, label: area?.name ?? areaId, type: 'area' });

        // Gaps for this area (approximate by current state mentions)
        const areaGaps = sortedGaps.filter((g: any) =>
            g.currentState?.toLowerCase().includes(area?.name?.toLowerCase() ?? '') ||
            sortedGaps.indexOf(g) < 3 // fallback: first 3 gaps linked to first area
        );
    });

    // Link each gap to its category
    sortedGaps.slice(0, 20).forEach((g: any, i: number) => {
        const gapId = `gap_${i}`;
        kgNodes.push({ id: gapId, label: g.gap?.substring(0, 30) ?? `Gap ${i + 1}`, type: 'gap', impact: g.impact });

        // Link gap to its category
        kgEdges.push({ source: `cat_${g.category}`, target: gapId, type: 'category-gap' });

        // Link gap to first area (simplified)
        if (session.selectedAreas.length > 0) {
            const areaIdx = i % session.selectedAreas.length;
            kgEdges.push({ source: `area_${session.selectedAreas[areaIdx]}`, target: gapId, type: 'area-gap' });
        }
    });

    // Add recommendation nodes (from roadmap items)
    const allRoadmapItems: string[] = (parsed.roadmap || []).flatMap((p: any) => p.items || []).slice(0, 8);
    allRoadmapItems.forEach((item: string, i: number) => {
        const recId = `rec_${i}`;
        kgNodes.push({ id: recId, label: item.substring(0, 28), type: 'recommendation' });
        // Link recommendations to high-impact gaps
        const highGapIdx = sortedGaps.findIndex((g: any) => g.impact === 'high');
        if (highGapIdx >= 0) {
            kgEdges.push({ source: `gap_${highGapIdx}`, target: recId, type: 'gap-recommendation' });
        }
    });

    // ── Heatmap Data ─────────────────────────────────────────────────────────────
    const impactWeight = (impact: string) => impact === 'high' ? 10 : impact === 'medium' ? 5 : 2;
    const heatmapData = session.selectedAreas.flatMap((areaId: string) => {
        const areaName = getSubArea(areaId)?.name ?? areaId;
        return ['process', 'technology', 'capability', 'data'].map(cat => {
            const catGaps = sortedGaps.filter((g: any) => g.category === cat);
            const areaGaps = catGaps.filter((_: any, idx: number) => idx % session.selectedAreas.length === session.selectedAreas.indexOf(areaId));
            const count = areaGaps.length;
            const severity = count > 0 ? Math.min(10, Math.round(areaGaps.reduce((sum: number, g: any) => sum + impactWeight(g.impact), 0) / count)) : 0;
            return { area: areaName, category: cat.charAt(0).toUpperCase() + cat.slice(1), severity, count };
        });
    });

    // ── Sankey Data ───────────────────────────────────────────────────────────────
    const sankeyNodes: { id: string; name: string; column: 0 | 1 | 2; value: number }[] = [];
    const sankeyLinks: { source: string; target: string; value: number; color?: string }[] = [];

    // Column 0: Current state areas
    session.selectedAreas.slice(0, 5).forEach((areaId: string) => {
        const area = getSubArea(areaId);
        sankeyNodes.push({ id: `cs_${areaId}`, name: area?.name ?? areaId, column: 0, value: 10 });
    });

    // Column 1: Gap categories
    ['process', 'technology', 'capability', 'data'].forEach(cat => {
        const count = sortedGaps.filter((g: any) => g.category === cat).length;
        if (count > 0) {
            sankeyNodes.push({ id: `gap_${cat}`, name: cat.charAt(0).toUpperCase() + cat.slice(1) + ' Gaps', column: 1, value: count });
        }
    });

    // Column 2: Target states
    ['Optimised Process', 'Modern Technology', 'Skilled Workforce', 'Data Governance'].forEach((name, i) => {
        sankeyNodes.push({ id: `ts_${i}`, name, column: 2, value: 8 });
    });

    // Links: areas → gap categories
    session.selectedAreas.slice(0, 5).forEach((areaId: string) => {
        ['process', 'technology', 'capability', 'data'].forEach(cat => {
            const count = sortedGaps.filter((g: any) => g.category === cat).length;
            if (count > 0) {
                sankeyLinks.push({ source: `cs_${areaId}`, target: `gap_${cat}`, value: Math.max(1, Math.floor(count / session.selectedAreas.length)) });
            }
        });
    });

    // Links: gap categories → target states
    ['process', 'technology', 'capability', 'data'].forEach((cat, i) => {
        const count = sortedGaps.filter((g: any) => g.category === cat).length;
        if (count > 0) {
            sankeyLinks.push({ source: `gap_${cat}`, target: `ts_${i % 4}`, value: count, color: '#10b981' });
        }
    });

    // ── Treemap Data ──────────────────────────────────────────────────────────────
    const treemapData = session.selectedAreas.map((areaId: string) => {
        const areaName = getSubArea(areaId)?.name ?? areaId;
        const areaGapsAll = sortedGaps.filter((_: any, idx: number) => idx % session.selectedAreas.length === session.selectedAreas.indexOf(areaId));
        const fallbackGaps = sortedGaps.slice(0, Math.ceil(sortedGaps.length / session.selectedAreas.length));
        const ag = areaGapsAll.length > 0 ? areaGapsAll : fallbackGaps;
        const highCount = ag.filter((g: any) => g.impact === 'high').length;
        const mediumCount = ag.filter((g: any) => g.impact === 'medium').length;
        const lowCount = ag.filter((g: any) => g.impact === 'low').length;
        const avgImpact = ag.length > 0 ? ag.reduce((sum: number, g: any) => sum + impactWeight(g.impact), 0) / ag.length : 0;
        return { name: areaName, value: Math.max(1, ag.length), avgImpact, highCount, mediumCount, lowCount };
    });

    // ── Gauge Data ────────────────────────────────────────────────────────────────
    const gaugeData = maturityRadar.map((r: any) => ({
        area: r.area,
        current: r.current,
        target: r.target,
        max: r.fullMark || 100,
    }));

    const quickWins = parsed.quickWins && Array.isArray(parsed.quickWins) && parsed.quickWins.length > 0
        ? parsed.quickWins.map((qw: any) => typeof qw === 'string' ? gaps.find(g => g.id === qw || g.gap === qw) : qw).filter(Boolean)
        : gaps.filter(g => g.impact === 'high' && g.effort === 'low');

    return {
        sessionId,
        generatedAt: new Date(),
        executiveSummary: parsed.executiveSummary || 'Gap analysis completed.',
        gaps: sortedGaps,
        quickWins,
        roadmap: parsed.roadmap || [],
        riskAssessment: parsed.risks || [],
        chartData: {
            maturityRadar,
            impactEffortBubble,
            kpiBarChart,
            gapsByCategory,
            knowledgeGraph: { nodes: kgNodes, edges: kgEdges },
            heatmapData,
            sankeyData: { nodes: sankeyNodes, links: sankeyLinks },
            treemapData,
            gaugeData,
        },
    };
}

// Helper functions
function buildAnswerContext(session: any): string {
    const lines: string[] = [];

    for (const areaId of session.selectedAreas) {
        const area = getSubArea(areaId);
        const answers = session.responses[areaId] || [];

        if (answers.length > 0) {
            lines.push(`\n## ${area?.name ?? areaId}`);
            for (const qa of answers) {
                lines.push(`Q: ${qa.question}`);
                lines.push(`A: ${JSON.stringify(qa.answer)}`);
            }
        }
    }

    return lines.join('\n');
}

function calculateDefaultScore(session: any, areaId: string): number {
    const answers = session.responses[areaId] || [];
    // Base score on question count
    return Math.min(100, answers.length * 15);
}

function calculatePriority(impact: string, effort: string): number {
    const impactScore = impact === 'high' ? 3 : impact === 'medium' ? 2 : 1;
    const effortScore = effort === 'low' ? 3 : effort === 'medium' ? 2 : 1;
    return impactScore * effortScore;
}

// Generate consolidated report — runs readiness + gap in parallel then merges
export async function generateConsolidatedReport(sessionId: string, modelId?: string): Promise<ConsolidatedReport> {
    const [readiness, gap] = await Promise.all([
        generateReadinessReport(sessionId, modelId),
        generateGapReport(sessionId, modelId),
    ]);

    return {
        sessionId,
        generatedAt: new Date(),
        overallScore: readiness.overallScore,
        overallMaturity: readiness.overallMaturity,
        executiveSummary: readiness.executiveSummary,
        areaScores: readiness.areaScores,
        keyFindings: readiness.keyFindings,
        priorityRecommendations: readiness.priorityRecommendations,
        gaps: gap.gaps,
        quickWins: gap.quickWins,
        roadmap: gap.roadmap,
        riskAssessment: gap.riskAssessment,
        chartData: {
            pieChart: readiness.chartData.pieChart,
            maturityRadar: gap.chartData.maturityRadar,
            impactEffortBubble: gap.chartData.impactEffortBubble,
            kpiBarChart: gap.chartData.kpiBarChart,
            gapsByCategory: gap.chartData.gapsByCategory,
            knowledgeGraph: gap.chartData.knowledgeGraph,
            heatmapData: gap.chartData.heatmapData,
            sankeyData: gap.chartData.sankeyData,
            treemapData: gap.chartData.treemapData,
            gaugeData: gap.chartData.gaugeData,
        },
    };
}
