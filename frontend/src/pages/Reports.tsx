import { useEffect, useState, useCallback } from 'react';
import GpuWarmupOverlay from '../components/shared/GpuWarmupOverlay';
import { useGpuWarmup } from '../hooks/useGpuWarmup';
import {
    FileText,
    Download,
    Database,
    Calendar,
    X,
    Loader,
    Trash2,
    RefreshCw,
    Eye,
} from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import StatCard from '../components/shared/StatCard';
import SectionCard from '../components/shared/SectionCard';
import { SkeletonStatCards, SkeletonTable } from '../components/shared/Skeleton';
import {
    fetchReports,
    fetchReportStats,
    downloadReport,
    deleteReport,
    subscribeToReportStream,
    downloadRTM,
    retryReport,
    fetchCumulativeGaps,
    type ReportRecord,
    type ReportStats,
    type CumulativeGapData,
} from '../services/api';
import { generateReportPDF } from '../utils/pdfExport';
import { useLanguage } from '../i18n/LanguageContext';
import * as XLSX from 'xlsx';
import './Reports.css';
import { ConsolidatedReportModal } from '../components/ConsolidatedReportModal';

const TYPE_LABEL_KEYS: Record<string, string> = {
    readiness:    'reports.typeExecutive',
    gap_analysis: 'reports.typeDetailed',
    broad_area:   'reports.typeGapAnalysis',
    consolidated: 'reports.typeConsolidated',
    interview:    'reports.typeRaw',
    strategic:    'reports.typeStrategic',
};

const SEVERITY_COLORS: Record<string, string> = {
    High: '#ef4444',
    Medium: '#f59e0b',
    Low: '#10b981',
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#10b981',
};

function relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

