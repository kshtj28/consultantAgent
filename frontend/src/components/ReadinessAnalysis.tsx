import { useState, useEffect, useCallback } from 'react';
import {
    Play,
    CheckCircle,
    Circle,
    Loader,
    ChevronRight,
    AlertCircle,
    FileText,
    BarChart3,
} from 'lucide-react';
import ReadinessReport from './ReadinessReport';
import './ReadinessAnalysis.css';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import VoiceInputButton from './VoiceInputButton';

const API_BASE = '/api';

// Types
interface FinancialArea {
    id: string;
    name: string;
    icon: string;
    description: string;
    order: number;
}

interface AreaProgress {
    areaId: string;
    name: string;
    questionsAnswered: number;
    status: 'not_started' | 'in_progress' | 'completed';
    insights: string[];
}

interface GeneratedQuestion {
    id: string;
    question: string;
    type: 'single_choice' | 'multi_choice' | 'scale' | 'open_ended' | 'yes_no';
    options?: string[];
    mode: string;
    areaId: string;
    followUpTopics?: string[];
}

interface Session {
    sessionId: string;
    status: string;
    selectedAreas: string[];
    currentArea: string | null;
}

interface ReadinessAnalysisProps {
    selectedModel?: string;
    resumeSessionId?: string;
}

