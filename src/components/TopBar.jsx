import React, { useMemo } from 'react';
import {
  Activity,
  ChevronDown,
  Send,
  ShieldAlert,
  CheckCircle2,
  BookOpen,
  FolderOpen,
  Sliders,
} from 'lucide-react';
import { useNetworkStore } from '../store/useNetworkStore.js';
import { LABS_LIST } from '../labs/labsData.js';
import { analyzeTopologyDiagnostics } from '../engine/networkDiagnostics.js';

export default function TopBar() {
  const activeLabId = useNetworkStore((s) => s.activeLabId);
  const loadLab = useNetworkStore((s) => s.loadLab);
  const devices = useNetworkStore((s) => s.devices);
  const links = useNetworkStore((s) => s.links);
  const simHistory = useNetworkStore((s) => s.simHistory);
  const setActiveModal = useNetworkStore((s) => s.setActiveModal);

  const currentLab = useMemo(
    () => LABS_LIST.find((l) => l.id === activeLabId) || LABS_LIST[0],
    [activeLabId]
  );

  const objectives = useMemo(() => {
    if (!currentLab || !currentLab.checkObjectives) return [];
    return currentLab.checkObjectives(devices, links, simHistory);
  }, [currentLab, devices, links, simHistory]);

  const completedCount = objectives.filter((o) => o.completed).length;

  const diagnostics = useMemo(
    () => analyzeTopologyDiagnostics(devices, links),
    [devices, links]
  );
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;

  return (
    <header className="nr-topbar">
      {/* Left: Brand + Logical View Selector */}
      <div className="nr-topbar-left">
        <div className="nr-brand">
          <div className="nr-brand-bars" aria-hidden="true">
            <span className="b1" />
            <span className="b2" />
            <span className="b3" />
            <span className="b4" />
            <span className="b5" />
            <span className="b2" />
          </div>
          <span className="nr-brand-title">NetRunner</span>
        </div>

        <button
          type="button"
          className="nr-logical-pill"
          onClick={() => setActiveModal('config')}
          title="Inspect & Configure Selected Device"
        >
          <Sliders size={13} />
          <span>Logical</span>
          <ChevronDown size={13} />
        </button>
      </div>

      {/* Center: Lab / Class Selector + Objectives Pill */}
      <div className="nr-topbar-center">
        <div className="nr-lab-select-wrap">
          <select
            aria-label="Select Networking Lab"
            className="nr-lab-select"
            value={activeLabId}
            onChange={(e) => loadLab(e.target.value)}
          >
            {LABS_LIST.map((lab) => (
              <option key={lab.id} value={lab.id}>
                NetRunner / {lab.title}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="nr-lab-select-icon" />
        </div>

        <button
          type="button"
          className={`nr-objectives-pill ${
            completedCount === objectives.length && objectives.length > 0
              ? 'is-complete'
              : ''
          }`}
          onClick={() => setActiveModal('labs')}
          title="Open Lab Instructions & Challenge Objectives"
        >
          <BookOpen size={13} />
          <span>
            Lab Guide ({completedCount}/{objectives.length})
          </span>
        </button>
      </div>

      {/* Right: Packet Launcher, Diagnostics, Save/Export */}
      <div className="nr-topbar-right">
        <button
          type="button"
          className="nr-top-action-btn nr-btn-primary"
          onClick={() => setActiveModal('packetLauncher')}
        >
          <Send size={14} />
          <span>Send Packet</span>
        </button>

        <button
          type="button"
          className={`nr-top-action-btn ${
            errorCount > 0 ? 'nr-diag-error' : 'nr-diag-ok'
          }`}
          onClick={() => setActiveModal('labs')}
          title="View Live Network Diagnostics & Troubleshooting"
        >
          {errorCount > 0 ? (
            <>
              <ShieldAlert size={14} />
              <span>{errorCount} Issue{errorCount > 1 ? 's' : ''}</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={14} />
              <span>Healthy</span>
            </>
          )}
        </button>

        <button
          type="button"
          className="nr-top-action-btn"
          onClick={() => setActiveModal('saveLoad')}
          title="Save, Load, or Export Topology JSON"
        >
          <FolderOpen size={14} />
          <span className="hide-sm">Topologies</span>
        </button>
      </div>
    </header>
  );
}
