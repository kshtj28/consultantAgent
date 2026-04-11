import { useEffect, useState } from 'react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Zap, DollarSign, Loader, Target, RefreshCw } from 'lucide-react';
import SectionCard from '../components/shared/SectionCard';
import StatusBadge from '../components/shared/StatusBadge';
import { fetchSessions, fetchInsightsData, computeInsightsData, subscribeToInsightsStream, type SessionSummary } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import './Insights.css';

interface ActionCard {
    icon: typeof Zap;
    title: string;
    description: string;
    fullText?: string;
    impact: string;
    effort: string;
    source: 'static' | 'ai';
}

const defaultActions: ActionCard[] = [
    {
        icon: Zap,
        title: 'Automation Quick Win',
        description: 'Implementing automated credit check validation could save $2.4M annually',
        impact: 'High',
        effort: 'Medium',
        source: 'static',
    },
    {
        icon: DollarSign,
        title: 'Revenue Leakage Opportunity',
        description: 'Invoice reconciliation automation targets $890K in recoverable revenue',
        impact: 'High',
        effort: 'High',
        source: 'static',
    },
];

export default function Insights() {
    const { t } = useLanguage();
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [actions, setActions] = useState<ActionCard[]>(defaultActions);
    const [insights, setInsights] = useState<any>(null);
    const [expandedAction, setExpandedAction] = useState<string | null>(null);
    const [computing, setComputing] = useState(false);

    useEffect(() => {
        // Load sessions for chart fallback
        fetchSessions()
            .then(({ sessions: s }) => setSessions(s))
            .catch(() => {});

        setLoading(true);
        fetchInsightsData()
            .then(data => {
                if (data.insights) {
                    setInsights(data.insights);
                    const aiActions = (data.insights.recommendedActions || []).map((a: any) => ({
                        icon: Target,
                        title: a.title,
                        description: a.description,
                        impact: a.impact || 'Medium',
                        effort: a.effort || 'Medium',
                        source: 'ai' as const,
                    }));
                    setActions(aiActions.length > 0 ? aiActions : defaultActions);
                }
            })
            .catch(err => console.error('Failed to fetch insights:', err))
            .finally(() => setLoading(false));

        const es = subscribeToInsightsStream((event) => {
            const aiActions = (event.recommendedActions || []).map((a: any) => ({
                icon: Target,
                title: a.title,
                description: a.description,
                impact: a.impact || 'Medium',
                effort: a.effort || 'Medium',
                source: 'ai' as const,
            }));
            if (aiActions.length > 0) setActions(aiActions);
        });

        return () => es.close();
    }, []);

    // Build trend data from sessions (by month) — used as fallback when backend has no trend data
    const buildTrendDataFromSessions = (s: SessionSummary[]) => {
        const months: Record<string, { completed: number; total: number }> = {};
        s.forEach((sess) => {
            const d = new Date(sess.startedAt);
            const key = d.toLocaleString('default', { month: 'short' });
            if (!months[key]) months[key] = { completed: 0, total: 0 };
            months[key].total += 1;
            if (sess.status === 'completed') months[key].completed += 1;
        });
        return Object.entries(months).map(([month, v]) => ({
            month,
            sessions: v.total,
            completed: v.completed,
        }));
    };

    const trendData = insights?.trendData || buildTrendDataFromSessions(sessions);

    const hasTrends = trendData.length >= 1;

    const handleCompute = async () => {
        setComputing(true);
        try {
            const data = await computeInsightsData();
            if (data.insights) {
                setInsights(data.insights);
                const aiActions = (data.insights.recommendedActions || []).map((a: any) => ({
                    icon: Target,
                    title: a.title,
                    description: a.description,
                    impact: a.impact || 'Medium',
                    effort: a.effort || 'Medium',
                    source: 'ai' as const,
                }));
                setActions(aiActions.length > 0 ? aiActions : defaultActions);
            }
        } catch (err) {
            console.error('Failed to compute insights:', err);
        } finally {
            setComputing(false);
        }
    };
    const completedCount = sessions.filter((s) => s.status === 'completed').length;
    const improving = completedCount > 0;

    return (
        <div className="insights">
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">{t('insights.title')}</h1>
                    <p className="page-header__subtitle">
                        {t('insights.subtitle')}
                    </p>
                </div>
                <button
                    className="insights__compute-btn"
                    onClick={handleCompute}
                    disabled={computing}
                >
                    {computing ? <Loader size={16} className="spin" /> : <RefreshCw size={16} />}
                    {computing ? 'Analyzing...' : 'Generate AI Insights'}
                </button>
            </div>

            {/* Performance Trends chart */}
            <SectionCard
                title={t('insights.perfTrends')}
                headerRight={
                    improving ? (
                        <span className="insights__trend-badge">
                            <TrendingUp size={14} /> {t('insights.improving')}
                        </span>
                    ) : null
                }
            >
                <div className="insights__chart">
                    {loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 250 }}>
                            <Loader size={20} className="spin" />
                        </div>
                    ) : hasTrends ? (
                        <div dir="ltr" style={{ width: '100%', height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={trendData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey="month" stroke="rgba(255,255,255,0.5)" />
                                <YAxis yAxisId="left" domain={[0, 16]} stroke="rgba(255,255,255,0.5)" />
                                <YAxis yAxisId="right" orientation="right" domain={[0, 60]} stroke="rgba(255,255,255,0.5)" />
                                <Tooltip
                                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                                    itemStyle={{ color: '#f8fafc' }}
                                />
                                <Line yAxisId="left" type="monotone" dataKey="sessions" stroke="#4ade80" strokeWidth={2} dot={{ fill: '#4ade80' }} name={t('insights.totalSessions')} />
                                <Line yAxisId="right" type="monotone" dataKey="completed" stroke="#94a3b8" strokeWidth={2} dot={{ fill: '#94a3b8' }} name={t('dash.completed')} />
                            </ComposedChart>
                        </ResponsiveContainer>
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '3rem' }}>
                            {sessions.length === 0 ? t('insights.noData') : t('insights.notEnoughData')}
                        </p>
                    )}
                </div>
            </SectionCard>

            {/* Gap Analysis */}
            {insights?.gapAnalysis && insights.gapAnalysis.length > 0 && (
                <>
                    <h3 className="insights__section-label">Top Gaps Identified</h3>
                    <SectionCard title="">
                        <div className="insights__gap-table-wrapper">
                            <table className="insights__gap-table">
                                <thead>
                                    <tr>
                                        <th>Area</th>
                                        <th>Gap</th>
                                        <th>Severity</th>
                                        <th>Est. Impact</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {insights.gapAnalysis.map((g: any, i: number) => (
                                        <tr key={i}>
                                            <td>{g.area}</td>
                                            <td>{g.gap}</td>
                                            <td><StatusBadge label={g.severity} /></td>
                                            <td className="insights__impact-cell">{g.impact}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </>
            )}

            {/* Automation Opportunities */}
            {insights?.automationOpportunities && insights.automationOpportunities.length > 0 && (
                <>
                    <h3 className="insights__section-label">Automation Opportunities</h3>
                    <SectionCard title="">
                        <div className="insights__gap-table-wrapper">
                            <table className="insights__gap-table">
                                <thead>
                                    <tr>
                                        <th>Process</th>
                                        <th>Est. Savings</th>
                                        <th>Effort</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {insights.automationOpportunities.map((a: any, i: number) => (
                                        <tr key={i}>
                                            <td>{a.process}</td>
                                            <td className="insights__impact-cell">{a.savings}</td>
                                            <td><StatusBadge label={a.effort} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </>
            )}

            {/* Recommended Actions */}
            <h3 className="insights__section-label">
                {t('insights.recommendedActions')}
            </h3>
            {!insights && !loading && (
                <div className="insights__empty-state">
                    <Target size={32} />
                    <p>No AI insights generated yet. Click "Generate AI Insights" to analyze your assessment data.</p>
                </div>
            )}
            <div className="insights__actions">
                {actions.map((action) => {
                    const isExpanded = expandedAction === action.title;
                    return (
                        <div key={action.title} className={`action-card ${isExpanded ? 'action-card--expanded' : ''}`}>
                            <div className={`action-card__icon ${action.source === 'ai' ? 'action-card__icon--ai' : ''}`}>
                                <action.icon size={20} />
                            </div>
                            <div className="action-card__content">
                                <h4 className="action-card__title">
                                    {action.title}
                                    {action.source === 'ai' && <span className="action-card__ai-tag">AI</span>}
                                </h4>
                                <p className="action-card__desc">
                                    {isExpanded && action.fullText ? action.fullText : action.description}
                                </p>
                                <div className="action-card__tags">
                                    <span className="action-card__tag">
                                        {t('insights.impact')} <StatusBadge label={action.impact} />
                                    </span>
                                    <span className="action-card__tag">
                                        {t('insights.effort')} <strong>{action.effort}</strong>
                                    </span>
                                </div>
                            </div>
                            {action.fullText && (
                                <button
                                    className="action-card__btn"
                                    onClick={() => setExpandedAction(isExpanded ? null : action.title)}
                                >
                                    {isExpanded ? 'Hide Details' : 'View Details'}
                                </button>
                            )}
                            {!action.fullText && (
                                <button className="action-card__btn" disabled>View Details</button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
