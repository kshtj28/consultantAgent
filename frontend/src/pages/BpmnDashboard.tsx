import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Network, Loader2, AlertTriangle, Clock, Hand, Sparkles,
  ArrowRightLeft, Info, ChevronDown, ChevronUp, CheckCircle2,
  TrendingUp, DollarSign, Zap, Users, ShieldCheck, ArrowRight,
} from 'lucide-react';
import BpmnJsViewer from '../components/BpmnJsViewer';
import {
  fetchMultiSMEConsolidation,
  generateUnifiedBPMN,
  type MultiSMEConsolidation,
} from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import './BpmnDashboard.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type TabState = 'asis' | 'tobe';
type AnalysisPhase = 'idle' | 'issues_start' | 'issues' | 'tobe_start' | 'tobe' | 'comparison_start' | 'comparison' | 'done' | 'error';

interface Issue {
  id: string;
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  category: string;
  impact: string;
  rootCause?: string;
}

interface Metrics {
  timeSavings?: { asis: string; tobe: string; reduction: string; detail: string };
  costReduction?: { percentage: string; detail: string };
  efficiencyGain?: { percentage: string; detail: string };
  automationRate?: { asis: string; tobe: string; detail: string };
  riskReduction?: { percentage: string; detail: string };
  customerExperience?: { improvement: string; detail: string };
  keyImprovements?: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
const CAT_ICON: Record<string, React.ReactNode> = {
  efficiency: <Clock size={12} />,
  cost: <DollarSign size={12} />,
  risk: <ShieldCheck size={12} />,
  compliance: <ShieldCheck size={12} />,
  customer_experience: <Users size={12} />,
  automation: <Zap size={12} />,
};

const PHASE_ORDER: AnalysisPhase[] = ['issues_start', 'issues', 'tobe_start', 'tobe', 'comparison_start', 'comparison', 'done'];
const atOrPast = (cur: AnalysisPhase, target: AnalysisPhase) => PHASE_ORDER.indexOf(cur) >= PHASE_ORDER.indexOf(target);

// ── Sub-components ────────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: '50%', background: 'var(--primary)',
          animation: `bpmn-dot 1.2s ${i * 0.2}s ease-in-out infinite`,
        }} />
      ))}
    </span>
  );
}

function AnalysisCard({
  title, icon, status, children,
}: {
  title: string; icon: React.ReactNode;
  status: 'waiting' | 'loading' | 'ready';
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{
      border: `1px solid ${status === 'ready' ? 'var(--border-light)' : 'var(--border)'}`,
      borderRadius: 10, overflow: 'hidden', background: 'var(--surface)', transition: 'border-color 0.3s',
    }}>
      <button
        onClick={() => status === 'ready' && setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', background: 'transparent', border: 'none',
          cursor: status === 'ready' ? 'pointer' : 'default', textAlign: 'left',
        }}
      >
        <span style={{
          padding: 6, borderRadius: 7,
          background: status === 'ready' ? 'var(--primary)22' : 'var(--border)',
          color: status === 'ready' ? 'var(--primary)' : 'var(--text-secondary)',
          display: 'flex', transition: 'all 0.3s',
        }}>{icon}</span>
        <span style={{ flex: 1, fontWeight: 600, fontSize: '0.9rem', color: status === 'ready' ? 'var(--text)' : 'var(--text-secondary)' }}>
          {title}
        </span>
        {status === 'loading' && <LoadingDots />}
        {status === 'waiting' && <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>Pending</span>}
        {status === 'ready' && (open ? <ChevronUp size={15} color="var(--text-secondary)" /> : <ChevronDown size={15} color="var(--text-secondary)" />)}
      </button>
      {status === 'ready' && open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px' }}>{children}</div>
      )}
    </div>
  );
}

