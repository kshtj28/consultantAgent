import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import { ZoomIn, ZoomOut, Maximize2, X } from 'lucide-react';
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
  'bpmn:Participant':            { fill: '#0f172a', stroke: '#334155' },
  'bpmn:Lane':                   { fill: 'none', stroke: '#334155' },
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
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    viewerRef.current = new NavigatedViewer({
      container: containerRef.current,
      keyboard: { bindTo: document },
      // Disable mouse-wheel zoom in the diagram to avoid page-scrolling interference
      zoomScroll: { enabled: false }
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
  const toggleFullscreen = () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    
    // Enable/disable scroll depending on mode
    if (viewerRef.current) {
      try {
        const zoomScroll = viewerRef.current.get('zoomScroll') as any;
        if (zoomScroll) zoomScroll.toggle(next);
      } catch (e) {}
    }
  };

  // Close fullscreen on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: '#94a3b8', fontSize: '0.82rem' }}>
        <span style={{ color: '#ef4444' }}>Failed to render BPMN diagram</span>
        <span style={{ opacity: 0.6, fontSize: '0.72rem' }}>{error}</span>
      </div>
    );
  }

  const wrapperStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 99999,
    background: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(12px)',
    display: 'flex', 
    flexDirection: 'column',
    padding: '40px',
  };

  const content = (
    <div 
      className={`bpmn-js-wrapper ${isFullscreen ? 'bpmn-js-wrapper--fullscreen' : ''}`} 
      style={isFullscreen ? wrapperStyle : { position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div className="bpmn-js-toolbar" style={isFullscreen ? { bottom: 'auto', top: 60, right: 60, scale: '1.2' } : {}}>
        <button onClick={handleZoomIn} title="Zoom In"><ZoomIn size={14} /></button>
        <button onClick={toggleFullscreen} title={isFullscreen ? "Close Fullscreen" : "Enlarge to Fullscreen"}>
          {isFullscreen ? <X size={14} /> : <Maximize2 size={14} />}
        </button>
        <button onClick={handleZoomOut} title="Zoom Out"><ZoomOut size={14} /></button>
        <div className="bpmn-js-toolbar-sep" />
        <span className="bpmn-js-zoom-pct">{Math.round(zoom * 100)}%</span>
        {!isFullscreen && (
          <span style={{ fontSize: '0.65rem', color: '#475569', marginLeft: 8, opacity: 0.7 }}>
            (Click enlarge to scroll)
          </span>
        )}
      </div>
      <div 
        ref={containerRef} 
        className="bpmn-js-container" 
        style={{ 
          flex: 1, 
          overflow: 'hidden', 
          background: isFullscreen ? 'transparent' : 'transparent',
          borderRadius: isFullscreen ? 12 : 0,
          border: isFullscreen ? '1px solid rgba(255,255,255,0.1)' : 'none'
        }} 
      />
      {isFullscreen && (
        <div style={{ position: 'absolute', top: 20, left: 40, color: 'white', opacity: 0.8, fontSize: '0.9rem', fontWeight: 600 }}>
          {isFullscreen ? 'Full Process View' : ''}
        </div>
      )}
    </div>
  );

  if (isFullscreen) {
    return createPortal(content, document.body);
  }

  return content;
}
