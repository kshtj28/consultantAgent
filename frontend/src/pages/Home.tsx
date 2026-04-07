import { useEffect, useState } from 'react';
import { Clock, CheckCircle2, Circle, BarChart3, DollarSign, Target, ArrowRight, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';

const API_BASE = '/api';

interface SessionSummary {
    id: string;
    type: 'interview' | 'readiness';
    status: 'in_progress' | 'completed' | 'abandoned';
    startedAt: string;
    lastActivityAt: string;
    currentCategory?: string;
    progress: {
        completed: number;
        total: number;
    };
    title: string;
}

interface HomeProps {
    onResumeInterview: (sessionId: string) => void;
    onResumeReadiness: (sessionId: string) => void;
    onNewInterview: () => void;
    onNewReadiness: () => void;
}

function formatRelativeTime(dateStr: string, locale: string, t: (key: string) => string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return t('time.justNow');
    if (diffMins < 60) return `${diffMins}${t('time.mAgo')}`;
    if (diffHours < 24) return `${diffHours}${t('time.hAgo')}`;
    if (diffDays < 7) return `${diffDays}${t('time.dAgo')}`;
    return date.toLocaleDateString(locale);
}

function StatusBadge({ status }: { status: SessionSummary['status'] }) {
    const { t } = useLanguage();
    const config = {
        in_progress: { label: t('session.inProgress'), color: 'var(--primary)', icon: <Clock size={12} /> },
        completed: { label: t('session.completed'), color: '#10b981', icon: <CheckCircle2 size={12} /> },
        abandoned: { label: t('session.abandoned'), color: 'var(--text-secondary)', icon: <Circle size={12} /> },
    }[status];

    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '0.7rem',
            fontWeight: 600,
            color: config.color,
            background: `${config.color}22`,
            border: `1px solid ${config.color}44`,
        }}>
            {config.icon}
            {config.label}
        </span>
    );
}

function ProgressBar({ completed, total }: { completed: number; total: number }) {
    const { t } = useLanguage();
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return (
        <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {completed}/{total} {t('session.categories')}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{pct}%</span>
            </div>
            <div style={{
                height: '4px',
                borderRadius: '2px',
                background: 'var(--border)',
                overflow: 'hidden',
            }}>
                <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: pct === 100 ? '#10b981' : 'var(--primary)',
                    borderRadius: '2px',
                    transition: 'width 0.3s ease',
                }} />
            </div>
        </div>
    );
}

function SessionCard({
    session,
    onResume,
}: {
    session: SessionSummary;
    onResume: () => void;
}) {
    const { language, t } = useLanguage();
    const isInterview = session.type === 'interview';
    const canResume = session.status === 'in_progress';

    return (
        <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            transition: 'border-color 0.15s',
        }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        padding: '6px',
                        borderRadius: '8px',
                        background: 'var(--primary)22',
                        color: 'var(--primary)',
                        display: 'flex',
                    }}>
                        {isInterview ? <DollarSign size={16} /> : <Target size={16} />}
                    </div>
                    <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                            {session.title}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {isInterview ? 'Finance Interview' : 'Readiness Assessment'}
                        </div>
                    </div>
                </div>
                <StatusBadge status={session.status} />
            </div>

            <ProgressBar completed={session.progress.completed} total={session.progress.total} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {t('home.lastActivity')}: {formatRelativeTime(session.lastActivityAt, language, t)}
                </span>
                {canResume && (
                    <button
                        onClick={onResume}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--primary)',
                            background: 'transparent',
                            color: 'var(--primary)',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'var(--primary)';
                            e.currentTarget.style.color = '#fff';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = 'var(--primary)';
                        }}
                    >
                        {t('home.resume')} <ArrowRight size={12} />
                    </button>
                )}
            </div>
        </div>
    );
}

export function Home({ onResumeInterview, onResumeReadiness, onNewInterview, onNewReadiness }: HomeProps) {
    const { token } = useAuth();
    const { t } = useLanguage();
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSessions = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/sessions/all`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to load sessions');
            const data = await res.json();
            setSessions(data.sessions || []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    const interviewSessions = sessions.filter(s => s.type === 'interview');
    const readinessSessions = sessions.filter(s => s.type === 'readiness');

    return (
        <main className="main-content" style={{ padding: '32px', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text)' }}>{t('nav.dashboard')}</h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        {t('home.subtitle')}
                    </p>
                </div>
                <button
                    onClick={fetchSessions}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                    }}
                >
                    <RefreshCw size={14} /> {t('home.refresh')}
                </button>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '40px' }}>
                <button
                    onClick={onNewInterview}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '20px',
                        borderRadius: '12px',
                        border: '1px solid var(--primary)',
                        background: 'var(--primary)11',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary)22')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)11')}
                >
                    <div style={{ padding: '10px', borderRadius: '10px', background: 'var(--primary)', color: '#fff', display: 'flex' }}>
                        <DollarSign size={20} />
                    </div>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('home.newInterview')}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {t('home.newInterviewMeta')}
                        </div>
                    </div>
                    <Plus size={18} style={{ marginLeft: 'auto', color: 'var(--primary)' }} />
                </button>

                <button
                    onClick={onNewReadiness}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '20px',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)33')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
                >
                    <div style={{ padding: '10px', borderRadius: '10px', background: '#10b981', color: '#fff', display: 'flex' }}>
                        <Target size={20} />
                    </div>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('home.newReadiness')}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {t('home.newReadinessMeta')}
                        </div>
                    </div>
                    <Plus size={18} style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }} />
                </button>
            </div>

            {/* Sessions List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    <BarChart3 size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
                    <p>{t('home.loading')}</p>
                </div>
            ) : error ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    <p style={{ color: '#ef4444' }}>{error}</p>
                    <button onClick={fetchSessions} style={{ marginTop: '8px', cursor: 'pointer' }}>{t('home.retry')}</button>
                </div>
            ) : sessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
                    <BarChart3 size={40} style={{ opacity: 0.2, marginBottom: '16px' }} />
                    <h3 style={{ margin: '0 0 8px', fontWeight: 500 }}>{t('home.noSessions')}</h3>
                    <p style={{ margin: 0, fontSize: '0.875rem' }}>
                        {t('home.noSessionsDesc')}
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
                    {interviewSessions.length > 0 && (
                        <section>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <DollarSign size={16} style={{ color: 'var(--primary)' }} />
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>{t('home.financeInterviews')}</h3>
                                <span style={{
                                    padding: '1px 8px', borderRadius: '12px', background: 'var(--border)',
                                    fontSize: '0.72rem', color: 'var(--text-secondary)',
                                }}>
                                    {interviewSessions.length}
                                </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
                                {interviewSessions.map(s => (
                                    <SessionCard
                                        key={s.id}
                                        session={s}
                                        onResume={() => onResumeInterview(s.id)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {readinessSessions.length > 0 && (
                        <section>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <Target size={16} style={{ color: '#10b981' }} />
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>{t('home.readinessAssessments')}</h3>
                                <span style={{
                                    padding: '1px 8px', borderRadius: '12px', background: 'var(--border)',
                                    fontSize: '0.72rem', color: 'var(--text-secondary)',
                                }}>
                                    {readinessSessions.length}
                                </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
                                {readinessSessions.map(s => (
                                    <SessionCard
                                        key={s.id}
                                        session={s}
                                        onResume={() => onResumeReadiness(s.id)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </main>
    );
}
