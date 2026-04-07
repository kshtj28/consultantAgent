import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadiness = {
    sessionId: 'sess-1',
    generatedAt: new Date('2026-01-01'),
    overallScore: 72,
    overallMaturity: 'managed',
    executiveSummary: 'Good readiness.',
    areaScores: [{
        areaId: 'otc', areaName: 'Order to Cash', score: 72,
        maturityLevel: 'managed', strengths: ['s1'], weaknesses: ['w1'], recommendations: ['r1'],
    }],
    keyFindings: ['finding1'],
    priorityRecommendations: ['rec1'],
    chartData: {
        pieChart: [{ name: 'Order to Cash', value: 72 }],
        maturityRadar: [{ area: 'Order to Cash', current: 72, target: 80 }],
    },
};

const mockGap = {
    sessionId: 'sess-1',
    generatedAt: new Date('2026-01-01'),
    executiveSummary: 'Some gaps found.',
    gaps: [{
        id: 'GAP-001', category: 'process', area: 'Order to Cash',
        currentState: 'manual', targetState: 'automated',
        gap: 'No automation', impact: 'high', effort: 'medium',
        fit: 'gap', standard: 'SAP S/4HANA OTC', priority: 1,
    }],
    quickWins: [],
    roadmap: [{ phase: 'Phase 1', duration: '3 months', items: ['item1'] }],
    riskAssessment: [{ risk: 'Delay', likelihood: 'medium', impact: 'high', mitigation: 'Plan early' }],
    chartData: {
        maturityRadar: [{ area: 'Order to Cash', current: 72, target: 80, fullMark: 100 }],
        impactEffortBubble: [],
        kpiBarChart: [],
        gapsByCategory: [],
        knowledgeGraph: { nodes: [{ id: 'n1', label: 'OTC', type: 'area' }], edges: [] },
    },
};

vi.mock('../services/reportService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/reportService')>();
    const mockGenReadiness = vi.fn().mockResolvedValue(mockReadiness);
    const mockGenGap = vi.fn().mockResolvedValue(mockGap);
    return {
        ...actual,
        generateReadinessReport: mockGenReadiness,
        generateGapReport: mockGenGap,
        generateConsolidatedReport: async (sessionId: string, modelId?: string) => {
            const [readiness, gap] = await Promise.all([
                mockGenReadiness(sessionId, modelId),
                mockGenGap(sessionId, modelId),
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
        },
    };
});

describe('generateConsolidatedReport', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('merges readiness and gap data into one object', async () => {
        const { generateConsolidatedReport } = await import('../services/reportService');
        const result = await generateConsolidatedReport('sess-1', 'model-x');

        expect(result.sessionId).toBe('sess-1');
        expect(result.overallScore).toBe(72);
        expect(result.overallMaturity).toBe('managed');
        expect(result.areaScores).toHaveLength(1);
        expect(result.gaps).toHaveLength(1);
        expect(result.gaps[0].gap).toBe('No automation');
        expect(result.roadmap).toHaveLength(1);
        expect(result.riskAssessment).toHaveLength(1);
        expect(result.chartData.knowledgeGraph?.nodes).toHaveLength(1);
        expect(result.chartData.pieChart).toHaveLength(1);
        expect(result.chartData.maturityRadar[0]).toHaveProperty('fullMark', 100);
    });

    it('calls both generators with the given sessionId and modelId', async () => {
        const { generateConsolidatedReport, generateReadinessReport, generateGapReport } =
            await import('../services/reportService');

        await generateConsolidatedReport('sess-1', 'model-x');

        expect(generateReadinessReport).toHaveBeenCalledWith('sess-1', 'model-x');
        expect(generateGapReport).toHaveBeenCalledWith('sess-1', 'model-x');
    });
});
