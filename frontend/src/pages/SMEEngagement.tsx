import { useEffect, useState } from 'react';
import { Users, CheckCircle, MessageCircle, AlertCircle } from 'lucide-react';
import StatCard from '../components/shared/StatCard';
import SectionCard from '../components/shared/SectionCard';
import StatusBadge from '../components/shared/StatusBadge';
import { SkeletonStatCards, SkeletonTable } from '../components/shared/Skeleton';
import { fetchSMEEngagement as fetchSMEEngagementData, subscribeToSMEStream } from '../services/api';
import { getInitials, formatRelativeTime, getRoleLabel } from '../utils/format';
import { useLanguage } from '../i18n/LanguageContext';
import './SMEEngagement.css';

interface SMEUser {
    userId: string;
    username: string;
    role?: string;
    department?: string;
    engagementScore?: number;
    participationRate?: number;
    responseCount?: number;     // total Q&A pairs across sessions
    sessionsTaken?: number;     // distinct assessment sessions
    lastActive?: string;
}

function engagementColor(pct: number): string {
    if (pct >= 70) return 'var(--success)';
    if (pct >= 40) return 'var(--warning)';
    return 'var(--error)';
}

export default function SMEEngagement() {
    const { t } = useLanguage();
    const [users, setUsers] = useState<SMEUser[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetchSMEEngagementData()
            .then(data => {
                setUsers(data.users || []);
            })
            .catch(err => console.error('Failed to fetch SME engagement:', err))
            .finally(() => setLoading(false));

        const es = subscribeToSMEStream((event) => {
            setUsers(event.users || []);
        });

        return () => es.close();
    }, []);

    const totalSMEs = users.length;
    const avgEngagement = users.length > 0
        ? Math.round(users.reduce((sum, u) => sum + (u.engagementScore || 0), 0) / users.length)
        : 0;
    const activeUsers = users.filter(u => u.lastActive && (Date.now() - new Date(u.lastActive).getTime()) < 7 * 24 * 60 * 60 * 1000);
    const participationRate = users.length > 0
        ? Math.round((activeUsers.length / users.length) * 100)
        : 0;
    // "Responses" stat = total assessment sessions taken (what testers expect),
    // not Q&A pair count which doubles/inflates the number.
    const totalResponses = users.reduce((sum, u) => sum + (u.sessionsTaken ?? 0), 0);
    const lowEngagement = users.filter(u => !u.lastActive || (Date.now() - new Date(u.lastActive).getTime()) >= 7 * 24 * 60 * 60 * 1000).length;

    const stats = [
        { icon: <Users size={18} />, label: 'Total SMEs', value: String(totalSMEs), subtitle: `${avgEngagement}% avg engagement` },
        { icon: <CheckCircle size={18} color="var(--success)" />, label: t('sme.activeParticipants'), value: String(activeUsers.length), subtitle: `${participationRate}${t('sme.participationRate')}`, subtitleColor: 'success' as const },
        { icon: <MessageCircle size={18} />, label: t('sme.totalResponses'), value: String(totalResponses), subtitle: 'This assessment period' },
        { icon: <AlertCircle size={18} color="var(--error)" />, label: t('sme.lowEngagement'), value: String(lowEngagement), subtitle: lowEngagement > 0 ? t('sme.needFollowUp') : t('sme.allOnTrack'), subtitleColor: (lowEngagement > 0 ? 'warning' : 'success') as 'warning' | 'success' },
    ];

    return (
        <div className="sme-engagement">
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">{t('sme.title')}</h1>
                    <p className="page-header__subtitle">
                        {t('sme.subtitle')}
                    </p>
                </div>
            </div>

            {/* Stats */}
            {loading ? (
                <SkeletonStatCards count={4} />
            ) : (
                <div className="sme-engagement__stats">
                    {stats.map((s) => (
                        <StatCard key={s.label} {...s} />
                    ))}
                </div>
            )}

            {/* Table */}
            <SectionCard title={t('sme.subjectMatterExperts')}>
                {loading ? (
                    <SkeletonTable rows={5} cols={6} />
                ) : users.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
                        {t('sme.noParticipants')}
                    </p>
                ) : (
                    <div className="sme-table-wrapper">
                        <table className="sme-table">
                            <thead>
                                <tr>
                                    <th>{t('sme.sme')}</th>
                                    <th>{t('sme.department')}</th>
                                    <th>{t('sme.engagement')}</th>
                                    <th>{t('sme.responses')}</th>
                                    <th>{t('sme.lastActive')}</th>
                                    <th>{t('sme.status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(user => (
                                    <tr key={user.userId}>
                                        <td>
                                            <div className="sme-table__user">
                                                <span className="sme-table__avatar">
                                                    {getInitials(user.username || '')}
                                                </span>
                                                <div>
                                                    <div className="sme-table__name">{user.username || 'Unknown'}</div>
                                                    <div className="sme-table__role">{getRoleLabel(user.role || '')}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>{user.department || 'Unknown'}</td>
                                        <td>
                                            <div className="sme-table__engagement">
                                                <div className="sme-table__bar-track">
                                                    <div
                                                        className="sme-table__bar-fill"
                                                        style={{
                                                            width: `${user.engagementScore || 0}%`,
                                                            background: engagementColor(user.engagementScore || 0),
                                                        }}
                                                    />
                                                </div>
                                                <span>{Math.round(user.engagementScore || 0)}%</span>
                                            </div>
                                        </td>
                                        <td>{user.sessionsTaken ?? 0}</td>
                                        <td className="sme-table__muted">{user.lastActive ? formatRelativeTime(user.lastActive) : '—'}</td>
                                        <td>
                                            <StatusBadge
                                                label={user.lastActive && (Date.now() - new Date(user.lastActive).getTime()) < 7 * 24 * 60 * 60 * 1000
                                                    ? t('sme.active')
                                                    : t('sme.inactive')}
                                                variant={user.lastActive && (Date.now() - new Date(user.lastActive).getTime()) < 7 * 24 * 60 * 60 * 1000
                                                    ? 'success'
                                                    : 'neutral'}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>
        </div>
    );
}
