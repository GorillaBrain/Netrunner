import React from 'react';
import { X, Send, Terminal, Zap } from 'lucide-react';
import { useNetworkStore } from '../store/useNetworkStore.js';
import { DEVICE_TYPES } from '../engine/deviceModels.js';

export default function PacketLauncherModal() {
  const devices = useNetworkStore((s) => s.devices);
  const packetRequest = useNetworkStore((s) => s.packetRequest);
  const setPacketRequest = useNetworkStore((s) => s.setPacketRequest);
  const launchSimulation = useNetworkStore((s) => s.launchSimulation);
  const setActiveModal = useNetworkStore((s) => s.setActiveModal);

  const l3Devices = devices.filter(
    (d) => d.type !== DEVICE_TYPES.SWITCH && d.type !== DEVICE_TYPES.HUB
  );

  const handleTargetDeviceSelect = (targetId) => {
    const dev = devices.find((d) => d.id === targetId);
    const ip =
      dev?.interfaces?.find((i) => i.adminUp && i.ip)?.ip ||
      dev?.interfaces?.[0]?.ip ||
      '';
    setPacketRequest({
      targetDeviceId: targetId,
      targetIpInput: ip,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    launchSimulation();
    setActiveModal(null);
  };

  return (
    <div className="nr-modal-backdrop" onClick={() => setActiveModal(null)}>
      <div
        className="nr-modal-card nr-modal-md"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Send Network Packet"
      >
        <div className="nr-modal-header">
          <div className="nr-modal-title-group">
            <Terminal size={18} className="nr-accent-icon" />
            <div>
              <h3>Packet Generator & Protocol Simulator</h3>
              <p>
                Originate real ARP, ICMP Ping, Traceroute, DNS, HTTP, or DHCP
                traffic across your virtual network.
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

        <form className="nr-modal-body" onSubmit={handleSubmit}>
          <div className="nr-form-card">
            <div className="nr-field-row">
              <label>Protocol / Simulation Type</label>
              <div className="nr-proto-pills">
                {[
                  { id: 'ICMP', label: 'ICMP Ping (Echo)' },
                  { id: 'TRACEROUTE', label: 'Traceroute (TTL Probe)' },
                  { id: 'HTTP', label: 'HTTP GET (Port 80)' },
                  { id: 'DNS', label: 'DNS Query (Port 53)' },
                  { id: 'DHCP', label: 'DHCP Lease Request' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`nr-proto-pill-btn ${
                      packetRequest.protocol === p.id ? 'is-active' : ''
                    }`}
                    onClick={() => setPacketRequest({ protocol: p.id })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="nr-field-grid-2">
              <div className="nr-field-row">
                <label>Source Device (Sender)</label>
                <select
                  className="nr-input"
                  value={packetRequest.sourceDeviceId}
                  onChange={(e) =>
                    setPacketRequest({ sourceDeviceId: e.target.value })
                  }
                >
                  {l3Devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.interfaces?.[0]?.ip || 'unassigned'})
                    </option>
                  ))}
                </select>
              </div>

              {packetRequest.protocol !== 'DHCP' && (
                <div className="nr-field-row">
                  <label>Quick-Pick Target Device</label>
                  <select
                    className="nr-input"
                    value={packetRequest.targetDeviceId || ''}
                    onChange={(e) => handleTargetDeviceSelect(e.target.value)}
                  >
                    <option value="">-- Custom IP / Hostname --</option>
                    {l3Devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.interfaces?.[0]?.ip || 'unassigned'})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {packetRequest.protocol !== 'DHCP' && (
              <div className="nr-field-grid-2">
                <div className="nr-field-row">
                  <label>
                    Destination IPv4 or Domain Name (e.g. 192.168.21.3 or
                    netrunner.lab)
                  </label>
                  <input
                    type="text"
                    className="nr-input nr-mono"
                    placeholder="192.168.21.3 or netrunner.lab"
                    value={packetRequest.targetIpInput}
                    onChange={(e) =>
                      setPacketRequest({ targetIpInput: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="nr-field-row">
                  <label>Initial IPv4 Time-To-Live (TTL)</label>
                  <input
                    type="number"
                    min={1}
                    max={255}
                    className="nr-input nr-mono"
                    value={packetRequest.initialTtl}
                    onChange={(e) =>
                      setPacketRequest({
                        initialTtl: Number(e.target.value) || 64,
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <div className="nr-modal-footer">
            <button
              type="button"
              className="nr-btn-secondary"
              onClick={() => setActiveModal(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="nr-top-action-btn nr-btn-primary"
            >
              <Zap size={14} />
              <span>Launch Packet Simulation</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
