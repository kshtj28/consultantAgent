import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  GitMerge,
  UserPlus,
  Users,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  ChevronDown,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import BpmnViewerModal from '../components/BpmnViewerModal';
import {
  fetchMultiSMEConsolidation,
  regenerateMultiSMEConsolidation,
  acceptConsolidationStep,
  editConsolidationStep,
  inviteSMEToConsolidation,
  generateUnifiedBPMN,
  subscribeToConsolidationStream,
  listConsolidationProcesses,
  type MultiSMEConsolidation,
  type ConsolidatedStep,
  type ConsolidationStepStatus,
  type ConsolidationStakeholder,
  type AvailableProcess,
} from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import './MultiSMEConsolidation.css';

// Mock configuration removed as we now require explicit selection

type StepFilter = 'all' | ConsolidationStepStatus;

function StatusIcon({ status, size = 16 }: { status: ConsolidationStepStatus; size?: number }) {
  if (status === 'consensus') return <CheckCircle2 size={size} />;
  if (status === 'majority') return <AlertTriangle size={size} />;
  if (status === 'conflict') return <XCircle size={size} />;
  return <Sparkles size={size} />;
}

function MetricCard({
  label,
  value,
  helper,
  icon,
  iconColor,
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  iconColor?: string;
}) {
  return (
    <div className="consolidation-metric">
      <div className="consolidation-metric__label">
        <span>{label}</span>
        <span className="consolidation-metric__icon" style={{ color: iconColor }}>{icon}</span>
      </div>
      <div className="consolidation-metric__value">{value}</div>
      <div className="consolidation-metric__helper">{helper}</div>
    </div>
  );
}

function AvatarStack({ people }: { people: Array<{ initials: string; color: string }> }) {
  return (
    <span className="avatar-stack">
      {people.map((p, idx) => (
        <span key={idx} className="avatar-stack__avatar" style={{ background: p.color }}>
          {p.initials}
        </span>
      ))}
    </span>
  );
}

function StakeholderCard({ stakeholder, t }: { stakeholder: ConsolidationStakeholder; t: (k: string) => string }) {
  const status = stakeholder.sessionStatus;
  const fillClass = status === 'active' ? 'roster-card__bar-fill--active' : '';
  const statusLabel = status === 'done' ? t('consolidation.statusDone')
    : status === 'active' ? t('consolidation.statusActive')
    : t('consolidation.statusInvited');
  return (
    <div className="roster-card">
      <div className="roster-card__head">
        <span className="roster-card__avatar" style={{ background: stakeholder.color }}>
          {stakeholder.initials}
        </span>
        <div>
          <div className="roster-card__name">{stakeholder.username}</div>
          <div className="roster-card__role">{stakeholder.role}</div>
        </div>
      </div>
      <div className="roster-card__meta">
        <span>{stakeholder.yearsExperience} yrs · {stakeholder.seniority}</span>
        <span className={`status-pill status-pill--${status}`}>{statusLabel}</span>
      </div>
      <div className="roster-card__bar">
        <div className={`roster-card__bar-fill ${fillClass}`} style={{ width: `${stakeholder.completePct}%` }} />
      </div>
      <div className="roster-card__footer">
        <span>{stakeholder.turnsTaken} {t('consolidation.turns')}</span>
        <span>{stakeholder.completePct}% {t('consolidation.complete')}</span>
      </div>
    </div>
  );
}

