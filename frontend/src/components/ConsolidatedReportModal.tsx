import { useState, useEffect } from 'react';
import {
    X, Download, BarChart3, Table2, Zap, Shield, Network, AlertTriangle, RefreshCw, Settings,
} from 'lucide-react';
import { GapKnowledgeGraph, type KGNode, type KGEdge } from './charts/GapKnowledgeGraph';
import { regenerateReport, fetchModels, fetchProjectSettings, type ModelConfig } from '../services/api';
import './ConsolidatedReportModal.css';

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = 'executive' | 'gaps' | 'roadmap' | 'risks' | 'knowledge';

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
    reportId?: string;
    onClose: () => void;
    onDownloadPDF: () => void;
    onRegenerate?: () => void;
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

// ─── ERP guidance: maps gap → ideal practice, availability, specific module ────

type ErpKey = 'sap' | 'dynamics' | 'oracle' | 'generic';

const ERP_LABEL: Record<ErpKey, string> = {
    sap: 'SAP S/4HANA',
    dynamics: 'Dynamics 365 F&O',
    oracle: 'Oracle Cloud ERP',
    generic: 'Target ERP',
};

function detectErp(erpPath: string): ErpKey {
    const p = (erpPath || '').toLowerCase();
    if (p.includes('s/4') || p.includes('s4') || p.includes('sap')) return 'sap';
    if (p.includes('d365') || p.includes('dynamics')) return 'dynamics';
    if (p.includes('oracle')) return 'oracle';
    return 'generic';
}

type ProcessArea = 'r2r' | 'p2p' | 'o2c' | 'h2r' | 'ptp' | 'generic';

function detectProcessArea(reportName: string, gapArea: string): ProcessArea {
    const n = `${reportName} ${gapArea}`.toLowerCase();
    if (n.match(/record.to.report|r2r|financial close|general ledger/)) return 'r2r';
    if (n.match(/procure.to.pay|p2p|procurement|accounts payable/))       return 'p2p';
    if (n.match(/order.to.cash|o2c|accounts receivable|sales order/))     return 'o2c';
    if (n.match(/hire.to.retire|h2r|human resources|payroll|talent/))     return 'h2r';
    if (n.match(/plan.to.produce|production|manufacturing/))              return 'ptp';
    return 'generic';
}

// Primary ERP module per (ERP, process area)
const MODULES: Record<ErpKey, Record<ProcessArea, string>> = {
    sap: {
        r2r: 'FI-GL · S/4HANA Finance',
        p2p: 'MM + SAP Ariba',
        o2c: 'SD · S/4HANA Sales',
        h2r: 'SAP SuccessFactors',
        ptp: 'PP · S/4HANA Manufacturing',
        generic: 'S/4HANA core',
    },
    dynamics: {
        r2r: 'D365 Finance · General Ledger',
        p2p: 'D365 Finance · AP + SCM Procurement',
        o2c: 'D365 Finance · AR + Sales',
        h2r: 'D365 Human Resources',
        ptp: 'D365 SCM · Production Control',
        generic: 'D365 core',
    },
    oracle: {
        r2r: 'Oracle Cloud · General Ledger',
        p2p: 'Oracle Cloud · Procurement',
        o2c: 'Oracle Cloud · Order Management',
        h2r: 'Oracle Cloud HCM',
        ptp: 'Oracle Cloud · Manufacturing',
        generic: 'Oracle Cloud ERP',
    },
    generic: {
        r2r: 'Financial Close / GL',
        p2p: 'Procurement / AP',
        o2c: 'Order Management / AR',
        h2r: 'HR / Payroll',
        ptp: 'Production Planning',
        generic: 'Core ERP',
    },
};

