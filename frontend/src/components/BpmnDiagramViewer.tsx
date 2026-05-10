import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

export interface DiagramStep {
  stepId: string;
  label: string;
  order: number;
  status: string;
}

interface Props {
  steps: DiagramStep[];
  processName: string;
}

// ── Layout constants ──────────────────────────────────────────────
const TASK_W = 150, TASK_H = 64, TASK_GAP = 18;
const SP_PAD_X = 28, SP_PAD_TOP = 46, SP_PAD_BOT = 22;
const SP_GAP = 56;
const PROC_PAD_X = 44, PROC_PAD_TOP = 54, PROC_PAD_BOT = 32;
const EV_R = 18, EV_GAP = 40;
const PHASE = 4; // steps per subprocess

const PHASE_PALETTE = [
  { border: '#2563eb', bg: 'rgba(37,99,235,0.1)',  text: '#93c5fd' },
  { border: '#7c3aed', bg: 'rgba(124,58,237,0.1)', text: '#c4b5fd' },
  { border: '#0891b2', bg: 'rgba(8,145,178,0.1)',  text: '#67e8f9' },
  { border: '#059669', bg: 'rgba(5,150,105,0.1)',  text: '#6ee7b7' },
  { border: '#d97706', bg: 'rgba(217,119,6,0.1)',  text: '#fcd34d' },
];

const STATUS_COLOR: Record<string, { border: string; bg: string }> = {
  consensus: { border: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  majority:  { border: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  conflict:  { border: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
  unique:    { border: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
};
const DEFAULT_TASK = { border: '#475569', bg: 'rgba(71,85,105,0.18)' };

/**
 * Derive a concise phase name from the steps in a sub-process group.
 * Takes the first step's label and strips common filler words to get a topic.
 * Falls back to meaningful ordered labels (Initiation, Processing, etc.).
 */
function derivePhaseName(steps: DiagramStep[], phaseIndex: number, totalPhases: number, processName: string): string {
  if (totalPhases === 1) return processName;
  const firstLabel = steps[0]?.label || '';
  const stopWords = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'for', 'with', 'in', 'on', 'at', 'to', 'by', 'is', 'are', 'was', 'be']);
  const words = firstLabel.split(/[\s\-_/]+/).filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));
  if (words.length > 0) {
    const name = words.slice(0, 3).join(' ');
    return name.length > 24 ? name.slice(0, 22) + '…' : name;
  }
  const phaseLabels = ['Initiation', 'Processing', 'Review & Approval', 'Execution', 'Reporting', 'Closure'];
  return phaseLabels[phaseIndex] || `Stage ${phaseIndex + 1}`;
}

function wrap(text: string, maxCh: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxCh) { cur = next; }
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

