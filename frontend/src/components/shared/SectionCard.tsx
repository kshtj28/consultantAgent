import { type ReactNode } from 'react';
import './SectionCard.css';

interface SectionCardProps {
    title?: string;
    headerRight?: ReactNode;
    children: ReactNode;
    className?: string;
}

export default function SectionCard({ title, headerRight, children, className = '' }: SectionCardProps) {
    return (
        <section className={`section-card ${className}`}>
            {(title || headerRight) && (
                <div className="section-card__header">
                    {title && <h3 className="section-card__title">{title}</h3>}
                    {headerRight && <div className="section-card__header-right">{headerRight}</div>}
                </div>
            )}
            <div className="section-card__body">{children}</div>
        </section>
    );
}