// Keyword refinement for specific module within a process area
function refineModule(erp: ErpKey, area: ProcessArea, gapText: string): string {
    const base = MODULES[erp][area];
    const t = (gapText || '').toLowerCase();
    if (area === 'r2r') {
        if (/consolidat/.test(t))          return erp === 'sap' ? 'FI Group Reporting' : erp === 'dynamics' ? 'D365 Consolidations' : base;
        if (/close|period[- ]end/.test(t)) return erp === 'sap' ? 'SAP Financial Closing Cockpit' : erp === 'dynamics' ? 'D365 Period Close Workspace' : base;
        if (/reconcil/.test(t))            return erp === 'sap' ? 'SAP ICMR · Ledger Reconciliation' : erp === 'dynamics' ? 'D365 Ledger Settlement' : base;
        if (/recurring|deferr|prepay|accrual/.test(t)) return erp === 'sap' ? 'FI-GL Recurring Entries' : erp === 'dynamics' ? 'D365 Recurring Journals' : base;
        if (/journal|posting/.test(t))     return erp === 'sap' ? 'FI-GL Journal Entry (Fiori F0718)' : erp === 'dynamics' ? 'D365 General Journal' : base;
        if (/segregation|approv/.test(t))  return erp === 'sap' ? 'SAP BTP Workflow + GRC' : erp === 'dynamics' ? 'D365 Workflow + Power Automate' : base;
    }
    if (area === 'p2p') {
        if (/invoice/.test(t))       return erp === 'sap' ? 'SAP Ariba Invoice Mgmt' : erp === 'dynamics' ? 'D365 Vendor Invoice' : base;
        if (/supplier|vendor/.test(t)) return erp === 'sap' ? 'SAP Ariba Supplier Mgmt' : erp === 'dynamics' ? 'D365 Vendor Collaboration' : base;
        if (/payment/.test(t))       return erp === 'sap' ? 'SAP S/4HANA Cash Management' : erp === 'dynamics' ? 'D365 Payment Journals' : base;
    }
    return base;
}

// Ideal practice phrased by gap category
const IDEAL_PRACTICE: Record<string, string> = {
    process:    'Standardized end-to-end process with automated controls',
    technology: 'Native ERP automation replacing manual tools / spreadsheets',
    capability: 'Formal role separation with workflow-based approvals',
    data:       'Single source of truth with real-time system integration',
};

function availabilityText(fit: string | undefined, erp: ErpKey): string {
    const label = ERP_LABEL[erp];
    if (fit === 'fit')     return `Meets standard · no change needed`;
    if (fit === 'partial') return `Partially available in ${label}`;
    return `Available out-of-box in ${label}`;
}

interface ErpGuidance {
    idealPractice: string;
    availability: string;
    module: string;
}

function getErpGuidance(gap: GapItem, reportName: string, erpPath: string): ErpGuidance {
    const erp = detectErp(erpPath);
    const area = detectProcessArea(reportName, gap.area || '');
    const module = refineModule(erp, area, `${gap.gap} ${gap.currentState}`);
    const ideal = IDEAL_PRACTICE[(gap.category || '').toLowerCase()] || 'Industry best practice for this area';
    return {
        idealPractice: ideal,
        availability: availabilityText(gap.fit, erp),
        module,
    };
}

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

const ERP_PATH_OPTIONS = [
    { value: '', label: 'No change (keep current)' },
    { value: 'SAP ECC → S/4HANA', label: 'SAP ECC → S/4HANA' },
    { value: 'Dynamics GP/NAV/AX → D365 F&O', label: 'Dynamics GP/NAV/AX → D365 F&O' },
    { value: 'Oracle EBS → Oracle Cloud', label: 'Oracle EBS → Oracle Cloud' },
    { value: 'Generic', label: 'Generic' },
];