export default function Reports() {
    const { t } = useLanguage();

    const [reports, setReports] = useState<ReportRecord[]>([]);
    const [stats, setStats] = useState<ReportStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [generatingReports, setGeneratingReports] = useState<Map<string, any>>(new Map());
    const [bannerDismissed, setBannerDismissed] = useState(false);
    const [cumulativeGaps, setCumulativeGaps] = useState<CumulativeGapData | null>(null);

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [previewReport, setPreviewReport] = useState<{ data: any; name: string; type: string; reportId: string } | null>(null);
    const [previewLoading, setPreviewLoading] = useState<string | null>(null);
    const warmup = useGpuWarmup();

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    const loadReports = useCallback(async (type?: string) => {
        try {
            const res = await fetchReports(type);
            setReports(res.reports || []);
        } catch {
            setReports([]);
        }
    }, []);

    const loadStats = useCallback(async () => {
        try {
            const res = await fetchReportStats();
            setStats(res);
        } catch {
            setStats(null);
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        Promise.all([loadReports(), loadStats(), fetchCumulativeGaps()])
            .then(([, , gapData]) => {
                setCumulativeGaps(gapData);
            })
            .finally(() => setLoading(false));
    }, [loadReports, loadStats]);

    // SSE subscription for real-time report status updates
    useEffect(() => {
        const es = subscribeToReportStream((event) => {
            setReports(prev => {
                const idx = prev.findIndex(r => r.reportId === event.reportId);
                if (idx >= 0) {
                    const updated = [...prev];
                    updated[idx] = { ...updated[idx], ...event };
                    return updated;
                }
                return [event, ...prev];
            });

            setGeneratingReports(prev => {
                const next = new Map(prev);
                if (event.status === 'generating') {
                    next.set(event.reportId, event);
                } else {
                    next.delete(event.reportId);
                }
                return next;
            });

            if (event.status === 'ready') {
                loadStats();
                // Refresh cumulative gaps when a report becomes ready
                fetchCumulativeGaps().then(setCumulativeGaps).catch(() => {});
            }
        });

        return () => es.close();
    }, []);

    async function handleDelete(reportId: string) {
        if (!confirm('Delete this report?')) return;
        try {
            await deleteReport(reportId);
            await Promise.all([loadReports(), loadStats()]);
        } catch (err: any) {
            showToast(`Failed to delete: ${err.message}`, 'error');
        }
    }

    async function handlePreview(reportId: string, reportName: string, reportType: string) {
        setPreviewLoading(reportId);
        try {
            const data = await downloadReport(reportId);
            const content = data.content ?? data;
            setPreviewReport({ data: content, name: reportName, type: reportType, reportId });
        } catch (err: any) {
            showToast(`Failed to load report: ${err.message}`, 'error');
        } finally {
            setPreviewLoading(null);
        }
    }

    async function handleDownload(reportId: string, reportName: string, reportType: string) {
        try {
            const data = await downloadReport(reportId);
            const content = data.content || data;
            await generateReportPDF({
                name: reportName,
                type: t(TYPE_LABEL_KEYS[reportType] || '') || reportType,
                generatedAt: data.generatedAt || new Date().toISOString(),
                executiveSummary: content.executiveSummary,
                overallScore: content.overallScore,
                overallMaturity: content.overallMaturity,
                keyFindings: content.keyFindings,
                priorityRecommendations: content.priorityRecommendations,
                areaScores: content.areaScores,
                gaps: content.gaps,
                quickWins: content.quickWins,
                roadmap: content.roadmap,
                riskAssessment: content.riskAssessment,
                responses: content.responses,
            });
            showToast('Report downloaded successfully', 'success');
            loadStats();
        } catch (err: any) {
            console.error('PDF generation failed:', err);
            showToast(`Download failed: ${err.message}`, 'error');
        }
    }

    async function handleDownloadRTM(sessionId: string, reportName: string) {
        setPreviewLoading(`rtm-${sessionId}`);
        try {
            const { rtm } = await downloadRTM(sessionId);
            if (!rtm || rtm.length === 0) throw new Error("No RTM data generated.");

            const formattedData = rtm.map((r: any) => ({
                'L1 (Process)': r.l1,
                'L2 (Sub Process)': r.l2,
                'Requirement': r.l3Requirement,
                'Category': r.l3Category,
                'Requirement Type': r.requirementType || '',
                'Priority': r.priority,
                'Effort Estimate': r.effortEstimate || '',
                'Acceptance Criteria': r.acceptanceCriteria || '',
                'Source Evidence': r.sourceEvidence || '',
                'Notes / Flow': r.notes
            }));

            const worksheet = XLSX.utils.json_to_sheet(formattedData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "RTM");

            XLSX.writeFile(workbook, `RTM_${reportName}.xlsx`);
            showToast('RTM exported successfully', 'success');
        } catch (err: any) {
            console.error('RTM generation failed:', err);
            showToast(`RTM Export failed: ${err.message}`, 'error');
        } finally {
            setPreviewLoading(null);
        }
    }

    const statCards = [
        { icon: <FileText size={18} />, label: t('reports.totalReports'), value: String(stats?.totalReports ?? 0) },
        { icon: <Calendar size={18} />, label: t('reports.thisMonth'), value: String(stats?.thisMonth ?? 0) },
        { icon: <Download size={18} />, label: t('reports.downloads'), value: String(stats?.totalDownloads ?? 0) },
        { icon: <Database size={18} />, label: t('reports.storageUsed'), value: stats?.storageUsed ?? '0 MB' },
    ];

    // Prepare cumulative chart data
    const severityData = cumulativeGaps
        ? Object.entries(cumulativeGaps.gapsBySeverity).map(([name, value]) => {
            const key = `severity.${name.toLowerCase()}`;
            const translated = t(key);
            return {
                name: translated !== key ? translated : (name.charAt(0).toUpperCase() + name.slice(1)),
                value,
                _key: name.toLowerCase(),
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

    const totalGaps = cumulativeGaps?.totalGaps ?? 0;
    const highImpactGaps = cumulativeGaps?.gapsBySeverity?.high ?? 0;
    const mediumImpactGaps = cumulativeGaps?.gapsBySeverity?.medium ?? 0;

    return (
        <div className="reports">
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">{t('reports.title')}</h1>
                    <p className="page-header__subtitle">{t('reports.subtitle')}</p>
                </div>
            </div>

            {/* Stat Cards */}
            {loading ? (
                <SkeletonStatCards count={4} />
            ) : (
                <div className="reports__stats">
                    {statCards.map(s => (
                        <StatCard key={s.label} {...s} />
                    ))}
                </div>
            )}

            {/* Cumulative Gap Summary */}
            {!loading && cumulativeGaps && cumulativeGaps.totalGaps > 0 && (
                <SectionCard title={t('reports.cumulativeGapAnalysis')}>
                    {/* Summary KPI row */}
                    <div className="reports__gap-kpis">
                        <div className="reports__gap-kpi">
                            <span className="reports__gap-kpi-value">{totalGaps}</span>
                            <span className="reports__gap-kpi-label">{t('gap.totalGaps')}</span>
                        </div>
                        <div className="reports__gap-kpi">
                            <span className="reports__gap-kpi-value reports__gap-kpi-value--high">{highImpactGaps}</span>
                            <span className="reports__gap-kpi-label">{t('dash.highImpact')}</span>
                        </div>
                        <div className="reports__gap-kpi">
                            <span className="reports__gap-kpi-value reports__gap-kpi-value--medium">{mediumImpactGaps}</span>
                            <span className="reports__gap-kpi-label">{t('reports.mediumImpact')}</span>
                        </div>
                        <div className="reports__gap-kpi">
                            <span className="reports__gap-kpi-value">{cumulativeGaps.broadAreas.length}</span>
                            <span className="reports__gap-kpi-label">{t('dash.areasAssessed')}</span>
                        </div>
                    </div>

                    {/* Charts row */}
                    <div className="reports__gap-charts">
                        {severityData.length > 0 && (
                            <div className="reports__gap-chart-card">
                                <h4 className="reports__gap-chart-title">{t('dash.gapsByImpact')}</h4>
                                <div dir="ltr" style={{ width: '100%', height: '250px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                        <Pie
                                            data={severityData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={40}
                                            outerRadius={70}
                                            dataKey="value"
                                            paddingAngle={3}
                                            label={({ name, value }) => `${name}: ${value}`}
                                        >
                                            {severityData.map(entry => (
                                                <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || SEVERITY_COLORS[entry.name.toLowerCase()] || '#6b7280'} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {areaBarData.length > 0 && (
                            <div className="reports__gap-chart-card">
                                <h4 className="reports__gap-chart-title">{t('dash.gapsByProcessArea')}</h4>
                                <div dir="ltr" style={{ width: '100%', height: '220px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={areaBarData} layout="vertical" margin={{ left: 20 }}>
                                        <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={130} />
                                        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc' }} />
                                        <Bar dataKey="gaps" fill="#3b82f6" radius={[0, 4, 4, 0]} name={t('gap.totalGaps')} />
                                        <Bar dataKey="critical" fill="#ef4444" radius={[0, 4, 4, 0]} name={t('dash.highImpact')} />
                                    </BarChart>
                                </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Gap Register Table */}
                    {cumulativeGaps.gaps.length > 0 && (
                        <div className="reports__gap-register">
                            <h4 className="reports__gap-chart-title" style={{ marginTop: '0.75rem' }}>{t('reports.gapRegister')}</h4>
                            <div className="reports-table-wrapper">
                                <table className="reports__table">
                                    <thead>
                                        <tr>
                                            <th className="reports__th">{t('reports.gapId')}</th>
                                            <th className="reports__th">{t('reports.gapArea')}</th>
                                            <th className="reports__th">{t('reports.gapTitle')}</th>
                                            <th className="reports__th">{t('reports.gapImpact')}</th>
                                            <th className="reports__th">{t('reports.gapCategory')}</th>
                                            <th className="reports__th">{t('reports.gapFit')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cumulativeGaps.gaps.slice(0, 25).map((gap: any, idx: number) => (
                                            <tr key={gap.id || idx} className="reports__row">
                                                <td className="reports__cell" style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                    {gap.id || `GAP-${idx + 1}`}
                                                </td>
                                                <td className="reports__cell" style={{ fontSize: '0.78rem' }}>
                                                    {gap.broadAreaName || gap.area || '—'}
                                                </td>
                                                <td className="reports__cell" style={{ fontSize: '0.78rem', maxWidth: '300px' }}>
                                                    {gap.gap || gap.description || '—'}
                                                </td>
                                                <td className="reports__cell">
                                                    <span
                                                        className="reports__gap-impact-badge"
                                                        style={{ backgroundColor: SEVERITY_COLORS[gap.impact] || '#6b7280' }}
                                                    >
                                                        {t(`severity.${(gap.impact || '').toLowerCase()}`) !== `severity.${(gap.impact || '').toLowerCase()}` ? t(`severity.${(gap.impact || '').toLowerCase()}`) : (gap.impact || '—')}
                                                    </span>
                                                </td>
                                                <td className="reports__cell" style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>
                                                    {t(`gapCategory.${(gap.category || '').toLowerCase()}`) !== `gapCategory.${(gap.category || '').toLowerCase()}` ? t(`gapCategory.${(gap.category || '').toLowerCase()}`) : (gap.category || '—')}
                                                </td>
                                                <td className="reports__cell" style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>
                                                    {t(`gapFit.${(gap.fit || '').toLowerCase()}`) !== `gapFit.${(gap.fit || '').toLowerCase()}` ? t(`gapFit.${(gap.fit || '').toLowerCase()}`) : (gap.fit || '—')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {cumulativeGaps.gaps.length > 25 && (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textAlign: 'center', padding: '0.5rem' }}>
                                    {t('reports.showingGaps').replace('{0}', String(cumulativeGaps.gaps.length))}
                                </p>
                            )}
                        </div>
                    )}
                </SectionCard>
            )}

            {/* Reports Table */}
            <SectionCard title={t('reports.recentReports')}>
                {/* Generation banner */}
                {generatingReports.size > 0 && !bannerDismissed && (
                    <div className="reports__banner">
                        <Loader className="reports__banner-spinner spin" size={18} />
                        <div className="reports__banner-text">
                            <strong>Generating reports from latest interview data...</strong>
                            <span className="reports__banner-areas">
                                {Array.from(generatingReports.values())
                                    .map(r => r.broadAreaName || r.name)
                                    .join(', ')}
                            </span>
                        </div>
                        <button className="reports__banner-dismiss" onClick={() => setBannerDismissed(true)}>
                            <X size={16} />
                        </button>
                    </div>
                )}

                {loading ? (
                    <SkeletonTable rows={5} cols={4} />
                ) : reports.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
                        {t('reports.noReports')}
                    </p>
                ) : (
                    <div className="reports-table-wrapper">
                        <table className="reports__table">
                            <thead>
                                <tr>
                                    <th className="reports__th"></th>
                                    <th className="reports__th">{t('reports.reportName')}</th>
                                    <th className="reports__th">{t('reports.status')}</th>
                                    <th className="reports__th">{t('reports.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reports.map(report => {
                                    const rec = report as any;
                                    const isQueued = report.status === 'generating' && rec.pendingRegeneration === true;
                                    const isRefreshing = report.status === 'generating' && !isQueued && rec.previousContent != null;
                                    const isFirstGen = report.status === 'generating' && !isQueued && rec.previousContent == null;
                                    const canAccess = report.status === 'ready' || rec.previousContent != null;

                                    let rowClass = 'reports__row';
                                    if (isQueued) rowClass += ' reports__row--queued';
                                    else if (isRefreshing) rowClass += ' reports__row--refreshing';
                                    else if (isFirstGen) rowClass += ' reports__row--generating';

                                    let statusLabel = t('reports.statusReady');
                                    let statusClass = 'reports__status--ready';
                                    if (isQueued) {
                                        statusLabel = t('reports.statusQueued');
                                        statusClass = 'reports__status--queued';
                                    } else if (isRefreshing) {
                                        statusLabel = t('reports.statusRefreshing');
                                        statusClass = 'reports__status--refreshing';
                                    } else if (isFirstGen) {
                                        statusLabel = t('reports.statusGenerating');
                                        statusClass = 'reports__status--generating';
                                    } else if (report.status === 'failed') {
                                        statusLabel = t('reports.statusFailed');
                                        statusClass = 'reports__status--failed';
                                    }

                                    return (
                                        <tr key={report.reportId} className={rowClass}>
                                            <td className="reports__cell reports__cell--icon">
                                                <FileText size={20} />
                                            </td>
                                            <td className="reports__cell reports__cell--info">
                                                <span className="reports__name">{report.name}</span>
                                                <span className="reports__meta">
                                                    {t(TYPE_LABEL_KEYS[report.type] || '') || report.type}
                                                    {' '}&bull;{' '}
                                                    {new Date(report.createdAt).toLocaleDateString()}
                                                    {' '}&bull;{' '}
                                                    {report.fileSize}
                                                    {rec.updatedAt && (
                                                        <>{' '}&bull;{' '}{t('reports.updated')} {relativeTime(rec.updatedAt)}</>
                                                    )}
                                                </span>
                                            </td>
                                            <td className="reports__cell">
                                                <span className={`reports__status ${statusClass}`}>
                                                    {statusLabel}
                                                </span>
                                            </td>
                                            <td className="reports__cell">
                                                {canAccess && (
                                                    <>
                                                        <button
                                                            className="reports__preview-btn"
                                                            onClick={() => handlePreview(report.reportId, report.name, report.type)}
                                                            disabled={previewLoading === report.reportId}
                                                            title="Preview report"
                                                        >
                                                            {previewLoading === report.reportId
                                                                ? <Loader size={14} className="spin" />
                                                                : <Eye size={14} />}
                                                        </button>
                                                        <button className="reports__download-btn" onClick={() => handleDownload(report.reportId, report.name, report.type)}>
                                                            <Download size={14} /> PDF
                                                        </button>
                                                        {(report.type === 'gap_analysis' || report.type === 'broad_area') && (
                                                            <button
                                                                className="reports__download-btn"
                                                                onClick={() => handleDownloadRTM(report.sessionId, report.name)}
                                                                disabled={previewLoading === `rtm-${report.sessionId}`}
                                                            >
                                                                {previewLoading === `rtm-${report.sessionId}` ? <Loader size={14} className="spin" /> : <Database size={14} />} RTM
                                                            </button>
                                                        )}
                                                        <button className="reports__delete-btn" onClick={() => handleDelete(report.reportId)} title="Delete report">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </>
                                                )}
                                                {(report.status === 'failed' || report.status === 'generating') && (
                                                    <button
                                                        className="reports__retry-btn"
                                                        title="Retry report generation"
                                                        onClick={async () => {
                                                            try {
                                                                await retryReport(report.reportId);
                                                                showToast('Report regeneration started...', 'success');
                                                                setTimeout(() => Promise.all([loadReports(), loadStats()]), 2000);
                                                            } catch (err: any) {
                                                                showToast(`Retry failed: ${err.message}`, 'error');
                                                            }
                                                        }}
                                                    >
                                                        <RefreshCw size={14} /> {t('reports.retry')}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>

            <GpuWarmupOverlay warmup={warmup} onCancel={() => {}} />

            {toast && (
                <div className={`reports__toast reports__toast--${toast.type}`}>
                    {toast.message}
                </div>
            )}

            {previewReport && (
                <ConsolidatedReportModal
                    report={previewReport.data}
                    reportName={previewReport.name}
                    reportType={t(TYPE_LABEL_KEYS[previewReport.type] || '') || previewReport.type}
                    onClose={() => setPreviewReport(null)}
                    onDownloadPDF={() => handleDownload(previewReport.reportId, previewReport.name, previewReport.type)}
                />
            )}
        </div>
    );
}
