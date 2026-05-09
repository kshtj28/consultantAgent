import { useEffect, useRef, useState } from 'react';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import './BpmnJsViewer.css';

interface BpmnJsViewerProps {
  xml: string;
}

// ── Theme colors per BPMN element type ───────────────────────────────────────

const SHAPE_COLORS: Record<string, { fill: string; stroke: string; strokeWidth?: string }> = {
  'bpmn:StartEvent':        { fill: '#064e3b', stroke: '#10b981', strokeWidth: '2.5px' },
  'bpmn:EndEvent':          { fill: '#7f1d1d', stroke: '#f87171', strokeWidth: '3px' },
  'bpmn:Task':              { fill: '#1e3a5f', stroke: '#3b82f6', strokeWidth: '1.5px' },
  'bpmn:UserTask':          { fill: '#2d1b69', stroke: '#8b5cf6', strokeWidth: '1.5px' },
  'bpmn:ServiceTask':       { fill: '#0c4a6e', stroke: '#38bdf8', strokeWidth: '1.5px' },
  'bpmn:ManualTask':        { fill: '#1e293b', stroke: '#64748b', strokeWidth: '1.5px' },
  'bpmn:SendTask':          { fill: '#0c4a6e', stroke: '#38bdf8', strokeWidth: '1.5px' },
  'bpmn:ReceiveTask':       { fill: '#0c4a6e', stroke: '#38bdf8', strokeWidth: '1.5px' },
  'bpmn:ScriptTask':        { fill: '#1e293b', stroke: '#64748b', strokeWidth: '1.5px' },
  'bpmn:ExclusiveGateway':  { fill: '#451a03', stroke: '#f59e0b', strokeWidth: '2px' },
  'bpmn:ParallelGateway':   { fill: '#042f2e', stroke: '#14b8a6', strokeWidth: '2px' },
  'bpmn:InclusiveGateway':  { fill: '#3b0764', stroke: '#a855f7', strokeWidth: '2px' },
  'bpmn:EventBasedGateway': { fill: '#1c1917', stroke: '#78716c', strokeWidth: '2px' },
  'bpmn:IntermediateCatchEvent': { fill: '#1e3a5f', stroke: '#60a5fa', strokeWidth: '2px' },
  'bpmn:IntermediateThrowEvent': { fill: '#1e3a5f', stroke: '#60a5fa', strokeWidth: '2px' },
  'bpmn:SubProcess':        { fill: 'rgba(15, 23, 42, 0.7)', stroke: '#334155', strokeWidth: '1px' },
};

