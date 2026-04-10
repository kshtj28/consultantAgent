import { useState } from 'react';
import {
    X, Download, BarChart3, TrendingUp, Table2, Zap, Shield, Network, AlertTriangle,
} from 'lucide-react';
import { MaturityRadarChart } from './charts/MaturityRadarChart';
import { GapKnowledgeGraph, type KGNode, type KGEdge } from './charts/GapKnowledgeGraph';
import './ConsolidatedReportModal.css';

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = 'executive' | 'areas' | 'gaps' | 'roadmap' | 'risks' | 'knowledge';

interface AreaScore {
    areaName: string;
    score: number;
    maturityLevel: string;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
}

interface GapItem {
    id?: string;
    category: string;
    area: string;
    currentState: string;
    gap: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'high' | 'medium' | 'low';
    fit?: 'gap' | 'partial' | 'fit';
    standard?: string;
}

interface ReportData {
    generatedAt?: string;
    overallScore?: number;
    overallMaturity?: string;
    executiveSummary?: string;
    areaScores?: AreaScore[];
    keyFindings?: string[];
    priorityRecommendations?: string[];
    gaps?: GapItem[];
    roadmap?: { phase: string; duration: string; items: string[] }[];
    riskAssessment?: { risk: string; likelihood: string; impact: string; mitigation: string }[];
    chartData?: {
        maturityRadar?: { area: string; current: number; target: number; fullMark?: number }[];
        knowledgeGraph?: { nodes: KGNode[]; edges: KGEdge[] };
    };
}

export interface ConsolidatedReportModalProps {
    report: ReportData;
    reportName: string;
    reportType: string;
    onClose: () => void;
    onDownloadPDF: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const IMPACT_COLOR: Record<string, string> = {
    high: '#ef4444', medium: '#f59e0b', low: '#10b981',
};

const FIT_COLOR: Record<string, string> = {
    gap: '#ef4444', partial: '#f59e0b', fit: '#10b981',
};

// Map effort level → size label shown in Gap Register
const SIZE_MAP: Record<string, string> = { high: 'L', medium: 'M', low: 'S' };
const SIZE_BG:  Record<string, string> = { L: 'rgba(239,68,68,0.15)', M: 'rgba(245,158,11,0.15)', S: 'rgba(16,185,129,0.15)' };
const SIZE_COLOR: Record<string, string> = { L: '#ef4444', M: '#f59e0b', S: '#10b981' };

const PHASE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ec4899'];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ImpactBadge({ value }: { value: string }) {
    const color = IMPACT_COLOR[value] ?? '#94a3b8';
    return (
        <span className="crm__badge" style={{ color, background: `${color}22`, border: `1px solid ${color}44` }}>
            {value}
        </span>
    );
}

function FitBadge({ value }: { value: string }) {
    const color = FIT_COLOR[value] ?? '#94a3b8';
    return (
        <span className="crm__badge" style={{ color, background: `${color}22`, border: `1px solid ${color}44` }}>
            {value}
        </span>
    );
}

function ScoreRing({ score }: { score: number }) {
    const r = 52;
    const circumference = 2 * Math.PI * r;
    const offset = circumference - (score / 100) * circumference;
    const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
    return (
        <svg width="130" height="130" style={{ flexShrink: 0 }}>
            <circle cx="65" cy="65" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
            <circle
                cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="10"
                strokeDasharray={circumference} strokeDashoffset={offset}
                strokeLinecap="round" transform="rotate(-90 65 65)"
                style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
            <text x="65" y="60" textAnchor="middle"
                style={{ fill: 'var(--text)', fontSize: '1.8rem', fontWeight: 700, fontFamily: 'inherit' }}>
                {score}
            </text>
            <text x="65" y="78" textAnchor="middle"
                style={{ fill: 'var(--text-secondary)', fontSize: '0.7rem', fontFamily: 'inherit' }}>
                / 100
            </text>
        </svg>
    );
}

