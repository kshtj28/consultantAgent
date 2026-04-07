import { useState } from 'react';
import { X, Download, ClipboardList, Table2, Network, Bot, User, AlertTriangle, type LucideIcon } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { GapKnowledgeGraph, type KGNode, type KGEdge } from './charts/GapKnowledgeGraph';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GapItemEnhanced {
    id: string;
    category: 'process' | 'technology' | 'capability' | 'data';
    area: string;
    currentState: string;
    targetState: string;
    gap: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'high' | 'medium' | 'low';
    fit: 'gap' | 'partial' | 'fit';
    standard: string;
    priority: number;
}

export interface GapReportEnhanced {
    sessionId?: string;
    generatedAt?: string;
    executiveSummary: string;
    gaps: GapItemEnhanced[];
    quickWins?: GapItemEnhanced[];
    roadmap?: { phase: string; duration: string; items: string[] }[];
    riskAssessment?: {
        risk: string;
        likelihood?: 'high' | 'medium' | 'low';
        impact: 'high' | 'medium' | 'low';
        mitigation: string;
    }[];
    chartData?: {
        knowledgeGraph?: { nodes: KGNode[]; edges: KGEdge[] };
    };
}

export interface QAEntry {
    question: string;
    answer: string | string[] | number | boolean;
    type: string;
    categoryId: string;
    categoryName?: string;
}

// ─── Data Normalization ───────────────────────────────────────────────────────
// The backend may return either the OLD schema (gapIdentification.processGaps …)
// or the NEW schema (gaps[]).  This adapter always produces the new shape.

interface LegacyGapItem {
    gap: string;
    impact: 'high' | 'medium' | 'low';
    description?: string;
}

interface LegacyReport {
    gapIdentification?: {
        processGaps?: LegacyGapItem[];
        technologyGaps?: LegacyGapItem[];
        capabilityGaps?: LegacyGapItem[];
        dataGaps?: LegacyGapItem[];
    };
    gaps?: GapItemEnhanced[];
    executiveSummary?: string;
    [key: string]: unknown;
}

function normalizeGaps(raw: LegacyReport): GapItemEnhanced[] {
    // New schema: already has gaps[]
    if (Array.isArray(raw.gaps) && raw.gaps.length > 0) {
        return raw.gaps.map((g: any, i: number) => ({
            id: g.id ?? `GAP-${String(i + 1).padStart(3, '0')}`,
            category: g.category ?? 'process',
            area: g.area ?? 'General',
            currentState: g.currentState ?? '',
            targetState: g.targetState ?? '',
            gap: g.gap ?? g.title ?? '',
            impact: g.impact ?? 'medium',
            effort: g.effort ?? 'medium',
            fit: g.fit ?? 'gap',
            standard: g.standard ?? '',
            priority: g.priority ?? i + 1,
        }));
    }

    // Old schema: flatten gapIdentification into gaps[]
    const gi = raw.gapIdentification;
    if (!gi) return [];

    const typedBuckets: { bucket: LegacyGapItem[] | undefined; category: GapItemEnhanced['category'] }[] = [
        { bucket: gi.processGaps, category: 'process' },
        { bucket: gi.technologyGaps, category: 'technology' },
        { bucket: gi.capabilityGaps, category: 'capability' },
        { bucket: gi.dataGaps, category: 'data' },
    ];

    let idx = 0;
    return typedBuckets.flatMap(({ bucket, category }) =>
        (bucket ?? []).map((g): GapItemEnhanced => ({
            id: `GAP-${String(++idx).padStart(3, '0')}`,
            category,
            area: 'General',
            currentState: g.description ?? '',
            targetState: '',
            gap: g.gap,
            impact: g.impact ?? 'medium',
            effort: 'medium',
            fit: 'gap',
            standard: '',
            priority: idx,
        }))
    );
}

interface GapAnalysisModalProps {
    report: GapReportEnhanced;
    qaHistory?: QAEntry[];
    onClose: () => void;
    onDownloadPDF?: () => void;
    domainName?: string;
}


// ─── Tab Config ───────────────────────────────────────────────────────────────

