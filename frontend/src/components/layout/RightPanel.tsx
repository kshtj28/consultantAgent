import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingDown, ChevronRight, Clock, Loader } from 'lucide-react';
import { fetchRiskSummary, type RiskItem, type EngagementEntry } from '../../services/api';
import { formatRelativeTime } from '../../utils/format';
import { useLanguage } from '../../i18n/LanguageContext';
import './RightPanel.css';

export default function RightPanel() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [risks, setRisks] = useState<RiskItem[]>([]);
    const [engagement, setEngagement] = useState<EngagementEntry[]>([]);
    const [totalRisks, setTotalRisks] = useState(0);
    const [overallEngagement, setOverallEngagement] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchRiskSummary()
            .then((res) => {
                setRisks(res.risks || []);
                setEngagement(res.engagement || []);
                setTotalRisks(res.totalRisks || 0);
                setOverallEngagement(res.overallEngagement || 0);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    return (
        <aside className="right-panel">
            {/* Section 1: Key Risks & Narratives */}
            <section className="right-panel__section">
                <div className="right-panel__section-header">
                    <h3 className="right-panel__section-title">{t('panel.keyRisks')}</h3>
                    {totalRisks > 0 && (
                        <span className="right-panel__risk-badge">{totalRisks}</span>
                    )}
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                        <Loader size={16} className="spin" />
                    </div>
                ) : risks.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: '0.8rem', textAlign: 'center', padding: '1.5rem' }}>
                        {t('panel.noRisks')}
                    </p>
                ) : (
                    <div className="right-panel__risk-list">
                        {risks.slice(0, 3).map((risk) => (
                            <div key={risk.id} className="risk-card">
                                <div className="risk-card__header">
                                    <span className={`risk-card__severity ${risk.severity === 'HIGH RISK' ? 'risk-card__severity--high' : risk.severity === 'MEDIUM RISK' ? 'risk-card__severity--medium' : 'risk-card__severity--low'}`}>
                                        <span className="risk-card__severity-dot" />
                                        {risk.severity}
                                    </span>
                                    <span className="risk-card__timestamp">
                                        <Clock size={10} />
                                        {formatRelativeTime(risk.timestamp)}
                                    </span>
                                </div>
                                <p className="risk-card__title">{risk.title}</p>
                                <div className="risk-card__meta">
                                    <div className="risk-card__assignee">
                                        <span className="risk-card__assignee-role">
                                            {risk.smeContact?.name}, {risk.smeContact?.role}
                                        </span>
                                    </div>
                                    <span className="risk-card__impact">
                                        <TrendingDown size={12} className="risk-card__impact-icon" />
                                        {risk.annualImpact}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {totalRisks > 0 && (
                    <button className="right-panel__view-all" onClick={() => navigate('/insights')}>
                        {t('panel.viewAllRisks')} ({totalRisks} {t('panel.total')})
                        <ChevronRight size={14} />
                    </button>
                )}
            </section>

            {/* Section 2: SME Engagement Heatmap */}
            <section className="right-panel__section">
                <div className="right-panel__section-header">
                    <h3 className="right-panel__section-title">{t('panel.smeHeatmap')}</h3>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                        <Loader size={16} className="spin" />
                    </div>
                ) : engagement.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>
                        {t('panel.noEngagement')}
                    </p>
                ) : (
                    <div className="heatmap">
                        {engagement.map((entry) => (
                            <div key={entry.label} className="heatmap__row">
                                <span className="heatmap__label">{entry.label}</span>
                                <div className="heatmap__bar-track">
                                    <div
                                        className={`heatmap__bar-fill heatmap__bar-fill--${entry.color}`}
                                        style={{ width: `${entry.percent}%` }}
                                    />
                                </div>
                                <span className="heatmap__percent">{entry.percent}%</span>
                            </div>
                        ))}
                    </div>
                )}

                <p className="heatmap__overall">
                    {t('panel.overallEngagement')}: <strong>{overallEngagement}% {t('panel.average')}</strong>
                </p>
            </section>
        </aside>
    );
}
