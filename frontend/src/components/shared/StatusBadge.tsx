import './StatusBadge.css';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface StatusBadgeProps {
    label: string;
    variant?: BadgeVariant;
}

const AUTO_VARIANT_MAP: Record<string, BadgeVariant> = {
    active: 'success',
    completed: 'success',
    high: 'error',
    'high risk': 'error',
    'medium risk': 'warning',
    'in progress': 'info',
    'low activity': 'warning',
    inactive: 'neutral',
    medium: 'warning',
    low: 'success',
};

export default function StatusBadge({ label, variant }: StatusBadgeProps) {
    const resolved = variant || AUTO_VARIANT_MAP[label.toLowerCase()] || 'neutral';
    return <span className={`status-badge status-badge--${resolved}`}>{label}</span>;
}