type TabId = 'overview' | 'gap_report' | 'knowledge_graph';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<string, { bg: string; text: string; border: string }> = {
    high: { bg: 'rgba(239,68,68,0.12)', text: '#ef4444', border: 'rgba(239,68,68,0.35)' },
    medium: { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', border: 'rgba(245,158,11,0.35)' },
    low: { bg: 'rgba(16,185,129,0.12)', text: '#10b981', border: 'rgba(16,185,129,0.35)' },
};

const FIT_STYLE: Record<string, { bg: string; text: string }> = {
    gap: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
    partial: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
    fit: { bg: 'rgba(16,185,129,0.15)', text: '#10b981' },
};

function Badge({ value, styles }: { value: string; styles?: { bg: string; text: string; border?: string } }) {
    const s = styles ?? SEVERITY_STYLE[value] ?? SEVERITY_STYLE['medium'];
    return (
        <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            background: s.bg,
            color: s.text,
            border: `1px solid ${s.border ?? s.text}44`,
            whiteSpace: 'nowrap',
        }}>
            {value}
        </span>
    );
}

function formatAnswer(a: string | string[] | number | boolean): string {
    if (Array.isArray(a)) return a.join(', ');
    return String(a);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function GapAnalysisModal({
    report,
    qaHistory = [],
    onClose,
    onDownloadPDF,
    domainName,
}: GapAnalysisModalProps) {
    const { language, t } = useLanguage();
    const [activeTab, setActiveTab] = useState<TabId>('overview');

    const TABS: { id: TabId; label: string; Icon: LucideIcon }[] = [
        { id: 'overview', label: t('gap.overviewTab'), Icon: ClipboardList },
        { id: 'gap_report', label: t('gap.gapReportTab'), Icon: Table2 },
        { id: 'knowledge_graph', label: t('gap.knowledgeGraphTab'), Icon: Network },
    ];
    const [sortCol, setSortCol] = useState<'impact' | 'effort' | 'area' | 'type' | 'fit' | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const gaps: GapItemEnhanced[] = normalizeGaps(report as any);

    // Sorting
    const handleSort = (col: typeof sortCol) => {
        if (sortCol === col) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCol(col);
            setSortDir('asc');
        }
    };

    const sortedGaps = [...gaps].sort((a, b) => {
        if (!sortCol) return 0;
        const order = ['high', 'medium', 'low'];
        const fitOrder = ['gap', 'partial', 'fit'];
        let cmp = 0;
        switch (sortCol) {
            case 'impact': cmp = order.indexOf(a.impact) - order.indexOf(b.impact); break;
            case 'effort': cmp = order.indexOf(a.effort) - order.indexOf(b.effort); break;
            case 'fit': cmp = fitOrder.indexOf(a.fit ?? 'gap') - fitOrder.indexOf(b.fit ?? 'gap'); break;
            case 'area': cmp = (a.area ?? '').localeCompare(b.area ?? '', language); break;
            case 'type': cmp = a.category.localeCompare(b.category, language); break;
        }
        return sortDir === 'asc' ? cmp : -cmp;
    });

    // Group Q&A by category
    const qaByCategory = qaHistory.reduce((acc, qa) => {
        const key = qa.categoryName ?? qa.categoryId ?? 'General';
        if (!acc[key]) acc[key] = [];
        acc[key].push(qa);
        return acc;
    }, {} as Record<string, QAEntry[]>);

    const SortIcon = ({ col }: { col: typeof sortCol }) => (
        <span style={{ marginLeft: 4, opacity: sortCol === col ? 1 : 0.35, fontSize: '0.7rem' }}>
            {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
    );

    const thStyle: React.CSSProperties = {
        padding: '10px 12px',
        fontSize: '0.72rem',
        fontWeight: 700,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        textAlign: 'left',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        userSelect: 'none',
    };

    const tdStyle: React.CSSProperties = {
        padding: '10px 12px',
        fontSize: '0.8rem',
        color: 'var(--text)',
        borderBottom: '1px solid var(--border)',
        verticalAlign: 'top',
    };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'stretch',
            }}
            onClick={onClose}
        >
            <div
                id="gap-analysis-modal-content"
                style={{
                    margin: '24px auto',
                    width: 'min(1100px, 96vw)',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
                    maxHeight: 'calc(100vh - 48px)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* ── Modal Header ── */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '18px 24px', borderBottom: '1px solid var(--border)',
                    flexShrink: 0,
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={18} color="#f59e0b" />
                            {domainName ? `${domainName} ` : ''}{t('report.gapAnalysis')}
                        </h2>
                        {report.generatedAt && (
                            <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {t('report.generated')}{new Date(report.generatedAt).toLocaleString(language)}
                            </p>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {onDownloadPDF && (
                            <button
                                onClick={onDownloadPDF}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '7px 14px', borderRadius: '8px',
                                    border: '1px solid var(--border)', background: 'var(--surface)',
                                    color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer',
                                }}
                            >
                                <Download size={14} /> {t('report.export')} PDF
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            style={{
                                width: 36, height: 36, borderRadius: '8px',
                                border: '1px solid var(--border)', background: 'var(--surface)',
                                color: 'var(--text-secondary)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* ── Tabs ── */}
                <div style={{
                    display: 'flex', gap: 4, padding: '12px 24px 0',
                    borderBottom: '1px solid var(--border)', flexShrink: 0,
                }}>
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '8px 16px', borderRadius: '8px 8px 0 0',
                                border: 'none', cursor: 'pointer', fontSize: '0.82rem',
                                fontWeight: activeTab === tab.id ? 700 : 400,
                                background: activeTab === tab.id ? 'var(--primary)' : 'transparent',
                                color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
                                transition: 'all 0.15s',
                                marginBottom: -1,
                                borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                            }}
                        >
                            {<tab.Icon size={15} />} {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── Tab Content ── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

                    {/* ── Overview Tab ── */}
                    {activeTab === 'overview' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            {/* Executive Summary */}
                            <div style={{
                                background: 'var(--surface)', border: '1px solid var(--border)',
                                borderRadius: 10, padding: 20,
                            }}>
                                <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: 'var(--text)' }}>
                                    {t('gap.execSummary')}
                                </h4>
                                <p style={{ margin: 0, lineHeight: 1.7, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                    {report.executiveSummary}
                                </p>
                            </div>

                            {/* Q&A by category */}
                            {Object.keys(qaByCategory).length > 0 ? (
                                Object.entries(qaByCategory).map(([category, qas]) => (
                                    <div key={category} style={{
                                        background: 'var(--surface)', border: '1px solid var(--border)',
                                        borderRadius: 10, overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            padding: '12px 20px',
                                            borderBottom: '1px solid var(--border)',
                                            background: 'rgba(99,102,241,0.06)',
                                        }}>
                                            <h4 style={{ margin: 0, fontSize: '0.875rem', color: '#a5b4fc', fontWeight: 600 }}>
                                                {category}
                                            </h4>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                            {qas.map((qa, i) => (
                                                <div key={i} style={{
                                                    padding: '14px 20px',
                                                    borderBottom: i < qas.length - 1 ? '1px solid var(--border)' : 'none',
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                                                        <Bot size={14} color="#6366f1" style={{ marginTop: 2, flexShrink: 0 }} />
                                                        <span style={{ fontSize: '0.83rem', color: 'var(--text)', lineHeight: 1.5, fontWeight: 500 }}>
                                                            {qa.question}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                                        <User size={14} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />
                                                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                                            {formatAnswer(qa.answer)}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{
                                    background: 'var(--surface)', border: '1px solid var(--border)',
                                    borderRadius: 10, padding: '40px 24px', textAlign: 'center',
                                }}>
                                    <ClipboardList size={32} color="#334155" style={{ marginBottom: 12 }} />
                                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                        {t('gap.noQA')}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── GAP Report Tab ── */}
                    {activeTab === 'gap_report' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            {/* Summary stats */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                                {[
                                    { label: t('gap.totalGaps'), value: gaps.length, color: '#6366f1' },
                                    { label: t('gap.highSeverity'), value: gaps.filter(g => g.impact === 'high').length, color: '#ef4444' },
                                    { label: t('gap.majorGaps'), value: gaps.filter(g => g.fit === 'gap').length, color: '#f59e0b' },
                                    { label: t('gap.alreadyFit'), value: gaps.filter(g => g.fit === 'fit').length, color: '#10b981' },
                                ].map(s => (
                                    <div key={s.label} style={{
                                        background: 'var(--surface)', border: '1px solid var(--border)',
                                        borderRadius: 10, padding: '14px 16px', textAlign: 'center',
                                        borderTop: `3px solid ${s.color}`,
                                    }}>
                                        <div style={{ fontSize: '1.8rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>{s.label}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Table */}
                            <div style={{
                                background: 'var(--surface)', border: '1px solid var(--border)',
                                borderRadius: 10, overflow: 'hidden',
                            }}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ ...thStyle, width: 70 }}>{t('gap.gapId')}</th>
                                                <th style={thStyle} onClick={() => handleSort('impact')}>
                                                    {t('gap.severity')} <SortIcon col="impact" />
                                                </th>
                                                <th style={thStyle} onClick={() => handleSort('area')}>
                                                    {t('gap.area')} <SortIcon col="area" />
                                                </th>
                                                <th style={thStyle} onClick={() => handleSort('type')}>
                                                    {t('gap.type')} <SortIcon col="type" />
                                                </th>
                                                <th style={thStyle} onClick={() => handleSort('fit')}>
                                                    {t('gap.fit')} <SortIcon col="fit" />
                                                </th>
                                                <th style={thStyle} onClick={() => handleSort('effort')}>
                                                    {t('gap.effortSize')} <SortIcon col="effort" />
                                                </th>
                                                <th style={{ ...thStyle, minWidth: 220 }}>{t('gap.description')}</th>
                                                <th style={{ ...thStyle, minWidth: 160 }}>{t('gap.standardUsed')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedGaps.map((g, idx) => (
                                                <tr
                                                    key={g.id ?? idx}
                                                    style={{ transition: 'background 0.1s' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                >
                                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                        {g.id ?? `GAP-${(idx + 1).toString().padStart(3, '0')}`}
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <Badge value={g.impact} styles={SEVERITY_STYLE[g.impact]} />
                                                    </td>
                                                    <td style={{ ...tdStyle, minWidth: 120 }}>
                                                        <span style={{ fontSize: '0.78rem', color: 'var(--text)' }}>
                                                            {g.area || '—'}
                                                        </span>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <span style={{
                                                            padding: '2px 7px', borderRadius: 6,
                                                            fontSize: '0.7rem', fontWeight: 600,
                                                            background: 'rgba(99,102,241,0.12)',
                                                            color: '#a5b4fc',
                                                            textTransform: 'capitalize',
                                                        }}>
                                                            {g.category}
                                                        </span>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <Badge
                                                            value={g.fit ?? 'gap'}
                                                            styles={FIT_STYLE[g.fit ?? 'gap']}
                                                        />
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <Badge value={g.effort} styles={SEVERITY_STYLE[g.effort]} />
                                                    </td>
                                                    <td style={{ ...tdStyle, maxWidth: 300 }}>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text)', marginBottom: 3 }}>
                                                            {g.gap}
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                                            {g.currentState}
                                                        </div>
                                                    </td>
                                                    <td style={{ ...tdStyle, fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                                        {g.standard || '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                            {sortedGaps.length === 0 && (
                                                <tr>
                                                    <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: '40px 24px', color: 'var(--text-secondary)' }}>
                                                        {t('gap.noGaps')}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Knowledge Graph Tab ── */}
                    {activeTab === 'knowledge_graph' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                {t('gap.relationshipMap')}
                                <strong style={{ color: 'var(--text)' }}> {t('gap.dragNodes')}</strong>
                            </p>
                            {report.chartData?.knowledgeGraph && report.chartData.knowledgeGraph.nodes.length > 0 ? (
                                <GapKnowledgeGraph
                                    nodes={report.chartData.knowledgeGraph.nodes}
                                    edges={report.chartData.knowledgeGraph.edges}
                                />
                            ) : (
                                // Build a minimal knowledge graph from gaps if no chartData
                                gaps.length > 0 ? (
                                    <GapKnowledgeGraph
                                        nodes={[
                                            // Area nodes
                                            ...Array.from(new Set(gaps.map(g => g.area || 'General'))).map((area, i) => ({
                                                id: `area_${i}`,
                                                label: area,
                                                type: 'area' as const,
                                            })),
                                            // Category nodes
                                            ...Array.from(new Set(gaps.map(g => g.category))).map(cat => ({
                                                id: `cat_${cat}`,
                                                label: cat.charAt(0).toUpperCase() + cat.slice(1),
                                                type: 'category' as const,
                                            })),
                                            // Gap nodes (top 15)
                                            ...gaps.slice(0, 15).map((g, i) => ({
                                                id: `gap_${i}`,
                                                label: g.gap?.substring(0, 28) ?? `Gap ${i + 1}`,
                                                type: 'gap' as const,
                                                impact: g.impact,
                                            })),
                                        ]}
                                        edges={[
                                            // Area → Gap edges
                                            ...gaps.slice(0, 15).map((g, i) => {
                                                const areas = Array.from(new Set(gaps.map(x => x.area || 'General')));
                                                const areaIdx = areas.indexOf(g.area || 'General');
                                                return { source: `area_${areaIdx}`, target: `gap_${i}`, type: 'area-gap' as const };
                                            }),
                                            // Category → Gap edges
                                            ...gaps.slice(0, 15).map((g, i) => ({
                                                source: `cat_${g.category}`, target: `gap_${i}`, type: 'category-gap' as const,
                                            })),
                                        ]}
                                    />
                                ) : (
                                    <div style={{
                                        background: 'var(--surface)', border: '1px solid var(--border)',
                                        borderRadius: 10, padding: '48px 24px', textAlign: 'center',
                                    }}>
                                        <Network size={32} color="#334155" style={{ marginBottom: 12 }} />
                                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                            {t('gap.graphPending')}
                                        </p>
                                    </div>
                                )
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