function applyThemeColors(viewer: NavigatedViewer) {
  try {
    const elementRegistry = viewer.get('elementRegistry') as any;

    elementRegistry.forEach((element: any) => {
      // Skip connections (sequence flows, message flows)
      if (element.waypoints) return;
      // Skip root canvas element
      if (element.id === '__implicitroot') return;

      const gfx = element.gfx as SVGElement | null;
      if (!gfx) return;

      const visual = gfx.querySelector('.djs-visual') as SVGElement | null;
      if (!visual) return;

      const colors = SHAPE_COLORS[element.type];

      if (colors) {
        const shapes = visual.querySelectorAll<SVGElement>('rect, circle, polygon, path, ellipse');
        shapes.forEach(shape => {
          shape.style.fill = colors.fill;
          shape.style.stroke = colors.stroke;
          shape.style.strokeWidth = colors.strokeWidth || '2px';
        });

        // Dashed border for SubProcess
        if (element.type === 'bpmn:SubProcess') {
          shapes.forEach(shape => {
            (shape as SVGRectElement).style.strokeDasharray = '8 4';
            shape.style.strokeOpacity = '0.7';
          });
        }
      }

      // Text labels — always white/light
      const texts = visual.querySelectorAll<SVGElement>('text, tspan');
      texts.forEach(t => {
        t.style.fill = '#e2e8f0';
        t.style.fontFamily = "'Inter', -apple-system, sans-serif";
        t.style.fontSize = '11px';
        t.style.fontWeight = '500';
      });
    });

    // Style sequence flow arrows (connections)
    elementRegistry.forEach((element: any) => {
      if (!element.waypoints) return;
      const gfx = element.gfx as SVGElement | null;
      if (!gfx) return;
      const visual = gfx.querySelector('.djs-visual') as SVGElement | null;
      if (!visual) return;

      const paths = visual.querySelectorAll<SVGElement>('path');
      paths.forEach(p => {
        p.style.stroke = '#475569';
        p.style.strokeWidth = '1.5px';
        p.style.fill = 'none';
      });

      // Labels on sequence flows
      const texts = gfx.querySelectorAll<SVGElement>('text, tspan');
      texts.forEach(t => {
        t.style.fill = '#94a3b8';
        t.style.fontSize = '10px';
      });
    });

    // Style arrowhead markers in the SVG defs
    const svgEl = (gfx: Element): SVGSVGElement | null => {
      let el: Element | null = gfx;
      while (el && el.tagName !== 'svg') el = el.parentElement;
      return el as SVGSVGElement | null;
    };
    const firstGfx = (elementRegistry.getAll()[0] as any)?.gfx;
    if (firstGfx) {
      const svg = svgEl(firstGfx);
      if (svg) {
        svg.querySelectorAll<SVGElement>('defs marker path, defs marker polygon').forEach(el => {
          el.style.fill = '#475569';
          el.style.stroke = '#475569';
        });
      }
    }
  } catch (err) {
    // Non-fatal: just log and continue
    console.warn('[BpmnJsViewer] applyThemeColors error:', err);
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

    const importXML = async () => {
      try {
        await viewerRef.current!.importXML(xml);

        const canvas = viewerRef.current!.get('canvas') as any;
        canvas.zoom('fit-viewport', 'center');
        setZoom(canvas.zoom());

        // Apply type-specific dark-theme colors
        applyThemeColors(viewerRef.current!);
      } catch (err: any) {
        console.error('[BpmnJsViewer] importXML failed:', err);
        setError(err?.message || 'Failed to render diagram');
      }
    };

    importXML();

    if (containerRef.current) {
      const ro = new ResizeObserver(() => {
        if (viewerRef.current) {
          const canvas = viewerRef.current.get('canvas') as any;
          canvas.zoom('fit-viewport', 'center');
        }
      });
      ro.observe(containerRef.current);
      return () => ro.disconnect();
    }
  }, [xml]);

  const handleZoomIn = () => {
    if (!viewerRef.current) return;
    const canvas = viewerRef.current.get('canvas') as any;
    canvas.zoom(zoom * 1.25);
    setZoom(canvas.zoom());
  };

  const handleZoomOut = () => {
    if (!viewerRef.current) return;
    const canvas = viewerRef.current.get('canvas') as any;
    canvas.zoom(zoom / 1.25);
    setZoom(canvas.zoom());
  };

  const handleFit = () => {
    if (!viewerRef.current) return;
    const canvas = viewerRef.current.get('canvas') as any;
    canvas.zoom('fit-viewport', 'center');
    setZoom(canvas.zoom());
  };

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: '#94a3b8', fontSize: '0.82rem' }}>
        <span style={{ color: '#ef4444' }}>Failed to render BPMN diagram</span>
        <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{error}</span>
      </div>
    );
  }

  return (
    <div className="bpmn-js-wrapper" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Toolbar */}
      <div className="bpmn-js-toolbar">
        <button onClick={handleZoomIn} title="Zoom In"><ZoomIn size={15} /></button>
        <button onClick={handleFit} title="Fit to viewport"><Maximize2 size={15} /></button>
        <button onClick={handleZoomOut} title="Zoom Out"><ZoomOut size={15} /></button>
        <div className="bpmn-js-toolbar-divider" />
        <span className="bpmn-js-zoom-label">{Math.round(zoom * 100)}%</span>
      </div>

      <div
        ref={containerRef}
        className="bpmn-js-container"
        style={{ flex: 1, borderRadius: 8, overflow: 'hidden' }}
      />
    </div>
  );
}
