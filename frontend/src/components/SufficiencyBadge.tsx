import type { SufficiencyAssessment, SufficiencyDimensionKey } from '../services/api';
import './SufficiencyBadge.css';

const DIMENSION_LABELS: Record<SufficiencyDimensionKey, string> = {
    actor: 'Actor',
    action: 'Action',
    input: 'Input',
    output: 'Output',
    decisionCriteria: 'Decision',
    sla: 'SLA',
};

const DIMENSION_TOOLTIPS: Record<SufficiencyDimensionKey, string> = {
    actor: 'A clear role, team, or named system performing the step',
    action: 'Verb-level clarity on what is actually done',
    input: 'What document, event, or data feeds this step',
    output: 'What artifact or state-change is produced',
    decisionCriteria: 'Thresholds or rules that determine which path the work follows',
    sla: 'Expected duration, deadline, or cycle time',
};

const DIMENSION_ORDER: SufficiencyDimensionKey[] = [
    'actor',
    'action',
    'input',
    'output',
    'decisionCriteria',
    'sla',
];

function scoreColor(score: number | null, applicable: boolean): string {
    if (!applicable || score === null) return 'var(--sb-na)';
    if (score >= 70) return 'var(--sb-green)';
    if (score >= 40) return 'var(--sb-yellow)';
    return 'var(--sb-red)';
}

interface Props {
    assessment: SufficiencyAssessment;
    /** "compact" shows only the 6 dots; "full" shows labels and overall. */
    variant?: 'compact' | 'full';
}

export default function SufficiencyBadge({ assessment, variant = 'full' }: Props) {
    const { overall, passed, dimensions, missingDimension, threshold, errored } = assessment;

    if (errored) {
        return (
            <div className="sb-root sb-root--errored" title={assessment.errorReason || 'Sufficiency unknown'}>
                <span className="sb-label">Sufficiency: unknown</span>
            </div>
        );
    }

    if (variant === 'compact') {
        return (
            <div className="sb-root sb-root--compact" title={`Sufficiency ${overall}/100 — threshold ${threshold}`}>
                {DIMENSION_ORDER.map(key => {
                    const dim = dimensions[key];
                    return (
                        <span
                            key={key}
                            className="sb-dot"
                            style={{ background: scoreColor(dim.score, dim.applicable) }}
                            title={`${DIMENSION_LABELS[key]}: ${dim.applicable && dim.score !== null ? `${dim.score}/100` : 'n/a'}`}
                        />
                    );
                })}
                <span className={`sb-overall ${passed ? 'sb-overall--pass' : 'sb-overall--fail'}`}>{overall}</span>
            </div>
        );
    }

    return (
        <div className={`sb-root ${passed ? 'sb-root--pass' : 'sb-root--fail'}`}>
            <div className="sb-header">
                <span className="sb-label">Audit sufficiency</span>
                <span className={`sb-overall sb-overall--${passed ? 'pass' : 'fail'}`}>
                    {overall}/100
                </span>
                <span className="sb-status">
                    {passed ? '✓ passes audit threshold' : `needs more detail · threshold ${threshold}`}
                </span>
            </div>
            <div className="sb-grid">
                {DIMENSION_ORDER.map(key => {
                    const dim = dimensions[key];
                    const isMissing = missingDimension === key;
                    return (
                        <div
                            key={key}
                            className={`sb-cell ${isMissing ? 'sb-cell--missing' : ''}`}
                            title={DIMENSION_TOOLTIPS[key]}
                        >
                            <span
                                className="sb-cell__dot"
                                style={{ background: scoreColor(dim.score, dim.applicable) }}
                            />
                            <span className="sb-cell__name">{DIMENSION_LABELS[key]}</span>
                            <span className="sb-cell__score">
                                {dim.applicable && dim.score !== null ? dim.score : '—'}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
