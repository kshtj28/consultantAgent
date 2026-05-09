import { useEffect, useRef, useState } from 'react';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import './BpmnJsViewer.css';

interface BpmnJsViewerProps {
  xml: string;
}

// ── Type-specific colors ──────────────────────────────────────────────────────

const SHAPE_COLORS: Record<string, { fill: string; stroke: string; sw?: string }> = {
  'bpmn:StartEvent':             { fill: '#064e3b', stroke: '#10b981', sw: '2.5' },
  'bpmn:EndEvent':               { fill: '#7f1d1d', stroke: '#f87171', sw: '3' },
  'bpmn:Task':                   { fill: '#1e3a5f', stroke: '#3b82f6' },
  'bpmn:UserTask':               { fill: '#2d1b69', stroke: '#8b5cf6' },
  'bpmn:ServiceTask':            { fill: '#0c4a6e', stroke: '#38bdf8' },
  'bpmn:ManualTask':             { fill: '#1e293b', stroke: '#64748b' },
  'bpmn:SendTask':               { fill: '#0c4a6e', stroke: '#38bdf8' },
  'bpmn:ReceiveTask':            { fill: '#0c4a6e', stroke: '#38bdf8' },
  'bpmn:ScriptTask':             { fill: '#1c1917', stroke: '#78716c' },
  'bpmn:ExclusiveGateway':       { fill: '#451a03', stroke: '#f59e0b', sw: '2' },
  'bpmn:ParallelGateway':        { fill: '#042f2e', stroke: '#14b8a6', sw: '2' },
  'bpmn:InclusiveGateway':       { fill: '#3b0764', stroke: '#a855f7', sw: '2' },
  'bpmn:IntermediateCatchEvent': { fill: '#1e3a5f', stroke: '#60a5fa' },
  'bpmn:IntermediateThrowEvent': { fill: '#1e3a5f', stroke: '#60a5fa' },
  'bpmn:SubProcess':             { fill: '#0f172a', stroke: '#334155' },
  'bpmn:CallActivity':           { fill: '#1e3a5f', stroke: '#3b82f6', sw: '3' },
};

function applyThemeColors(viewer: NavigatedViewer) {
  try {
    const elementRegistry = viewer.get('elementRegistry') as any;

    elementRegistry.forEach((element: any) => {
      // Skip connections and root
      if (element.waypoints || element.id === '__implicitroot') return;

      // ← correct API: getGraphics(element), not element.gfx
      const gfx: SVGElement | null = elementRegistry.getGraphics(element);
      if (!gfx) return;

      const visual = gfx.querySelector<SVGElement>('.djs-visual');
      if (!visual) return;

      const colors = SHAPE_COLORS[element.type];
      if (!colors) return;

      // Apply fill/stroke as inline styles — beats CSS class selectors
      const svgShapes = visual.querySelectorAll<SVGElement>('rect, circle, polygon, path, ellipse');
      svgShapes.forEach(shape => {
        shape.style.fill = colors.fill;
        shape.style.stroke = colors.stroke;
        shape.style.strokeWidth = `${colors.sw ?? '1.5'}px`;
        if (element.type === 'bpmn:SubProcess') {
          shape.style.strokeDasharray = '8 4';
        }
      });

      // White text inside every shape
      visual.querySelectorAll<SVGElement>('text, tspan').forEach(t => {
        t.style.fill = '#e2e8f0';
        t.style.fontFamily = "'Inter', sans-serif";
        t.style.fontSize = '11px';
        t.style.fontWeight = '500';
      });
    });

    // Style sequence-flow connections
    elementRegistry.forEach((element: any) => {
      if (!element.waypoints) return;
      const gfx: SVGElement | null = elementRegistry.getGraphics(element);
      if (!gfx) return;

      gfx.querySelectorAll<SVGElement>('.djs-visual path').forEach(p => {
        p.style.stroke = '#475569';
        p.style.strokeWidth = '1.5px';
        p.style.fill = 'none';
      });

      gfx.querySelectorAll<SVGElement>('text, tspan').forEach(t => {
        t.style.fill = '#94a3b8';
        t.style.fontSize = '10px';
      });
    });

    // Arrow markers in <defs>
    const firstGfx = elementRegistry.getGraphics(elementRegistry.getAll()?.[0]) as SVGElement | null;
    const container = firstGfx?.ownerSVGElement;
    if (container) {
      container.querySelectorAll<SVGElement>('defs marker path, defs marker polygon').forEach((el: SVGElement) => {
        el.style.fill = '#475569';
        el.style.stroke = '#475569';
      });
    }
  } catch (err) {
    console.warn('[BpmnJsViewer] applyThemeColors failed (non-fatal):', err);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BpmnJsViewer({ xml }: BpmnJsViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<NavigatedViewer | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    viewerRef.current = new NavigatedViewer({
      container: containerRef.current,
      keyboard: { bindTo: document },
    });

    return () => {
      viewerRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!viewerRef.current || !xml) return;
    setError(null);

    (async () => {
      try {
        await viewerRef.current!.importXML(xml);
        const canvas = viewerRef.current!.get('canvas') as any;
        canvas.zoom('fit-viewport', 'center');
        setZoom(canvas.zoom());
        applyThemeColors(viewerRef.current!);
      } catch (err: any) {
        console.error('[BpmnJsViewer] importXML failed:', err);
        setError(err?.message || 'Failed to render diagram');
      }
    })();

    if (containerRef.current) {
      const ro = new ResizeObserver(() => {
        if (viewerRef.current) {
          (viewerRef.current.get('canvas') as any).zoom('fit-viewport', 'center');
        }
      });
      ro.observe(containerRef.current);
      return () => ro.disconnect();
    }
  }, [xml]);

  const getCanvas = () => viewerRef.current?.get('canvas') as any;

  const handleZoomIn = () => { const c = getCanvas(); if (c) { c.zoom(zoom * 1.25); setZoom(c.zoom()); } };
  const handleZoomOut = () => { const c = getCanvas(); if (c) { c.zoom(zoom / 1.25); setZoom(c.zoom()); } };
  const handleFit = () => { const c = getCanvas(); if (c) { c.zoom('fit-viewport', 'center'); setZoom(c.zoom()); } };

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: '#94a3b8', fontSize: '0.82rem' }}>
        <span style={{ color: '#ef4444' }}>Failed to render BPMN diagram</span>
        <span style={{ opacity: 0.6, fontSize: '0.72rem' }}>{error}</span>
      </div>
    );
  }

  return (
    <div className="bpmn-js-wrapper" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div className="bpmn-js-toolbar">
        <button onClick={handleZoomIn} title="Zoom In"><ZoomIn size={14} /></button>
        <button onClick={handleFit} title="Fit"><Maximize2 size={14} /></button>
        <button onClick={handleZoomOut} title="Zoom Out"><ZoomOut size={14} /></button>
        <div className="bpmn-js-toolbar-sep" />
        <span className="bpmn-js-zoom-pct">{Math.round(zoom * 100)}%</span>
      </div>
      <div ref={containerRef} className="bpmn-js-container" style={{ flex: 1, overflow: 'hidden' }} />
    </div>
  );
}