function buildSyntheticGraph(gaps: GapItem[]): { nodes: KGNode[]; edges: KGEdge[] } {
    const areas = Array.from(new Set(gaps.map(g => g.area || 'General')));
    const categories = Array.from(new Set(gaps.map(g => g.category)));
    const topGaps = gaps.slice(0, 15);
    const nodes: KGNode[] = [
        ...areas.map((area, i) => ({ id: `area_${i}`, label: area, type: 'area' as const })),
        ...categories.map(cat => ({ id: `cat_${cat}`, label: cat.charAt(0).toUpperCase() + cat.slice(1), type: 'category' as const })),
        ...topGaps.map((g, i) => ({ id: `gap_${i}`, label: (g.gap ?? `Gap ${i + 1}`).substring(0, 28), type: 'gap' as const, impact: g.impact })),
    ];
    const edges: KGEdge[] = [
        ...topGaps.map((g, i) => ({ source: `area_${areas.indexOf(g.area || 'General')}`, target: `gap_${i}`, type: 'area-gap' as const })),
        ...topGaps.map((g, i) => ({ source: `cat_${g.category}`, target: `gap_${i}`, type: 'category-gap' as const })),
    ];
    return { nodes, edges };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ConsolidatedReportModal({
    report, reportName, reportType, onClose, onDownloadPDF,
}: ConsolidatedReportModalProps) {
    const [activeTab, setActiveTab] = useState<TabId>('executive');
    const [sortCol, setSortCol] = useState<'impact' | 'effort' | 'area' | 'category' | 'fit' | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const TABS: { id: TabId; label: string; Icon: typeof BarChart3 }[] = [
        { id: 'executive', label: 'Executive Summary', Icon: BarChart3 },
        { id: 'areas',     label: 'Area Assessments', Icon: TrendingUp },
        { id: 'gaps',      label: 'Gap Register',     Icon: Table2 },
        { id: 'roadmap',   label: 'Roadmap',          Icon: Zap },
        { id: 'risks',     label: 'Risks',            Icon: Shield },
        { id: 'knowledge', label: 'Knowledge Graph',  Icon: Network },
    ];

    const gaps: GapItem[] = report.gaps ?? [];

    const handleSort = (col: typeof sortCol) => {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('asc'); }
    };

    const ORDER = ['high', 'medium', 'low'];
    const FIT_ORDER = ['gap', 'partial', 'fit'];

    const sortedGaps = [...gaps].sort((a, b) => {
        if (!sortCol) return 0;
        let cmp = 0;
        switch (sortCol) {
            case 'impact':   cmp = ORDER.indexOf(a.impact) - ORDER.indexOf(b.impact); break;
            case 'effort':   cmp = ORDER.indexOf(a.effort) - ORDER.indexOf(b.effort); break;
            case 'fit':      cmp = FIT_ORDER.indexOf(a.fit ?? 'gap') - FIT_ORDER.indexOf(b.fit ?? 'gap'); break;
            case 'area':     cmp = (a.area ?? '').localeCompare(b.area ?? ''); break;
            case 'category': cmp = a.category.localeCompare(b.category); break;
        }
        return sortDir === 'asc' ? cmp : -cmp;
    });

    const SortIcon = ({ col }: { col: typeof sortCol }) => (
        <span style={{ marginLeft: 4, opacity: sortCol === col ? 1 : 0.35, fontSize: '0.7rem' }}>
            {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
    );

    // Ensure maturityRadar always has fullMark (MaturityRadarChart requires it)
    const radarData = (report.chartData?.maturityRadar ?? []).map(d => ({
        ...d, fullMark: d.fullMark ?? 100,
    }));

    const kgData = report.chartData?.knowledgeGraph
        ?? (gaps.length > 0 ? buildSyntheticGraph(gaps) : null);

    return (
        <div className="crm-overlay" onClick={onClose}>
            <div className="crm" onClick={e => e.stopPropagation()}>

                {/* ── Header ── */}
                <div className="crm__header">
                    <div>
                        <h2 className="crm__title">
                            <AlertTriangle size={18} color="#f59e0b" />
                            {reportName}
                        </h2>
                        {report.generatedAt && (
                            <p className="crm__meta">
                                {reportType} · Generated {new Date(report.generatedAt).toLocaleString()}
                            </p>
                        )}
                    </div>
                    <div className="crm__header-actions">
                        <button className="crm__btn" onClick={onDownloadPDF}>
                            <Download size={14} /> Export PDF
                        </button>
                        <button className="crm__btn crm__btn--icon" onClick={onClose}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* ── Tabs ── */}
                <div className="crm__tabs">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            className={`crm__tab${activeTab === tab.id ? ' crm__tab--active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <tab.Icon size={14} /> {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── Body ── */}
                <div className="crm__body">

                    {/* Executive Summary */}
                    {activeTab === 'executive' && (
                        <>
                            {/* Score ring — only for readiness reports that return overallScore */}
                            {report.overallScore !== undefined && (
                                <div className="crm__score-row">
                                    <ScoreRing score={report.overallScore} />
                                    <div className="crm__score-info">
                                        {report.overallMaturity && (
                                            <span className="crm__maturity-badge">{report.overallMaturity}</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Executive summary text — shown for all report types */}
                            {report.executiveSummary ? (
                                <div className="crm__card">
                                    <h4 className="crm__card-title">Executive Summary</h4>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                                        {report.executiveSummary}
                                    </p>
                                </div>
                            ) : (
                                <div className="crm__empty">No executive summary available.</div>
                            )}

                            {(report.keyFindings?.length ?? 0) > 0 && (
                                <div className="crm__card">
                                    <h4 className="crm__card-title">Key Findings</h4>
                                    <ul className="crm__list">{report.keyFindings!.map((f, i) => <li key={i}>{f}</li>)}</ul>
                                </div>
                            )}
                            {(report.priorityRecommendations?.length ?? 0) > 0 && (
                                <div className="crm__card">
                                    <h4 className="crm__card-title">Priority Recommendations</h4>
                                    <ul className="crm__list">{report.priorityRecommendations!.map((r, i) => <li key={i}>{r}</li>)}</ul>
                                </div>
                            )}
                        </>
                    )}

                    {/* Area Assessments */}
                    {activeTab === 'areas' && (
                        <>
                            {radarData.length > 0 && (
                                <div className="crm__card">
                                    <h4 className="crm__card-title">Maturity Radar</h4>
                                    <MaturityRadarChart data={radarData} />
                                </div>
                            )}

                            {/* Full area scores (readiness reports) */}
                            {(report.areaScores?.length ?? 0) > 0 ? report.areaScores!.map(area => (
                                <div key={area.areaName} className="crm__area">
                                    <div className="crm__area-header">
                                        <span className="crm__area-name">{area.areaName}</span>
                                        <span className="crm__area-score">{area.score}/100</span>
                                        <span className="crm__maturity-badge" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                                            {area.maturityLevel}
                                        </span>
                                    </div>
                                    <div className="crm__area-bar-bg">
                                        <div className="crm__area-bar-fill" style={{ width: `${area.score}%` }} />
                                    </div>
                                    {area.strengths?.length > 0 && (
                                        <div className="crm__tag-row">
                                            <span className="crm__tag crm__tag--success">Strengths</span>
                                            {area.strengths.map((s, i) => (
                                                <span key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                                    {s}{i < area.strengths.length - 1 ? ' ·' : ''}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {area.weaknesses?.length > 0 && (
                                        <div className="crm__tag-row">
                                            <span className="crm__tag crm__tag--error">Weaknesses</span>
                                            {area.weaknesses.map((w, i) => (
                                                <span key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                                    {w}{i < area.weaknesses.length - 1 ? ' ·' : ''}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {area.recommendations?.length > 0 && (
                                        <div className="crm__tag-row">
                                            <span className="crm__tag crm__tag--primary">Recommendations</span>
                                            {area.recommendations.map((r, i) => (
                                                <span key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                                    {r}{i < area.recommendations.length - 1 ? ' ·' : ''}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                            /* Fallback for gap analysis reports — use maturityRadar data */
                            )) : radarData.length > 0 ? radarData.map(area => {
                                const current = area.current ?? 0;
                                const target = area.target ?? 80;
                                const maturity = current >= 80 ? 'Optimized' : current >= 60 ? 'Managed' : current >= 40 ? 'Defined' : current >= 20 ? 'Developing' : 'Initial';
                                const maturityColor = current >= 60 ? '#10b981' : current >= 40 ? '#f59e0b' : '#ef4444';
                                return (
                                    <div key={area.area} className="crm__area">
                                        <div className="crm__area-header">
                                            <span className="crm__area-name">{area.area}</span>
                                            <span className="crm__area-score">{current}/100</span>
                                            <span className="crm__maturity-badge" style={{ fontSize: '0.7rem', padding: '2px 8px', color: maturityColor, borderColor: maturityColor }}>
                                                {maturity}
                                            </span>
                                        </div>
                                        <div className="crm__area-bar-bg">
                                            <div className="crm__area-bar-fill" style={{ width: `${current}%` }} />
                                        </div>
                                        <div className="crm__tag-row" style={{ marginTop: '0.5rem' }}>
                                            <span className="crm__tag crm__tag--primary">Target</span>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                                {target}/100 — close the {target - current} point gap through transformation initiatives
                                            </span>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="crm__empty">No area assessment data available.</div>
                            )}
                        </>
                    )}

                    {/* Gap Register */}
                    {activeTab === 'gaps' && (
                        <>
                            <div className="crm__stat-row">
                                {[
                                    { label: 'Total Gaps',    value: gaps.length,                                  color: '#6366f1' },
                                    { label: 'High Severity', value: gaps.filter(g => g.impact === 'high').length, color: '#ef4444' },
                                    { label: 'Major Gaps',    value: gaps.filter(g => g.fit === 'gap').length,     color: '#f59e0b' },
                                    { label: 'Already Fit',   value: gaps.filter(g => g.fit === 'fit').length,     color: '#10b981' },
                                ].map(s => (
                                    <div key={s.label} className="crm__stat-card" style={{ borderTop: `3px solid ${s.color}` }}>
                                        <div className="crm__stat-value" style={{ color: s.color }}>{s.value}</div>
                                        <div className="crm__stat-label">{s.label}</div>
                                    </div>
                                ))}
                            </div>
                            {gaps.length > 0 ? (
                                <div className="crm__table-wrap">
                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="crm__table">
                                            <thead>
                                                <tr>
                                                    <th className="crm__th">ID</th>
                                                    <th className="crm__th" onClick={() => handleSort('impact')}>Severity <SortIcon col="impact" /></th>
                                                    <th className="crm__th" onClick={() => handleSort('area')}>Area <SortIcon col="area" /></th>
                                                    <th className="crm__th" onClick={() => handleSort('category')}>Type <SortIcon col="category" /></th>
                                                    <th className="crm__th" onClick={() => handleSort('fit')}>Fit <SortIcon col="fit" /></th>
                                                    <th className="crm__th" onClick={() => handleSort('effort')}>Size <SortIcon col="effort" /></th>
                                                    <th className="crm__th" style={{ minWidth: 220 }}>Description</th>
                                                    <th className="crm__th" style={{ minWidth: 160 }}>SAP Standard</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedGaps.map((g, idx) => {
                                                    const size = SIZE_MAP[g.effort] ?? 'M';
                                                    const sap = g.standard || (
                                                        g.fit === 'gap'     ? `SAP S/4HANA ${g.area}` :
                                                        g.fit === 'partial' ? `SAP BPC ${g.area}`     :
                                                        `SAP Standard ${g.area}`
                                                    );
                                                    return (
                                                        <tr key={g.id ?? idx}
                                                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                            style={{ transition: 'background 0.1s' }}
                                                        >
                                                            <td className="crm__td crm__gap-id">
                                                                {g.id ?? `GAP-${String(idx + 1).padStart(4, '0')}`}
                                                            </td>
                                                            <td className="crm__td"><ImpactBadge value={g.impact} /></td>
                                                            <td className="crm__td" style={{ minWidth: 120 }}>
                                                                <span style={{ fontSize: '0.78rem', color: 'var(--text)' }}>{g.area || '—'}</span>
                                                            </td>
                                                            <td className="crm__td">
                                                                <span style={{ padding: '2px 7px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600, background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', textTransform: 'capitalize' }}>
                                                                    {g.category}
                                                                </span>
                                                            </td>
                                                            <td className="crm__td"><FitBadge value={g.fit ?? 'gap'} /></td>
                                                            <td className="crm__td">
                                                                <span className="crm__size-badge" style={{ background: SIZE_BG[size], color: SIZE_COLOR[size] }}>
                                                                    {size}
                                                                </span>
                                                            </td>
                                                            <td className="crm__td" style={{ maxWidth: 300 }}>
                                                                <div className="crm__td-main">{g.gap}</div>
                                                                {g.currentState && <div className="crm__td-sub">→ {g.currentState}</div>}
                                                            </td>
                                                            <td className="crm__td crm__sap-standard">{sap}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <div className="crm__empty">No gap data available.</div>
                            )}
                        </>
                    )}

                    {/* Roadmap */}
                    {activeTab === 'roadmap' && (
                        <>
                            {(report.roadmap?.length ?? 0) > 0 ? report.roadmap!.map((phase, i) => (
                                <div key={i} className="crm__phase"
                                    style={{ borderLeft: `4px solid ${PHASE_COLORS[i % PHASE_COLORS.length]}` }}>
                                    <div className="crm__phase-header">
                                        <span className="crm__phase-name" style={{ color: PHASE_COLORS[i % PHASE_COLORS.length] }}>
                                            {phase.phase}
                                        </span>
                                        {phase.duration && <span className="crm__phase-dur">{phase.duration}</span>}
                                    </div>
                                    <ul className="crm__list">{phase.items.map((item, j) => <li key={j}>{item}</li>)}</ul>
                                </div>
                            )) : (
                                <div className="crm__empty">No roadmap data available.</div>
                            )}
                        </>
                    )}

                    {/* Risks */}
                    {activeTab === 'risks' && (
                        <>
                            {(report.riskAssessment?.length ?? 0) > 0 ? report.riskAssessment!.map((r, i) => (
                                <div key={i} className="crm__risk">
                                    <div className="crm__risk-header">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <AlertTriangle size={14} color={IMPACT_COLOR[r.impact] ?? '#94a3b8'} />
                                            <span className="crm__risk-name">{r.risk}</span>
                                        </div>
                                        <div className="crm__risk-badges">
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Likelihood</span>
                                            <ImpactBadge value={r.likelihood} />
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Impact</span>
                                            <ImpactBadge value={r.impact} />
                                        </div>
                                    </div>
                                    <p className="crm__risk-mitigation"><strong>Mitigation: </strong>{r.mitigation}</p>
                                </div>
                            )) : (
                                <div className="crm__empty">No risk data available.</div>
                            )}
                        </>
                    )}

                    {/* Knowledge Graph */}
                    {activeTab === 'knowledge' && (
                        <>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                Relationship map between process areas, gap categories, and individual gaps.{' '}
                                <strong style={{ color: 'var(--text)' }}>Drag nodes to explore.</strong>
                            </p>
                            {kgData ? (
                                <GapKnowledgeGraph nodes={kgData.nodes} edges={kgData.edges} />
                            ) : (
                                <div className="crm__empty">
                                    <Network size={32} color="#334155" style={{ marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
                                    No gap data available to build knowledge graph.
                                </div>
                            )}
                        </>
                    )}

                </div>
            </div>
        </div>
    );
}
