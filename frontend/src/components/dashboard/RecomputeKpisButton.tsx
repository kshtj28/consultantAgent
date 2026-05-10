import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { recomputeDashboardMetrics, retriggerBankingKpis } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
    /** Called after the recompute call resolves so the parent can re-fetch
     *  whatever data feeds the dashboard. Recompute is fire-and-forget on
     *  the server (cheap aggregation), so the spinner only blocks the
     *  network round-trip, not the report generation. */
    onComplete?: () => void;
    /** "subtle" sits in a corner of a populated dashboard; "prominent"
     *  is for the empty state where it's the primary CTA for admins. */
    variant?: 'subtle' | 'prominent';
}

/** Admin-only button that forces a re-aggregation of dashboard KPIs from
 *  the underlying session and report data. Useful when a session was
 *  paused or completed before the metrics-recompute fix shipped, or
 *  when reports were regenerated and the dashboard hasn't yet picked
 *  up the new figures via SSE. Returns null for non-admins. */
export default function RecomputeKpisButton({ onComplete, variant = 'subtle' }: Props) {
    const { isAdmin } = useAuth();
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

    if (!isAdmin) return null;

    const handleClick = async () => {
        if (busy) return;
        setBusy(true);
        setStatus('idle');
        try {
            await recomputeDashboardMetrics();
            await retriggerBankingKpis();
            setStatus('success');
            onComplete?.();
            setTimeout(() => setStatus('idle'), 2500);
        } catch (err) {
            console.error('Recompute KPIs failed:', err);
            setStatus('error');
            setTimeout(() => setStatus('idle'), 4000);
        } finally {
            setBusy(false);
        }
    };

    const label = busy
        ? 'Recomputing…'
        : status === 'success'
            ? 'KPIs refreshed'
            : status === 'error'
                ? 'Recompute failed'
                : 'Recompute KPIs';

    if (variant === 'prominent') {
        return (
            <button
                onClick={handleClick}
                disabled={busy}
                title="Force a re-aggregation of dashboard KPIs from existing session and report data."
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: status === 'error' ? '#ef4444' : '#3b82f6',
                    color: 'white', padding: '10px 20px', borderRadius: 8,
                    fontSize: '0.9rem', fontWeight: 600, border: 'none',
                    cursor: busy ? 'wait' : 'pointer', transition: 'background 0.2s',
                    opacity: busy ? 0.8 : 1,
                }}
            >
                <RefreshCw size={15} className={busy ? 'spin' : ''} />
                {label}
            </button>
        );
    }

    return (
        <button
            onClick={handleClick}
            disabled={busy}
            title="Admin: force a re-aggregation of dashboard KPIs from existing session and report data."
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'transparent',
                color: status === 'error' ? '#ef4444' : status === 'success' ? '#10b981' : 'var(--text-secondary, #94a3b8)',
                padding: '6px 10px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 500,
                border: '1px solid var(--border, rgba(148,163,184,0.25))',
                cursor: busy ? 'wait' : 'pointer',
                opacity: busy ? 0.7 : 1,
            }}
        >
            <RefreshCw size={12} className={busy ? 'spin' : ''} />
            {label}
        </button>
    );
}
