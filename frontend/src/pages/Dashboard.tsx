import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BarChart3, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import SectionCard from '../components/shared/SectionCard';
import StatusBadge from '../components/shared/StatusBadge';
import { SkeletonStatCards, SkeletonChart } from '../components/shared/Skeleton';
import {
    fetchSessions, fetchDashboardStats, fetchCumulativeGaps,
    subscribeToDashboardStream,
    type SessionSummary, type DashboardStats, type CumulativeGapData,
} from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import './Dashboard.css';

/* ── SVG Gauge (half-circle speedometer) ── */
function GaugeChart({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
    const pct = Math.min(value / max, 1);
    const r = 50;
    const circumference = Math.PI * r;
    const offset = circumference * (1 - pct);

    return (
        <svg viewBox="0 0 120 70" className="gauge-svg">
            <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke="#1e293b" strokeWidth="10" strokeLinecap="round" />
            <path
                d="M 10 65 A 50 50 0 0 1 110 65"
                fill="none"
                stroke={color}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={offset}
                className="gauge-fill"
            />
            <text x="60" y="58" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="700">{label}</text>
        </svg>
    );
}

/* ── Circular Progress Ring ── */
function CircularProgress({ pct, color }: { pct: number; color: string }) {
    const r = 42;
    const circumference = 2 * Math.PI * r;
    const offset = circumference * (1 - pct / 100);

    return (
        <svg viewBox="0 0 100 100" className="circular-progress-svg">
            <circle cx="50" cy="50" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
            <circle
                cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={offset}
                transform="rotate(-90 50 50)"
                className="circular-fill"
            />
            <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fill="#f8fafc" fontSize="20" fontWeight="700">
                {pct}%
            </text>
        </svg>
    );
}

const SEVERITY_COLORS: Record<string, string> = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#10b981',
};

