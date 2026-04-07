import { useState } from 'react';
import { Download, AlertTriangle, Zap, TrendingUp, Shield, Map, BarChart3, Network, Activity } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { MaturityRadarChart } from './charts/MaturityRadarChart';
import { ImpactEffortBubble } from './charts/ImpactEffortBubble';
import { KPIBarChart } from './charts/KPIBarChart';
import { GapsByCategory } from './charts/GapsByCategory';
import { GapKnowledgeGraph, KGNode, KGEdge } from './charts/GapKnowledgeGraph';
import { GapHeatMap, HeatMapCell } from './charts/GapHeatMap';
import { SankeyChart, SankeyNode, SankeyLink } from './charts/SankeyChart';
import { TreeMapChart, TreeMapNode } from './charts/TreeMapChart';
import { GaugeChart, GaugeData } from './charts/GaugeChart';

// Matches the backend GapReport interface (chart-ready)
export interface GapItem {
    id: string;
    category: 'process' | 'technology' | 'capability' | 'data';
    currentState: string;
    targetState: string;
    gap: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'high' | 'medium' | 'low';
    priority: number;
}

export interface GapReport {
    sessionId: string;
    generatedAt: string;
    executiveSummary: string;
    gaps: GapItem[];
    quickWins: GapItem[];
    roadmap: { phase: string; duration: string; items: string[] }[];
    riskAssessment: {
        risk: string;
        likelihood: 'high' | 'medium' | 'low';
        impact: 'high' | 'medium' | 'low';
        mitigation: string;
    }[];
    chartData?: {
        maturityRadar: Array<{ area: string; current: number; target: number; fullMark: number }>;
        impactEffortBubble: Array<{ name: string; impact: number; effort: number; priority: number; category: string }>;
        kpiBarChart: Array<{ category: string; score: number; benchmark: number }>;
        gapsByCategory: Array<{ name: string; count: number; highImpact: number }>;
        heatmapData?: HeatMapCell[];
        sankeyData?: { nodes: SankeyNode[]; links: SankeyLink[] };
        treemapData?: TreeMapNode[];
        gaugeData?: GaugeData[];
        knowledgeGraph?: { nodes: KGNode[]; edges: KGEdge[] };
    };
}

interface GapAnalysisReportProps {
    report: GapReport;
    onClose?: () => void;
}

type Tab = 'summary' | 'kpi' | 'gapmap' | 'roadmap' | 'risks' | 'knowledge' | 'analytics';

const IMPACT_COLOR: Record<string, string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#10b981',
};

function ImpactBadge({ value }: { value: string }) {
    return (
        <span style={{
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '0.7rem',
            fontWeight: 700,
            color: IMPACT_COLOR[value] || '#94a3b8',
            background: `${IMPACT_COLOR[value] || '#94a3b8'}22`,
            border: `1px solid ${IMPACT_COLOR[value] || '#94a3b8'}44`,
            textTransform: 'uppercase',
        }}>
            {value}
        </span>
    );
}

const PHASE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ec4899'];

