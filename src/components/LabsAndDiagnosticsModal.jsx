import React, { useMemo, useState } from 'react';
import {
  X,
  BookOpen,
  CheckCircle2,
  Circle,
  ShieldAlert,
  AlertTriangle,
  Play,
  Wrench,
} from 'lucide-react';
import { useNetworkStore } from '../store/useNetworkStore.js';
import { LABS_LIST } from '../labs/labsData.js';
import { analyzeTopologyDiagnostics } from '../engine/networkDiagnostics.js';

export default function LabsAndDiagnosticsModal() {
  const [activeTab, setActiveTab] = useState('lab');

  const activeLabId = useNetworkStore((s) => s.activeLabId);
  const loadLab = useNetworkStore((s) => s.loadLab);
  const devices = useNetworkStore((s) => s.devices);
  const links = useNetworkStore((s) => s.links);
  const simHistory = useNetworkStore((s) => s.simHistory);
  const selectDevice = useNetworkStore((s) => s.selectDevice);
  const setActiveModal = useNetworkStore((s) => s.setActiveModal);

  const currentLab = useMemo(
    () => LABS_LIST.find((l) => l.id === activeLabId) || LABS_LIST[0],
    [activeLabId]
  );

  const objectives = useMemo(() => {
    if (!currentLab || !currentLab.checkObjectives) return [];
    return currentLab.checkObjectives(devices, links, simHistory);
  }, [currentLab, devices, links, simHistory]);

  const diagnostics = useMemo(
    () => analyzeTopologyDiagnostics(devices, links),
    [devices, links]
  );

  return (
    <div className="nr-modal-backdrop" onClick={() => setActiveModal(null)}>
      <div
        className="nr-modal-card nr-modal-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Interactive Networking Labs and Diagnostics"
      >
        <div className="nr-modal-header">
          <div className="nr-modal-title-group">
            <BookOpen size={18} className="nr-accent-icon" />
            <div>
              <h3>Networking Labs, Challenges & Topology Diagnostics</h3>
              <p>
                Complete hands-on networking missions or inspect automated
                configuration diagnostics.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="nr-icon-btn"
            onClick={() => setActiveModal(null)}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="nr-modal-tabs">
          <button
            type="button"
            className={`nr-tab-btn ${activeTab === 'lab' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('lab')}
          >
            <BookOpen size={14} />
            <span>Current Lab & All Challenges ({LABS_LIST.length})</span>
          </button>

          <button
            type="button"
            className={`nr-tab-btn ${activeTab === 'diag' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('diag')}
          >
            <ShieldAlert size={14} />
            <span>Topology Diagnostics ({diagnostics.length})</span>
          </button>
        </div>

        <div className="nr-modal-body">
          {activeTab === 'lab' && (
            <div className="nr-config-grid">
              {/* Left: All 6 Labs Catalog */}
              <div className="nr-config-col">
                <div className="nr-form-card">
                  <h4>Select a Networking Lab</h4>
                  <div className="nr-labs-catalog">
                    {LABS_LIST.map((lab) => {
                      const isCurrent = lab.id === activeLabId;
                      return (
                        <div
                          key={lab.id}
                          className={`nr-lab-card-item ${
                            isCurrent ? 'is-selected' : ''
                          }`}
                          onClick={() => loadLab(lab.id)}
                        >
                          <div className="nr-lab-card-top">
                            <strong>{lab.title}</strong>
                            <span className="nr-badge badge-blue">
                              {lab.difficulty}
                            </span>
                          </div>
                          <p>{lab.summary}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right: Active Lab Briefing & Live Objective Verification */}
              <div className="nr-config-col">
                <div className="nr-form-card">
                  <div className="nr-card-head-between">
                    <h4>{currentLab.title}</h4>
                    <span className="nr-badge badge-purple">
                      {currentLab.category}
                    </span>
                  </div>
                  <p className="nr-lab-summary-text">{currentLab.summary}</p>

                  <h5 className="nr-sub-heading">Step-by-Step Instructions</h5>
                  <ol className="nr-lab-steps">
                    {currentLab.instructions.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>

                  <h5 className="nr-sub-heading">
                    Live Lab Objectives (Auto-Verified)
                  </h5>
                  <div className="nr-objectives-list">
                    {objectives.map((obj) => (
                      <div
                        key={obj.id}
                        className={`nr-objective-row ${
                          obj.completed ? 'is-done' : ''
                        }`}
                      >
                        {obj.completed ? (
                          <CheckCircle2 size={16} className="text-green" />
                        ) : (
                          <Circle size={16} className="text-muted" />
                        )}
                        <span>{obj.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'diag' && (
            <div className="nr-form-card">
              <h4>Automated Network Configuration & Subnet Analyzer</h4>
              {diagnostics.length === 0 ? (
                <div className="nr-diag-healthy-box">
                  <CheckCircle2 size={22} className="text-green" />
                  <div>
                    <strong>All Interfaces, Subnets & Links Look Healthy!</strong>
                    <p>
                      No duplicate IPv4 addresses, invalid subnet masks,
                      disconnected ports, or unreachable gateways were detected.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="nr-diag-list">
                  {diagnostics.map((issue) => (
                    <div
                      key={issue.id}
                      className={`nr-diag-item ${
                        issue.severity === 'error' ? 'is-error' : 'is-warning'
                      }`}
                    >
                      <div className="nr-diag-item-left">
                        <AlertTriangle size={18} />
                        <div>
                          <div className="nr-diag-item-title">
                            <strong>{issue.title}</strong>
                            <span className="nr-mono-sm">{issue.code}</span>
                          </div>
                          <p>{issue.detail}</p>
                          <div className="nr-diag-fix">
                            <strong>How to Fix:</strong> {issue.remediation}
                          </div>
                        </div>
                      </div>
                      {issue.deviceId && (
                        <button
                          type="button"
                          className="nr-btn-secondary"
                          onClick={() => selectDevice(issue.deviceId, true)}
                        >
                          <Wrench size={13} />
                          <span>Fix Device</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="nr-modal-footer">
          <button
            type="button"
            className="nr-btn-secondary"
            onClick={() => loadLab(currentLab.id)}
          >
            <Play size={13} />
            <span>Reset Current Lab Topology</span>
          </button>
          <button
            type="button"
            className="nr-top-action-btn nr-btn-primary"
            onClick={() => setActiveModal(null)}
          >
            <span>Return to Workspace</span>
          </button>
        </div>
      </div>
    </div>
  );
}
