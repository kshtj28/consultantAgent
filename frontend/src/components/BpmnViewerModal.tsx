import { useEffect } from 'react';
import { X, Download } from 'lucide-react';
import BpmnDiagramViewer, { type DiagramStep } from './BpmnDiagramViewer';
import './BpmnViewerModal.css';

interface BpmnViewerModalProps {
  steps: DiagramStep[];
  processName?: string;
  note?: string;
  onClose: () => void;
  onDownloadXml?: () => void;
}

export default function BpmnViewerModal({ steps, processName, note, onClose, onDownloadXml }: BpmnViewerModalProps) {
  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  return (
    <div className="bpmn-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bpmn-modal">
        {/* Header */}
        <div className="bpmn-modal__header">
          <div className="bpmn-modal__title">
            <span className="bpmn-modal__title-icon">⬡</span>
            <span>{processName ? `${processName} — Process Diagram` : 'Process Diagram'}</span>
          </div>
          <div className="bpmn-modal__toolbar">
            {onDownloadXml && (
              <button className="bpmn-tool-btn" title="Download BPMN 2.0 XML" onClick={onDownloadXml}>
                <Download size={15} /> <span style={{ fontSize: 11, marginLeft: 4 }}>BPMN XML</span>
              </button>
            )}
            <button className="bpmn-tool-btn bpmn-tool-btn--close" title="Close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Diagram */}
        <div className="bpmn-modal__canvas-wrap">
          <BpmnDiagramViewer steps={steps} processName={processName ?? 'Process'} />
        </div>

        {/* Footer note */}
        {note && <div className="bpmn-modal__note">ℹ️ {note}</div>}
      </div>
    </div>
  );
}
