import { useState, useEffect } from 'react';
import {
    Download,
    Share2,
    ChevronLeft,
    CheckCircle,
    AlertTriangle,
    ArrowRight
} from 'lucide-react';
import './ReadinessReport.css';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';

interface ReadinessReportData {
    sessionId: string;
    generatedAt: string;
    overallScore: number;
    overallMaturity: string;
    executiveSummary: string;
    areaScores: {
        areaId: string;
        areaName: string;
        score: number;
        maturityLevel: string;
        strengths: string[];
        weaknesses: string[];
        recommendations: string[];
    }[];
    keyFindings: string[];
    priorityRecommendations: string[];
    chartData: {
        pieChart: { name: string; value: number }[];
        maturityRadar: { area: string; current: number; target: number }[];
    };
}

interface GapReportData {
    sessionId: string;
    generatedAt: string;
    executiveSummary: string;
    gaps: {
        id: string;
        category: string;
        currentState: string;
        targetState: string;
        gap: string;
        impact: 'high' | 'medium' | 'low';
        effort: 'high' | 'medium' | 'low';
        priority: number;
    }[];
    quickWins: {
        id: string;
        gap: string;
        impact: string;
    }[];
    roadmap: {
        phase: string;
        duration: string;
        items: string[];
    }[];
    riskAssessment: {
        risk: string;
        likelihood: string;
        impact: string;
        mitigation: string;
    }[];
}

interface ReadinessReportProps {
    sessionId: string;
    type: 'readiness' | 'gap';
    onBack: () => void;
    selectedModel?: string;
}

const API_BASE = '/api';

