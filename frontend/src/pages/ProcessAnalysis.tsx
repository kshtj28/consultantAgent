import { useEffect, useState, useCallback, useRef } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { Loader, Users, Paperclip, X as XIcon } from 'lucide-react';
import VoiceInputButton from '../components/VoiceInputButton';
import StatCard from '../components/shared/StatCard';
import SectionCard from '../components/shared/SectionCard';
import StatusBadge from '../components/shared/StatusBadge';
import GpuWarmupOverlay from '../components/shared/GpuWarmupOverlay';
import { useGpuWarmup } from '../hooks/useGpuWarmup';
import {
    fetchBroadAreas,
    startInterviewSession,
    getInterviewSessionData,
    getNextInterviewQuestion,
    submitInterviewAnswer,
    uploadAnswerAttachment,
    type AnswerAttachment,
    switchSubArea,
    completeInterviewSession,
    fetchDashboardStats,
    fetchRiskSummary,
    fetchSessions,
    subscribeToDashboardStream,
    translateInterviewHistory,
    BroadAreaInfo,
    BroadAreaProgressInfo,
    type SessionSummary, type GeneratedQuestion,
    type DashboardStats,
} from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import './ProcessAnalysis.css';

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

type Step = 'overview' | 'select_broad_areas' | 'interview' | 'complete';