export default function BpmnDiagramViewer({ steps, processName }: Props) {
  const [zoom, setZoom] = useState(1);
  const wrapRef = useRef<HTMLDivElement>(null);

  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const phases: DiagramStep[][] = [];
  for (let i = 0; i < sorted.length; i += PHASE) phases.push(sorted.slice(i, i + PHASE));

  // ── Compute layout ───────────────────────────────────────────────
  const spH = SP_PAD_TOP + TASK_H + SP_PAD_BOT;
  const startX = PROC_PAD_X + EV_R;
  const midY   = PROC_PAD_TOP + spH / 2;

  interface PL { spX: number; spW: number; spH: number; tasks: { step: DiagramStep; tx: number; ty: number }[] }
  const pls: PL[] = [];
  let cx = PROC_PAD_X + EV_R * 2 + EV_GAP;

  for (const phase of phases) {
    const spW = SP_PAD_X * 2 + phase.length * (TASK_W + TASK_GAP) - TASK_GAP;
    const spY = PROC_PAD_TOP;
    const tasks = phase.map((s, i) => ({
      step: s,
      tx: cx + SP_PAD_X + i * (TASK_W + TASK_GAP),
      ty: spY + SP_PAD_TOP,
    }));
    pls.push({ spX: cx, spW, spH, tasks });
    cx += spW + SP_GAP;
  }

  const endX = cx - SP_GAP + EV_GAP + EV_R;
  const procW = endX + EV_R + PROC_PAD_X;
  const procH = PROC_PAD_TOP + spH + PROC_PAD_BOT;

  function fit() {
    if (!wrapRef.current) return;
    const scaleX = (wrapRef.current.clientWidth  - 32) / procW;
    const scaleY = (wrapRef.current.clientHeight - 32) / procH;
    setZoom(Math.min(scaleX, scaleY, 1.4));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fit(); }, [steps.length]);

  const FONT = "Inter, system-ui, sans-serif";
  const ARROW_COLOR = '#64748b';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <button className="bpmn-tool-btn" onClick={() => setZoom(z => Math.min(z * 1.2, 4))}><ZoomIn size={14}/></button>
        <button className="bpmn-tool-btn" onClick={() => setZoom(z => Math.max(z / 1.2, 0.15))}><ZoomOut size={14}/></button>
        <button className="bpmn-tool-btn" onClick={fit}><Maximize2 size={14}/></button>
        <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6, lineHeight: '28px' }}>{Math.round(zoom * 100)}%</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: '#475569', lineHeight: '28px' }}>
          {phases.length} subprocess{phases.length !== 1 ? 'es' : ''} · {steps.length} task{steps.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Scrollable canvas */}
      <div ref={wrapRef} style={{ flex: 1, overflow: 'auto', padding: 16, background: '#111827' }}>
        <svg
          width={procW * zoom}
          height={procH * zoom}
          viewBox={`0 0 ${procW} ${procH}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block' }}
        >
          <defs>
            <marker id="arh" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
              <polygon points="0 0, 9 3.5, 0 7" fill={ARROW_COLOR} />
            </marker>
            <filter id="glow">
              <feDropShadow dx="0" dy="1" stdDeviation="3" floodColor="rgba(0,0,0,0.6)" />
            </filter>
          </defs>

          {/* ── PROCESS container ── */}
          <rect x={1} y={1} width={procW - 2} height={procH - 2} rx={10}
            fill="rgba(124,58,237,0.04)" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="7 4" />
          {/* "PROCESS" badge */}
          <rect x={10} y={8} width={65} height={16} rx={4} fill="rgba(124,58,237,0.18)" />
          <text x={43} y={19.5} textAnchor="middle" fontSize={9} fill="#a78bfa" fontWeight="700" fontFamily={FONT}>PROCESS</text>
          <text x={16} y={40} fontSize={13} fill="#c4b5fd" fontWeight="700" fontFamily={FONT}>{processName}</text>

          {/* ── START EVENT ── */}
          <circle cx={startX} cy={midY} r={EV_R} fill="#052e16" stroke="#22c55e" strokeWidth={2} filter="url(#glow)" />
          <polygon points={`${startX-5},${midY-7} ${startX+8},${midY} ${startX-5},${midY+7}`} fill="#22c55e" />
          <text x={startX} y={midY + EV_R + 11} textAnchor="middle" fontSize={9} fill="#4ade80" fontFamily={FONT}>Start</text>

          {/* ── Arrow: start → first SP ── */}
          {pls.length > 0 && (
            <line x1={startX + EV_R} y1={midY} x2={pls[0].spX} y2={midY}
              stroke={ARROW_COLOR} strokeWidth={1.5} markerEnd="url(#arh)" />
          )}

          {/* ── SUBPROCESSES ── */}
          {pls.map((pl, pi) => {
            const pc = PHASE_PALETTE[pi % PHASE_PALETTE.length];
            const spY = PROC_PAD_TOP;
            const spCY = spY + spH / 2;
            // Derive a meaningful phase name from the steps' labels
            const phaseName = derivePhaseName(phases[pi], pi, phases.length, processName);

            return (
              <g key={pi}>
                {/* SubProcess border box */}
                <rect x={pl.spX} y={spY} width={pl.spW} height={spH} rx={8}
                  fill={pc.bg} stroke={pc.border} strokeWidth={1.5} filter="url(#glow)" />

                {/* "SUB-PROCESS" label */}
                <rect x={pl.spX + 8} y={spY + 6} width={72} height={14} rx={3} fill={`${pc.border}30`} />
                <text x={pl.spX + 44} y={spY + 16.5} textAnchor="middle" fontSize={8} fill={pc.text} fontWeight="700" fontFamily={FONT}>SUB-PROCESS</text>

                {/* Phase name — derived from step content, not hardcoded "Phase X of N" */}
                <text x={pl.spX + 10} y={spY + 36} fontSize={11} fill={pc.text} fontWeight="600" fontFamily={FONT}>
                  {phaseName}
                </text>

                {/* Tasks */}
                {pl.tasks.map((tl, _ti) => {
                  const tc = STATUS_COLOR[tl.step.status] || DEFAULT_TASK;
                  // Improved text wrap: 50-char truncation, 20-char width for wrapping
                  const labelText = tl.step.label.length > 50 ? tl.step.label.slice(0, 48) + '…' : tl.step.label;
                  const lines = wrap(labelText, 20);
                  const lh = 13;
                  const ty0 = tl.ty + TASK_H / 2 - (lines.length * lh) / 2 + lh * 0.75;

                  return (
                    <g key={tl.step.stepId}>
                      <rect x={tl.tx} y={tl.ty} width={TASK_W} height={TASK_H} rx={5}
                        fill={tc.bg} stroke={tc.border} strokeWidth={1.5} />
                      {/* Colored left accent bar for status */}
                      <rect x={tl.tx} y={tl.ty + 4} width={4} height={TASK_H - 8} rx={2} fill={tc.border} opacity={0.8} />
                      {/* Step number badge */}
                      <circle cx={tl.tx + 14} cy={tl.ty + 12} r={9} fill={tc.border} opacity={0.25} />
                      <text x={tl.tx + 14} y={tl.ty + 15.5} textAnchor="middle" fontSize={8} fill={tc.border} fontWeight="700" fontFamily={FONT}>
                        {tl.step.order}
                      </text>
                      {lines.map((ln, li) => (
                        <text key={li} x={tl.tx + TASK_W / 2} y={ty0 + li * lh}
                          textAnchor="middle" fontSize={10} fill="#e2e8f0" fontFamily={FONT}>{ln}</text>
                      ))}
                    </g>
                  );
                })}

                {/* Task → Task arrows */}
                {pl.tasks.slice(0, -1).map((tl, ti) => {
                  const nx = pl.tasks[ti + 1];
                  return (
                    <line key={`ta-${pi}-${ti}`}
                      x1={tl.tx + TASK_W} y1={tl.ty + TASK_H / 2}
                      x2={nx.tx}          y2={nx.ty + TASK_H / 2}
                      stroke={ARROW_COLOR} strokeWidth={1.5} markerEnd="url(#arh)" />
                  );
                })}

                {/* SP → next SP arrow */}
                {pi < pls.length - 1 && (
                  <line x1={pl.spX + pl.spW} y1={spCY}
                        x2={pls[pi + 1].spX}  y2={PROC_PAD_TOP + spH / 2}
                    stroke={ARROW_COLOR} strokeWidth={1.5} markerEnd="url(#arh)" />
                )}
              </g>
            );
          })}

          {/* ── Arrow: last SP → end ── */}
          {pls.length > 0 && (
            <line x1={pls[pls.length - 1].spX + pls[pls.length - 1].spW} y1={midY}
                  x2={endX - EV_R} y2={midY}
              stroke={ARROW_COLOR} strokeWidth={1.5} markerEnd="url(#arh)" />
          )}

          {/* ── END EVENT (double-border per BPMN 2.0 standard) ── */}
          <circle cx={endX} cy={midY} r={EV_R}     fill="#450a0a" stroke="#ef4444" strokeWidth={2.5} filter="url(#glow)" />
          <circle cx={endX} cy={midY} r={EV_R - 5} fill="none"   stroke="#ef4444" strokeWidth={2} />
          <text x={endX} y={midY + EV_R + 11} textAnchor="middle" fontSize={9} fill="#f87171" fontFamily={FONT}>End</text>
        </svg>
      </div>
    </div>
  );
}
