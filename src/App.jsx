import React, { useState } from 'react';
import TopBar from './components/TopBar.jsx';
import LeftToolbar from './components/LeftToolbar.jsx';
import BottomDock from './components/BottomDock.jsx';
import SimulationPanel from './components/SimulationPanel.jsx';
import NetworkCanvas from './components/NetworkCanvas.jsx';
import DeviceConfigModal from './components/DeviceConfigModal.jsx';
import PacketInspectorModal from './components/PacketInspectorModal.jsx';
import PacketLauncherModal from './components/PacketLauncherModal.jsx';
import LabsAndDiagnosticsModal from './components/LabsAndDiagnosticsModal.jsx';
import SaveLoadModal from './components/SaveLoadModal.jsx';
import { useNetworkStore } from './store/useNetworkStore.js';

export default function App() {
  const [zoomControls, setZoomControls] = useState(null);
  const activeModal = useNetworkStore((s) => s.activeModal);

  return (
    <div className="nr-app-shell">
      <TopBar />

      <main className="nr-workspace">
        <NetworkCanvas onRegisterZoom={setZoomControls} />
        <LeftToolbar zoomControls={zoomControls} />
        <BottomDock />
        <SimulationPanel />
      </main>

      {/* Modals & Drawers */}
      {activeModal === 'config' && <DeviceConfigModal />}
      {activeModal === 'inspector' && <PacketInspectorModal />}
      {activeModal === 'packetLauncher' && <PacketLauncherModal />}
      {activeModal === 'labs' && <LabsAndDiagnosticsModal />}
      {activeModal === 'saveLoad' && <SaveLoadModal />}
    </div>
  );
}