export default function Dashboard() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [cumulativeGaps, setCumulativeGaps] = useState<CumulativeGapData | null>(null);
    const [loading, setLoading] = useState(true);
    const esRef = useRef<EventSource | null>(null);

    const goToReports = (severity?: string, areaId?: string) =>
        navigate('/reports', { state: { scrollToGaps: true, severity, areaId } });

    useEffect(() => {
        Promise.all([fetchSessions(), fetchDashboardStats(), fetchCumulativeGaps()])
            .then(([sessRes, dashStats, gapData]) => {
                setSessions(sessRes.sessions || []);
                setStats(dashStats);
                setCumulativeGaps(gapData);
            })
            .catch(() => {})
            .finally(() => setLoading(false));

        const es = subscribeToDashboardStream(
            (updatedStats) => {
                setStats(updatedStats);
            },
            () => {},
        );
        esRef.current = es;

        return () => {
            es.close();
        };
    }, []);

    const gaugeColor = stats?.gapSeverity === 'Critical' ? '#ef4444'
        : stats?.gapSeverity === 'High Risk' ? '#f59e0b'
        : stats?.gapSeverity === 'Medium Risk' ? '#f59e0b'
        : '#10b981';

    const trendArrow = (trend: string | undefined) =>
        trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '';

    // Prepare chart data from cumulative gaps
    const severityData = cumulativeGaps
        ? Object.entries(cumulativeGaps.gapsBySeverity).map(([name, value]) => {
            const key = `severity.${name.toLowerCase()}`;
            const translated = t(key);
            return {
                originalName: name,
                name: translated !== key ? translated : (name.charAt(0).toUpperCase() + name.slice(1)),
                value,
            };
        })
        : [];

    const areaBarData = cumulativeGaps
        ? cumulativeGaps.broadAreas.map(a => {
            const key = `area.${(a as any).id || a.name.toLowerCase().replace(/[^a-z]+/g, '_')}.label`;
            const translated = t(key);
            return {
                name: translated !== key ? translated : a.name,
                gaps: a.gapCount,
                critical: a.criticalCount,
            };
        })
        : [];

    if (loading) {
        return (
            <div className="dashboard">
                <SkeletonStatCards count={4} />
                <SkeletonChart height="200px" />
                <SkeletonStatCards count={3} />
            </div>
        );
    }

    const highImpactGaps = (cumulativeGaps?.gaps ?? [])
        .filter((g: any) => (g.impact || '').toLowerCase() === 'high')
        .slice(0, 5);

    const healthColor = stats?.gapSeverity === 'Critical' ? '#ef4444'
        : stats?.gapSeverity === 'High Risk' ? '#f97316'
        : stats?.gapSeverity === 'Medium Risk' ? '#f59e0b'
        : '#10b981';

    return (
        <div className="dashboard">
            {/* Executive Health Banner */}
            {(stats || cumulativeGaps) && (
                <div className="dashboard__exec-banner">
                    <div className="dashboard__exec-banner-left">
                        <span className="dashboard__exec-banner-label">ENTERPRISE PROCESS HEALTH</span>
                        <span className="dashboard__exec-banner-status" style={{ color: healthColor }}>
                            <span className="dashboard__exec-banner-dot" style={{ background: healthColor }} />
                            {stats?.gapSeverity ?? 'Assessing'}
                        </span>
                    </div>
                    <div className="dashboard__exec-banner-divider" />
                    <div className="dashboard__exec-banner-stat">
                        <span className="dashboard__exec-banner-stat-value">{cumulativeGaps?.totalGaps ?? 0}</span>
                        <span className="dashboard__exec-banner-stat-label">Total Gaps</span>
                    </div>
                    <div className="dashboard__exec-banner-divider" />
                    <div className="dashboard__exec-banner-stat">
                        <span className="dashboard__exec-banner-stat-value" style={{ color: '#ef4444' }}>
                            {cumulativeGaps?.gapsBySeverity?.high ?? 0}
                        </span>
                        <span className="dashboard__exec-banner-stat-label">High Impact</span>
                    </div>
                    <div className="dashboard__exec-banner-divider" />
                    <div className="dashboard__exec-banner-stat">
                        <span className="dashboard__exec-banner-stat-value">{cumulativeGaps?.broadAreas.length ?? 0}</span>
                        <span className="dashboard__exec-banner-stat-label">Process Areas</span>
                    </div>
                    <div className="dashboard__exec-banner-divider" />
                    <div className="dashboard__exec-banner-stat">
                        <span className="dashboard__exec-banner-stat-value">{stats?.discoveryPct ?? 0}%</span>
                        <span className="dashboard__exec-banner-stat-label">Discovery Complete</span>
                    </div>
                    <div className="dashboard__exec-banner-divider" />
                    <div className="dashboard__exec-banner-stat">
                        <span className="dashboard__exec-banner-stat-value">{stats?.automationPct ?? 0}%</span>
                        <span className="dashboard__exec-banner-stat-label">Automated</span>
                    </div>
                    <div className="dashboard__exec-banner-divider" />
                    <div className="dashboard__exec-banner-stat">
                        <span className="dashboard__exec-banner-stat-value" style={{ fontSize: '0.8rem' }}>
                            {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="dashboard__exec-banner-stat-label">As of Today</span>
                    </div>
                </div>
            )}

            {/* KPI Row */}
            <div className="dashboard__kpi-row">
                <div className="dashboard__kpi-card">
                    <span className="dashboard__kpi-label">{t('dash.gapSeverity')}</span>
                    <div className="dashboard__kpi-visual">
                        <GaugeChart value={stats?.avgRisk || 0} max={stats?.maxRisk || 100} label={stats?.gapSeverity || 'Low Risk'} color={gaugeColor} />
                    </div>
                    <span className="dashboard__kpi-subtitle">{t('dash.avgRisk')} {stats?.avgRisk ?? 0}</span>
                </div>

                <div className="dashboard__kpi-card">
                    <span className="dashboard__kpi-label">{t('dash.criticalIssues')}</span>
                    <div className="dashboard__kpi-visual dashboard__kpi-visual--center">
                        <span className={`dashboard__kpi-trend ${stats?.criticalIssuesTrend === 'up' ? 'dashboard__kpi-trend--up' : 'dashboard__kpi-trend--down'}`}>
                            {trendArrow(stats?.criticalIssuesTrend)}
                        </span>
                        <span className="dashboard__kpi-big-value">{stats?.criticalIssues ?? 0}</span>
                    </div>
                    <span className="dashboard__kpi-subtitle dashboard__kpi-subtitle--error">{t('dash.requiresAttention')}</span>
                    <span className="dashboard__kpi-meta">{t('dash.acrossAssessments')}</span>
                </div>

                <div className="dashboard__kpi-card">
                    <span className="dashboard__kpi-label">{t('dash.automationQuotient')}</span>
                    <div className="dashboard__kpi-visual dashboard__kpi-visual--center">
                        <span className={`dashboard__kpi-trend ${stats?.automationTrend === 'up' ? 'dashboard__kpi-trend--up' : 'dashboard__kpi-trend--down'}`}>
                            {trendArrow(stats?.automationTrend)}
                        </span>
                        <span className="dashboard__kpi-big-value">{stats?.automationPct ?? 0}%</span>
                    </div>
                    <span className="dashboard__kpi-subtitle dashboard__kpi-subtitle--success">
                        &#8593; {stats?.automationDelta ?? 0}{t('dash.improvementPotential')}
                    </span>
                    <span className="dashboard__kpi-meta">{t('dash.currentAutomation')}</span>
                </div>

                <div className="dashboard__kpi-card">
                    <span className="dashboard__kpi-label">{t('dash.discoveryProgress')}</span>
                    <div className="dashboard__kpi-visual dashboard__kpi-visual--center">
                        <CircularProgress pct={stats?.discoveryPct ?? 0} color="#3b82f6" />
                    </div>
                    <span className="dashboard__kpi-subtitle">{t('dash.estCompletion')} {stats?.estCompletion ?? '—'}</span>
                </div>
            </div>

            {/* Cumulative Gap Overview by Broad Area */}
            <SectionCard
                title={t('dash.cumulativeGapOverview')}
                headerRight={
                    <button className="dashboard__view-reports-link" onClick={() => goToReports()}>
                        {t('dash.viewFullReport')} <ArrowRight size={14} />
                    </button>
                }
            >
                {!cumulativeGaps || cumulativeGaps.broadAreas.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
                        {t('dash.noGapData')}
                    </p>
                ) : (
                    <div className="dashboard__gap-overview">
                        {/* Broad Area Gap Cards */}
                        <div className="dashboard__gap-cards">
                            {cumulativeGaps.broadAreas.map(area => (
                                <div
                                    key={area.id}
                                    className="dashboard__gap-area-card dashboard__gap-area-card--clickable"
                                    onClick={() => goToReports(undefined, area.id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={e => e.key === 'Enter' && goToReports(undefined, area.id)}
                                    title={t('dash.viewReportsForArea')}
                                >
                                    <div className="dashboard__gap-area-header">
                                        <BarChart3 size={16} />
                                        <span className="dashboard__gap-area-name">{(() => { const k = `area.${area.id}.label`; const v = t(k); return v !== k ? v : area.name; })()}</span>
                                    </div>
                                    <div className="dashboard__gap-area-count">{area.gapCount}</div>
                                    <span className="dashboard__gap-area-label">{t('dash.gapsIdentified')}</span>
                                    <div className="dashboard__gap-area-breakdown">
                                        {area.criticalCount > 0 && (
                                            <span
                                                className="dashboard__gap-severity dashboard__gap-severity--high"
                                                onClick={e => { e.stopPropagation(); goToReports('high'); }}
                                            >
                                                <AlertTriangle size={10} /> {area.criticalCount} {t('dash.high')}
                                            </span>
                                        )}
                                        {area.highCount > 0 && (
                                            <span
                                                className="dashboard__gap-severity dashboard__gap-severity--medium"
                                                onClick={e => { e.stopPropagation(); goToReports('medium'); }}
                                            >
                                                {area.highCount} {t('dash.medium')}
                                            </span>
                                        )}
                                        {area.lowCount > 0 && (
                                            <span
                                                className="dashboard__gap-severity dashboard__gap-severity--low"
                                                onClick={e => { e.stopPropagation(); goToReports('low'); }}
                                            >
                                                {area.lowCount} {t('dash.low')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Charts Row */}
                        <div className="dashboard__gap-charts">
                            {/* Gaps by Severity Pie */}
                            {severityData.length > 0 && (
                                <div className="dashboard__gap-chart-card">
                                    <h4 className="dashboard__gap-chart-title">{t('dash.gapsByImpact')}</h4>
                                    <div dir="ltr" style={{ width: '100%', height: '240px' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                                <Pie
                                                    data={severityData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={35}
                                                    outerRadius={65}
                                                    dataKey="value"
                                                    paddingAngle={3}
                                                    label={({ name, value }) => `${name}: ${value}`}
                                                    onClick={(entry) => goToReports((entry as any).originalName?.toLowerCase())}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    {severityData.map(entry => (
                                                        <Cell key={entry.name} fill={SEVERITY_COLORS[entry.originalName.toLowerCase()] || '#6b7280'} />
                                                    ))}
                                                </Pie>
                                                <Tooltip />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            {/* Gaps by Area Bar */}
                            {areaBarData.length > 0 && (
                                <div className="dashboard__gap-chart-card">
                                    <h4 className="dashboard__gap-chart-title">{t('dash.gapsByProcessArea')}</h4>
                                    <div dir="ltr" style={{ width: '100%', height: '200px' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={areaBarData} layout="vertical" margin={{ left: 10, right: 10 }}>
                                                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={120} />
                                                <Tooltip
                                                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc' }}
                                                />
                                                <Bar dataKey="gaps" fill="#3b82f6" radius={[0, 4, 4, 0]} name={t('gap.totalGaps')} />
                                                <Bar dataKey="critical" fill="#ef4444" radius={[0, 4, 4, 0]} name={t('dash.highImpact')} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Top Critical Issues */}
                        {highImpactGaps.length > 0 && (
                            <div className="dashboard__critical-section">
                                <div className="dashboard__critical-header">
                                    <span className="dashboard__critical-title">
                                        <AlertTriangle size={14} style={{ color: '#ef4444' }} />
                                        Top Critical Issues Requiring Action
                                    </span>
                                    <button className="dashboard__view-reports-link" onClick={() => goToReports('high')}>
                                        View All Critical <ArrowRight size={14} />
                                    </button>
                                </div>
                                <div className="dashboard__critical-list">
                                    {highImpactGaps.map((gap: any, idx: number) => (
                                        <div
                                            key={gap.id || idx}
                                            className="dashboard__critical-item"
                                            onClick={() => goToReports('high', cumulativeGaps?.broadAreas.find(a => a.name === (gap.broadAreaName || gap.area))?.id)}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={e => e.key === 'Enter' && goToReports('high')}
                                        >
                                            <span className="dashboard__critical-area">
                                                {gap.broadAreaName || gap.area || '—'}
                                            </span>
                                            <span className="dashboard__critical-gap">
                                                {gap.gap || gap.description || '—'}
                                            </span>
                                            <span className="dashboard__critical-badge dashboard__critical-badge--high">
                                                High
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </SectionCard>

            {/* Recent sessions */}
            {sessions.length > 0 && (
                <SectionCard title={t('dash.recentSessions')}>
                    <div className="dashboard__sessions">
                        {sessions.slice(0, 5).map((s) => (
                            <div key={s.id} className="dashboard__session-row">
                                <span className="dashboard__session-title">{s.title}</span>
                                <StatusBadge label={s.status === 'completed' ? t('dash.completed') : s.status === 'in_progress' ? t('dash.inProgress') : s.status} />
                                <span className="dashboard__session-progress">
                                    {s.progress.completed}/{s.progress.total}
                                </span>
                            </div>
                        ))}
                    </div>
                </SectionCard>
            )}
        </div>
    );
}
