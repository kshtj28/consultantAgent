import { type ReactNode } from 'react';
import './StatCard.css';

interface StatCardProps {
    icon?: ReactNode;
    label: string;
    value: string | number;
    valueColor?: 'default' | 'success' | 'warning' | 'error';
    subtitle?: string;
    subtitleColor?: 'default' | 'success' | 'warning' | 'error';
}

export default function StatCard({ icon, label, value, valueColor = 'default', subtitle, subtitleColor = 'default' }: StatCardProps) {
    return (
        <div className="stat-card">
            {icon && <div className="stat-card__icon">{icon}</div>}
            <span className="stat-card__label">{label}</span>
            <span className={`stat-card__value${valueColor !== 'default' ? ` stat-card__value--${valueColor}` : ''}`}>{value}</span>
            {subtitle && (
                <span className={`stat-card__subtitle stat-card__subtitle--${subtitleColor}`}>
                    {subtitle}
                </span>
            )}
        </div>
    );
}