export function GapAnalysisReport({ report }: GapAnalysisReportProps) {
    const { language, t } = useLanguage();
    const [activeTab, setActiveTab] = useState<Tab>('summary');

    const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
        { id: 'summary', label: t('gap.execSummary'), icon: <BarChart3 size={14} /> },
        { id: 'kpi', label: t('report.kpiDashboard'), icon: <TrendingUp size={14} /> },
        { id: 'gapmap', label: t('report.gapMap'), icon: <Map size={14} /> },
        { id: 'roadmap', label: t('report.roadmapTab'), icon: <Zap size={14} /> },
        { id: 'risks', label: t('report.risks'), icon: <Shield size={14} /> },
        { id: 'knowledge', label: t('gap.knowledgeGraphTab'), icon: <Network size={14} /> },
        { id: 'analytics', label: t('report.analytics'), icon: <Activity size={14} /> },
    ];

    const handlePrint = () => window.print();

    const stats = [
        { label: t('gap.totalGaps'), value: report.gaps.length, color: '#6366f1' },
        { label: t('report.quickWins'), value: report.quickWins.length, color: '#10b981' },
        { label: t('gap.highSeverity'), value: report.gaps.filter(g => g.impact === 'high').length, color: '#ef4444' },
        { label: t('report.roadmapPhases'), value: report.roadmap.length, color: '#f59e0b' },
    ];

    return (
        <div id="gap-analysis-report" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0 0 16px', borderBottom: '1px solid var(--border)',
            }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text)' }}>{t('report.gapAnalysis')}</h2>
                    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {t('report.generated')}{new Date(report.generatedAt).toLocaleString(language)}
                    </p>
                </div>
                <button
                    onClick={handlePrint}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '7px 14px', borderRadius: '7px',
                        border: '1px solid var(--border)', background: 'var(--surface)',
                        color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer',
                    }}
                >
                    <Download size={14} /> {t('report.export')}
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                            fontSize: '0.8rem', fontWeight: activeTab === tab.id ? 600 : 400,
                            background: activeTab === tab.id ? 'var(--primary)' : 'transparent',
                            color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
                            transition: 'all 0.15s',
                        }}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0' }}>

                {/* ── Executive Summary ── */}
                {activeTab === 'summary' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* KPI cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                            {stats.map(s => (
                                <div key={s.label} style={{
                                    background: 'var(--surface)', border: '1px solid var(--border)',
                                    borderRadius: '10px', padding: '16px', textAlign: 'center',
                                    borderTop: `3px solid ${s.color}`,
                                }}>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{s.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Summary text */}
                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
                            <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: 'var(--text)' }}>{t('report.overview')}</h4>
                            <p style={{ margin: 0, lineHeight: 1.7, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                {report.executiveSummary}
                            </p>
                        </div>

                        {/* Quick wins */}
                        {report.quickWins.length > 0 && (
                            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
                                <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Zap size={14} /> {t('report.quickWins')}
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {report.quickWins.map((g, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px', background: '#10b98111', borderRadius: '8px' }}>
                                            <ImpactBadge value={g.impact} />
                                            <div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text)' }}>{g.gap}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{g.category} · {t('report.effortLabel')}{g.effort}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── KPI Dashboard ── */}
                {activeTab === 'kpi' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
                                <h4 style={{ margin: '0 0 16px', fontSize: '0.875rem', color: 'var(--text)' }}>{t('report.maturityRadar')}</h4>
                                {report.chartData?.maturityRadar?.length ? (
                                    <MaturityRadarChart data={report.chartData.maturityRadar} />
                                ) : (
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{t('report.noRadarData')}</p>
                                )}
                            </div>
                            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
                                <h4 style={{ margin: '0 0 16px', fontSize: '0.875rem', color: 'var(--text)' }}>{t('report.kpiScores')}</h4>
                                {report.chartData?.kpiBarChart?.length ? (
                                    <KPIBarChart data={report.chartData.kpiBarChart} />
                                ) : (
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{t('report.noKpiData')}</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Gap Map ── */}
                {activeTab === 'gapmap' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
                            <h4 style={{ margin: '0 0 4px', fontSize: '0.875rem', color: 'var(--text)' }}>{t('report.impactEffortMatrix')}</h4>
                            <p style={{ margin: '0 0 16px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {t('report.impactEffortHint')}
                            </p>
                            {report.chartData?.impactEffortBubble?.length ? (
                                <ImpactEffortBubble data={report.chartData.impactEffortBubble} />
                            ) : (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{t('report.noGapData')}</p>
                            )}
                        </div>
                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
                            <h4 style={{ margin: '0 0 16px', fontSize: '0.875rem', color: 'var(--text)' }}>{t('report.gapsByCategory')}</h4>
                            {report.chartData?.gapsByCategory?.length ? (
                                <GapsByCategory data={report.chartData.gapsByCategory} />
                            ) : (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{t('report.noCategoryData')}</p>
                            )}
                        </div>

                        {/* Gap table */}
                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
                            <h4 style={{ margin: '0 0 14px', fontSize: '0.875rem', color: 'var(--text)' }}>{t('report.allGaps')} ({report.gaps.length})</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {report.gaps.map((g, i) => (
                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '10px', alignItems: 'center', padding: '10px 12px', background: '#ffffff08', borderRadius: '8px' }}>
                                        <div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text)' }}>{g.gap}</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{g.currentState}</div>
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{g.category}</span>
                                        <ImpactBadge value={g.impact} />
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{t('report.effortLabel')}{g.effort}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Roadmap ── */}
                {activeTab === 'roadmap' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {report.roadmap.length === 0 ? (
                            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>{t('report.noRoadmapData')}</p>
                        ) : report.roadmap.map((phase, i) => (
                            <div key={i} style={{
                                background: 'var(--surface)', border: `1px solid ${PHASE_COLORS[i % PHASE_COLORS.length]}44`,
                                borderLeft: `4px solid ${PHASE_COLORS[i % PHASE_COLORS.length]}`,
                                borderRadius: '10px', padding: '18px 20px',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.9rem', color: PHASE_COLORS[i % PHASE_COLORS.length] }}>
                                        {phase.phase}
                                    </h4>
                                    {phase.duration && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--border)', padding: '2px 8px', borderRadius: '10px' }}>
                                            {phase.duration}
                                        </span>
                                    )}
                                </div>
                                <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {phase.items.map((item, j) => (
                                        <li key={j} style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Risks ── */}
                {activeTab === 'risks' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {report.riskAssessment.length === 0 ? (
                            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>{t('report.noRiskData')}</p>
                        ) : report.riskAssessment.map((r, i) => (
                            <div key={i} style={{
                                background: 'var(--surface)', border: '1px solid var(--border)',
                                borderRadius: '10px', padding: '16px 18px',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <AlertTriangle size={14} color={IMPACT_COLOR[r.impact] || '#94a3b8'} />
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>{r.risk}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t('report.likelihood')}</span>
                                        <ImpactBadge value={r.likelihood} />
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t('report.impact')}</span>
                                        <ImpactBadge value={r.impact} />
                                    </div>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                    <strong>{t('report.mitigation')}</strong>{r.mitigation}
                                </p>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Knowledge Graph ── */}
                {activeTab === 'knowledge' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            {t('gap.relationshipMap')}
                        </p>
                        {report.chartData?.knowledgeGraph && report.chartData.knowledgeGraph.nodes.length > 0 ? (
                            <GapKnowledgeGraph
                                nodes={report.chartData.knowledgeGraph.nodes}
                                edges={report.chartData.knowledgeGraph.edges}
                            />
                        ) : (
                            <div style={{
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '10px',
                                padding: '48px 24px',
                                textAlign: 'center',
                            }}>
                                <Network size={32} color="#334155" style={{ marginBottom: '12px' }} />
                                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                    {t('gap.graphPending')}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Analytics ── */}
                {activeTab === 'analytics' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                        {/* Row 1: Heatmap + Sankey */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div style={{
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '10px',
                                padding: '20px',
                            }}>
                                <h4 style={{ margin: '0 0 16px', fontSize: '0.875rem', color: 'var(--text)' }}>
                                    {t('report.gapHeatmap')}
                                </h4>
                                <GapHeatMap data={report.chartData?.heatmapData ?? []} />
                            </div>

                            <div style={{
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '10px',
                                padding: '20px',
                            }}>
                                <h4 style={{ margin: '0 0 16px', fontSize: '0.875rem', color: 'var(--text)' }}>
                                    {t('report.processFlow')}
                                </h4>
                                {report.chartData?.sankeyData && report.chartData.sankeyData.nodes.length > 0 ? (
                                    <SankeyChart
                                        nodes={report.chartData.sankeyData.nodes}
                                        links={report.chartData.sankeyData.links}
                                    />
                                ) : (
                                    <div style={{ padding: '40px', textAlign: 'center' }}>
                                        <Activity size={28} color="#334155" style={{ marginBottom: '8px' }} />
                                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                            {t('report.noFlowData')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Priority Treemap - full width */}
                        <div style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            padding: '20px',
                        }}>
                            <h4 style={{ margin: '0 0 16px', fontSize: '0.875rem', color: 'var(--text)' }}>
                                {t('report.priorityTreemap')}
                            </h4>
                            <TreeMapChart data={report.chartData?.treemapData ?? []} />
                        </div>

                        {/* Maturity Gauges - full width */}
                        <div style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            padding: '20px',
                        }}>
                            <h4 style={{ margin: '0 0 16px', fontSize: '0.875rem', color: 'var(--text)' }}>
                                {t('report.maturityGauges')}
                            </h4>
                            <GaugeChart data={report.chartData?.gaugeData ?? []} />
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @media print {
                    #gap-analysis-report { color: #1a1a2e !important; background: #fff !important; }
                    #gap-analysis-report * { color: #1a1a2e !important; background: transparent !important; border-color: #ddd !important; }
                }
            `}</style>
        </div>
    );
}
