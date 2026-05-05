import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BarChart3, ArrowRight, TrendingUp, Zap, DollarSign, Target } from 'lucide-react';
import SectionCard from '../components/shared/SectionCard';
import StatusBadge from '../components/shared/StatusBadge';
import { SkeletonStatCards, SkeletonChart } from '../components/shared/Skeleton';
import {
    fetchSessions, fetchDashboardStats, fetchCumulativeGaps, fetchExecutiveSummary,
    fetchMaturityTrend, fetchBankingKpis, fetchActiveDomain,
    subscribeToDashboardStream,
    type SessionSummary, type DashboardStats, type CumulativeGapData, type ExecutiveSummary,
    type MaturityTrend, type BankingKpis,
} from '../services/api';
import BankingDashboardView from '../components/dashboard/BankingDashboardView';
import { useLanguage } from '../i18n/LanguageContext';
import './Dashboard.css';

/* ── Overall Readiness Score Ring ── */
function ReadinessRing({ score }: { score: number }) {
    const r = 54;
    const circumference = 2 * Math.PI * r;
    const offset = circumference * (1 - score / 100);
    const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
    const label = score >= 70 ? 'Ready' : score >= 40 ? 'Partial' : 'Not Ready';

    return (
        <div className="dashboard__readiness-ring">
            <svg viewBox="0 0 130 130" width="130" height="130">
                <circle cx="65" cy="65" r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
                <circle
                    cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${circumference}`}
                    strokeDashoffset={offset}
                    transform="rotate(-90 65 65)"
                    className="circular-fill"
                />
                <text x="65" y="58" textAnchor="middle" fill="#f8fafc" fontSize="28" fontWeight="700">
                    {score}
                </text>
                <text x="65" y="78" textAnchor="middle" fill="#94a3b8" fontSize="11" fontWeight="500">
                    / 100
                </text>
            </svg>
            <span className="dashboard__readiness-label" style={{ color }}>{label}</span>
        </div>
    );
}

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

/* ── Maturity Trend (system improvement over time) ── */
function MaturityTrendCard({ trend }: { trend: MaturityTrend | null }) {
    if (!trend || !trend.points.length) {
        return (
            <div className="dashboard__kpi-card" style={{ minHeight: 140 }}>
                <span className="dashboard__kpi-label">
                    <TrendingUp size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                    System Improvement
                </span>
                <div style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    Generate a few broad-area reports across different days to build a maturity baseline.
                </div>
            </div>
        );
    }

    const { points, baseline, current, deltaPct, sampleCount } = trend;
    const positive = deltaPct >= 0;
    const deltaColor = positive ? '#10b981' : '#ef4444';
    const arrow = positive ? '↑' : '↓';

    // Build a mini sparkline path
    const w = 180, h = 44, pad = 4;
    const scores = points.map(p => p.avgScore);
    const minS = Math.min(...scores, 0);
    const maxS = Math.max(...scores, 100);
    const range = Math.max(1, maxS - minS);
    const path = points.map((p, i) => {
        const x = pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1);
        const y = h - pad - ((p.avgScore - minS) / range) * (h - pad * 2);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');

    return (
        <div className="dashboard__kpi-card" style={{ minHeight: 140 }}>
            <span className="dashboard__kpi-label">
                <TrendingUp size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                System Improvement <span style={{ opacity: 0.6, fontWeight: 400 }}>· {trend.days}d</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                <span className="dashboard__kpi-big-value">{current ?? 0}</span>
                <span style={{ color: deltaColor, fontWeight: 700, fontSize: '0.95rem' }}>
                    {arrow} {Math.abs(deltaPct)}%
                </span>
            </div>
            <svg width={w} height={h} style={{ marginTop: 4 }}>
                <path d={path} fill="none" stroke={deltaColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="dashboard__kpi-subtitle">
                Maturity {baseline ?? 0} → {current ?? 0} · {sampleCount} report{sampleCount === 1 ? '' : 's'}
            </span>
        </div>
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


export default function Dashboard() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [cumulativeGaps, setCumulativeGaps] = useState<CumulativeGapData | null>(null);
    const [execSummary, setExecSummary] = useState<ExecutiveSummary | null>(null);
    const [maturityTrend, setMaturityTrend] = useState<MaturityTrend | null>(null);
    const [bankingKpis, setBankingKpis] = useState<BankingKpis | null>(null);
    const [activeDomainId, setActiveDomainId] = useState<string>('finance');
    const [loading, setLoading] = useState(true);
    const esRef = useRef<EventSource | null>(null);

    const goToReports = (severity?: string, areaId?: string) =>
        navigate('/reports', { state: { scrollToGaps: true, severity, areaId } });

    useEffect(() => {
        Promise.all([
            fetchSessions(),
            fetchDashboardStats(),
            fetchCumulativeGaps(),
            fetchExecutiveSummary(),
            fetchMaturityTrend(90).catch(() => null),
            fetchActiveDomain().catch(() => null),
            fetchBankingKpis().catch(() => null),
        ])
            .then(([sessRes, dashStats, gapData, execData, trendData, domainData, kpiData]) => {
                setSessions(sessRes.sessions || []);
                setStats(dashStats);
                setCumulativeGaps(gapData);
                setExecSummary(execData);
                setMaturityTrend(trendData);
                if (domainData) setActiveDomainId(domainData.domain?.id);
                if (kpiData?.available && kpiData.kpis) setBankingKpis(kpiData.kpis);
            })
            .catch(() => {})
            .finally(() => setLoading(false));

        const es = subscribeToDashboardStream(
            (updatedStats) => {
                setStats(updatedStats);
                // Refresh executive summary when stats update
                fetchExecutiveSummary().then(setExecSummary).catch(() => {});
            },
            () => {},
        );
        esRef.current = es;

        return () => {
            es.close();
        };
    }, []);

    const trendArrow = (trend: string | undefined) =>
        trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '';

    // Use risk level from executive summary (gap-based) instead of metrics service (formula-based)
    const riskLevel = execSummary?.riskLevel ?? stats?.gapSeverity ?? 'Assessing';
    const healthColor = riskLevel === 'Critical' ? '#ef4444'
        : riskLevel === 'High Risk' ? '#f97316'
        : riskLevel === 'Medium Risk' ? '#f59e0b'
        : '#10b981';

    const gaugeColor = healthColor;

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

    if (activeDomainId === 'banking') {
        return <BankingDashboardView kpis={bankingKpis} />;
    }

    return (
        <div className="dashboard">
            {/* ── Executive Health Banner ── */}
            {(stats || cumulativeGaps) && (
                <div className="dashboard__exec-banner">
                    <div className="dashboard__exec-banner-left">
                        <span className="dashboard__exec-banner-label">ENTERPRISE PROCESS HEALTH</span>
                        <span className="dashboard__exec-banner-status" style={{ color: healthColor }}>
                            <span className="dashboard__exec-banner-dot" style={{ background: healthColor }} />
                            {riskLevel}
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
                            {execSummary?.highGaps ?? cumulativeGaps?.gapsBySeverity?.high ?? 0}
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
                    {execSummary?.erpPath && (
                        <>
                            <div className="dashboard__exec-banner-divider" />
                            <div className="dashboard__exec-banner-stat">
                                <span className="dashboard__exec-banner-stat-value" style={{ fontSize: '0.75rem' }}>
                                    {execSummary.erpPath}
                                </span>
                                <span className="dashboard__exec-banner-stat-label">Migration Path</span>
                            </div>
                        </>
                    )}
                    <div className="dashboard__exec-banner-divider" />
                    <div className="dashboard__exec-banner-stat">
                        <span className="dashboard__exec-banner-stat-value" style={{ fontSize: '0.8rem' }}>
                            {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="dashboard__exec-banner-stat-label">As of Today</span>
                    </div>
                </div>
            )}

            {/* ── Executive Health Banner ── */}

            {/* ── Readiness Score + KPI Row ── */}
            <div className="dashboard__hero-row">
                {/* Overall Readiness Score — the big number a CXO looks for */}
                {execSummary && (
                    <div className="dashboard__readiness-card">
                        <span className="dashboard__readiness-title">
                            <Target size={16} /> Overall Readiness
                        </span>
                        <ReadinessRing score={execSummary.readinessScore} />
                        <div className="dashboard__readiness-breakdown">
                            <div className="dashboard__readiness-stat">
                                <span className="dashboard__readiness-stat-val" style={{ color: '#ef4444' }}>{execSummary.highGaps}</span>
                                <span className="dashboard__readiness-stat-lbl">Critical</span>
                            </div>
                            <div className="dashboard__readiness-stat">
                                <span className="dashboard__readiness-stat-val" style={{ color: '#f59e0b' }}>{execSummary.mediumGaps}</span>
                                <span className="dashboard__readiness-stat-lbl">Medium</span>
                            </div>
                            <div className="dashboard__readiness-stat">
                                <span className="dashboard__readiness-stat-val" style={{ color: '#10b981' }}>{execSummary.fitCount}</span>
                                <span className="dashboard__readiness-stat-lbl">Fit</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* KPI Cards */}
                <div className="dashboard__kpi-grid">
                    <div className="dashboard__kpi-card">
                        <span className="dashboard__kpi-label">{t('dash.gapSeverity')}</span>
                        <div className="dashboard__kpi-visual">
                            <GaugeChart
                                value={execSummary?.highGaps ?? stats?.avgRisk ?? 0}
                                max={Math.max(execSummary?.totalGaps ?? 1, stats?.maxRisk ?? 100)}
                                label={riskLevel}
                                color={gaugeColor}
                            />
                        </div>
                        <span className="dashboard__kpi-subtitle">
                            {execSummary?.highGaps ?? 0} high / {execSummary?.totalGaps ?? 0} total
                        </span>
                    </div>

                    <div className="dashboard__kpi-card">
                        <span className="dashboard__kpi-label">{t('dash.criticalIssues')}</span>
                        <div className="dashboard__kpi-visual dashboard__kpi-visual--center">
                            <span className={`dashboard__kpi-trend ${stats?.criticalIssuesTrend === 'up' ? 'dashboard__kpi-trend--up' : 'dashboard__kpi-trend--down'}`}>
                                {trendArrow(stats?.criticalIssuesTrend)}
                            </span>
                            <span className="dashboard__kpi-big-value">{execSummary?.highGaps ?? stats?.criticalIssues ?? 0}</span>
                        </div>
                        <span className="dashboard__kpi-subtitle dashboard__kpi-subtitle--error">{t('dash.requiresAttention')}</span>
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
                    </div>

                    <div className="dashboard__kpi-card">
                        <span className="dashboard__kpi-label">{t('dash.discoveryProgress')}</span>
                        <div className="dashboard__kpi-visual dashboard__kpi-visual--center">
                            <CircularProgress pct={stats?.discoveryPct ?? 0} color="#3b82f6" />
                        </div>
                        <span className="dashboard__kpi-subtitle">{t('dash.estCompletion')} {stats?.estCompletion ?? '—'}</span>
                    </div>

                    <MaturityTrendCard trend={maturityTrend} />
                </div>
            </div>

            {/* ── Quick Wins & Recommendations ── */}
            {execSummary && execSummary.recommendations.length > 0 && (
                <SectionCard
                    title="Top Recommendations"
                    headerRight={
                        <button className="dashboard__view-reports-link" onClick={() => goToReports()}>
                            View Full Report <ArrowRight size={14} />
                        </button>
                    }
                >
                    <div className="dashboard__recommendations">
                        {execSummary.recommendations.map((rec, idx) => (
                            <div key={idx} className="dashboard__rec-card">
                                <div className="dashboard__rec-header">
                                    <span className="dashboard__rec-number">{idx + 1}</span>
                                    <span className="dashboard__rec-title">{rec.title}</span>
                                    <div className="dashboard__rec-badges">
                                        <span className={`dashboard__rec-badge dashboard__rec-badge--${(rec.impact || 'medium').toLowerCase()}`}>
                                            <TrendingUp size={10} /> {rec.impact} Impact
                                        </span>
                                        <span className={`dashboard__rec-badge dashboard__rec-badge--effort-${(rec.effort || 'medium').toLowerCase()}`}>
                                            {rec.effort} Effort
                                        </span>
                                    </div>
                                </div>
                                <p className="dashboard__rec-desc">{rec.description}</p>
                                {rec.estimatedSavings && (
                                    <span className="dashboard__rec-savings">
                                        <DollarSign size={12} /> Est. savings: {rec.estimatedSavings}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Estimated Business Impact */}
                    {execSummary.automationSavings.length > 0 && (
                        <div className="dashboard__impact-banner">
                            <Zap size={16} color="#f59e0b" />
                            <span className="dashboard__impact-text">
                                <strong>Estimated Savings Opportunity:</strong>{' '}
                                {execSummary.automationSavings.slice(0, 3).join(' + ')}
                                {' '}across identified automation opportunities
                            </span>
                        </div>
                    )}
                </SectionCard>
            )}

            {/* ── Cumulative Gap Overview by Broad Area ── */}
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

                        {/* Top Critical Issues with Mitigation Actions */}
                        {highImpactGaps.length > 0 && (
                            <div className="dashboard__critical-section">
                                <div className="dashboard__critical-header">
                                    <span className="dashboard__critical-title">
                                        <AlertTriangle size={14} style={{ color: '#ef4444' }} />
                                        Top Critical Issues Requiring Action
                                    </span>
                                    <button className="dashboard__view-reports-link" onClick={() => goToReports('high')}>
                                        View All ({(cumulativeGaps?.gaps ?? []).filter((g: any) => (g.impact || '').toLowerCase() === 'high').length}) in Gap Register <ArrowRight size={14} />
                                    </button>
                                </div>
                                <div className="dashboard__critical-list">
                                    {highImpactGaps.map((gap: any, idx: number) => (
                                        <div key={gap.id || idx} className="dashboard__critical-item-card">
                                            <div className="dashboard__critical-item-top">
                                                <span className="dashboard__critical-area">
                                                    {gap.broadAreaName || gap.area || '—'}
                                                </span>
                                                <span className="dashboard__critical-gap">
                                                    {gap.gap || gap.description || '—'}
                                                </span>
                                                <div className="dashboard__critical-badges">
                                                    <span className="dashboard__critical-badge dashboard__critical-badge--high">High</span>
                                                    {gap.effort && (
                                                        <span className={`dashboard__critical-badge dashboard__critical-badge--effort-${gap.effort.toLowerCase()}`}>
                                                            {gap.effort} Effort
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {gap.targetState && (
                                                <div className="dashboard__critical-mitigation">
                                                    <span className="dashboard__critical-mitigation-label">Required Action:</span>
                                                    <span className="dashboard__critical-mitigation-text">{gap.targetState}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </SectionCard>

            {/* ── Recent Sessions ── */}
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
