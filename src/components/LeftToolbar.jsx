import React from 'react';
import {
  MousePointer,
  Search,
  XCircle,
  Cable,
  FileText,
  ZoomIn,
  ZoomOut,
  MailPlus,
  Mail,
} from 'lucide-react';
import { useNetworkStore } from '../store/useNetworkStore.js';

export default function LeftToolbar({ zoomControls }) {
  const activeTool = useNetworkStore((s) => s.activeTool);
  const setActiveTool = useNetworkStore((s) => s.setActiveTool);
  const setActiveModal = useNetworkStore((s) => s.setActiveModal);
  const clearSimulationEvents = useNetworkStore((s) => s.clearSimulationEvents);

  return (
    <aside className="nr-left-toolbar" aria-label="Workspace Tools">
      <button
        type="button"
        className={`nr-tool-btn ${activeTool === 'select' ? 'is-active' : ''}`}
        onClick={() => setActiveTool('select')}
        title="Select & Move Devices (V)"
      >
        <MousePointer size={17} />
      </button>

      <button
        type="button"
        className={`nr-tool-btn ${activeTool === 'inspect' ? 'is-active' : ''}`}
        onClick={() => setActiveTool('inspect')}
        title="Inspect Device Configuration & Tables (I)"
      >
        <Search size={17} />
      </button>

      <button
        type="button"
        className={`nr-tool-btn ${activeTool === 'delete' ? 'is-active' : ''}`}
        onClick={() => setActiveTool('delete')}
        title="Delete Device or Disconnect Cable (D)"
      >
        <XCircle size={17} />
      </button>

      <button
        type="button"
        className={`nr-tool-btn ${activeTool === 'connect' ? 'is-active' : ''}`}
        onClick={() => setActiveTool('connect')}
        title="Connect Virtual Ethernet Cable (C)"
      >
        <Cable size={17} />
      </button>

      <button
        type="button"
        className="nr-tool-btn"
        onClick={() => setActiveModal('labs')}
        title="Lab Guide, Subnet Reference & Network Diagnostics"
      >
        <FileText size={17} />
      </button>

      <div className="nr-tool-divider" />

      <button
        type="button"
        className="nr-tool-btn"
        onClick={() => zoomControls?.zoomIn?.()}
        title="Zoom In"
      >
        <ZoomIn size={17} />
      </button>

      <button
        type="button"
        className="nr-tool-btn"
        onClick={() => zoomControls?.zoomOut?.()}
        title="Zoom Out"
      >
        <ZoomOut size={17} />
      </button>

      <div className="nr-tool-divider" />

      <button
        type="button"
        className={`nr-tool-btn ${activeTool === 'pdu' ? 'is-active' : ''}`}
        onClick={() => setActiveTool('pdu')}
        title="Simple PDU / Click-to-Ping between two devices (P)"
      >
        <MailPlus size={17} />
      </button>

      <button
        type="button"
        className="nr-tool-btn"
        onClick={() => clearSimulationEvents()}
        title="Clear Active Packet Trace"
      >
        <Mail size={17} />
      </button>
    </aside>
  );
}
