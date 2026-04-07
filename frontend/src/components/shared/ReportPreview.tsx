import { PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import StatusBadge from './StatusBadge';
import './ReportPreview.css';

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

interface ReadinessReportData {
    overallScore: number;
    overallMaturity: string;
    executiveSummary: string;
    areaScores: {
        areaName: string;
        score: number;
        maturityLevel: string;
        strengths: string[];
        weaknesses: string[];
        recommendations: string[];
    }[];
    keyFindings: string[];
    priorityRecommendations: string[];
    chartData?: {
        pieChart?: { name: string; value: number }[];
        maturityRadar?: { area: string; current: number; target: number }[];
    };
}

interface GapReportData {
    executiveSummary: string;
    gaps: {
        category: string;
        area: string;
        currentState: string;
        targetState: string;
        gap: string;
        impact: string;
        effort: string;
        fit: string;
    }[];
    quickWins: any[];
    roadmap: { phase: string; duration: string; items: string[] }[];
    riskAssessment: { risk: string; likelihood: string; impact: string; mitigation: string }[];
    chartData?: {
        gapsByCategory?: { name: string; count: number; highImpact: number }[];
        maturityRadar?: { area: string; current: number; target: number; fullMark?: number }[];
    };
}

export function ReadinessReportPreview({ data }: { data: ReadinessReportData }) {
    const radar = data.chartData?.maturityRadar || [];
    const pie = data.chartData?.pieChart || [];

    return (
        <div className="rpt">
            {/* Overall Score */}
            <div className="rpt__score-ring">
                <div className="rpt__score-circle" style={{ '--score': data.overallScore } as any}>
                    <span className="rpt__score-value">{data.overallScore}</span>
                    <span className="rpt__score-label">Overall</span>
                </div>
                <StatusBadge label={data.overallMaturity} />
            </div>

            {/* Executive Summary */}
            <div className="rpt__section">
                <h4 className="rpt__heading">Executive Summary</h4>
                <p className="rpt__text">{data.executiveSummary}</p>
            </div>

            {/* Charts row */}
            {(radar.length > 0 || pie.length > 0) && (
                <div className="rpt__charts">
                    {radar.length > 0 && (
                        <div className="rpt__chart-box">
                            <h5 className="rpt__chart-title">Maturity Radar</h5>
                            <ResponsiveContainer width="100%" height={220}>
                                <RadarChart data={radar}>
                                    <PolarGrid stroke="#1e293b" />
                                    <PolarAngleAxis dataKey="area" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                    <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                                    <Radar name="Current" dataKey="current" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} />
                                    <Radar name="Target" dataKey="target" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                    {pie.length > 0 && (
                        <div className="rpt__chart-box">
                            <h5 className="rpt__chart-title">Area Scores</h5>
                            <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                    <Pie data={pie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                                        {pie.map((_, i) => (
                                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            )}

            {/* Area Scores */}
            {data.areaScores?.length > 0 && (
                <div className="rpt__section">
                    <h4 className="rpt__heading">Area Assessments</h4>
                    {data.areaScores.map((area) => (
                        <div key={area.areaName} className="rpt__area">
                            <div className="rpt__area-header">
                                <span className="rpt__area-name">{area.areaName}</span>
                                <span className="rpt__area-score">{area.score}/100</span>
                                <StatusBadge label={area.maturityLevel} />
                            </div>
                            <div className="rpt__area-bar">
                                <div className="rpt__area-fill" style={{ width: `${area.score}%` }} />
                            </div>
                            {area.strengths?.length > 0 && (
                                <div className="rpt__list-group">
                                    <span className="rpt__list-label rpt__list-label--success">Strengths</span>
                                    <ul className="rpt__list">{area.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                                </div>
                            )}
                            {area.weaknesses?.length > 0 && (
                                <div className="rpt__list-group">
                                    <span className="rpt__list-label rpt__list-label--error">Weaknesses</span>
                                    <ul className="rpt__list">{area.weaknesses.map((s, i) => <li key={i}>{s}</li>)}</ul>
                                </div>
                            )}
                            {area.recommendations?.length > 0 && (
                                <div className="rpt__list-group">
                                    <span className="rpt__list-label rpt__list-label--primary">Recommendations</span>
                                    <ul className="rpt__list">{area.recommendations.map((s, i) => <li key={i}>{s}</li>)}</ul>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Key Findings */}
            {data.keyFindings?.length > 0 && (
                <div className="rpt__section">
                    <h4 className="rpt__heading">Key Findings</h4>
                    <ul className="rpt__list rpt__list--numbered">
                        {data.keyFindings.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                </div>
            )}

            {/* Priority Recommendations */}
            {data.priorityRecommendations?.length > 0 && (
                <div className="rpt__section">
                    <h4 className="rpt__heading">Priority Recommendations</h4>
                    <ul className="rpt__list rpt__list--numbered">
                        {data.priorityRecommendations.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
}

const SEVERITY_COLORS: Record<string, string> = {
    critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#10b981',
};
const FIT_LABELS: Record<string, string> = {
    gap: 'Gap', partial: 'Partial', fit: 'Fit',
};
const SIZE_LABELS = ['S', 'M', 'L'];

export function GapRegisterTab({ reportGaps, contextGaps, painPoints }: {
    reportGaps?: GapReportData['gaps'];
    contextGaps?: string[];
    painPoints?: string[];
}) {
    const gaps = reportGaps || [];
    const hasContextGaps = (contextGaps && contextGaps.length > 0) || (painPoints && painPoints.length > 0);

    if (gaps.length === 0 && !hasContextGaps) {
        return <div className="rpt"><p className="rpt__text" style={{ textAlign: 'center', padding: '2rem' }}>No gaps identified yet. Complete an assessment interview to generate gap data.</p></div>;
    }

    return (
        <div className="rpt">
            {gaps.length > 0 && (
                <div className="rpt__section">
                    <div className="rpt__gap-table-wrap">
                        <table className="rpt__gap-table rpt__gap-register">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Severity</th>
                                    <th>Area</th>
                                    <th>Type</th>
                                    <th>Fit</th>
                                    <th>Size</th>
                                    <th>Description</th>
                                    <th>SAP Standard</th>
                                </tr>
                            </thead>
                            <tbody>
                                {gaps.map((g, i) => {
                                    const severity = g.impact === 'high' ? 'Critical' : g.impact === 'medium' ? 'Medium' : 'Low';
                                    const sevColor = SEVERITY_COLORS[severity.toLowerCase()] || SEVERITY_COLORS.medium;
                                    const size = SIZE_LABELS[i % 3];
                                    return (
                                        <tr key={i}>
                                            <td className="rpt__gap-id">GAP-{String(i + 1).padStart(4, '0')}</td>
                                            <td><span className="rpt__severity-badge" style={{ background: sevColor }}>{severity}</span></td>
                                            <td>{g.area || '—'}</td>
                                            <td>{g.category || 'Process'}</td>
                                            <td>{FIT_LABELS[g.fit] || g.fit || '—'}</td>
                                            <td><span className={`rpt__size-badge rpt__size-badge--${size.toLowerCase()}`}>{size}</span></td>
                                            <td>
                                                <div className="rpt__gap-cell-main">{g.gap}</div>
                                                {g.currentState && <div className="rpt__gap-cell-sub">→ {g.currentState}</div>}
                                            </td>
                                            <td className="rpt__sap-standard">{g.fit === 'gap' ? `SAP S/4HANA ${g.area}` : g.fit === 'partial' ? `SAP BPC ${g.area}` : `SAP Standard ${g.area}`}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {contextGaps && contextGaps.length > 0 && (
                <div className="rpt__section">
                    <h4 className="rpt__heading">Identified Gaps from Interviews</h4>
                    <ul className="rpt__list rpt__list--numbered">
                        {contextGaps.map((g, i) => <li key={i}>{g}</li>)}
                    </ul>
                </div>
            )}
            {painPoints && painPoints.length > 0 && (
                <div className="rpt__section">
                    <h4 className="rpt__heading">Pain Points</h4>
                    <ul className="rpt__list rpt__list--numbered">
                        {painPoints.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
}

export function InterviewQATab({ qaHistory }: { qaHistory: { area?: string; question: string; answer: any; type?: string }[] }) {
    if (!qaHistory || qaHistory.length === 0) {
        return <div className="rpt"><p className="rpt__text" style={{ textAlign: 'center', padding: '2rem' }}>No interview responses yet. Complete an assessment interview to see Q&A history.</p></div>;
    }

    // Group by area
    const grouped: Record<string, typeof qaHistory> = {};
    for (const qa of qaHistory) {
        const area = qa.area || 'General';
        if (!grouped[area]) grouped[area] = [];
        grouped[area].push(qa);
    }

    return (
        <div className="rpt">
            {Object.entries(grouped).map(([area, items]) => (
                <div key={area} className="rpt__section">
                    <h4 className="rpt__heading">{area}</h4>
                    <div className="rpt__qa-list">
                        {items.map((qa, i) => (
                            <div key={i} className="rpt__qa-item">
                                <div className="rpt__qa-question">
                                    <span className="rpt__qa-num">Q{i + 1}</span>
                                    {qa.question}
                                </div>
                                <div className="rpt__qa-answer">
                                    <span className="rpt__qa-label">A:</span>
                                    {typeof qa.answer === 'string' ? qa.answer : Array.isArray(qa.answer) ? qa.answer.join(', ') : String(qa.answer)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

export function GapReportPreview({ data }: { data: GapReportData }) {
    const gapsByCat = data.chartData?.gapsByCategory || [];
    const radar = data.chartData?.maturityRadar || [];

    return (
        <div className="rpt">
            {/* Executive Summary */}
            <div className="rpt__section">
                <h4 className="rpt__heading">Executive Summary</h4>
                <p className="rpt__text">{data.executiveSummary}</p>
            </div>

            {/* Charts */}
            {(gapsByCat.length > 0 || radar.length > 0) && (
                <div className="rpt__charts">
                    {gapsByCat.length > 0 && (
                        <div className="rpt__chart-box">
                            <h5 className="rpt__chart-title">Gaps by Category</h5>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={gapsByCat}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                                    <Legend />
                                    <Bar dataKey="count" name="Total Gaps" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="highImpact" name="High Impact" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                    {radar.length > 0 && (
                        <div className="rpt__chart-box">
                            <h5 className="rpt__chart-title">Maturity: Current vs Target</h5>
                            <ResponsiveContainer width="100%" height={220}>
                                <RadarChart data={radar}>
                                    <PolarGrid stroke="#1e293b" />
                                    <PolarAngleAxis dataKey="area" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                    <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                                    <Radar name="Current" dataKey="current" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.25} />
                                    <Radar name="Target" dataKey="target" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            )}

            {/* Quick Wins */}
            {data.quickWins?.length > 0 && (
                <div className="rpt__section">
                    <h4 className="rpt__heading">Quick Wins (High Impact, Low Effort)</h4>
                    <div className="rpt__gap-cards">
                        {data.quickWins.map((g, i) => (
                            <div key={i} className="rpt__gap-card rpt__gap-card--quickwin">
                                <div className="rpt__gap-card-header">
                                    <StatusBadge label={g.category} />
                                    <StatusBadge label={`Impact: ${g.impact}`} />
                                </div>
                                <p className="rpt__gap-desc">{g.gap}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Gap Table */}
            {data.gaps?.length > 0 && (
                <div className="rpt__section">
                    <h4 className="rpt__heading">Identified Gaps ({data.gaps.length})</h4>
                    <div className="rpt__gap-table-wrap">
                        <table className="rpt__gap-table">
                            <thead>
                                <tr>
                                    <th>Gap</th>
                                    <th>Category</th>
                                    <th>Impact</th>
                                    <th>Effort</th>
                                    <th>Fit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.gaps.slice(0, 15).map((g, i) => (
                                    <tr key={i}>
                                        <td>
                                            <div className="rpt__gap-cell-main">{g.gap}</div>
                                            {g.currentState && <div className="rpt__gap-cell-sub">Current: {g.currentState}</div>}
                                        </td>
                                        <td><StatusBadge label={g.category} /></td>
                                        <td><StatusBadge label={g.impact} /></td>
                                        <td><StatusBadge label={g.effort} /></td>
                                        <td><StatusBadge label={g.fit} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Roadmap */}
            {data.roadmap?.length > 0 && (
                <div className="rpt__section">
                    <h4 className="rpt__heading">Implementation Roadmap</h4>
                    <div className="rpt__roadmap">
                        {data.roadmap.map((phase, i) => (
                            <div key={i} className="rpt__roadmap-phase">
                                <div className="rpt__roadmap-header">
                                    <span className="rpt__roadmap-name">{phase.phase}</span>
                                    <span className="rpt__roadmap-dur">{phase.duration}</span>
                                </div>
                                <ul className="rpt__list">
                                    {phase.items?.map((item, j) => <li key={j}>{item}</li>)}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Risk Assessment */}
            {data.riskAssessment?.length > 0 && (
                <div className="rpt__section">
                    <h4 className="rpt__heading">Risk Assessment</h4>
                    <div className="rpt__gap-cards">
                        {data.riskAssessment.map((r, i) => (
                            <div key={i} className="rpt__gap-card">
                                <div className="rpt__gap-card-header">
                                    <StatusBadge label={`Likelihood: ${r.likelihood}`} />
                                    <StatusBadge label={`Impact: ${r.impact}`} />
                                </div>
                                <p className="rpt__gap-desc"><strong>{r.risk}</strong></p>
                                <p className="rpt__gap-sub">{r.mitigation}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
