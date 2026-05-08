import { useEffect, useRef, useState } from 'react';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import './BpmnJsViewer.css'; // Add some basic CSS for the bpmn-js wrapper

interface BpmnJsViewerProps {
  xml: string;
}

export default function BpmnJsViewer({ xml }: BpmnJsViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<NavigatedViewer | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize viewer
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

    const importXML = async () => {
      try {
        await viewerRef.current!.importXML(xml);
        // Automatically fit to viewport once loaded
        const canvas = viewerRef.current!.get('canvas') as any;
        canvas.zoom('fit-viewport', 'center');
        setZoom(canvas.zoom());
      } catch (err) {
        console.error('Failed to render BPMN diagram', err);
      }
    };

    importXML();

    // Listen for container resize to keep the diagram centered
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        if (viewerRef.current) {
          const canvas = viewerRef.current.get('canvas') as any;
          canvas.zoom('fit-viewport', 'center');
        }
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, [xml]);

  const handleZoomIn = () => {
    if (!viewerRef.current) return;
    const canvas = viewerRef.current.get('canvas') as any;
    canvas.zoom(zoom * 1.2);
    setZoom(canvas.zoom());
  };

  const handleZoomOut = () => {
    if (!viewerRef.current) return;
    const canvas = viewerRef.current.get('canvas') as any;
    canvas.zoom(zoom / 1.2);
    setZoom(canvas.zoom());
  };

  const handleFit = () => {
    if (!viewerRef.current) return;
    const canvas = viewerRef.current.get('canvas') as any;
    canvas.zoom('fit-viewport');
    setZoom(canvas.zoom());
  };

  return (
    <div className="bpmn-js-wrapper" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div className="bpmn-js-toolbar" style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 10, display: 'flex', gap: 8, background: 'var(--surface, #1e293b)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border, #334155)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
        <button onClick={handleZoomIn} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary, #94a3b8)', cursor: 'pointer', padding: 4 }} title="Zoom In">
          <ZoomIn size={16} />
        </button>
        <button onClick={handleFit} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary, #94a3b8)', cursor: 'pointer', padding: 4 }} title="Fit Viewport">
          <Maximize2 size={16} />
        </button>
        <button onClick={handleZoomOut} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary, #94a3b8)', cursor: 'pointer', padding: 4 }} title="Zoom Out">
          <ZoomOut size={16} />
        </button>
      </div>
      <div ref={containerRef} className="bpmn-js-container" style={{ flex: 1, backgroundColor: 'var(--surface-sunken, #0f172a)', borderRadius: 8, overflow: 'hidden' }} />
    </div>
  );
}