export function ConsolidatedReportModal({
    report, reportName, reportType, reportId, onClose, onDownloadPDF, onRegenerate,
}: ConsolidatedReportModalProps) {
    const [activeTab, setActiveTab] = useState<TabId>('executive');
    const [sortCol, setSortCol] = useState<'impact' | 'effort' | 'area' | 'category' | 'fit' | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [showRegenPanel, setShowRegenPanel] = useState(false);
    const [regenErpPath, setRegenErpPath] = useState('');
    const [regenModelId, setRegenModelId] = useState('');
    const [models, setModels] = useState<ModelConfig[]>([]);
    const [currentErpPath, setCurrentErpPath] = useState('');
    const [regenerating, setRegenerating] = useState(false);

    // Load erpPath on mount — needed for Gap Register ERP Solution column
    useEffect(() => {
        fetchProjectSettings()
            .then(res => setCurrentErpPath(res.erpPath || ''))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (showRegenPanel) {
            fetchModels().then(res => setModels(res.models || [])).catch(() => {});
        }
    }, [showRegenPanel]);

    const handleRegenerate = async () => {
        if (!reportId) return;
        setRegenerating(true);
        try {
            const overrides: { erpPath?: string; modelId?: string } = {};
            if (regenErpPath) overrides.erpPath = regenErpPath;
            if (regenModelId) overrides.modelId = regenModelId;
            await regenerateReport(reportId, overrides);
            setShowRegenPanel(false);
            onRegenerate?.();
            onClose();
        } catch (err) {
            console.error('Regeneration failed:', err);
        } finally {
            setRegenerating(false);
        }
    };

    const TABS: { id: TabId; label: string; Icon: typeof BarChart3 }[] = [
        { id: 'executive', label: 'Executive Summary', Icon: BarChart3 },
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
                        {reportId && (
                            <button
                                className="crm__btn"
                                onClick={() => setShowRegenPanel(p => !p)}
                                title="Regenerate report with different settings"
                            >
                                <Settings size={14} /> Regenerate
                            </button>
                        )}
                        <button className="crm__btn" onClick={onDownloadPDF}>
                            <Download size={14} /> Export PDF
                        </button>
                        <button className="crm__btn crm__btn--icon" onClick={onClose}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* ── Regeneration Settings Panel ── */}
                {showRegenPanel && (
                    <div className="crm__regen-panel">
                        <div className="crm__regen-header">
                            <RefreshCw size={14} />
                            <span>Regenerate Report with Different Settings</span>
                        </div>
                        {currentErpPath && (
                            <p className="crm__regen-current">
                                Current ERP Path: <strong>{currentErpPath}</strong>
                            </p>
                        )}
                        <div className="crm__regen-fields">
                            <label className="crm__regen-field">
                                <span className="crm__regen-label">ERP Migration Path</span>
                                <select
                                    className="crm__regen-select"
                                    value={regenErpPath}
                                    onChange={e => setRegenErpPath(e.target.value)}
                                >
                                    {ERP_PATH_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="crm__regen-field">
                                <span className="crm__regen-label">AI Model</span>
                                <select
                                    className="crm__regen-select"
                                    value={regenModelId}
                                    onChange={e => setRegenModelId(e.target.value)}
                                >
                                    <option value="">No change (keep current)</option>
                                    {models.map(m => (
                                        <option key={m.id} value={m.id}>{m.displayName}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <div className="crm__regen-actions">
                            <button
                                className="crm__btn crm__btn--regen"
                                onClick={handleRegenerate}
                                disabled={regenerating || (!regenErpPath && !regenModelId)}
                            >
                                {regenerating ? (
                                    <><RefreshCw size={14} className="crm__spin" /> Regenerating...</>
                                ) : (
                                    <><RefreshCw size={14} /> Regenerate Report</>
                                )}
                            </button>
                            <button className="crm__btn" onClick={() => setShowRegenPanel(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

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
                                                    <th className="crm__th" style={{ minWidth: 160 }}>ERP Standard</th>
                                                    <th className="crm__th" style={{ minWidth: 260 }}>ERP Solution</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedGaps.map((g, idx) => {
                                                    const size = SIZE_MAP[g.effort] ?? 'M';
                                                    const sap = g.standard || (
                                                        g.fit === 'gap'     ? 'Industry Best Practice' :
                                                        g.fit === 'partial' ? 'Partial Alignment'      :
                                                        'Meets Standard'
                                                    );
                                                    const erpGuide = getErpGuidance(g, reportName, currentErpPath);
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
                                                            <td className="crm__td crm__erp-solution">
                                                                <div className="crm__erp-row">
                                                                    <span className="crm__erp-label">Ideal</span>
                                                                    <span className="crm__erp-val">{erpGuide.idealPractice}</span>
                                                                </div>
                                                                <div className="crm__erp-row">
                                                                    <span className="crm__erp-label">Available</span>
                                                                    <span className="crm__erp-val crm__erp-val--availability">{erpGuide.availability}</span>
                                                                </div>
                                                                <div className="crm__erp-row">
                                                                    <span className="crm__erp-label">Module</span>
                                                                    <span className="crm__erp-val crm__erp-val--module">{erpGuide.module}</span>
                                                                </div>
                                                            </td>
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