export default function ProcessAnalysis() {
    const { t, language } = useLanguage();

    // Overview state
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [broadAreas, setBroadAreas] = useState<BroadAreaInfo[]>([]);
    const [totalRisks, setTotalRisks] = useState(0);
    const [_loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState<DashboardStats | null>(null);
    const esRef = useRef<EventSource | null>(null);

    // Interview state
    const [step, setStep] = useState<Step>('overview');
    const [selectedBroadAreas, setSelectedBroadAreas] = useState<string[]>([]);
    const [selectedSubAreas, setSelectedSubAreas] = useState<string[]>([]);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [progress, setProgress] = useState<BroadAreaProgressInfo[]>([]);
    const [currentQuestion, setCurrentQuestion] = useState<GeneratedQuestion | null>(null);
    const [answer, setAnswer] = useState<string | string[] | number>('');
    const [chatHistory, setChatHistory] = useState<{ question: GeneratedQuestion; answer: string | string[] | number }[]>([]);
    const [questionLoading, setQuestionLoading] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Files attached to the current pending answer (cleared after submit).
    const [pendingAttachments, setPendingAttachments] = useState<AnswerAttachment[]>([]);
    const [attachUploading, setAttachUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const warmup = useGpuWarmup();

    const fetchData = useCallback(() => {
        setLoading(true);
        Promise.all([fetchSessions(), fetchBroadAreas(), fetchRiskSummary(), fetchDashboardStats()])
            .then(([sessRes, areaRes, riskRes, dashStats]) => {
                setSessions(sessRes.sessions?.filter((s) => s.type === 'readiness' || s.type === 'interview') || []);
                setBroadAreas(areaRes.broadAreas || []);
                setTotalRisks(riskRes.totalRisks || 0);
                setMetrics(dashStats);
            })
            .catch((err) => console.error('Failed to fetch dashboard data:', err))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchData();

        // Subscribe to real-time metrics updates via SSE
        const es = subscribeToDashboardStream((updated) => {
            setMetrics(updated);
        });
        esRef.current = es;

        return () => { es.close(); };
    }, [fetchData]);

    // Handle language changes mid-session (Translate history)
    useEffect(() => {
        if (sessionId && step === 'interview') {
            const translate = async () => {
                try {
                    setQuestionLoading(true);
                    console.log(`[ProcessAnalysis] Language changed to ${language}, translating history...`);
                    const res = await translateInterviewHistory(sessionId, language);
                    
                    if (res.success) {
                        // Re-fetch the session data and the next question to get them in the new language
                        const [sessionData, nextQRes] = await Promise.all([
                            getInterviewSessionData(sessionId),
                            getNextInterviewQuestion(sessionId, undefined, language)
                        ]);
                        
                        console.log('[ProcessAnalysis] History translated, reconstructing chat history...');
                        
                        // Reconstruct chat history from all translated responses across sub-areas
                        // Flatten and sort by timestamp to maintain chronological order
                        const flatHistory: any[] = [];
                        if (sessionData.responses) {
                            Object.entries(sessionData.responses).forEach(([areaId, answers]: [string, any]) => {
                                answers.forEach((ans: any) => {
                                    flatHistory.push({
                                        question: {
                                            id: ans.questionId,
                                            text: ans.question,
                                            type: ans.type || 'open_ended',
                                            areaId: areaId,
                                            mode: ans.mode,
                                            options: ans.options || []
                                        },
                                        answer: ans.answer,
                                        timestamp: new Date(ans.timestamp || 0).getTime()
                                    });
                                });
                            });
                        }
                        
                        // Sort by timestamp
                        flatHistory.sort((a, b) => a.timestamp - b.timestamp);
                        
                        // Map back to the expected structure (removing the temporary timestamp used for sorting)
                        setChatHistory(flatHistory.map(({ timestamp, ...rest }) => rest));
                        
                        setCurrentQuestion(nextQRes.question);
                        setProgress(nextQRes.progress || []);
                        console.log('[ProcessAnalysis] UI updated with translated history');
                    }
                } catch (err) {
                    console.error('Failed to translate history:', err);
                } finally {
                    setQuestionLoading(false);
                }
            };
            translate();
        }
    }, [language, sessionId, step]);

    const fetchQuestion = useCallback(async (sid: string) => {
        try {
            setQuestionLoading(true);
            const res = await getNextInterviewQuestion(sid, undefined, language);
            setCurrentQuestion(res.question);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch question');
            setCurrentQuestion(null);
        } finally {
            setQuestionLoading(false);
        }
    }, [language]);

    // Auto-scroll to bottom when chat history updates
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory, currentQuestion]);

    const handleStartNew = () => {
        setStep('select_broad_areas');
        setSelectedBroadAreas([]);
        setSelectedSubAreas([]);
        setChatHistory([]);
        setError(null);
    };

    const handleResume = async (sid: string) => {
        try {
            setQuestionLoading(true);
            const res = await getInterviewSessionData(sid);
            setSessionId(sid);
            setProgress(res.progress || []);
            // Load existing Q&A from session responses into chat history
            const history: { question: GeneratedQuestion; answer: string | string[] | number }[] = [];
            if (res.responses) {
                for (const subAreaId of Object.keys(res.responses)) {
                    for (const r of res.responses[subAreaId]) {
                        history.push({
                            question: {
                                id: r.questionId,
                                text: r.question,
                                type: r.type || 'open_ended',
                                areaId: subAreaId,
                            },
                            answer: r.answer,
                        });
                    }
                }
            }
            setChatHistory(history);
            setStep('interview');
            await fetchQuestion(sid);
        } catch (err: any) {
            setError(err.message || 'Failed to resume session');
        } finally {
            setQuestionLoading(false);
        }
    };

    const handleBeginInterview = async () => {
        if (selectedBroadAreas.length === 0) {
            setError('Please select at least one area');
            return;
        }
        try {
            setQuestionLoading(true);
            setError(null);
            const userId = localStorage.getItem('userId') || 'anonymous';
            const res = await startInterviewSession(userId, selectedBroadAreas, undefined, selectedSubAreas.length > 0 ? selectedSubAreas : undefined, language);
            setSessionId(res.sessionId);
            setProgress(res.progress || []);
            setCurrentQuestion(res.question);
            setStep('interview');
        } catch (err: any) {
            setError(err.message || 'Failed to start interview');
        } finally {
            setQuestionLoading(false);
        }
    };

    const handleSubmitAnswer = async () => {
        if (!sessionId || !currentQuestion) return;
        try {
            setSubmitLoading(true);
            setError(null);
            const submittedAnswer = answer;
            const res = await submitInterviewAnswer(sessionId, {
                questionId: currentQuestion.id,
                question: currentQuestion.text || (currentQuestion as any).question,
                answer,
                type: currentQuestion.type || 'open_ended',
                mode: currentQuestion.mode,
                subAreaId: currentQuestion.areaId || (currentQuestion as any).categoryId || '',
                aiConfident: (currentQuestion as any).aiConfident,
                language,
                attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
            });
            // Add Q&A to chat history before moving to next question
            setChatHistory(prev => [...prev, { question: currentQuestion, answer: submittedAnswer }]);
            setProgress(res.progress || []);
            setAnswer('');
            setPendingAttachments([]);
            if (res.completed) {
                setCurrentQuestion(null);
                setStep('complete');
            } else {
                setCurrentQuestion(res.nextQuestion);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to submit answer');
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // reset input so the same file can be re-selected after removal
        if (e.target) e.target.value = '';
        if (!file || !sessionId || !currentQuestion) return;
        try {
            setAttachUploading(true);
            setError(null);
            const att = await uploadAnswerAttachment(sessionId, currentQuestion.id, file);
            setPendingAttachments(prev => [...prev, att]);
        } catch (err: any) {
            setError(err.message || 'Failed to attach file');
        } finally {
            setAttachUploading(false);
        }
    };

    const removeAttachment = (documentId: string) => {
        setPendingAttachments(prev => prev.filter(a => a.documentId !== documentId));
    };

    const handleSwitchSubArea = async (subAreaId: string) => {
        if (!sessionId) return;
        try {
            setQuestionLoading(true);
            await switchSubArea(sessionId, subAreaId);
            const qRes = await getNextInterviewQuestion(sessionId, undefined, language);
            setCurrentQuestion(qRes.question);
        } catch (err: any) {
            setError(err.message || 'Failed to switch area');
        } finally {
            setQuestionLoading(false);
        }
    };

    const handleFinishAssessment = async () => {
        if (!sessionId) return;
        try {
            setSubmitLoading(true);
            setError(null);
            await completeInterviewSession(sessionId);
            setCurrentQuestion(null);
            setStep('complete');
            fetchData(); // Refresh data to reflect completed status
        } catch (err: any) {
            setError(err.message || 'Failed to finish assessment');
        } finally {
            setSubmitLoading(false);
        }
    };

    // --- Stats and chart data from server metrics (SSE-synced) ---
    const readinessSessions = sessions;

    // Stat cards: use server metrics when available, otherwise derive from local data
    const totalAssessments = metrics ? metrics.totalSessions : readinessSessions.length;
    const completedCount = metrics ? metrics.completedSessions : readinessSessions.filter((s) => s.status === 'completed').length;
    const criticalIssuesCount = metrics ? metrics.criticalIssues : totalRisks;
    const avgRiskScore = metrics ? metrics.avgRisk : 0;

    // Charts: use server-computed data directly
    const pieData = metrics?.processTypeDistribution ?? [];
    const barData = metrics?.processEfficiency ?? [];

    const overviewStats = [
        { label: t('pa.totalAssessments'), value: String(totalAssessments) },
        { label: t('pa.completed'), value: String(completedCount), valueColor: 'success' as const },
        { label: t('pa.criticalIssues'), value: String(criticalIssuesCount) },
        { label: t('pa.avgRiskScore'), value: String(avgRiskScore) },
    ];

    // --- RENDER ---

    if (step === 'select_broad_areas') {
        return (
            <div className="process-analysis">
                <div className="page-header">
                    <h2 className="page-header__title">{t('pa.selectAreas')}</h2>
                    <p className="page-header__subtitle">{t('pa.chooseAreas')}</p>
                </div>
                {error && <div className="pa-error">{error}</div>}
                <div className="pa-broad-area-grid">
                    {broadAreas.map((ba) => {
                        const isBroadSelected = selectedBroadAreas.includes(ba.id);
                        const baSubIds = ba.subAreas.map(s => s.id);
                        const selectedSubsInArea = selectedSubAreas.filter(id => baSubIds.includes(id));
                        const allSubsSelected = selectedSubsInArea.length === baSubIds.length;

                        return (
                            <div
                                key={ba.id}
                                className={`pa-broad-area-card ${isBroadSelected ? 'pa-broad-area-card--selected' : ''}`}
                                onClick={() => {
                                    if (isBroadSelected) {
                                        setSelectedBroadAreas(prev => prev.filter(id => id !== ba.id));
                                        // Remove all sub-areas from this broad area
                                        setSelectedSubAreas(prev => prev.filter(id => !baSubIds.includes(id)));
                                    } else {
                                        setSelectedBroadAreas(prev => [...prev, ba.id]);
                                    }
                                }}
                            >
                                <div className="pa-broad-area-card__header">
                                    <input type="checkbox" checked={isBroadSelected} onChange={() => {}} />
                                    <strong>{t(`area.${ba.id}.label`) !== `area.${ba.id}.label` ? t(`area.${ba.id}.label`) : ba.name}</strong>
                                </div>
                                <p className="pa-broad-area-card__desc">{t(`area.${ba.id}.description`) !== `area.${ba.id}.description` ? t(`area.${ba.id}.description`) : ba.description}</p>
                                <div className="pa-broad-area-card__subs">
                                    {ba.subAreas.map(s => {
                                        const isSubSelected = selectedSubAreas.includes(s.id);
                                        return (
                                            <span
                                                key={s.id}
                                                className={`pa-sub-area-tag ${isBroadSelected ? 'pa-sub-area-tag--selectable' : ''} ${isSubSelected ? 'pa-sub-area-tag--selected' : ''}`}
                                                onClick={(e) => {
                                                    if (!isBroadSelected) return;
                                                    e.stopPropagation();
                                                    setSelectedSubAreas(prev =>
                                                        prev.includes(s.id)
                                                            ? prev.filter(id => id !== s.id)
                                                            : [...prev, s.id]
                                                    );
                                                }}
                                            >
                                                {isSubSelected && <span className="pa-sub-area-check">&#10003;</span>}
                                                {t(`subarea.${s.id}.label`) !== `subarea.${s.id}.label` ? t(`subarea.${s.id}.label`) : s.name}
                                            </span>
                                        );
                                    })}
                                </div>
                                {isBroadSelected && selectedSubsInArea.length > 0 && !allSubsSelected && (
                                    <p className="pa-broad-area-card__focus-hint">
                                        {t('pa.focusedOn').replace('{0}', String(selectedSubsInArea.length)).replace('{1}', String(baSubIds.length))}
                                    </p>
                                )}
                                {isBroadSelected && selectedSubsInArea.length === 0 && (
                                    <p className="pa-broad-area-card__focus-hint">
                                        {t('pa.allSubAreas')}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
                <div className="pa-actions">
                    <button className="pa-btn pa-btn--secondary" onClick={() => setStep('overview')}>{t('pa.back')}</button>
                    <button className="pa-btn pa-btn--primary" onClick={handleBeginInterview} disabled={selectedBroadAreas.length === 0 || questionLoading}>{t('pa.beginAssessment')}</button>
                </div>
            </div>
        );
    }

    if (step === 'interview') {
        return (
            <div className="process-analysis">
                <div className="page-header">
                    <div>
                        <h1 className="page-header__title">{t('pa.assessmentInterview')}</h1>
                        <p className="page-header__subtitle">{t('pa.answerQuestions')}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button className="pa-btn pa-btn--primary" onClick={handleFinishAssessment} disabled={submitLoading || questionLoading}>
                            {t('pa.finishAssessment')}
                        </button>
                        <button className="pa-btn pa-btn--secondary" onClick={() => { warmup.cancel(); fetchData(); setStep('overview'); }}>
                            {t('pa.savePause')}
                        </button>
                    </div>
                </div>
                {error && <div className="pa-error">{error}</div>}

                {/* Progress sidebar */}
                <div className="pa-interview-layout">
                    <div className="pa-progress-sidebar">
                        <h4>{t('pa.coverage')}</h4>
                        {progress.map((ba) => (
                            <div key={ba.broadAreaId} className="pa-sidebar-broad-area">
                                <div className={`pa-sidebar-broad-area__header ${ba.overallStatus === 'covered' ? 'pa-sidebar-broad-area__header--done' : ''}`}>
                                    <span className={`pa-progress-dot pa-progress-dot--${ba.overallStatus}`} />
                                    <span className="pa-sidebar-broad-area__name">{t(`area.${ba.broadAreaId}.label`) !== `area.${ba.broadAreaId}.label` ? t(`area.${ba.broadAreaId}.label`) : ba.name}</span>
                                </div>
                                <div className="pa-sidebar-sub-areas">
                                    {ba.subAreas.map((sub) => (
                                        <button
                                            key={sub.subAreaId}
                                            className={`pa-progress-item ${sub.status === 'covered' ? 'pa-progress-item--done' : ''} ${currentQuestion?.areaId === sub.subAreaId ? 'pa-progress-item--active' : ''}`}
                                            onClick={() => handleSwitchSubArea(sub.subAreaId)}
                                        >
                                            <span className={`pa-progress-dot pa-progress-dot--${sub.status}`} />
                                            <span>{t(`subarea.${sub.subAreaId}.label`) !== `subarea.${sub.subAreaId}.label` ? t(`subarea.${sub.subAreaId}.label`) : sub.name}</span>
                                            <span className="pa-progress-count">{sub.questionsAnswered}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <GpuWarmupOverlay warmup={warmup} onCancel={() => setStep('overview')} />

                    <div className="pa-question-area">
                        <div className="pa-chat-container">
                            {/* Chat history - all previous Q&A */}
                            {chatHistory.map((entry, idx) => (
                                <div key={idx} className="pa-chat-entry">
                                    <div className="pa-chat-bubble pa-chat-bubble--question">
                                        <span className="pa-chat-label">Q</span>
                                        <p>{entry.question.text}</p>
                                    </div>
                                    <div className="pa-chat-bubble pa-chat-bubble--answer">
                                        <span className="pa-chat-label">A</span>
                                        <p>{Array.isArray(entry.answer) ? entry.answer.join(', ') : String(entry.answer)}</p>
                                    </div>
                                </div>
                            ))}

                            {/* Current question */}
                            {questionLoading ? (
                                <div className="pa-loading"><Loader size={20} className="spin" /> {t('pa.loadingQuestion')}</div>
                            ) : currentQuestion ? (
                                <div className="pa-chat-entry">
                                    <div className="pa-chat-bubble pa-chat-bubble--question">
                                        <span className="pa-chat-label">Q</span>
                                        <p>{currentQuestion.text}</p>
                                    </div>

                                    <div className="pa-chat-input-area">
                                        {currentQuestion.type === 'open_ended' && (
                                            <div style={{ position: 'relative' }}>
                                                <textarea
                                                    className="pa-textarea"
                                                    value={answer as string}
                                                    onChange={(e) => setAnswer(e.target.value)}
                                                    placeholder={t('pa.typeAnswer')}
                                                    rows={4}
                                                    style={{ paddingRight: '2.5rem' }}
                                                />
                                                <div style={{ position: 'absolute', right: '0.5rem', top: '0.5rem' }}>
                                                    <VoiceInputButton
                                                        onTranscript={(t) => setAnswer((prev) => {
                                                            const current = typeof prev === 'string' ? prev : '';
                                                            return current ? `${current} ${t}` : t;
                                                        })}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {currentQuestion.type === 'yes_no' && (
                                            <div className="pa-options">
                                                {['Yes', 'No'].map((opt) => (
                                                    <label key={opt} className={`pa-option ${answer === opt ? 'pa-option--selected' : ''}`}>
                                                        <input type="radio" name="yn" value={opt} checked={answer === opt} onChange={() => setAnswer(opt)} />
                                                        {opt}
                                                    </label>
                                                ))}
                                            </div>
                                        )}

                                        {currentQuestion.type === 'single_choice' && currentQuestion.options && (
                                            <div className="pa-options">
                                                {currentQuestion.options.map((opt) => (
                                                    <label key={opt} className={`pa-option ${answer === opt ? 'pa-option--selected' : ''}`}>
                                                        <input type="radio" name="sc" value={opt} checked={answer === opt} onChange={() => setAnswer(opt)} />
                                                        {opt}
                                                    </label>
                                                ))}
                                            </div>
                                        )}

                                        {currentQuestion.type === 'multi_choice' && currentQuestion.options && (
                                            <div className="pa-options">
                                                {currentQuestion.options.map((opt) => {
                                                    const selected = Array.isArray(answer) && answer.includes(opt);
                                                    return (
                                                        <label key={opt} className={`pa-option ${selected ? 'pa-option--selected' : ''}`}>
                                                            <input
                                                                type="checkbox"
                                                                checked={selected}
                                                                onChange={() => {
                                                                    const arr = Array.isArray(answer) ? answer : [];
                                                                    setAnswer(selected ? arr.filter((x) => x !== opt) : [...arr, opt]);
                                                                }}
                                                            />
                                                            {opt}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {currentQuestion.type === 'scale' && (
                                            <div className="pa-scale">
                                                {[1, 2, 3, 4, 5].map((n) => (
                                                    <button
                                                        key={n}
                                                        className={`pa-scale-btn ${answer === n ? 'pa-scale-btn--selected' : ''}`}
                                                        onClick={() => setAnswer(n)}
                                                    >
                                                        {n}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Attached files for this answer (shown above the actions row) */}
                                        {pendingAttachments.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: '0.75rem' }}>
                                                {pendingAttachments.map(att => (
                                                    <span
                                                        key={att.documentId}
                                                        title={att.excerpt}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                                            padding: '4px 10px', borderRadius: 999,
                                                            background: 'rgba(99,102,241,0.12)',
                                                            border: '1px solid rgba(99,102,241,0.3)',
                                                            color: '#a5b4fc', fontSize: '0.75rem',
                                                        }}
                                                    >
                                                        <Paperclip size={12} /> {att.filename}
                                                        <button
                                                            onClick={() => removeAttachment(att.documentId)}
                                                            aria-label={`Remove ${att.filename}`}
                                                            style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', padding: 0, display: 'inline-flex' }}
                                                        >
                                                            <XIcon size={12} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <div className="pa-actions" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <button
                                                className="pa-btn pa-btn--primary"
                                                onClick={handleSubmitAnswer}
                                                disabled={!answer || submitLoading || attachUploading}
                                            >
                                                {submitLoading ? <Loader size={16} className="spin" /> : t('pa.submitAnswer')}
                                            </button>
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept=".pdf,.docx,.txt,.csv,.xlsx"
                                                style={{ display: 'none' }}
                                                onChange={handleAttachFile}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={attachUploading || submitLoading}
                                                title="Attach a supporting file (PDF, DOCX, TXT, CSV, XLSX). The AI will use it to ground follow-up questions."
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                                    padding: '8px 12px', borderRadius: 8,
                                                    background: 'transparent',
                                                    border: '1px solid var(--border)',
                                                    color: 'var(--text-secondary)', cursor: 'pointer',
                                                    fontSize: '0.82rem',
                                                }}
                                            >
                                                {attachUploading ? <Loader size={14} className="spin" /> : <Paperclip size={14} />}
                                                {attachUploading ? 'Uploading…' : 'Attach file'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="pa-loading">{t('pa.noMoreQuestions')}</div>
                            )}
                            <div ref={chatEndRef} />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (step === 'complete') {
        return (
            <div className="process-analysis">
                <div className="page-header">
                    <div>
                        <h1 className="page-header__title">{t('pa.assessmentComplete')}</h1>
                        <p className="page-header__subtitle">{t('pa.allAreasAssessed')}</p>
                    </div>
                </div>
                <button className="pa-btn pa-btn--primary" onClick={() => { fetchData(); setStep('overview'); }}>
                    {t('pa.backToOverview')}
                </button>
            </div>
        );
    }

    // --- Overview (default) ---
    return (
        <div className="process-analysis">
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">
                        {t('pa.myAssessments')}
                    </h1>
                    <p className="page-header__subtitle">
                        {t('pa.personalMetrics')}
                    </p>
                </div>
                <button className="pa-badge-btn" onClick={handleStartNew}>
                    <Users size={14} />
                    {readinessSessions.length} {t('pa.myAssessments')}
                </button>
            </div>

            <div className="process-analysis__stats">
                {overviewStats.map((s) => (
                    <StatCard key={s.label} {...s} />
                ))}
            </div>

            <div className="process-analysis__charts">
                <SectionCard title={t('pa.processTypeDistribution')}>
                    <div className="process-analysis__chart-container">
                        <div dir="ltr" style={{ width: '100%', height: '260px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={110}
                                    paddingAngle={3}
                                    dataKey="value"
                                    strokeWidth={0}
                                >
                                    {pieData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: '0.8rem' }}
                                    itemStyle={{ color: '#f8fafc' }}
                                    formatter={(value: any, name: any) => {
                                        const total = pieData.reduce((sum, d) => sum + (d.value || 0), 0);
                                        const pct = total > 0 ? ((Number(value) / total) * 100).toFixed(0) : '0';
                                        return [`${pct}%`, name];
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        </div>
                        {/* Legend */}
                        {pieData.length > 0 && (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                gap: '6px 16px',
                                marginTop: '12px',
                                padding: '0 8px',
                            }}>
                                {pieData.map((entry, i) => {
                                    const total = pieData.reduce((sum, d) => sum + (d.value || 0), 0);
                                    const pct = total > 0 ? ((entry.value / total) * 100).toFixed(0) : '0';
                                    return (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                                            <span style={{
                                                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                                                background: PIE_COLORS[i % PIE_COLORS.length],
                                            }} />
                                            <span style={{
                                                fontSize: '0.72rem', color: 'var(--text-secondary)',
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
                                            }} title={entry.name}>{entry.name}</span>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text)', fontWeight: 600, flexShrink: 0 }}>
                                                {pct}%
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </SectionCard>

                <SectionCard title={t('pa.processEfficiency')}>
                    <div className="process-analysis__chart-container">
                        <div dir="ltr" style={{ width: '100%', height: '340px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} margin={{ bottom: 90, left: 10, right: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 9 }} angle={-45} textAnchor="end" interval={0} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[0, 100]} />
                                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} itemStyle={{ color: '#f8fafc' }} />
                                <Bar dataKey="efficiency" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Efficiency %" />
                            </BarChart>
                        </ResponsiveContainer>
                        </div>
                    </div>
                </SectionCard>
            </div>

            {/* Assessment Details */}
            {readinessSessions.length > 0 && (
                <SectionCard title={t('pa.myAssessmentDetails')}>
                    {readinessSessions.map((s) => {
                        const pct = s.progress.total ? Math.round((s.progress.completed / s.progress.total) * 100) : 0;
                        const critCount = s.highGapCount || 0;
                        const riskScore = s.riskScore || 0;
                        return (
                            <div key={s.id} className="assessment-detail">
                                <div className="assessment-detail__header">
                                    <span className="assessment-detail__name">{s.title}</span>
                                    <StatusBadge label={s.status === 'completed' ? t('pa.completed') : s.status === 'in_progress' ? t('pa.inProgress') : s.status} />
                                    <span className="assessment-detail__date">
                                        {t('pa.lastUpdated')} {new Date(s.lastActivityAt || s.startedAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="assessment-detail__metrics">
                                    <div className="assessment-detail__metric">
                                        <span className="assessment-detail__metric-label">{t('pa.completionRate')}</span>
                                        <div className="assessment-detail__progress-track">
                                            <div
                                                className="assessment-detail__progress-fill"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <span className="assessment-detail__metric-value">{pct}%</span>
                                    </div>
                                    <div className="assessment-detail__metric">
                                        <span className="assessment-detail__metric-label">{t('pa.criticalIssues')}</span>
                                        <span className="assessment-detail__metric-value assessment-detail__metric-value--warning">
                                            &#9888; {critCount}
                                        </span>
                                    </div>
                                    <div className="assessment-detail__metric">
                                        <span className="assessment-detail__metric-label">{t('pa.riskScore')}</span>
                                        <span className="assessment-detail__metric-value">{riskScore}</span>
                                    </div>
                                    {s.status === 'in_progress' && (
                                        <button className="pa-btn pa-btn--secondary" onClick={() => handleResume(s.id)}>
                                            {t('pa.resume')}
                                        </button>
                                    )}
                                </div>

                            </div>
                        );
                    })}
                </SectionCard>
            )}

        </div>
    );
}
