import { useEffect, useState, useCallback } from 'react';
import { ScrollText, Users, Activity, RefreshCw } from 'lucide-react';
import StatCard from '../../components/shared/StatCard';
import SectionCard from '../../components/shared/SectionCard';
import StatusBadge from '../../components/shared/StatusBadge';
import { fetchAuditLogs, type AuditLogEntry } from '../../services/api';
import './AuditLogs.css';

const LIMIT = 25;

function formatTimestamp(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function statusVariant(code: number): 'success' | 'warning' | 'error' | 'info' {
    if (code >= 200 && code < 300) return 'success';
    if (code >= 400 && code < 500) return 'warning';
    if (code >= 500) return 'error';
    return 'info';
}

export default function AuditLogs() {
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    // Filters
    const [resource, setResource] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, any> = { page, limit: LIMIT };
            if (resource) params.resource = resource;
            if (from) params.from = from;
            if (to) params.to = to;
            const data = await fetchAuditLogs(params);
            setLogs(data.logs);
            setTotal(data.total);
        } catch {
            // silently handle
        } finally {
            setLoading(false);
        }
    }, [page, resource, from, to]);

    useEffect(() => {
        load();
    }, [load]);

    // Derived stats
    const uniqueUsers = new Set(logs.map((l) => l.userId)).size;
    const actionCounts: Record<string, number> = {};
    logs.forEach((l) => {
        actionCounts[l.action] = (actionCounts[l.action] || 0) + 1;
    });
    const mostCommonAction =
        Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

    const totalPages = Math.ceil(total / LIMIT);

    return (
        <div className="audit-logs">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">Audit Logs</h1>
                    <p className="page-header__subtitle">Track all system activity and user actions</p>
                </div>
            </div>

            {/* Stats */}
            <div className="audit-logs__stats">
                <StatCard
                    icon={<ScrollText size={18} />}
                    label="Total Entries"
                    value={total}
                />
                <StatCard
                    icon={<Users size={18} />}
                    label="Unique Users"
                    value={uniqueUsers}
                />
                <StatCard
                    icon={<Activity size={18} />}
                    label="Most Common Action"
                    value={mostCommonAction}
                />
            </div>

            {/* Filters */}
            <SectionCard title="Activity Log">
                <div className="audit-logs__filters">
                    <select
                        className="audit-logs__filter-select"
                        value={resource}
                        onChange={(e) => { setResource(e.target.value); setPage(1); }}
                    >
                        <option value="">All Resources</option>
                        <option value="auth">Auth</option>
                        <option value="sessions">Sessions</option>
                        <option value="readiness">Readiness</option>
                        <option value="interview">Interview</option>
                        <option value="documents">Documents</option>
                        <option value="admin">Admin</option>
                    </select>

                    <input
                        type="date"
                        className="audit-logs__filter-input"
                        value={from}
                        onChange={(e) => { setFrom(e.target.value); setPage(1); }}
                        placeholder="From"
                    />
                    <input
                        type="date"
                        className="audit-logs__filter-input"
                        value={to}
                        onChange={(e) => { setTo(e.target.value); setPage(1); }}
                        placeholder="To"
                    />

                    <button
                        className="audit-logs__page-btn"
                        onClick={load}
                        disabled={loading}
                    >
                        <RefreshCw size={14} style={{ marginRight: 4 }} />
                        Refresh
                    </button>
                </div>

                {/* Table */}
                <div className="audit-logs__table-wrap">
                    <table className="audit-logs__table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>User</th>
                                <th>Role</th>
                                <th>Action</th>
                                <th>Resource</th>
                                <th>Status</th>
                                <th>IP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                                        No audit logs found
                                    </td>
                                </tr>
                            )}
                            {logs.map((entry) => (
                                <tr key={entry.auditId}>
                                    <td>{formatTimestamp(entry.timestamp)}</td>
                                    <td>{entry.username}</td>
                                    <td>{entry.role}</td>
                                    <td>{entry.action}</td>
                                    <td>{entry.resource}</td>
                                    <td>
                                        <StatusBadge
                                            label={String(entry.statusCode)}
                                            variant={statusVariant(entry.statusCode)}
                                        />
                                    </td>
                                    <td>{entry.ipAddress}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="audit-logs__pagination">
                    <span>
                        Page {page} of {totalPages || 1} ({total} entries)
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            className="audit-logs__page-btn"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                        >
                            Previous
                        </button>
                        <button
                            className="audit-logs__page-btn"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            Next
                        </button>
                    </div>
                </div>
            </SectionCard>
        </div>
    );
}