function StepRow({
  step,
  expanded,
  onToggle,
  onAcceptMerge,
  onEditVersion,
  t,
}: {
  step: ConsolidatedStep;
  expanded: boolean;
  onToggle: () => void;
  onAcceptMerge: () => void;
  onEditVersion: () => void;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const statusLabel = (
    step.status === 'consensus' ? t('consolidation.filterConsensus')
    : step.status === 'majority' ? t('consolidation.filterMajority')
    : step.status === 'conflict' ? t('consolidation.filterConflict')
    : t('consolidation.filterUnique')
  );
  return (
    <div className="step-row">
      <button type="button" className="step-row__head" onClick={onToggle}>
        <span className="step-row__index">{String(step.order).padStart(2, '0')}</span>
        <span className={`step-row__icon step-row__icon--${step.status}`}>
          <StatusIcon status={step.status} size={18} />
        </span>
        <div className="step-row__main">
          <div className="step-row__title">
            <span>{step.label}</span>
            <span className={`step-pill step-pill--${step.status}`}>{statusLabel}</span>
            {step.accepted && (
              <span className="step-pill step-pill--accepted">
                <CheckCircle2 size={11} /> {t('consolidation.accepted')}
              </span>
            )}
          </div>
          <div className="step-row__sub">
            <span><strong>{t('consolidation.confidence')}</strong> {step.confidence}%</span>
            <span>·</span>
            <span>{t('consolidation.mentionedByTpl', { n: step.mentionedByCount, total: step.totalSMEs })}</span>
            <AvatarStack people={step.mentionedBy} />
          </div>
        </div>
        <span className={`step-row__chevron ${expanded ? 'expanded' : ''}`}>
          <ChevronDown size={16} />
        </span>
      </button>

      {expanded && (
        <div className="step-row__body">
          <div className="per-sme-label">{t('consolidation.perSMEVersion')}</div>
          {step.perSMEVersions.map((v) => (
            <div className="per-sme-card" key={v.userId}>
              <div className="per-sme-card__head">
                <span className="roster-card__avatar" style={{ background: v.color, width: 28, height: 28, fontSize: 11 }}>
                  {v.initials}
                </span>
                <span className="per-sme-card__name">{v.username}</span>
                <span className="per-sme-card__meta">· {v.role}</span>
                <span className="weight-pill">
                  {t('consolidation.weightTpl', { seniority: v.seniority, weight: v.weight })}
                </span>
              </div>
              <div className="per-sme-card__desc">{v.description}</div>
              {v.quote && <div className="per-sme-card__quote">"{v.quote}"</div>}
            </div>
          ))}

          {step.aiProposedMerge && (
            <div className="merge-callout">
              <div className="merge-callout__title">
                <Sparkles size={14} /> {t('consolidation.aiProposedMerge')}
              </div>
              <div className="merge-callout__body">{step.aiProposedMerge.proposed}</div>
              <div className="merge-callout__rationale">{step.aiProposedMerge.rationale}</div>
              <div className="merge-callout__actions">
                <button className="consolidation-btn consolidation-btn--primary" onClick={onAcceptMerge}>
                  {t('consolidation.acceptMerge')}
                </button>
                <button className="consolidation-btn" onClick={onEditVersion}>
                  {t('consolidation.editVersion')}
                </button>
                <button className="consolidation-btn" disabled>
                  {t('consolidation.scheduleWorkshop')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MultiSMEConsolidationPage() {
  const { t } = useLanguage();
  const [consolidation, setConsolidation] = useState<MultiSMEConsolidation | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StepFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['step-05']));
  const [generating, setGenerating] = useState(false);
  const [processes, setProcesses] = useState<AvailableProcess[]>([]);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [showBpmn, setShowBpmn] = useState(false);

  const navigate = useNavigate();
  const params = useParams<{ processId?: string }>();
  const processId = params.processId || '';

  useEffect(() => {
    listConsolidationProcesses()
      .then((res) => {
        setProcesses(res.processes);
        // Auto-navigate to first real process (or demo) when no process is selected
        if (!params.processId && res.processes.length > 0) {
          // Prefer a process with real SME data; fall back to demo
          const real = res.processes.find((p) => p.smeCount > 0 && p.processId !== 'loan-origination');
          const demo = res.processes.find((p) => p.processId === 'loan-origination');
          const target = real ?? demo ?? res.processes[0];
          navigate(`/sme/consolidation/${encodeURIComponent(target.processId)}`, { replace: true });
        }
      })
      .catch((err) => console.error('Failed to list processes:', err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;

    if (!processId) {
      setConsolidation(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setGenerateError(null);

    async function loadOrGenerate() {
      try {
        const res = await fetchMultiSMEConsolidation(processId);
        if (cancelled) return;
        if (res.consolidation) {
          setConsolidation(res.consolidation);
          return;
        }
      } catch (err) {
        console.warn('Fetch consolidation failed:', err);
      }
      
      // Auto-recover by generating the demo ONLY if we are explicitly on the demo process.
      // The route returns 202 immediately; the SSE handler above will set the consolidation.
      if (processId === 'loan-origination') {
        regenerateMultiSMEConsolidation(processId, { forceMock: true }).catch((err) => {
          console.error('Demo fallback generate failed:', err);
        });
      } else {
        if (!cancelled) setConsolidation(null);
      }
    }

    loadOrGenerate().finally(() => { if (!cancelled) setLoading(false); });

    const es = subscribeToConsolidationStream(processId, (event: any) => {
      if (cancelled) return;
      setGenerating(false);
      if (event?.type === 'generated') {
        fetchMultiSMEConsolidation(processId)
          .then((res) => { if (!cancelled && res.consolidation) setConsolidation(res.consolidation); })
          .catch(() => {});
      } else if (event?.type === 'no_data') {
        setGenerateError('No process steps could be extracted from the interview responses. Try completing more interviews for this area, or load the demo mockup to see how the feature works.');
      } else if (event?.type === 'error') {
        setGenerateError('Consolidation generation failed. Please try again.');
      }
    });
    return () => { cancelled = true; es.close(); };
  }, [processId]);

  const filteredSteps = useMemo(() => {
    if (!consolidation) return [];
    if (filter === 'all') return consolidation.steps;
    return consolidation.steps.filter((s) => s.status === filter);
  }, [consolidation, filter]);

  function toggleStep(stepId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId); else next.add(stepId);
      return next;
    });
  }

  async function handleAcceptMerge(stepId: string) {
    if (!consolidation) return;
    try {
      const res = await acceptConsolidationStep(consolidation.consolidationId, stepId);
      setConsolidation(res.consolidation);
    } catch (err) {
      console.error('Accept step failed:', err);
    }
  }

  async function handleEditVersion(step: ConsolidatedStep) {
    if (!consolidation) return;
    const next = window.prompt(t('consolidation.editPrompt'), step.aiProposedMerge?.proposed ?? step.description);
    if (!next || !next.trim()) return;
    try {
      const res = await editConsolidationStep(consolidation.consolidationId, step.stepId, next.trim());
      setConsolidation(res.consolidation);
    } catch (err) {
      console.error('Edit step failed:', err);
    }
  }

  async function handleInviteSME() {
    if (!consolidation) return;
    const username = window.prompt(t('consolidation.invitePrompt'));
    if (!username || !username.trim()) return;
    const role = window.prompt(t('consolidation.inviteRolePrompt'));
    if (!role || !role.trim()) return;
    try {
      const res = await inviteSMEToConsolidation(consolidation.consolidationId, {
        username: username.trim(),
        role: role.trim(),
      });
      setConsolidation(res.consolidation);
    } catch (err) {
      console.error('Invite SME failed:', err);
    }
  }

  async function handleGenerateBPMN() {
    if (!consolidation) return;
    setShowBpmn(true);
  }

  async function handleDownloadBpmnXml() {
    if (!consolidation) return;
    try {
      const res = await generateUnifiedBPMN(consolidation.consolidationId);
      if (res?.bpmnXml) {
        const blob = new Blob([res.bpmnXml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${consolidation.processId}-bpmn.xml`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Download BPMN failed:', err);
    }
  }

  async function handleRegenerate() {
    if (!processId || processId === 'loan-origination') return;
    setGenerating(true);
    setGenerateError(null);
    regenerateMultiSMEConsolidation(processId, { forceMock: false }).catch((err: any) => {
      console.error('Regenerate failed:', err);
      setGenerateError(err.message || 'Consolidation failed. Please try again.');
      setGenerating(false);
    });
  }

  async function handleGenerateDemo() {
    if (!processId) {
      alert('Please select a process area first to map the demo onto.');
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    // Backend returns 202; result arrives via SSE which clears the spinner
    regenerateMultiSMEConsolidation(processId, { forceMock: true }).catch((err) => {
      console.error('Generate demo consolidation failed:', err);
      setGenerating(false);
      setGenerateError(err.message || 'Failed to start demo generation.');
    });
  }

  async function handleGenerateActual() {
    if (!processId) return;
    setGenerating(true);
    setGenerateError(null);
    // Backend returns 202 immediately; the LLM runs in background.
    // The SSE handler above fires when done and clears the spinner.
    regenerateMultiSMEConsolidation(processId, { forceMock: false }).catch((err: any) => {
      console.error('Generate real consolidation failed:', err);
      setGenerateError(err.message || 'Consolidation failed. Please try again.');
      setGenerating(false);
    });
  }

  const subtitle = consolidation ? t('consolidation.subtitleTpl', {
    department: consolidation.department,
    count: consolidation.stakeholders.length,
  }) : '';

  const renderContent = () => {
    if (loading && !consolidation) {
      return (
        <div className="consolidation-loading" style={{ height: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary)' }} />
          <span>Loading consolidation data…</span>
        </div>
      );
    }
    
    if (!consolidation) {
      return (
        <div className="consolidation-empty">
          <p>{t('consolidation.empty')}</p>
          {generateError && (
            <p style={{ color: 'var(--error, #dc2626)', fontSize: '0.82rem', margin: '0.5rem 0', maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
              {generateError}
            </p>
          )}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
            <button
              className="consolidation-btn consolidation-btn--primary"
              onClick={handleGenerateActual}
              disabled={generating || !processId}
            >
              {generating ? <><Loader2 size={14} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} />Analysing with AI…</> : 'Consolidate Real Data'}
            </button>
            <button
              className="consolidation-btn"
              onClick={handleGenerateDemo}
              disabled={generating || !processId}
            >
              {generating ? 'Generating…' : 'Load Demo Mockup'}
            </button>
          </div>
        </div>
      );
    }

    const m = consolidation.metrics;
    return (
      <>
        <div className="consolidation-metrics">
          <MetricCard
            label={t('consolidation.metricInterviewsCompleted')}
            value={m.interviewsCompletedLabel}
            helper={t('consolidation.metricInterviewsHelper', { n: m.inProgress })}
            icon={<Users size={18} />}
          />
          <MetricCard
            label={t('consolidation.metricConsensusSteps')}
            value={String(m.consensusSteps)}
            helper={t('consolidation.metricConsensusHelper', { pct: m.consensusPct })}
            icon={<CheckCircle2 size={18} />}
            iconColor="#16a34a"
          />
          <MetricCard
            label={t('consolidation.metricMajority')}
            value={String(m.majoritySteps)}
            helper={t('consolidation.metricMajorityHelper')}
            icon={<AlertTriangle size={18} />}
            iconColor="#d97706"
          />
          <MetricCard
            label={t('consolidation.metricConflicts')}
            value={String(m.conflicts)}
            helper={t('consolidation.metricConflictsHelper')}
            icon={<XCircle size={18} />}
            iconColor="#dc2626"
          />
          <MetricCard
            label={t('consolidation.metricAlignment')}
            value={`${m.avgSemanticAlignment}%`}
            helper={t('consolidation.metricAlignmentHelper')}
            icon={<Sparkles size={18} />}
            iconColor="#7c3aed"
          />
        </div>

        <div className="consolidation-section">
          <div className="consolidation-section__head">
            <h2 className="consolidation-section__title">
              <Users size={16} /> {t('consolidation.stakeholderRoster')}
            </h2>
            <span className="consolidation-section__sub">
              · {t('consolidation.rosterDeptTpl', { department: consolidation.department })}
            </span>
          </div>
          <div className="roster-grid">
            {consolidation.stakeholders.map((s) => (
              <StakeholderCard key={s.userId} stakeholder={s} t={t} />
            ))}
          </div>
        </div>

        <div className="consolidation-section">
          <div className="consolidation-section__head">
            <h2 className="consolidation-section__title">
              <GitMerge size={16} /> {t('consolidation.consolidatedFlow')}
              <span className="consolidation-section__sub" style={{ marginLeft: 8 }}>
                · {t('consolidation.stepsNeedReview', { n: m.stepsNeedingReview })}
              </span>
            </h2>
            <div className="consolidation-filters">
              {(['all', 'consensus', 'majority', 'conflict', 'unique'] as StepFilter[]).map((f) => (
                <button
                  key={f}
                  className={`consolidation-filter-btn ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? t('consolidation.filterAll')
                    : f === 'consensus' ? t('consolidation.filterConsensus')
                    : f === 'majority' ? t('consolidation.filterMajority')
                    : f === 'conflict' ? t('consolidation.filterConflict')
                    : t('consolidation.filterUnique')}
                </button>
              ))}
            </div>
          </div>

          <div className="steps-list">
            {filteredSteps.map((step) => (
              <StepRow
                key={step.stepId}
                step={step}
                expanded={expanded.has(step.stepId)}
                onToggle={() => toggleStep(step.stepId)}
                onAcceptMerge={() => handleAcceptMerge(step.stepId)}
                onEditVersion={() => handleEditVersion(step)}
                t={t}
              />
            ))}
          </div>
        </div>

        <div className="how-it-works">
          <div className="how-it-works__title">
            <Info size={14} /> {t('consolidation.howItWorks')}
          </div>
          <div className="how-it-works__body">{t('consolidation.howItWorksBody')}</div>
        </div>
      </>
    );
  };

  return (
    <div className="consolidation-page">
      <div className="consolidation-header">
        <div>
          <h1 className="consolidation-header__title">
            <GitMerge size={22} /> {t('consolidation.title')}
          </h1>
          {subtitle && <p className="consolidation-header__subtitle">{subtitle}</p>}
        </div>
        <div className="consolidation-header__actions">
          {processes.length > 0 && (
            <select
              className="consolidation-dropdown"
              value={params.processId || ''}
              onChange={(e) => {
                if (e.target.value) navigate(`/sme/consolidation/${encodeURIComponent(e.target.value)}`);
              }}
            >
              <option value="" disabled>Select a process area...</option>
              {processes.filter(p => p.smeCount > 0 || p.processId === 'loan-origination').map(p => (
                <option key={p.processId} value={p.processId}>
                  {p.processName}{p.processId !== 'loan-origination' ? ` — ${p.smeCount} SME${p.smeCount !== 1 ? 's' : ''}` : ' — Demo'}
                </option>
              ))}
            </select>
          )}
          <button className="consolidation-btn" onClick={handleInviteSME}>
            <UserPlus size={14} /> {t('consolidation.inviteSME')}
          </button>
          {processId && processId !== 'loan-origination' && (
            <button
              className="consolidation-btn"
              onClick={handleRegenerate}
              disabled={generating}
              title="Re-run the AI pipeline on the latest interview data"
            >
              {generating
                ? <><Loader2 size={13} className="animate-spin" style={{ display: 'inline', marginRight: 4 }} />Analysing…</>
                : <><RefreshCw size={13} style={{ display: 'inline', marginRight: 4 }} />Regenerate</>}
            </button>
          )}
          <button
            className="consolidation-btn consolidation-btn--primary"
            onClick={handleGenerateBPMN}
            disabled={!consolidation}
          >
            <GitMerge size={14} style={{ display: 'inline', marginRight: 4 }} />{t('consolidation.generateBPMN')}
          </button>
        </div>
      </div>

      {renderContent()}

      {showBpmn && consolidation && (
        <BpmnViewerModal
          steps={consolidation.steps}
          processName={consolidation.processName}
          note={
            consolidation.steps.filter(s => s.accepted).length < 2
              ? 'Fewer than 2 steps accepted — showing all steps. Accept steps to refine the diagram.'
              : 'Showing all consolidated steps. Accepted steps are highlighted.'
          }
          onDownloadXml={handleDownloadBpmnXml}
          onClose={() => setShowBpmn(false)}
        />
      )}
    </div>
  );
}
