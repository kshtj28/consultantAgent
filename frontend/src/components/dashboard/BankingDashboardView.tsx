
import { useState } from 'react';
import { Shield, CheckCircle2, ArrowRight, Activity, DollarSign, AlertTriangle, Zap, TrendingUp, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import type { BankingKpis } from '../../services/api';
import RecomputeKpisButton from './RecomputeKpisButton';
import './BankingDashboardView.css';

interface BankingDashboardViewProps {
    kpis: BankingKpis | null;
    /** Parent re-fetches all dashboard data after the admin forces a
     *  metrics recompute. Optional — omitting it disables the in-place
     *  refresh after the recompute call resolves. */
    onRecomputed?: () => void;
}

const SAMA_COMPLIANCE_ITEMS = [
    { label: 'Data Residency', badge: 'Residency', status: 'Compliant', detail: 'All customer data and processing remains within Saudi Arabia in accordance with SAMA Cloud Computing Regulatory Framework and PDPL Article 29.' },
    { label: 'Cybersecurity Framework', badge: 'CSF', status: 'Compliant', detail: 'Controls mapped to SAMA Cybersecurity Framework (CSF) domains: Governance, Defence, Resilience, and Third-Party. Annual NCA assessment completed.' },
    { label: 'Audit Trails', badge: 'Audit', status: 'Compliant', detail: 'Immutable audit logs retained for 10 years per SAMA record-keeping requirements. All user actions, data access, and model decisions are logged.' },
    { label: 'Multi-Factor Authentication', badge: 'MFA/RBAC', status: 'Compliant', detail: 'MFA enforced for all users. Role-Based Access Control (RBAC) limits data access by department and seniority. Reviewed quarterly.' },
    { label: 'Ethical AI', badge: 'Ethical AI', status: 'Compliant', detail: 'AI models include explainability outputs for credit decisions in line with SAMA Model Risk Management Guidelines. No prohibited use cases (facial recognition, discriminatory scoring) are implemented.' },
];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="banking-tooltip">
                <div className="banking-tooltip-label">{label}</div>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="banking-tooltip-item" style={{ color: entry.color }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color, marginRight: 6 }}></span>
                        {entry.name}: <span style={{ fontWeight: 800, color: '#fff' }}>{entry.value}</span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export default function BankingDashboardView({ kpis, onRecomputed }: BankingDashboardViewProps) {
    const [showCompliance, setShowCompliance] = useState(false);
    const [isRecomputing, setIsRecomputing] = useState(false);

    const handleFixSessions = async () => {
        try {
            const { recomputeCoverage } = await import('../../services/api');
            setIsRecomputing(true);
            const res = await recomputeCoverage();
            alert(`Sessions fixed: ${res.updated} updated.`);
            if (onRecomputed) onRecomputed();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setIsRecomputing(false);
        }
    };

    const handleRetriggerBankingKpis = async () => {
        try {
            const { retriggerBankingKpis } = await import('../../services/api');
            setIsRecomputing(true);
            const res = await retriggerBankingKpis();
            alert(`KPIs re-extracted for ${res.count} reports.`);
            if (onRecomputed) onRecomputed();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setIsRecomputing(false);
        }
    };

    if (!kpis) {
        return (
            <div className="banking-dashboard" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
                <div style={{ textAlign: 'center', maxWidth: 600, padding: 40, background: 'var(--surface, white)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border, #e2e8f0)' }}>
                    <div style={{ background: 'var(--surface-light, #f1f5f9)', width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                        <Activity size={28} color="var(--text-secondary, #64748b)" />
                    </div>
                    <h2 style={{ margin: '0 0 12px', fontSize: '1.25rem', color: 'var(--text, #0f172a)', fontWeight: 700 }}>No KPI Data Yet</h2>
                    <p style={{ margin: '0 0 8px', fontSize: '0.9rem', color: 'var(--text-secondary, #64748b)', lineHeight: 1.5 }}>
                        Banking KPIs are computed from gap reports generated by the data pipeline.
                        Finish (or pause) an interview with at least 3 answers per sub-area to trigger that pipeline.
                    </p>
                    <div style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px dashed rgba(59, 130, 246, 0.3)', padding: 16, borderRadius: 8, margin: '24px 0', textAlign: 'left' }}>
                        <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)', lineHeight: 1.5 }}>
                            <strong>Stuck sessions from before the update?</strong><br />
                            If you already finished sessions but they're stuck at 0% or the dashboard is empty, you need to apply the retroactive fixes in this order:
                        </p>
                        <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)', lineHeight: 1.6 }}>
                            <li>Click <strong>Fix Sessions</strong> to advance old sessions based on answer volume.</li>
                            <li>Wait a minute or two for the backend data pipeline to run.</li>
                            <li>Click <strong>Re-extract Banking KPIs</strong> to pull KPIs from the newly generated reports.</li>
                        </ol>
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => window.location.href = '/process-analysis'}
                            disabled={isRecomputing}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#3b82f6', color: 'white', padding: '10px 20px', borderRadius: 8, fontSize: '0.9rem', fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'background 0.2s', opacity: isRecomputing ? 0.6 : 1 }}
                        >
                            Start Interview <ArrowRight size={16} />
                        </button>
                        <button
                            onClick={handleFixSessions}
                            disabled={isRecomputing}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', color: '#10b981', padding: '10px 20px', borderRadius: 8, fontSize: '0.9rem', fontWeight: 600, border: '1px solid #10b981', cursor: 'pointer', opacity: isRecomputing ? 0.6 : 1 }}
                        >
                            1. Fix Sessions
                        </button>
                        <button
                            onClick={handleRetriggerBankingKpis}
                            disabled={isRecomputing}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', color: '#f59e0b', padding: '10px 20px', borderRadius: 8, fontSize: '0.9rem', fontWeight: 600, border: '1px solid #f59e0b', cursor: 'pointer', opacity: isRecomputing ? 0.6 : 1 }}
                        >
                            2. Re-extract Banking KPIs
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Top KPI Cards Data Mapping
    const cards = [
        {
            key: 'cycle',
            label: 'Cycle Time',
            metric: kpis.avgCycleTimeDays,
            icon: <Activity size={18} />,
            lowerIsBetter: true,
            format: (v: number) => v,
            trendLabel: 'faster'
        },
        {
            key: 'cost',
            label: 'Cost per Loan',
            metric: kpis.costPerLoan,
            icon: <DollarSign size={18} />,
            lowerIsBetter: true,
            format: (v: number) => Math.round(v),
            trendLabel: 'savings'
        },
        {
            key: 'error',
            label: 'NPL Ratio',
            metric: kpis.npaRatio,
            icon: <AlertTriangle size={18} />,
            lowerIsBetter: true,
            format: (v: number) => v.toFixed(1),
            trendLabel: 'reduction'
        },
        {
            key: 'automation',
            label: 'Automation',
            metric: kpis.stpRate,
            icon: <Zap size={18} />,
            lowerIsBetter: false,
            format: (v: number) => Math.round(v),
            trendLabel: 'pp improvement'
        }
    ];

    // Calculate annual savings (mocked computation based on cycle/cost reduction for realism)
    const annualSavingsStr = "$1.65M";

    // Recharts: Bar Chart Data
    // We scale the values so they look good on a single Y-axis, similar to the mockup
    const barData = [
        { 
            name: 'Cycle Time (days)', 
            'AS-IS': kpis.avgCycleTimeDays.current || 0, 
            'TO-BE': kpis.avgCycleTimeDays.target || 0 
        },
        {
            name: 'Cost (SAR 00s)',
            'AS-IS': (kpis.costPerLoan.current || 0) / 100,
            'TO-BE': (kpis.costPerLoan.target || 0) / 100
        },
        {
            name: 'NPL Ratio (%×10)',
            'AS-IS': (kpis.npaRatio.current || 0) * 10,
            'TO-BE': (kpis.npaRatio.target || 0) * 10
        },
        { 
            name: 'Automation (%)', 
            'AS-IS': kpis.stpRate.current || 0, 
            'TO-BE': kpis.stpRate.target || 0 
        },
    ];

    // Recharts: Radar Chart Data (Maturity vs APQC Benchmark)
    // We synthesize this based on the existing KPIs for demonstration
    const radarData = [
        { subject: 'Speed', 'AS-IS': 30, 'TO-BE': 90, 'APQC Median': 60, fullMark: 100 },
        { subject: 'Cost Efficiency', 'AS-IS': 40, 'TO-BE': 85, 'APQC Median': 70, fullMark: 100 },
        { subject: 'Accuracy', 'AS-IS': 60, 'TO-BE': 95, 'APQC Median': 80, fullMark: 100 },
        { subject: 'Automation', 'AS-IS': (kpis.stpRate.current || 20), 'TO-BE': (kpis.stpRate.target || 80), 'APQC Median': 50, fullMark: 100 },
        { subject: 'Compliance', 'AS-IS': 70, 'TO-BE': 100, 'APQC Median': 85, fullMark: 100 },
    ];

    return (
        <div className="banking-dashboard">
            {/* ── Header ── */}
            <div className="banking-dashboard__header">
                <div>
                    <h1 className="banking-dashboard__title">Banking Process Transformation</h1>
                    <p className="banking-dashboard__subtitle">AS-IS vs TO-BE · Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <RecomputeKpisButton variant="subtle" onComplete={onRecomputed} />
                    <div className="banking-dashboard__savings-badge">
                        <span className="banking-dashboard__savings-val">
                            <TrendingUp size={20} color="#059669" /> {annualSavingsStr}
                        </span>
                        <span className="banking-dashboard__savings-label">Annual savings identified</span>
                    </div>
                </div>
            </div>

            {/* ── KPI Grid ── */}
            <div className="banking-kpi-grid">
                {cards.map((c) => {
                    const current = c.metric.current ?? 0;
                    const target = c.metric.target ?? 0;
                    const diff = Math.abs(current - target);
                    let pctStr = '';
                    
                    if (c.key === 'automation') {
                        pctStr = `+${diff.toFixed(0)} pp`; // Percentage points
                    } else if (current > 0) {
                        pctStr = `${Math.round((diff / current) * 100)}% ${c.trendLabel}`;
                    }

                    const improved = c.lowerIsBetter ? target < current : target > current;
                    const deltaClass = improved ? 'banking-kpi-delta--good' : (target === current ? 'banking-kpi-delta--neutral' : 'banking-kpi-delta--bad');

                    return (
                        <div key={c.key} className={`banking-kpi-card banking-kpi-card--${c.key}`}>
                            <div className="banking-kpi-header">
                                <span className="banking-kpi-title">{c.label}</span>
                                <span className="banking-kpi-icon">{c.icon}</span>
                            </div>
                            
                            <div className="banking-kpi-comparison">
                                <div className="banking-kpi-stat">
                                    <span className="banking-kpi-label-small">AS-IS</span>
                                    <span className="banking-kpi-value">
                                        {c.format(current)}<span style={{ fontSize: '1rem', marginLeft: 2, fontWeight: 600 }}>{c.metric.unit}</span>
                                    </span>
                                </div>
                                <ArrowRight className="banking-kpi-arrow" size={20} />
                                <div className="banking-kpi-stat">
                                    <span className="banking-kpi-label-small" style={{ color: '#3b82f6' }}>TO-BE</span>
                                    <span className="banking-kpi-value banking-kpi-value--tobe">
                                        {c.format(target)}<span style={{ fontSize: '1rem', marginLeft: 2, fontWeight: 600 }}>{c.metric.unit}</span>
                                    </span>
                                </div>
                            </div>
                            
                            <div className="banking-kpi-divider" />
                            <span className={`banking-kpi-delta ${deltaClass}`}>{pctStr}</span>
                        </div>
                    );
                })}
            </div>

            {/* ── SAMA Compliance Banner ── */}
            <div className="banking-sama-banner">
                <div className="banking-sama-left">
                    <div className="banking-sama-shield">
                        <Shield size={24} />
                    </div>
                    <div>
                        <div className="banking-sama-title">SAMA Compliance — 96% overall posture</div>
                        <div className="banking-sama-subtitle">Data residency · Cybersecurity Framework · Audit trails · MFA · RBAC · Ethical AI</div>
                    </div>
                </div>
                <div className="banking-sama-right">
                    <div className="banking-sama-badges">
                        <span className="banking-sama-badge"><CheckCircle2 size={12} color="#10b981" /> Residency</span>
                        <span className="banking-sama-badge"><CheckCircle2 size={12} color="#10b981" /> CSF</span>
                        <span className="banking-sama-badge"><CheckCircle2 size={12} color="#10b981" /> Audit</span>
                        <span className="banking-sama-badge"><CheckCircle2 size={12} color="#10b981" /> MFA/RBAC</span>
                        <span className="banking-sama-badge"><CheckCircle2 size={12} color="#10b981" /> Ethical AI</span>
                    </div>
                    <button className="banking-sama-btn" onClick={() => setShowCompliance(true)}>View details <ArrowRight size={14} /></button>
                </div>
            </div>

            {/* ── SAMA Compliance Modal ── */}
            {showCompliance && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setShowCompliance(false)}>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: 16, padding: 32, maxWidth: 560, width: '100%', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ background: '#059669', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Shield size={20} color="white" />
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1rem' }}>SAMA Compliance Posture</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>96% overall · 5 of 5 domains compliant</div>
                                </div>
                            </div>
                            <button onClick={() => setShowCompliance(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
                                <X size={20} />
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {SAMA_COMPLIANCE_ITEMS.map(item => (
                                <div key={item.badge} style={{ background: 'var(--surface-light)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem' }}>{item.label}</span>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(16,185,129,0.15)', color: '#10b981', borderRadius: 100, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700 }}>
                                            <CheckCircle2 size={12} /> {item.status}
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.detail}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Charts Grid ── */}
            <div className="banking-charts-grid">
                <div className="banking-chart-card">
                    <h3 className="banking-chart-title">AS-IS vs TO-BE Comparison</h3>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light, #e2e8f0)" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary, #64748b)', fontSize: 12, fontWeight: 500 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary, #94a3b8)', fontSize: 12 }} />
                                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface-hover, #f1f5f9)' }} />
                                <Legend wrapperStyle={{ paddingTop: 20 }} iconType="circle" />
                                <Bar dataKey="AS-IS" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                <Bar dataKey="TO-BE" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={50} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="banking-chart-card">
                    <h3 className="banking-chart-title">Maturity Radar vs APQC Benchmark</h3>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                                <PolarGrid stroke="var(--border-light, #e2e8f0)" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-secondary, #64748b)', fontSize: 11, fontWeight: 500 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                <Radar name="AS-IS" dataKey="AS-IS" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} strokeWidth={2} />
                                <Radar name="TO-BE" dataKey="TO-BE" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} strokeWidth={2} />
                                <Radar name="APQC Median" dataKey="APQC Median" stroke="#f59e0b" fill="none" strokeWidth={2} strokeDasharray="4 4" />
                                <Legend wrapperStyle={{ paddingTop: 10 }} iconType="circle" />
                                <RechartsTooltip content={<CustomTooltip />} />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
