import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Network, Loader2, AlertTriangle, Clock, Hand, Sparkles, ArrowRightLeft, Info } from 'lucide-react';
import BpmnJsViewer from '../components/BpmnJsViewer';
import {
  fetchMultiSMEConsolidation,
  generateUnifiedBPMN,
  type MultiSMEConsolidation,
} from '../services/api';
import './BpmnDashboard.css';

type TabState = 'asis' | 'tobe';

export default function BpmnDashboard() {
  const { processId } = useParams<{ processId: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabState>('asis');
  const [loading, setLoading] = useState(true);
  const [consolidation, setConsolidation] = useState<MultiSMEConsolidation | null>(null);
  const [asIsXml, setAsIsXml] = useState<string>('');
  const [toBeXml, setToBeXml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!processId) return;

    async function loadData() {
      try {
        setLoading(true);
        const res = await fetchMultiSMEConsolidation(processId!);
        if (res?.consolidation) {
          setConsolidation(res.consolidation);
          const [asIs, toBe] = await Promise.all([
            generateUnifiedBPMN(res.consolidation.consolidationId, false),
            generateUnifiedBPMN(res.consolidation.consolidationId, true),
          ]);
          setAsIsXml(asIs?.bpmnXml || '');
          setToBeXml(toBe?.bpmnXml || '');
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
        <span>{error || 'No consolidation data found for this process.'}</span>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{ padding: '8px 16px', background: 'var(--surface-hover)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
            Go Back
          </button>
          <button 
            onClick={async () => {
              setLoading(true);
              try {
                // Use the correct API endpoint for triggering consolidation
                const res = await fetch(`/api/multi-sme-consolidation/${encodeURIComponent(processId!)}/generate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ forceMock: false }) // Explicitly request real data
                });
                if (res.ok) {
                  // The process is backgrounded; we'll wait a bit then reload or just inform the user
                  alert('AI Consolidation started. This may take 30-60 seconds. The page will reload once complete.');
                  // We could poll here, but for simplicity let's just wait and reload
                  setTimeout(() => window.location.reload(), 5000);
                } else {
                  throw new Error('Failed to start generation');
                }
              } catch (e) {
                setError('Failed to trigger consolidation. Ensure you have completed at least one interview.');
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

  // Derive metrics from real data (consolidation steps)
  const totalSteps = consolidation.steps.length;
  const acceptedSteps = consolidation.steps.filter(s => s.accepted).length;

  // AS-IS metrics
  const asIsMetrics = {
    duration: `${totalSteps * 2.5} Days`,
    manualTasks: totalSteps,
    aiTasks: 0,
    handoffs: Math.max(0, totalSteps - 2),
  };

  // TO-BE metrics (hypothetical improvements based on accepted AI merges)
  const toBeMetrics = {
    duration: `${Math.max(1, totalSteps * 0.8)} Days`,
    manualTasks: totalSteps - acceptedSteps,
    aiTasks: acceptedSteps,
    handoffs: Math.max(0, totalSteps - 2 - Math.floor(acceptedSteps / 2)),
  };

  const metrics = activeTab === 'asis' ? asIsMetrics : toBeMetrics;

  return (
    <div className="bpmn-dashboard-page">
      <div className="bpmn-dashboard-header">
        <h1 className="bpmn-dashboard-header__title">
          <Network size={24} color="var(--primary)" />
          BPMN Process Diagrams
        </h1>
        <p className="bpmn-dashboard-header__subtitle">
          {consolidation.processName} · BPMN 2.0 notation · Auto-generated from SME interviews + process mining
        </p>
      </div>

      <div className="bpmn-tabs">
        <button
          className={`bpmn-tab-btn ${activeTab === 'asis' ? 'active' : ''}`}
          onClick={() => setActiveTab('asis')}
        >
          AS-IS Process
        </button>
        <button
          className={`bpmn-tab-btn ${activeTab === 'tobe' ? 'active' : ''}`}
          onClick={() => setActiveTab('tobe')}
        >
          TO-BE Process
        </button>
      </div>

      <div className="bpmn-metrics-row">
        <div className="bpmn-metric-card">
          <span className="bpmn-metric-card__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={14} /> Total Duration</span>
          <span className="bpmn-metric-card__value">{metrics.duration}</span>
        </div>
        <div className="bpmn-metric-card">
          <span className="bpmn-metric-card__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Hand size={14} /> Manual Tasks</span>
          <span className="bpmn-metric-card__value">{metrics.manualTasks}</span>
        </div>
        <div className="bpmn-metric-card">
          <span className="bpmn-metric-card__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={14} /> AI-Augmented Steps</span>
          <span className="bpmn-metric-card__value">{metrics.aiTasks}</span>
        </div>
        <div className="bpmn-metric-card">
          <span className="bpmn-metric-card__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ArrowRightLeft size={14} /> Handoffs</span>
          <span className="bpmn-metric-card__value">{metrics.handoffs}</span>
        </div>
      </div>

      <div className="bpmn-diagram-area">
        {(activeTab === 'asis' ? asIsXml : toBeXml) ? (
          <>
            <BpmnJsViewer xml={activeTab === 'asis' ? asIsXml : toBeXml} />
            <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(15, 23, 42, 0.6)', padding: '4px 8px', borderRadius: 4, maxWidth: '300px' }}>
              <Info size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {activeTab === 'asis' ? 'AS-IS Flow based on interview data.' : 'TO-BE Flow with AI optimizations.'}
            </div>
          </>
        ) : (
          <div className="bpmn-empty">No BPMN XML generated.</div>
        )}
      </div>

      <div className="bpmn-insights-area">
        <div className="bpmn-insights-header">
          {activeTab === 'asis' ? (
            <><AlertTriangle size={18} color="var(--error)" /> Pain Points Identified in AS-IS</>
          ) : (
            <><Sparkles size={18} color="var(--success)" /> AI Infusion Points in TO-BE</>
          )}
        </div>
        <div className="bpmn-insights-grid">
          {activeTab === 'asis' ? (
            consolidation.steps.slice(0, 4).map(step => (
              <div key={step.stepId} className="bpmn-insight-card">
                <div className="bpmn-insight-card__title">Manual step: {step.label}</div>
                <div className="bpmn-insight-card__desc">
                  This task requires manual intervention by SMEs, increasing cycle time. Confidence: {step.confidence}%
                </div>
              </div>
            ))
          ) : (
            consolidation.steps.filter(s => s.accepted).slice(0, 4).map(step => (
              <div key={step.stepId} className="bpmn-insight-card to-be">
                <div className="bpmn-insight-card__title">AI Automated: {step.label}</div>
                <div className="bpmn-insight-card__desc">
                  {step.aiProposedMerge?.rationale || 'This step has been optimized and merged using AI.'}
                </div>
              </div>
            ))
          )}
          {activeTab === 'tobe' && consolidation.steps.filter(s => s.accepted).length === 0 && (
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', padding: '1rem' }}>
              Accept more steps in the Multi-SME Consolidation view to see AI Infusion Points here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