export default function ReadinessReport({ sessionId, type, onBack, selectedModel = '' }: ReadinessReportProps) {
    const { token } = useAuth();
    const { language, t } = useLanguage();
    const [readinessData, setReadinessData] = useState<ReadinessReportData | null>(null);
    const [gapData, setGapData] = useState<GapReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchReport = async () => {
            setLoading(true);
            try {
                const modelParam = selectedModel ? `?model=${encodeURIComponent(selectedModel)}` : '';
                const endpoint = type === 'readiness'
                    ? `/readiness/${sessionId}/report/readiness${modelParam}`
                    : `/readiness/${sessionId}/report/gap${modelParam}`;

                const res = await fetch(`${API_BASE}${endpoint}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                const data = await res.json();

                if (data.error) throw new Error(data.error);

                if (type === 'readiness') {
                    setReadinessData(data.report);
                } else {
                    setGapData(data.report);
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load report');
            } finally {
                setLoading(false);
            }
        };

        if (token) {
            fetchReport();
        }
    }, [sessionId, type, token]);

    const getMaturityColor = (score: number) => {
        if (score >= 80) return '#10b981'; // Emerald
        if (score >= 60) return '#3b82f6'; // Blue
        if (score >= 40) return '#f59e0b'; // Amber
        return '#ef4444'; // Red
    };

    // --- Chart Components ---

    const RadarChart = ({ data }: { data: { area: string; current: number; target: number }[] }) => {
        const size = 300;
        const center = size / 2;
        const radius = (size / 2) - 40;
        const angleStep = (Math.PI * 2) / data.length;

        const getCoordinates = (value: number, index: number) => {
            const angle = index * angleStep - Math.PI / 2;
            const r = (value / 100) * radius;
            return [
                center + r * Math.cos(angle),
                center + r * Math.sin(angle)
            ];
        };

        const currentPath = data.map((d, i) => getCoordinates(d.current, i).join(',')).join(' ');
        const targetPath = data.map((d, i) => getCoordinates(d.target, i).join(',')).join(' ');

        return (
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size} `} className="radar-chart">
                {/* Grid */}
                {[20, 40, 60, 80, 100].map(level => (
                    <circle
                        key={level}
                        cx={center}
                        cy={center}
                        r={(radius * level) / 100}
                        fill="none"
                        stroke="#334155"
                        strokeDasharray="4 4"
                    />
                ))}

                {/* Axes */}
                {data.map((_, i) => {
                    const [x, y] = getCoordinates(100, i);
                    return (
                        <line
                            key={i}
                            x1={center}
                            y1={center}
                            x2={x}
                            y2={y}
                            stroke="#334155"
                        />
                    );
                })}

                {/* Target Area */}
                <polygon
                    points={targetPath}
                    fill="rgba(99, 102, 241, 0.1)"
                    stroke="#6366f1"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                />

                {/* Current Area */}
                <polygon
                    points={currentPath}
                    fill="rgba(16, 185, 129, 0.2)"
                    stroke="#10b981"
                    strokeWidth="2"
                />

                {/* Labels */}
                {data.map((d, i) => {
                    const [x, y] = getCoordinates(115, i);
                    return (
                        <text
                            key={i}
                            x={x}
                            y={y}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="#94a3b8"
                            fontSize="10"
                        >
                            {d.area}
                        </text>
                    );
                })}
            </svg>
        );
    };

    // --- Render Functions ---

    const renderReadinessReport = () => {
        if (!readinessData) return null;

        return (
            <div className="report-content">
                <header className="report-header">
                    <div className="report-meta">
                        <span className="report-date">{t('report.generated')}{new Date(readinessData.generatedAt).toLocaleDateString(language)}</span>
                        <span className={`maturity - badge ${readinessData.overallMaturity} `}>
                            {readinessData.overallMaturity.toUpperCase()}
                        </span>
                    </div>
                    <h1>{t('report.readinessTitle')}</h1>
                    <div className="overall-score">
                        <div className="score-ring" style={{
                            background: `conic - gradient(${getMaturityColor(readinessData.overallScore)} ${readinessData.overallScore}%, #1e293b 0)`
                        }}>
                            <div className="score-inner">
                                <span className="score-value">{readinessData.overallScore}</span>
                                <span className="score-label">/100</span>
                            </div>
                        </div>
                        <p className="score-desc">{t('report.overallMaturity')}</p>
                    </div>
                </header>

                <section className="executive-summary">
                    <h3>{t('report.execSummary')}</h3>
                    <p>{readinessData.executiveSummary}</p>
                </section>

                <div className="report-grid">
                    <section className="visualization-card">
                        <h3>{t('report.maturityRadar')}</h3>
                        <div className="chart-container">
                            <RadarChart data={readinessData.chartData.maturityRadar} />
                            <div className="chart-legend">
                                <span className="legend-item current">{t('report.currentStateLabel')}</span>
                                <span className="legend-item target">{t('report.targetState')}</span>
                            </div>
                        </div>
                    </section>

                    <section className="key-findings">
                        <h3>{t('report.keyFindings')}</h3>
                        <ul>
                            {readinessData.keyFindings.map((finding, i) => (
                                <li key={i}>{finding}</li>
                            ))}
                        </ul>
                    </section>
                </div>

                <section className="area-details">
                    <h3>{t('report.detailedAnalysis')}</h3>
                    <div className="areas-list">
                        {readinessData.areaScores.map(area => (
                            <div key={area.areaId} className="area-report-card">
                                <div className="area-header">
                                    <h4>{area.areaName}</h4>
                                    <span
                                        className="area-score"
                                        style={{ color: getMaturityColor(area.score) }}
                                    >
                                        {area.score}%
                                    </span>
                                </div>
                                <div className="swot-grid">
                                    <div className="swot-col strengths">
                                        <h5>{t('report.strengths')}</h5>
                                        <ul>{area.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                                    </div>
                                    <div className="swot-col weaknesses">
                                        <h5>{t('report.weaknesses')}</h5>
                                        <ul>{area.weaknesses.map((w, i) => <li key={i}>{w}</li>)}</ul>
                                    </div>
                                </div>
                                <div className="recommendations">
                                    <h5>{t('report.recommendations')}</h5>
                                    <ul>
                                        {area.recommendations.map((rec, i) => (
                                            <li key={i}><ArrowRight size={14} /> {rec}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        );
    };

    const renderGapReport = () => {
        if (!gapData) return null;

        return (
            <div className="report-content">
                <header className="report-header">
                    <div className="report-meta">
                        <span className="report-date">{t('report.generated')}{new Date(gapData.generatedAt).toLocaleDateString(language)}</span>
                    </div>
                    <h1>{t('report.gapTitle')}</h1>
                </header>

                <section className="executive-summary">
                    <h3>{t('report.execSummary')}</h3>
                    <p>{gapData.executiveSummary}</p>
                </section>

                <div className="report-grid">
                    <section className="quick-wins">
                        <h3>🚀 {t('report.quickWins')}</h3>
                        <div className="wins-list">
                            {gapData.quickWins.map(win => (
                                <div key={win.id} className="win-card">
                                    <CheckCircle size={20} className="win-icon" />
                                    <p>{win.gap}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="risk-matrix">
                        <h3>{t('report.riskAssessment')}</h3>
                        {gapData.riskAssessment.map((risk, i) => (
                            <div key={i} className="risk-item">
                                <div className="risk-header">
                                    <AlertTriangle size={16} className={risk.impact} />
                                    <span className="risk-title">{risk.risk}</span>
                                </div>
                                <p className="risk-mitigation">{t('report.mitigation')}{risk.mitigation}</p>
                            </div>
                        ))}
                    </section>
                </div>

                <section className="roadmap-section">
                    <h3>{t('report.roadmap')}</h3>
                    <div className="timeline">
                        {gapData.roadmap.map((phase, i) => (
                            <div key={i} className="timeline-item">
                                <div className="timeline-marker"></div>
                                <div className="timeline-content">
                                    <div className="timeline-header">
                                        <h4>{phase.phase}</h4>
                                        <span className="duration">{phase.duration}</span>
                                    </div>
                                    <ul>
                                        {phase.items.map((item, j) => (
                                            <li key={j}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="gaps-table-section">
                    <h3>{t('report.gapInventory')}</h3>
                    <table className="gaps-table">
                        <thead>
                            <tr>
                                <th>{t('report.category')}</th>
                                <th>{t('report.gapDesc')}</th>
                                <th>{t('report.impact')}</th>
                                <th>{t('report.effort')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {gapData.gaps.map(gap => (
                                <tr key={gap.id}>
                                    <td><span className="badge">{gap.category}</span></td>
                                    <td>
                                        <div className="gap-desc">{gap.gap}</div>
                                        <div className="gap-state">
                                            <small>{t('report.currentLabel')}{gap.currentState}</small>
                                            <small>{t('report.targetLabel')}{gap.targetState}</small>
                                        </div>
                                    </td>
                                    <td><span className={`impact - badge ${gap.impact} `}>{gap.impact}</span></td>
                                    <td><span className={`effort - badge ${gap.effort} `}>{gap.effort}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            </div>
        );
    };

    if (loading) return (
        <div className="report-loading">
            <div className="spinner"></div>
            <p>{t('report.generatingReport')}</p>
        </div>
    );

    if (error) return (
        <div className="report-error">
            <AlertTriangle size={48} />
            <p>{error}</p>
            <button onClick={onBack} className="btn-secondary">{t('report.goBack')}</button>
        </div>
    );

    return (
        <div className="readiness-report">
            <div className="report-toolbar">
                <button onClick={onBack} className="btn-icon">
                    <ChevronLeft size={20} /> {t('pa.back')}
                </button>
                <div className="toolbar-actions">
                    <button className="btn-secondary">
                        <Share2 size={18} /> {t('report.share')}
                    </button>
                    <button className="btn-primary">
                        <Download size={18} /> {t('report.export')} PDF
                    </button>
                </div>
            </div>

            <div className="report-container">
                {type === 'readiness' ? renderReadinessReport() : renderGapReport()}
            </div>
        </div>
    );
}
