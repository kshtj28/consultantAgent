import React from 'react';
import { Shield, CheckCircle2, ArrowRight, Activity, DollarSign, AlertTriangle, Zap, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import type { BankingKpis } from '../../services/api';
import './BankingDashboardView.css';

interface BankingDashboardViewProps {
    kpis: BankingKpis;
}

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

export default function BankingDashboardView({ kpis }: BankingDashboardViewProps) {
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
            label: 'Error Rate',
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
            name: 'Cost ($00s)', 
            'AS-IS': (kpis.costPerLoan.current || 0) / 100, 
            'TO-BE': (kpis.costPerLoan.target || 0) / 100 
        },
        { 
            name: 'Error Rate (%×10)', 
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
                    <h1 className="banking-dashboard__title">Process Transformation Overview</h1>
                    <p className="banking-dashboard__subtitle">Loan Origination · AS-IS vs TO-BE · Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                </div>
                <div className="banking-dashboard__savings-badge">
                    <span className="banking-dashboard__savings-val">
                        <TrendingUp size={20} color="#059669" /> {annualSavingsStr}
                    </span>
                    <span className="banking-dashboard__savings-label">Annual savings identified</span>
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
                    <button className="banking-sama-btn">View details <ArrowRight size={14} /></button>
                </div>
            </div>

            {/* ── Charts Grid ── */}
            <div className="banking-charts-grid">
                <div className="banking-chart-card">
                    <h3 className="banking-chart-title">AS-IS vs TO-BE Comparison</h3>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
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
                                <PolarGrid stroke="#e2e8f0" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }} />
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