export default function ReadinessAnalysis({ selectedModel = '', resumeSessionId }: ReadinessAnalysisProps) {
    const { token, user } = useAuth();
    const { language, t } = useLanguage();
    const [step, setStep] = useState<'select_areas' | 'interview' | 'complete' | 'report'>('select_areas');
    const [reportType, setReportType] = useState<'readiness' | 'gap'>('readiness');
    const [areas, setAreas] = useState<FinancialArea[]>([]);
    const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
    const [session, setSession] = useState<Session | null>(null);
    const [progress, setProgress] = useState<AreaProgress[]>([]);
    const [currentQuestion, setCurrentQuestion] = useState<GeneratedQuestion | null>(null);
    const [answer, setAnswer] = useState<string | string[] | number>('');
    const [loading, setLoading] = useState(false);
    const [questionLoading, setQuestionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch available areas on mount
    useEffect(() => {
        if (token) {
            fetchAreas();
        }
    }, [token]);

    // Resume an existing session when resumeSessionId is provided
    useEffect(() => {
        if (!resumeSessionId || !token) return;
        const resume = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`${API_BASE}/readiness/${resumeSessionId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error('Failed to load session');
                const data = await res.json();
                setSession(data.session);
                setSelectedAreas(data.session.selectedAreas || []);
                setProgress(data.progress || []);
                const allComplete = (data.progress || []).every((p: AreaProgress) => p.status === 'completed');
                setStep(allComplete ? 'complete' : 'interview');
                if (!allComplete) {
                    await fetchNextQuestion(resumeSessionId);
                }
            } catch (err) {
                setError('Failed to resume session');
            } finally {
                setLoading(false);
            }
        };
        resume();
    }, [resumeSessionId, token]);

    const fetchAreas = async () => {
        try {
            const res = await fetch(`${API_BASE}/readiness/areas`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const data = await res.json();
            setAreas(data.areas || []);
        } catch (err) {
            setError('Failed to load financial areas');
        }
    };

    const toggleArea = (areaId: string) => {
        setSelectedAreas(prev =>
            prev.includes(areaId)
                ? prev.filter(a => a !== areaId)
                : [...prev, areaId]
        );
    };

    const startSession = async () => {
        if (selectedAreas.length === 0) {
            setError('Please select at least one area');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Create session
            const startRes = await fetch(`${API_BASE}/readiness/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ userId: user!.userId, model: selectedModel, language }),
            });
            const startData = await startRes.json();
            if (!startRes.ok) throw new Error(startData.error || 'Failed to start session');

            // Set areas
            const areasRes = await fetch(`${API_BASE}/readiness/${startData.session.sessionId}/areas`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ areas: selectedAreas }),
            });
            const areasData = await areasRes.json();
            if (!areasRes.ok) throw new Error(areasData.error || 'Failed to set areas');

            setSession(areasData.session);
            setProgress(areasData.progress);
            setStep('interview');

            // Get first question
            await fetchNextQuestion(areasData.session.sessionId);
        } catch (err) {
            setError('Failed to start session');
        } finally {
            setLoading(false);
        }
    };

    const fetchNextQuestion = useCallback(async (sessionId?: string) => {
        const sid = sessionId || session?.sessionId;
        if (!sid) return;

        setQuestionLoading(true);
        try {
            const params = selectedModel ? `?model=${encodeURIComponent(selectedModel)}` : '';
            const res = await fetch(`${API_BASE}/readiness/${sid}/next-question${params}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to get next question');

            if (data.question) {
                setCurrentQuestion(data.question);
                setAnswer('');
            } else {
                setCurrentQuestion(null);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to get next question');
        } finally {
            setQuestionLoading(false);
        }
    }, [session?.sessionId, selectedModel, token]);

    const submitAnswer = async () => {
        if (!session || !currentQuestion || answer === '') return;

        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/readiness/${session.sessionId}/answer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    questionId: currentQuestion.id,
                    question: currentQuestion.question,
                    answer,
                    type: currentQuestion.type,
                    mode: currentQuestion.mode,
                    areaId: currentQuestion.areaId,
                    model: selectedModel,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to submit answer');
            setProgress(data.progress);

            // Check if all areas are complete
            const allComplete = data.progress.every((p: AreaProgress) => p.status === 'completed');
            if (allComplete) {
                setStep('complete');
            } else {
                await fetchNextQuestion();
            }
        } catch (err) {
            setError('Failed to submit answer');
        } finally {
            setLoading(false);
        }
    };

    const switchArea = async (areaId: string) => {
        if (!session) return;

        try {
            await fetch(`${API_BASE}/readiness/${session.sessionId}/area/${areaId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            await fetchNextQuestion();
        } catch (err) {
            setError('Failed to switch area');
        }
    };

    const handleViewReport = (type: 'readiness' | 'gap') => {
        setReportType(type);
        setStep('report');
    };

    const renderAreaSelection = () => (
        <div className="readiness-area-selection">
            <div className="readiness-header">
                <h2>🎯 {t('readiness.title')}</h2>
                <p>{t('readiness.selectAreas')}</p>
            </div>

            <div className="areas-grid">
                {areas.map(area => (
                    <div
                        key={area.id}
                        className={`area-card ${selectedAreas.includes(area.id) ? 'selected' : ''}`}
                        onClick={() => toggleArea(area.id)}
                    >
                        <div className="area-card-header">
                            <span className="area-icon">
                                {selectedAreas.includes(area.id) ? <CheckCircle size={24} /> : <Circle size={24} />}
                            </span>
                            <h3>{area.name}</h3>
                        </div>
                        <p>{area.description}</p>
                    </div>
                ))}
            </div>

            <div className="readiness-actions">
                <button
                    className="btn-primary"
                    onClick={startSession}
                    disabled={selectedAreas.length === 0 || loading}
                >
                    {loading ? <Loader className="spin" size={20} /> : <Play size={20} />}
                    {t('readiness.startAnalysis')} ({selectedAreas.length} {t('readiness.areas')})
                </button>
            </div>
        </div>
    );

    const renderQuestionInput = () => {
        if (!currentQuestion) return null;

        switch (currentQuestion.type) {
            case 'single_choice':
            case 'yes_no':
                return (
                    <div className="question-options">
                        {currentQuestion.options?.map(option => (
                            <label key={option} className="option-label">
                                <input
                                    type="radio"
                                    name="answer"
                                    checked={answer === option}
                                    onChange={() => setAnswer(option)}
                                />
                                <span>{option}</span>
                            </label>
                        ))}
                    </div>
                );

            case 'multi_choice':
                return (
                    <div className="question-options">
                        {currentQuestion.options?.map(option => (
                            <label key={option} className="option-label">
                                <input
                                    type="checkbox"
                                    checked={(answer as string[]).includes(option)}
                                    onChange={(e) => {
                                        const current = (answer as string[]) || [];
                                        setAnswer(
                                            e.target.checked
                                                ? [...current, option]
                                                : current.filter(a => a !== option)
                                        );
                                    }}
                                />
                                <span>{option}</span>
                            </label>
                        ))}
                    </div>
                );

            case 'scale':
                return (
                    <div className="scale-options">
                        {[1, 2, 3, 4, 5].map(num => (
                            <button
                                key={num}
                                className={`scale-btn ${answer === num ? 'selected' : ''}`}
                                onClick={() => setAnswer(num)}
                            >
                                {num}
                            </button>
                        ))}
                        <div className="scale-labels">
                            <span>{t('readiness.low')}</span>
                            <span>{t('readiness.high')}</span>
                        </div>
                    </div>
                );

            case 'open_ended':
            default:
                return (
                    <div className="voice-input-wrapper" style={{ position: 'relative' }}>
                        <textarea
                            className="open-answer"
                            value={answer as string}
                            onChange={(e) => setAnswer(e.target.value)}
                            placeholder={t('readiness.placeholder')}
                            rows={4}
                            style={{ paddingRight: '2.5rem' }}
                        />
                        <div style={{ position: 'absolute', right: '0.5rem', top: '0.5rem' }}>
                            <VoiceInputButton
                                onTranscript={(text) => setAnswer(prev => {
                                    const current = typeof prev === 'string' ? prev : '';
                                    return current ? `${current} ${text}` : text;
                                })}
                            />
                        </div>
                    </div>
                );
        }
    };

    const renderInterview = () => (
        <div className="readiness-interview">
            <div className="interview-sidebar">
                <h3>{t('readiness.progress')}</h3>
                {progress.map(p => (
                    <div
                        key={p.areaId}
                        className={`progress-item ${p.status}`}
                        onClick={() => switchArea(p.areaId)}
                    >
                        <span className="progress-icon">
                            {p.status === 'completed' && <CheckCircle size={18} />}
                            {p.status === 'in_progress' && <Loader size={18} className="spin" />}
                            {p.status === 'not_started' && <Circle size={18} />}
                        </span>
                        <span className="progress-name">{p.name}</span>
                        <span className="progress-count">{p.questionsAnswered}</span>
                    </div>
                ))}
            </div>

            <div className="interview-main">
                {questionLoading ? (
                    <div className="question-loading">
                        <Loader className="spin" size={32} />
                        <p>{t('readiness.generatingQ')}</p>
                    </div>
                ) : currentQuestion ? (
                    <div className="question-container">
                        <div className="question-meta">
                            <span className={`question-mode ${currentQuestion.mode}`}>
                                {currentQuestion.mode}
                            </span>
                            <span className="question-area">
                                {areas.find(a => a.id === currentQuestion.areaId)?.name}
                            </span>
                        </div>
                        <h2 className="question-text">{currentQuestion.question}</h2>
                        {renderQuestionInput()}
                        <button
                            className="btn-primary submit-answer"
                            onClick={submitAnswer}
                            disabled={answer === '' || loading}
                        >
                            {loading ? <Loader className="spin" size={20} /> : <ChevronRight size={20} />}
                            {t('interview.nextQuestion')}
                        </button>
                    </div>
                ) : (
                    <div className="no-question">
                        <AlertCircle size={48} />
                        <p>{t('readiness.noQuestion')}</p>
                        <button onClick={() => setStep('complete')} className="btn-secondary">
                            {t('readiness.finish')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );

    const renderComplete = () => (
        <div className="readiness-complete">
            <CheckCircle size={64} className="complete-icon" />
            <h2>{t('readiness.complete')}</h2>
            <p>{t('readiness.completeDesc')}</p>
            <div className="complete-actions">
                <button
                    className="btn-primary"
                    onClick={() => handleViewReport('readiness')}
                >
                    <FileText size={20} /> {t('readiness.generateReadiness')}
                </button>
                <button
                    className="btn-secondary"
                    onClick={() => handleViewReport('gap')}
                >
                    <BarChart3 size={20} /> {t('readiness.generateGap')}
                </button>
            </div>
        </div>
    );

    if (step === 'report' && session) {
        return (
            <ReadinessReport
                sessionId={session.sessionId}
                type={reportType}
                onBack={() => setStep('complete')}
                selectedModel={selectedModel}
            />
        );
    }

    return (
        <div className="readiness-analysis">
            {error && (
                <div className="error-banner">
                    <AlertCircle size={20} />
                    {error}
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            {step === 'select_areas' && renderAreaSelection()}
            {step === 'interview' && renderInterview()}
            {step === 'complete' && renderComplete()}
        </div>
    );
}