function IssueCard({ issue }: { issue: Issue }) {
  const color = SEV_COLOR[issue.severity] || '#94a3b8';
  const icon = CAT_ICON[issue.category] || <AlertTriangle size={12} />;
  return (
    <div style={{
      border: `1px solid ${color}33`, borderLeft: `3px solid ${color}`,
      borderRadius: 8, padding: '10px 14px', background: `${color}08`,
    }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{ padding: '1px 7px', borderRadius: 10, fontSize: '0.67rem', fontWeight: 700, color, background: `${color}22`, textTransform: 'uppercase' }}>
          {issue.severity}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 7px', borderRadius: 10, fontSize: '0.67rem', color: 'var(--text-secondary)', background: 'var(--border)', textTransform: 'capitalize' }}>
          {icon} {issue.category?.replace(/_/g, ' ')}
        </span>
      </div>
      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)', marginBottom: 4 }}>{issue.title}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: issue.impact ? 5 : 0 }}>{issue.description}</div>
      {issue.impact && (
        <div style={{ fontSize: '0.74rem', color, display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertTriangle size={11} /> {issue.impact}
        </div>
      )}
    </div>
  );
}

function MetricTile({ label, value, sub, color = 'var(--primary)' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--surface)' }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BpmnDashboard() {
  const { processId } = useParams<{ processId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [activeTab, setActiveTab] = useState<TabState>('asis');
  const [loading, setLoading] = useState(true);
  const [consolidation, setConsolidation] = useState<MultiSMEConsolidation | null>(null);
  const [asIsXml, setAsIsXml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // AI Analysis state
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>('idle');
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [aiTobeBpmn, setAiTobeBpmn] = useState<string | null>(null);
  const [aiMetrics, setAiMetrics] = useState<Metrics | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!processId) return;
    async function loadData() {
      try {
        setLoading(true);
        const res = await fetchMultiSMEConsolidation(processId!);
        if (res?.consolidation) {
          setConsolidation(res.consolidation);
          const asIs = await generateUnifiedBPMN(res.consolidation.consolidationId, false);
          setAsIsXml(asIs?.bpmnXml || '');
        } else {
          setError('No consolidation data found for this process.');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load BPMN data.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [processId]);

  async function runAiAnalysis() {
    if (!processId) return;
    setAnalysisPhase('issues_start');
    setAnalysisError(null);
    setIssues(null);
    setAiTobeBpmn(null);
    setAiMetrics(null);

    abortRef.current = new AbortController();

    try {
      const response = await fetch(`/api/multi-sme-consolidation/${encodeURIComponent(processId)}/ai-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        signal: abortRef.current.signal,
      });

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({ error: 'AI analysis failed' }));
        throw new Error(err.error);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));
          switch (data.phase) {
            case 'issues_start':     setAnalysisPhase('issues_start'); break;
            case 'issues':           setIssues(data.issues); setAnalysisPhase('issues'); break;
            case 'tobe_start':       setAnalysisPhase('tobe_start'); break;
            case 'tobe':             setAiTobeBpmn(data.bpmnXml); setAnalysisPhase('tobe'); break;
            case 'comparison_start': setAnalysisPhase('comparison_start'); break;
            case 'comparison':       setAiMetrics(data.metrics); setAnalysisPhase('comparison'); break;
            case 'done':             setAnalysisPhase('done'); break;
            case 'error':            throw new Error(data.error || 'AI analysis failed');
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setAnalysisError(err.message || 'AI analysis failed');
      setAnalysisPhase('error');
    }
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bpmn-dashboard-page bpmn-loading">
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary)' }} />
        <span>Loading BPMN Data...</span>
      </div>
    );
  }

  if (error || !consolidation) {
    return (
      <div className="bpmn-dashboard-page bpmn-empty">
        <AlertTriangle size={32} style={{ color: 'var(--error)' }} />
        <span>{error || 'No consolidation data found.'}</span>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{ padding: '8px 16px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
            Go Back
          </button>
          <button
            onClick={async () => {
              setLoading(true);
              try {
                const res = await fetch(`/api/multi-sme-consolidation/${encodeURIComponent(processId!)}/generate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ forceMock: false }),
                });
                if (res.ok) {
                  alert('AI Consolidation started. This may take 30-60 seconds. Reload the page once complete.');
                  setTimeout(() => window.location.reload(), 5000);
                } else {
                  throw new Error('Failed to start');
                }
              } catch {
                setError('Failed to trigger consolidation. Ensure at least one interview is completed.');
                setLoading(false);
              }
            }}
            style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Trigger AI Consolidation
          </button>
        </div>
      </div>
    );
  }

  // ── Metrics ────────────────────────────────────────────────────────────────

  const totalSteps = consolidation.steps.length;
  const asIsMetrics ={ duration: `${totalSteps * 2.5} Days`, manualTasks: totalSteps, aiTasks: 0, handoffs: Math.max(0, totalSteps - 2) };

  // TO-BE metrics: use AI-generated values when available, otherwise fall back to crude estimates
  const toBeMetrics = aiMetrics
    ? {
        duration: aiMetrics.timeSavings?.tobe || '—',
        manualTasks: `↓ ${aiMetrics.efficiencyGain?.percentage || '—'}`,
        aiTasks: aiMetrics.automationRate?.tobe || '—',
        handoffs: `↓ ${aiMetrics.costReduction?.percentage || '—'}`,
      }
    : {
        duration: '—',
        manualTasks: '—',
        aiTasks: '—',
        handoffs: '—',
      };

  const metrics = activeTab === 'asis' ? asIsMetrics : toBeMetrics;

  const isRunning = analysisPhase !== 'idle' && analysisPhase !== 'done' && analysisPhase !== 'error';

  return (
    <div className="bpmn-dashboard-page" style={{ overflowY: 'auto' }}>
      <style>{`
        @keyframes bpmn-dot { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div className="bpmn-dashboard-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 className="bpmn-dashboard-header__title">
            <Network size={24} color="var(--primary)" />
            BPMN Process Diagrams
          </h1>
          <p className="bpmn-dashboard-header__subtitle">
            {consolidation.processName} · BPMN 2.0 · Auto-generated from SME interviews
          </p>
        </div>
        {analysisPhase === 'idle' || analysisPhase === 'error' ? (
          <button
            onClick={runAiAnalysis}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px',
              borderRadius: 8, border: 'none', background: 'var(--primary)',
              color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
              flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            <Sparkles size={15} /> Run AI Analysis
          </button>
        ) : isRunning ? (
          <button disabled style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px',
            borderRadius: 8, border: 'none', background: 'var(--border)',
            color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, cursor: 'not-allowed', flexShrink: 0,
          }}>
            <Loader2 size={15} className="animate-spin" /> Analyzing...
          </button>
        ) : (
          <button
            onClick={() => { setAnalysisPhase('idle'); setIssues(null); setAiTobeBpmn(null); setAiMetrics(null); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 20px',
              borderRadius: 8, border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Sparkles size={15} /> Re-run Analysis
          </button>
        )}
      </div>

      {/* AS-IS / TO-BE tabs */}
      <div className="bpmn-tabs">
        <button className={`bpmn-tab-btn ${activeTab === 'asis' ? 'active' : ''}`} onClick={() => setActiveTab('asis')}>
          AS-IS Process
        </button>
        <button className={`bpmn-tab-btn ${activeTab === 'tobe' ? 'active' : ''}`} onClick={() => setActiveTab('tobe')}>
          TO-BE Process
        </button>
      </div>

      {/* Metrics row */}
      <div className="bpmn-metrics-row">
        <div className="bpmn-metric-card">
          <span className="bpmn-metric-card__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} /> {activeTab === 'asis' ? 'Total Duration' : 'Target Duration'}
          </span>
          <span className="bpmn-metric-card__value" style={{ color: activeTab === 'tobe' && aiMetrics ? '#10b981' : undefined }}>
            {metrics.duration}
          </span>
        </div>
        <div className="bpmn-metric-card">
          <span className="bpmn-metric-card__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Hand size={14} /> {activeTab === 'asis' ? 'Manual Tasks' : 'Efficiency Gain'}
          </span>
          <span className="bpmn-metric-card__value" style={{ color: activeTab === 'tobe' && aiMetrics ? '#10b981' : undefined }}>
            {metrics.manualTasks}
          </span>
        </div>
        <div className="bpmn-metric-card">
          <span className="bpmn-metric-card__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} /> {activeTab === 'asis' ? 'AI-Augmented' : 'Automation Rate'}
          </span>
          <span className="bpmn-metric-card__value" style={{ color: activeTab === 'tobe' && aiMetrics ? 'var(--primary)' : undefined }}>
            {metrics.aiTasks}
          </span>
        </div>
        <div className="bpmn-metric-card">
          <span className="bpmn-metric-card__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowRightLeft size={14} /> {activeTab === 'asis' ? 'Handoffs' : 'Cost Reduction'}
          </span>
          <span className="bpmn-metric-card__value" style={{ color: activeTab === 'tobe' && aiMetrics ? '#10b981' : undefined }}>
            {metrics.handoffs}
          </span>
        </div>
      </div>

      {/* BPMN diagram */}
      <div className="bpmn-diagram-area" style={{ position: 'relative', minHeight: 360 }}>
        {activeTab === 'asis' ? (
          asIsXml ? (
            <>
              <BpmnJsViewer xml={asIsXml} />
              <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, fontSize: '0.73rem', color: 'var(--text-secondary)', background: 'rgba(15,23,42,0.75)', padding: '4px 10px', borderRadius: 4 }}>
                <Info size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                AS-IS — current process derived from SME interviews
              </div>
            </>
          ) : (
            <div className="bpmn-empty">No AS-IS BPMN generated.</div>
          )
        ) : (
          /* TO-BE tab: show AI-optimized diagram if available, else prompt */
          aiTobeBpmn ? (
            <>
              <BpmnJsViewer xml={aiTobeBpmn} />
              <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, fontSize: '0.73rem', color: 'var(--text-secondary)', background: 'rgba(15,23,42,0.75)', padding: '4px 10px', borderRadius: 4 }}>
                <Sparkles size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                TO-BE — AI-optimized using industry best practices
              </div>
            </>
          ) : isRunning ? (
            <div className="bpmn-empty">
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--primary)', marginBottom: 8 }} />
              <span>Generating optimized TO-BE process...</span>
            </div>
          ) : (
            <div className="bpmn-empty" style={{ flexDirection: 'column', gap: 12 }}>
              <Sparkles size={32} style={{ color: 'var(--primary)', opacity: 0.5 }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>TO-BE diagram not yet generated</div>
                <div style={{ fontSize: '0.82rem' }}>Click "Run AI Analysis" to generate the industry best-practice optimized process</div>
              </div>
            </div>
          )
        )}
      </div>

      {/* Pain points section — only shown on AS-IS tab (TO-BE uses AI Analysis section below) */}
      {activeTab === 'asis' && (
        <div className="bpmn-insights-area">
          <div className="bpmn-insights-header">
            <AlertTriangle size={18} color="var(--error)" /> Pain Points in AS-IS
          </div>
          <div className="bpmn-insights-grid">
            {consolidation.steps.slice(0, 4).map(step => (
              <div key={step.stepId} className="bpmn-insight-card">
                <div className="bpmn-insight-card__title">Manual: {step.label}</div>
                <div className="bpmn-insight-card__desc">Requires manual intervention — increases cycle time. Confidence: {step.confidence}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── AI Analysis Section ─────────────────────────────────────────────── */}
      {analysisPhase !== 'idle' && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Sparkles size={18} color="var(--primary)" />
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)' }}>
              AI Process Analysis
            </h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: 10, background: 'var(--border)' }}>
              Powered by industry best practices
            </span>
          </div>

          {analysisError && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: '#ef444411', border: '1px solid #ef444433', color: '#ef4444', fontSize: '0.82rem', marginBottom: 12 }}>
              {analysisError}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Issues */}
            <AnalysisCard
              title="Issues Identified in AS-IS Process"
              icon={<AlertTriangle size={16} />}
              status={!atOrPast(analysisPhase, 'issues_start') ? 'waiting' : !atOrPast(analysisPhase, 'issues') ? 'loading' : 'ready'}
            >
              {issues && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    {(['high', 'medium', 'low'] as const).map(sev => {
                      const count = issues.filter(i => i.severity === sev).length;
                      if (!count) return null;
                      return (
                        <span key={sev} style={{ padding: '2px 9px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700, color: SEV_COLOR[sev], background: `${SEV_COLOR[sev]}22`, border: `1px solid ${SEV_COLOR[sev]}44` }}>
                          {count} {sev}
                        </span>
                      );
                    })}
                  </div>
                  {issues.map(issue => <IssueCard key={issue.id} issue={issue} />)}
                </div>
              )}
            </AnalysisCard>

            {/* Comparison / Savings */}
            <AnalysisCard
              title="Efficiency Gains — AS-IS vs TO-BE"
              icon={<TrendingUp size={16} />}
              status={!atOrPast(analysisPhase, 'comparison_start') ? 'waiting' : !atOrPast(analysisPhase, 'comparison') ? 'loading' : 'ready'}
            >
              {aiMetrics && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {aiMetrics.timeSavings && (
                    <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--primary)0d', border: '1px solid var(--primary)33' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Processing Time</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ef4444' }}>{aiMetrics.timeSavings.asis}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>AS-IS</div>
                        </div>
                        <ArrowRight size={16} color="var(--text-secondary)" />
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981' }}>{aiMetrics.timeSavings.tobe}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>TO-BE</div>
                        </div>
                        <div style={{ marginLeft: 'auto', padding: '5px 14px', borderRadius: 20, background: '#10b98122', color: '#10b981', fontSize: '1.1rem', fontWeight: 700 }}>
                          -{aiMetrics.timeSavings.reduction}
                        </div>
                      </div>
                      {aiMetrics.timeSavings.detail && (
                        <div style={{ marginTop: 8, fontSize: '0.77rem', color: 'var(--text-secondary)' }}>{aiMetrics.timeSavings.detail}</div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
                    {aiMetrics.costReduction && <MetricTile label="Cost Reduction" value={aiMetrics.costReduction.percentage} sub={aiMetrics.costReduction.detail} color="#10b981" />}
                    {aiMetrics.efficiencyGain && <MetricTile label="Efficiency Gain" value={aiMetrics.efficiencyGain.percentage} sub={aiMetrics.efficiencyGain.detail} color="var(--primary)" />}
                    {aiMetrics.automationRate && <MetricTile label="Automation Rate" value={aiMetrics.automationRate.tobe} sub={`From ${aiMetrics.automationRate.asis}`} color="var(--accent)" />}
                    {aiMetrics.riskReduction && <MetricTile label="Risk Reduction" value={aiMetrics.riskReduction.percentage} sub={aiMetrics.riskReduction.detail} color="#f59e0b" />}
                  </div>

                  {aiMetrics.customerExperience && (
                    <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface-light)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 3 }}>
                        <Users size={13} color="var(--primary)" />
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>
                          Customer Experience: {aiMetrics.customerExperience.improvement}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{aiMetrics.customerExperience.detail}</div>
                    </div>
                  )}

                  {aiMetrics.keyImprovements?.length && (
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', marginBottom: 7 }}>Key Improvements</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {aiMetrics.keyImprovements.map((item: string, i: number) => (
                          <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: '0.81rem' }}>
                            <CheckCircle2 size={13} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />
                            <span style={{ color: 'var(--text-secondary)' }}>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </AnalysisCard>
          </div>
        </div>
      )}
    </div>
  );
}
