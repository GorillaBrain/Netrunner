import React, { useMemo, useState } from 'react';
import {
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Eye,
  PanelRightClose,
  PanelRightOpen,
  Layers,
  AlertOctagon,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { useNetworkStore } from '../store/useNetworkStore.js';

const ALL_PROTOCOLS = ['ARP', 'ICMP', 'DNS', 'HTTP', 'DHCP'];

export default function SimulationPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [filterTab, setFilterTab] = useState('ipv4');

  const events = useNetworkStore((s) => s.events);
  const currentStepIndex = useNetworkStore((s) => s.currentStepIndex);
  const isPlaying = useNetworkStore((s) => s.isPlaying);
  const setIsPlaying = useNetworkStore((s) => s.setIsPlaying);
  const stepForward = useNetworkStore((s) => s.stepForward);
  const stepBackward = useNetworkStore((s) => s.stepBackward);
  const setStepIndex = useNetworkStore((s) => s.setStepIndex);
  const resetSimulation = useNetworkStore((s) => s.resetSimulation);
  const simSummary = useNetworkStore((s) => s.simSummary);
  const protocolFilters = useNetworkStore((s) => s.protocolFilters);
  const toggleProtocolFilter = useNetworkStore((s) => s.toggleProtocolFilter);
  const setActiveModal = useNetworkStore((s) => s.setActiveModal);
  const launchSimulation = useNetworkStore((s) => s.launchSimulation);

  const filteredEvents = useMemo(
    () =>
      events.filter((evt) => {
        const p = (evt.protocol || 'ICMP').toUpperCase();
        return protocolFilters[p] !== false;
      }),
    [events, protocolFilters]
  );

  const activeEvent =
    currentStepIndex >= 0 && currentStepIndex < events.length
      ? events[currentStepIndex]
      : null;

  if (collapsed) {
    return (
      <button
        type="button"
        className="nr-sim-collapsed-btn"
        onClick={() => setCollapsed(false)}
        title="Expand Simulation Panel"
      >
        <PanelRightOpen size={18} />
        <span>Simulation</span>
      </button>
    );
  }

  return (
    <aside className="nr-sim-panel" aria-label="Simulation Panel">
      {/* Header */}
      <div className="nr-sim-header">
        <h2>Simulation Panel</h2>
        <button
          type="button"
          className="nr-icon-btn"
          onClick={() => setCollapsed(true)}
          title="Collapse Panel"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {/* Play Controls */}
      <div className="nr-sim-controls-section">
        <div className="nr-sim-subhead">Play Controls</div>
        <div className="nr-sim-play-row">
          <button
            type="button"
            className="nr-play-ctrl-btn"
            onClick={stepBackward}
            disabled={events.length === 0 || currentStepIndex <= 0}
            title="Step Backward"
            aria-label="Step Backward"
          >
            <SkipBack size={16} />
          </button>

          <button
            type="button"
            className="nr-play-ctrl-btn nr-play-main-btn"
            onClick={() => {
              if (events.length === 0) {
                launchSimulation();
              } else {
                setIsPlaying(!isPlaying);
              }
            }}
            title={isPlaying ? 'Pause Simulation' : 'Play Simulation'}
            aria-label={isPlaying ? 'Pause Simulation' : 'Play Simulation'}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>

          <button
            type="button"
            className="nr-play-ctrl-btn"
            onClick={stepForward}
            disabled={
              events.length === 0 || currentStepIndex >= events.length - 1
            }
            title="Step Forward"
            aria-label="Step Forward"
          >
            <SkipForward size={16} />
          </button>
        </div>
      </div>

      {/* Simulation Outcome Status Banner */}
      {simSummary && (
        <div
          className={`nr-sim-summary-banner ${
            simSummary.success ? 'is-success' : 'is-failure'
          }`}
        >
          <div className="nr-sim-summary-top">
            {simSummary.success ? (
              <CheckCircle2 size={14} />
            ) : (
              <AlertOctagon size={14} />
            )}
            <span className="nr-sim-summary-title">
              {simSummary.statusText}
            </span>
          </div>
          {!simSummary.success && simSummary.failureDiagnosis && (
            <div className="nr-sim-summary-diag">
              {simSummary.failureDiagnosis}
            </div>
          )}
        </div>
      )}

      {/* Event List Header */}
      <div className="nr-sim-eventlist-head">
        <span>Event List</span>
        <button
          type="button"
          className="nr-link-btn"
          onClick={resetSimulation}
        >
          Reset Simulation
        </button>
      </div>

      {/* Event List Table */}
      <div className="nr-sim-table-box" role="region" aria-label="Packet Event Timeline">
        <div className="nr-sim-table-header">
          <span className="col-vis">Vis.</span>
          <span className="col-time">Time ( Sec)</span>
          <span className="col-dev">Last Device</span>
          <span className="col-dev">At Device</span>
          <span className="col-type">Type</span>
        </div>

        <div className="nr-sim-table-body">
          {filteredEvents.length === 0 ? (
            <div className="nr-sim-empty">
              <p>No packet events recorded yet.</p>
              <button
                type="button"
                className="nr-top-action-btn nr-btn-primary"
                onClick={() => launchSimulation()}
              >
                <Send size={13} />
                <span>Run Sample Ping</span>
              </button>
            </div>
          ) : (
            filteredEvents.map((evt) => {
              const isCurrent = evt.stepIndex === currentStepIndex;
              const dotClass =
                evt.status === 'dropped'
                  ? 'dot-red'
                  : evt.status === 'delivered'
                  ? 'dot-amber'
                  : 'dot-green';

              return (
                <div
                  key={evt.id}
                  className={`nr-sim-row ${isCurrent ? 'is-current' : ''} ${
                    evt.status === 'dropped' ? 'is-dropped-row' : ''
                  }`}
                  onClick={() => setStepIndex(evt.stepIndex, false)}
                  onDoubleClick={() => setStepIndex(evt.stepIndex, true)}
                  title="Click to jump to step; double-click or click Inspect PDU for full OSI Layer details"
                >
                  <span className="col-vis">
                    <Eye size={13} className="nr-vis-icon" />
                  </span>
                  <span className="col-time">{evt.timeSec}</span>
                  <span className="col-dev" title={evt.lastDeviceName}>
                    {evt.lastDeviceName}
                  </span>
                  <span className="col-dev" title={evt.atDeviceName}>
                    {evt.atDeviceName}
                  </span>
                  <span className="col-type">
                    <span className="nr-proto-text">{evt.protocol}</span>
                    <span className={`nr-status-dot ${dotClass}`} />
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Selected Step Quick Decision + Inspect PDU Button */}
      {activeEvent && (
        <div className="nr-sim-quick-pdu">
          <div className="nr-sim-quick-pdu-top">
            <span className="nr-sim-step-tag">
              Step {activeEvent.stepIndex + 1}/{events.length}:{' '}
              <strong>{activeEvent.subType}</strong>
            </span>
            <button
              type="button"
              className="nr-inspect-pdu-btn"
              onClick={() => setActiveModal('inspector')}
            >
              <Layers size={12} />
              <span>Inspect OSI Layers</span>
            </button>
          </div>
          <p className="nr-sim-quick-decision">
            {activeEvent.decisions?.[activeEvent.decisions.length - 1] ||
              'Click "Inspect OSI Layers" to view full L1–L7 frame encapsulation.'}
          </p>
        </div>
      )}

      {/* Event List Filter */}
      <div className="nr-sim-filter-section">
        <div className="nr-sim-eventlist-head">
          <span>Event List Filter</span>
          <button
            type="button"
            className="nr-link-btn"
            onClick={() => setActiveModal('packetLauncher')}
          >
            New Packet
          </button>
        </div>

        <div className="nr-sim-filter-tabs">
          <button
            type="button"
            className={`nr-filter-tab ${filterTab === 'ipv4' ? 'is-active' : ''}`}
            onClick={() => setFilterTab('ipv4')}
          >
            Ipv4
          </button>
          <button
            type="button"
            className={`nr-filter-tab ${filterTab === 'ipv6' ? 'is-active' : ''}`}
            onClick={() => setFilterTab('ipv6')}
          >
            Ipv6
          </button>
          <button
            type="button"
            className={`nr-filter-tab ${filterTab === 'misc' ? 'is-active' : ''}`}
            onClick={() => setFilterTab('misc')}
          >
            Misc
          </button>
        </div>

        <div className="nr-sim-checkbox-grid">
          {ALL_PROTOCOLS.map((proto) => (
            <label key={proto} className="nr-checkbox-item">
              <input
                type="checkbox"
                checked={protocolFilters[proto] !== false}
                onChange={() => toggleProtocolFilter(proto)}
              />
              <span>{proto}</span>
            </label>
          ))}
          <label className="nr-checkbox-item is-static">
            <input type="checkbox" checked readOnly />
            <span>TCP</span>
          </label>
          <label className="nr-checkbox-item is-static">
            <input type="checkbox" checked readOnly />
            <span>UDP</span>
          </label>
          <label className="nr-checkbox-item is-static">
            <input type="checkbox" checked readOnly />
            <span>LPM</span>
          </label>
          <label className="nr-checkbox-item is-static">
            <input type="checkbox" checked readOnly />
            <span>ACL</span>
          </label>
        </div>
      </div>
    </aside>
  );
}
