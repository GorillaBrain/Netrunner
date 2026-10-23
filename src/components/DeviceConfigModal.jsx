import React, { useState, useMemo } from 'react';
import {
  X,
  Sliders,
  Route,
  Table2,
  Shield,
  Server,
  Trash2,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Send,
} from 'lucide-react';
import { useNetworkStore } from '../store/useNetworkStore.js';
import { DEVICE_TYPES } from '../engine/deviceModels.js';
import {
  getSubnetDetails,
  isValidIpv4,
  longestPrefixMatch,
} from '../engine/ipUtils.js';
import { findConnectedLink } from '../engine/packetEngine.js';

const COMMON_CIDRS = [8, 16, 24, 25, 26, 27, 28, 29, 30];

export default function DeviceConfigModal() {
  const devices = useNetworkStore((s) => s.devices);
  const links = useNetworkStore((s) => s.links);
  const selectedDeviceId = useNetworkStore((s) => s.selectedDeviceId);
  const selectDevice = useNetworkStore((s) => s.selectDevice);
  const setActiveModal = useNetworkStore((s) => s.setActiveModal);
  const updateDeviceBasicInfo = useNetworkStore((s) => s.updateDeviceBasicInfo);
  const updateInterfaceConfig = useNetworkStore((s) => s.updateInterfaceConfig);
  const addStaticRoute = useNetworkStore((s) => s.addStaticRoute);
  const removeStaticRoute = useNetworkStore((s) => s.removeStaticRoute);
  const addFirewallRule = useNetworkStore((s) => s.addFirewallRule);
  const removeFirewallRule = useNetworkStore((s) => s.removeFirewallRule);
  const updateServerServices = useNetworkStore((s) => s.updateServerServices);
  const clearDeviceTables = useNetworkStore((s) => s.clearDeviceTables);
  const deleteDevice = useNetworkStore((s) => s.deleteDevice);
  const launchSimulation = useNetworkStore((s) => s.launchSimulation);

  const device = useMemo(
    () =>
      devices.find((d) => d.id === selectedDeviceId) || devices[0] || null,
    [devices, selectedDeviceId]
  );

  const [activeTab, setActiveTab] = useState('interfaces');
  const [selectedIfaceId, setSelectedIfaceId] = useState(null);

  // Static Route Form State
  const [routeForm, setRouteForm] = useState({
    network: '192.168.200.0',
    cidr: 24,
    nextHop: '172.16.0.2',
    interfaceId: 'eth1',
  });
  const [lpmTestIp, setLpmTestIp] = useState('8.8.8.8');

  // Firewall Rule Form State
  const [aclForm, setAclForm] = useState({
    name: 'Block ICMP Ping',
    action: 'DENY',
    protocol: 'ICMP',
    srcNetwork: 'any',
    dstNetwork: 'any',
    dstPort: 'any',
  });

  // DNS Record Form State
  const [dnsForm, setDnsForm] = useState({
    hostname: 'app.netrunner.lab',
    ip: '192.168.21.100',
  });

  if (!device) return null;

  const isL2SwitchOrHub =
    device.type === DEVICE_TYPES.SWITCH || device.type === DEVICE_TYPES.HUB;
  const isRouterLike = [
    DEVICE_TYPES.ROUTER,
    DEVICE_TYPES.FIREWALL,
    DEVICE_TYPES.CLOUD,
  ].includes(device.type);
  const isEndHost = [
    DEVICE_TYPES.PC,
    DEVICE_TYPES.LAPTOP,
    DEVICE_TYPES.SMARTPHONE,
    DEVICE_TYPES.SERVER,
  ].includes(device.type);

  const activeIface =
    device.interfaces.find((i) => i.id === selectedIfaceId) ||
    device.interfaces[0];

  const subnetCalc =
    activeIface && isValidIpv4(activeIface.ip)
      ? getSubnetDetails(activeIface.ip, activeIface.cidr)
      : null;

  const lpmResult =
    isRouterLike && isValidIpv4(lpmTestIp)
      ? longestPrefixMatch(lpmTestIp, device.routingTable || [])
      : null;

  const handleAddRoute = (e) => {
    e.preventDefault();
    if (!isValidIpv4(routeForm.network) || !isValidIpv4(routeForm.nextHop)) {
      return;
    }
    addStaticRoute(device.id, routeForm);
  };

  const handleAddAcl = (e) => {
    e.preventDefault();
    addFirewallRule(device.id, aclForm);
  };

  const handleAddDnsRecord = (e) => {
    e.preventDefault();
    if (!dnsForm.hostname || !isValidIpv4(dnsForm.ip)) return;
    const prevDns = device.services?.dns || { enabled: true, records: [] };
    updateServerServices(device.id, {
      dns: {
        ...prevDns,
        records: [
          ...(prevDns.records || []),
          { hostname: dnsForm.hostname.trim(), ip: dnsForm.ip.trim(), type: 'A' },
        ],
      },
    });
    setDnsForm({ hostname: '', ip: '' });
  };

  return (
    <div className="nr-modal-backdrop" onClick={() => setActiveModal(null)}>
      <div
        className="nr-modal-card nr-modal-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Configure ${device.name}`}
      >
        {/* Modal Header */}
        <div className="nr-modal-header">
          <div className="nr-modal-title-group">
            <Sliders size={18} className="nr-accent-icon" />
            <div>
              <h3>Device Configuration & Protocol Tables</h3>
              <p>
                Inspect and configure interfaces, subnet masks, routing tables,
                ARP/MAC caches, and ACLs.
              </p>
            </div>
          </div>

          <div className="nr-modal-header-actions">
            <select
              className="nr-input nr-device-switcher"
              value={device.id}
              onChange={(e) => {
                selectDevice(e.target.value, true);
                setSelectedIfaceId(null);
              }}
              aria-label="Switch Device"
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.type.toUpperCase()})
                </option>
              ))}
            </select>

            <button
              type="button"
              className="nr-icon-btn"
              onClick={() => setActiveModal(null)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="nr-modal-tabs">
          <button
            type="button"
            className={`nr-tab-btn ${
              activeTab === 'interfaces' ? 'is-active' : ''
            }`}
            onClick={() => setActiveTab('interfaces')}
          >
            <Sliders size={14} />
            <span>Interfaces & IPv4</span>
          </button>

          {isRouterLike && (
            <button
              type="button"
              className={`nr-tab-btn ${
                activeTab === 'routing' ? 'is-active' : ''
              }`}
              onClick={() => setActiveTab('routing')}
            >
              <Route size={14} />
              <span>Routing Table ({device.routingTable?.length || 0})</span>
            </button>
          )}

          <button
            type="button"
            className={`nr-tab-btn ${
              activeTab === 'tables' ? 'is-active' : ''
            }`}
            onClick={() => setActiveTab('tables')}
          >
            <Table2 size={14} />
            <span>
              {isL2SwitchOrHub
                ? `MAC CAM Table (${device.macTable?.length || 0})`
                : `ARP Cache (${device.arpTable?.length || 0})`}
            </span>
          </button>

          {!isL2SwitchOrHub && (
            <button
              type="button"
              className={`nr-tab-btn ${
                activeTab === 'firewall' ? 'is-active' : ''
              }`}
              onClick={() => setActiveTab('firewall')}
            >
              <Shield size={14} />
              <span>Firewall ACLs ({device.firewallRules?.length || 0})</span>
            </button>
          )}

          {device.type === DEVICE_TYPES.SERVER && (
            <button
              type="button"
              className={`nr-tab-btn ${
                activeTab === 'services' ? 'is-active' : ''
              }`}
              onClick={() => setActiveTab('services')}
            >
              <Server size={14} />
              <span>Server Daemons (HTTP / DNS / DHCP)</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="nr-modal-body">
          {/* TAB 1: INTERFACES & IP CONFIGURATION */}
          {activeTab === 'interfaces' && (
            <div className="nr-config-grid">
              {/* Left Column: Device Identity + Port Selector */}
              <div className="nr-config-col">
                <div className="nr-form-card">
                  <h4>Device Identity & Host Settings</h4>
                  <div className="nr-field-row">
                    <label>Hostname</label>
                    <input
                      type="text"
                      className="nr-input"
                      value={device.name}
                      onChange={(e) =>
                        updateDeviceBasicInfo(device.id, {
                          name: e.target.value,
                        })
                      }
                    />
                  </div>

                  {isEndHost && (
                    <>
                      <div className="nr-field-row">
                        <label>Default Gateway (Router IP)</label>
                        <input
                          type="text"
                          className="nr-input nr-mono"
                          placeholder="e.g. 192.168.21.1"
                          value={device.defaultGateway || ''}
                          onChange={(e) =>
                            updateDeviceBasicInfo(device.id, {
                              defaultGateway: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="nr-field-row">
                        <label>DNS Server IP</label>
                        <input
                          type="text"
                          className="nr-input nr-mono"
                          placeholder="e.g. 8.8.8.8 or 10.0.2.100"
                          value={device.dnsServer || ''}
                          onChange={(e) =>
                            updateDeviceBasicInfo(device.id, {
                              dnsServer: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="nr-dhcp-bar">
                        <span>Dynamic Host Configuration (DHCP)</span>
                        <button
                          type="button"
                          className="nr-btn-secondary"
                          onClick={() => {
                            launchSimulation({
                              sourceDeviceId: device.id,
                              protocol: 'DHCP',
                            });
                            setActiveModal(null);
                          }}
                        >
                          <Send size={12} />
                          <span>Request DHCP Lease</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Interface Port List */}
                <div className="nr-form-card">
                  <h4>Network Interfaces ({device.interfaces.length})</h4>
                  <div className="nr-port-list">
                    {device.interfaces.map((iface) => {
                      const conn = findConnectedLink(links, device.id, iface.id);
                      const isSel = activeIface?.id === iface.id;
                      return (
                        <button
                          key={iface.id}
                          type="button"
                          className={`nr-port-item ${
                            isSel ? 'is-selected' : ''
                          }`}
                          onClick={() => setSelectedIfaceId(iface.id)}
                        >
                          <div className="nr-port-item-left">
                            <span
                              className={`nr-status-dot ${
                                !iface.adminUp
                                  ? 'dot-red'
                                  : conn
                                  ? 'dot-green'
                                  : 'dot-muted'
                              }`}
                            />
                            <div>
                              <div className="nr-port-name">{iface.name}</div>
                              <div className="nr-port-mac">{iface.mac}</div>
                            </div>
                          </div>
                          <div className="nr-port-item-right">
                            {isL2SwitchOrHub ? (
                              <span className="nr-badge">
                                VLAN {iface.vlan || 1} ({iface.vlanMode || 'access'})
                              </span>
                            ) : (
                              <span className="nr-mono-sm">
                                {iface.ip
                                  ? `${iface.ip}/${iface.cidr}`
                                  : 'Unassigned'}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Selected Interface Editor + Live Subnet Calculator */}
              <div className="nr-config-col">
                {activeIface && (
                  <div className="nr-form-card">
                    <div className="nr-card-head-between">
                      <h4>Configure {activeIface.name}</h4>
                      <label className="nr-toggle-switch">
                        <input
                          type="checkbox"
                          checked={Boolean(activeIface.adminUp)}
                          onChange={(e) =>
                            updateInterfaceConfig(device.id, activeIface.id, {
                              adminUp: e.target.checked,
                            })
                          }
                        />
                        <span
                          className={`nr-status-pill ${
                            activeIface.adminUp ? 'is-up' : 'is-down'
                          }`}
                        >
                          {activeIface.adminUp ? 'PORT UP' : 'PORT SHUTDOWN'}
                        </span>
                      </label>
                    </div>

                    <div className="nr-field-row">
                      <label>Hardware MAC Address (L2)</label>
                      <input
                        type="text"
                        className="nr-input nr-mono"
                        value={activeIface.mac}
                        onChange={(e) =>
                          updateInterfaceConfig(device.id, activeIface.id, {
                            mac: e.target.value,
                          })
                        }
                      />
                    </div>

                    {isL2SwitchOrHub ? (
                      <>
                        <div className="nr-field-row">
                          <label>Switchport Mode</label>
                          <select
                            className="nr-input"
                            value={activeIface.vlanMode || 'access'}
                            onChange={(e) =>
                              updateInterfaceConfig(device.id, activeIface.id, {
                                vlanMode: e.target.value,
                              })
                            }
                          >
                            <option value="access">Access (Single VLAN)</option>
                            <option value="trunk">802.1Q Trunk (Multi-VLAN)</option>
                          </select>
                        </div>

                        <div className="nr-field-row">
                          <label>VLAN ID (1–4094)</label>
                          <input
                            type="number"
                            min={1}
                            max={4094}
                            className="nr-input nr-mono"
                            value={activeIface.vlan || 1}
                            onChange={(e) =>
                              updateInterfaceConfig(device.id, activeIface.id, {
                                vlan: Number(e.target.value) || 1,
                              })
                            }
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="nr-field-row">
                          <label>IPv4 Address</label>
                          <input
                            type="text"
                            className="nr-input nr-mono"
                            placeholder="e.g. 192.168.21.2"
                            value={activeIface.ip}
                            onChange={(e) =>
                              updateInterfaceConfig(device.id, activeIface.id, {
                                ip: e.target.value,
                              })
                            }
                          />
                        </div>

                        <div className="nr-field-grid-2">
                          <div className="nr-field-row">
                            <label>CIDR Prefix</label>
                            <select
                              className="nr-input nr-mono"
                              value={activeIface.cidr}
                              onChange={(e) =>
                                updateInterfaceConfig(
                                  device.id,
                                  activeIface.id,
                                  { cidr: Number(e.target.value) }
                                )
                              }
                            >
                              {COMMON_CIDRS.map((c) => (
                                <option key={c} value={c}>
                                  /{c}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="nr-field-row">
                            <label>Subnet Mask</label>
                            <input
                              type="text"
                              className="nr-input nr-mono"
                              value={activeIface.subnetMask}
                              onChange={(e) =>
                                updateInterfaceConfig(
                                  device.id,
                                  activeIface.id,
                                  { subnetMask: e.target.value }
                                )
                              }
                            />
                          </div>
                        </div>

                        {/* Real-Time Subnet Calculator Breakdown */}
                        {subnetCalc ? (
                          <div className="nr-subnet-calc-box">
                            <div className="nr-subnet-calc-title">
                              {subnetCalc.isValidHostIp ? (
                                <CheckCircle2
                                  size={14}
                                  className="text-green"
                                />
                              ) : (
                                <AlertTriangle
                                  size={14}
                                  className="text-amber"
                                />
                              )}
                              <span>
                                Live Subnet Analysis ({subnetCalc.networkAddress}
                                /{subnetCalc.cidr})
                              </span>
                            </div>

                            <div className="nr-subnet-kv-grid">
                              <div>
                                <span>Network ID:</span>
                                <strong>{subnetCalc.networkAddress}</strong>
                              </div>
                              <div>
                                <span>Broadcast IP:</span>
                                <strong>{subnetCalc.broadcastAddress}</strong>
                              </div>
                              <div>
                                <span>Usable Range:</span>
                                <strong>
                                  {subnetCalc.firstUsableHost} –{' '}
                                  {subnetCalc.lastUsableHost}
                                </strong>
                              </div>
                              <div>
                                <span>Usable Hosts:</span>
                                <strong>{subnetCalc.usableHosts} hosts</strong>
                              </div>
                            </div>

                            {!subnetCalc.isValidHostIp && (
                              <div className="nr-subnet-warning">
                                Warning: {activeIface.ip} is the{' '}
                                {subnetCalc.isNetworkAddress
                                  ? 'Network ID'
                                  : 'Broadcast Address'}{' '}
                                for this /{subnetCalc.cidr} block and cannot
                                send/receive host traffic!
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="nr-subnet-calc-box is-muted">
                            Enter a valid IPv4 address above to calculate
                            Network ID, Broadcast Address, and Usable Host
                            Range.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ROUTING TABLE & LPM TESTER */}
          {activeTab === 'routing' && (
            <div className="nr-config-grid">
              <div className="nr-config-col">
                <div className="nr-form-card">
                  <h4>Active IPv4 Routing Table ({device.name})</h4>
                  <table className="nr-data-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Network / CIDR</th>
                        <th>Next-Hop</th>
                        <th>Interface</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(device.routingTable || []).map((rt) => (
                        <tr key={rt.id}>
                          <td>
                            <span
                              className={`nr-badge ${
                                rt.type === 'connected'
                                  ? 'badge-blue'
                                  : 'badge-purple'
                              }`}
                            >
                              {rt.type === 'connected' ? 'C' : 'S'}
                            </span>
                          </td>
                          <td className="nr-mono">
                            {rt.network}/{rt.cidr}
                          </td>
                          <td className="nr-mono">
                            {rt.type === 'connected'
                              ? 'Directly Connected'
                              : rt.nextHop}
                          </td>
                          <td className="nr-mono">{rt.interfaceId}</td>
                          <td>
                            {rt.type !== 'connected' && (
                              <button
                                type="button"
                                className="nr-icon-btn text-red"
                                onClick={() =>
                                  removeStaticRoute(device.id, rt.id)
                                }
                                title="Delete Static Route"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Interactive LPM Tester */}
                <div className="nr-form-card">
                  <h4>Longest Prefix Match (LPM) Route Lookup Simulator</h4>
                  <div className="nr-field-row">
                    <label>Test Destination IPv4 Address</label>
                    <input
                      type="text"
                      className="nr-input nr-mono"
                      value={lpmTestIp}
                      onChange={(e) => setLpmTestIp(e.target.value)}
                    />
                  </div>
                  {lpmResult ? (
                    <div className="nr-lpm-result is-match">
                      Matched Route:{' '}
                      <strong>
                        {lpmResult.network}/{lpmResult.cidr}
                      </strong>{' '}
                      ({lpmResult.type.toUpperCase()}) via{' '}
                      <strong>
                        {lpmResult.type === 'connected'
                          ? 'Direct Delivery'
                          : lpmResult.nextHop}
                      </strong>{' '}
                      out interface <strong>{lpmResult.interfaceId}</strong>.
                    </div>
                  ) : (
                    <div className="nr-lpm-result is-nomatch">
                      No matching route found in {device.name}&apos;s routing
                      table! Packets to {lpmTestIp} will be dropped
                      (NO_ROUTE_TO_HOST).
                    </div>
                  )}
                </div>
              </div>

              {/* Add Static Route Form */}
              <div className="nr-config-col">
                <form className="nr-form-card" onSubmit={handleAddRoute}>
                  <h4>Add Static Route (ip route)</h4>
                  <div className="nr-field-row">
                    <label>Destination Network IP (use 0.0.0.0 for default route)</label>
                    <input
                      type="text"
                      className="nr-input nr-mono"
                      value={routeForm.network}
                      onChange={(e) =>
                        setRouteForm({ ...routeForm, network: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="nr-field-row">
                    <label>Subnet Prefix Length (CIDR)</label>
                    <select
                      className="nr-input nr-mono"
                      value={routeForm.cidr}
                      onChange={(e) =>
                        setRouteForm({
                          ...routeForm,
                          cidr: Number(e.target.value),
                        })
                      }
                    >
                      <option value={0}>/0 (0.0.0.0 — Default Route)</option>
                      {COMMON_CIDRS.map((c) => (
                        <option key={c} value={c}>
                          /{c}
                        </option>
                      ))}
                      <option value={32}>/32 (Host Route)</option>
                    </select>
                  </div>

                  <div className="nr-field-row">
                    <label>Next-Hop Router IP</label>
                    <input
                      type="text"
                      className="nr-input nr-mono"
                      value={routeForm.nextHop}
                      onChange={(e) =>
                        setRouteForm({ ...routeForm, nextHop: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="nr-field-row">
                    <label>Egress Interface</label>
                    <select
                      className="nr-input"
                      value={routeForm.interfaceId}
                      onChange={(e) =>
                        setRouteForm({
                          ...routeForm,
                          interfaceId: e.target.value,
                        })
                      }
                    >
                      {device.interfaces.map((iface) => (
                        <option key={iface.id} value={iface.id}>
                          {iface.name} ({iface.ip || 'unassigned'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="nr-top-action-btn nr-btn-primary"
                  >
                    <Plus size={14} />
                    <span>Add Static Route</span>
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: ARP CACHE & SWITCH MAC ADDRESS TABLE */}
          {activeTab === 'tables' && (
            <div className="nr-config-grid">
              <div className="nr-config-col">
                <div className="nr-form-card">
                  <div className="nr-card-head-between">
                    <h4>
                      {isL2SwitchOrHub
                        ? 'Switch MAC Address Table (CAM)'
                        : 'Layer 3 ARP Cache (IPv4 ⇄ MAC)'}
                    </h4>
                    <button
                      type="button"
                      className="nr-btn-secondary"
                      onClick={() => clearDeviceTables(device.id)}
                    >
                      <RefreshCw size={12} />
                      <span>Flush Table</span>
                    </button>
                  </div>

                  {isL2SwitchOrHub ? (
                    <table className="nr-data-table">
                      <thead>
                        <tr>
                          <th>MAC Address</th>
                          <th>Switch Port</th>
                          <th>VLAN</th>
                          <th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(device.macTable || []).length === 0 ? (
                          <tr>
                            <td colSpan={4} className="nr-empty-cell">
                              CAM table is currently empty. Send packets through
                              this switch to observe dynamic source MAC learning!
                            </td>
                          </tr>
                        ) : (
                          device.macTable.map((entry, idx) => (
                            <tr key={`${entry.mac}-${idx}`}>
                              <td className="nr-mono">{entry.mac}</td>
                              <td className="nr-mono">{entry.interfaceId}</td>
                              <td>VLAN {entry.vlan || 1}</td>
                              <td>
                                <span className="nr-badge badge-blue">
                                  DYNAMIC
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <table className="nr-data-table">
                      <thead>
                        <tr>
                          <th>Internet Address (IPv4)</th>
                          <th>Physical Address (MAC)</th>
                          <th>Interface</th>
                          <th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(device.arpTable || []).length === 0 ? (
                          <tr>
                            <td colSpan={4} className="nr-empty-cell">
                              ARP cache is empty. The next outbound packet will
                              trigger a broadcast ARP Request (FF:FF:FF:FF:FF:FF).
                            </td>
                          </tr>
                        ) : (
                          device.arpTable.map((entry, idx) => (
                            <tr key={`${entry.ip}-${idx}`}>
                              <td className="nr-mono">{entry.ip}</td>
                              <td className="nr-mono">{entry.mac}</td>
                              <td className="nr-mono">{entry.interfaceId}</td>
                              <td>
                                <span className="nr-badge badge-blue">
                                  {entry.type || 'dynamic'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FIREWALL ACL RULES */}
          {activeTab === 'firewall' && (
            <div className="nr-config-grid">
              <div className="nr-config-col">
                <div className="nr-form-card">
                  <h4>Packet Filtering ACL Rules ({device.name})</h4>
                  <table className="nr-data-table">
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Protocol</th>
                        <th>Source CIDR</th>
                        <th>Dest CIDR</th>
                        <th>Rule Name</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(device.firewallRules || []).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="nr-empty-cell">
                            No explicit ACL rules configured (Default policy:
                            PERMIT ALL).
                          </td>
                        </tr>
                      ) : (
                        device.firewallRules.map((rule) => (
                          <tr key={rule.id}>
                            <td>
                              <span
                                className={`nr-badge ${
                                  rule.action === 'DENY'
                                    ? 'badge-red'
                                    : 'badge-green'
                                }`}
                              >
                                {rule.action}
                              </span>
                            </td>
                            <td className="nr-mono">{rule.protocol}</td>
                            <td className="nr-mono">{rule.srcNetwork}</td>
                            <td className="nr-mono">{rule.dstNetwork}</td>
                            <td>{rule.name}</td>
                            <td>
                              <button
                                type="button"
                                className="nr-icon-btn text-red"
                                onClick={() =>
                                  removeFirewallRule(device.id, rule.id)
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="nr-config-col">
                <form className="nr-form-card" onSubmit={handleAddAcl}>
                  <h4>Add Firewall ACL Rule</h4>
                  <div className="nr-field-row">
                    <label>Rule Description</label>
                    <input
                      type="text"
                      className="nr-input"
                      value={aclForm.name}
                      onChange={(e) =>
                        setAclForm({ ...aclForm, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="nr-field-grid-2">
                    <div className="nr-field-row">
                      <label>Action</label>
                      <select
                        className="nr-input"
                        value={aclForm.action}
                        onChange={(e) =>
                          setAclForm({ ...aclForm, action: e.target.value })
                        }
                      >
                        <option value="DENY">DENY (Drop Packet)</option>
                        <option value="ALLOW">ALLOW (Permit Packet)</option>
                      </select>
                    </div>
                    <div className="nr-field-row">
                      <label>Protocol</label>
                      <select
                        className="nr-input"
                        value={aclForm.protocol}
                        onChange={(e) =>
                          setAclForm({ ...aclForm, protocol: e.target.value })
                        }
                      >
                        <option value="ICMP">ICMP (Ping)</option>
                        <option value="HTTP">HTTP (Port 80)</option>
                        <option value="DNS">DNS (Port 53)</option>
                        <option value="ANY">ANY (All Traffic)</option>
                      </select>
                    </div>
                  </div>
                  <div className="nr-field-grid-2">
                    <div className="nr-field-row">
                      <label>Source CIDR (or &quot;any&quot;)</label>
                      <input
                        type="text"
                        className="nr-input nr-mono"
                        value={aclForm.srcNetwork}
                        onChange={(e) =>
                          setAclForm({ ...aclForm, srcNetwork: e.target.value })
                        }
                      />
                    </div>
                    <div className="nr-field-row">
                      <label>Destination CIDR (or &quot;any&quot;)</label>
                      <input
                        type="text"
                        className="nr-input nr-mono"
                        value={aclForm.dstNetwork}
                        onChange={(e) =>
                          setAclForm({ ...aclForm, dstNetwork: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="nr-top-action-btn nr-btn-primary"
                  >
                    <Plus size={14} />
                    <span>Add Firewall Rule</span>
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 5: SERVER DAEMONS */}
          {activeTab === 'services' && (
            <div className="nr-config-grid">
              <div className="nr-config-col">
                <div className="nr-form-card">
                  <div className="nr-card-head-between">
                    <h4>HTTP Web Server (TCP Port 80)</h4>
                    <input
                      type="checkbox"
                      checked={Boolean(device.services?.http?.enabled)}
                      onChange={(e) =>
                        updateServerServices(device.id, {
                          http: {
                            ...device.services?.http,
                            enabled: e.target.checked,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="nr-field-row">
                    <label>HTTP 200 OK Response HTML Payload</label>
                    <textarea
                      rows={3}
                      className="nr-input nr-mono"
                      value={device.services?.http?.responseBody || ''}
                      onChange={(e) =>
                        updateServerServices(device.id, {
                          http: {
                            ...device.services?.http,
                            responseBody: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="nr-form-card">
                  <div className="nr-card-head-between">
                    <h4>DHCP Server Daemon (UDP 67/68)</h4>
                    <input
                      type="checkbox"
                      checked={Boolean(device.services?.dhcp?.enabled)}
                      onChange={(e) =>
                        updateServerServices(device.id, {
                          dhcp: {
                            ...device.services?.dhcp,
                            enabled: e.target.checked,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="nr-field-grid-2">
                    <div className="nr-field-row">
                      <label>Pool Start IP</label>
                      <input
                        type="text"
                        className="nr-input nr-mono"
                        value={
                          device.services?.dhcp?.poolStart || '192.168.1.100'
                        }
                        onChange={(e) =>
                          updateServerServices(device.id, {
                            dhcp: {
                              ...device.services?.dhcp,
                              poolStart: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="nr-field-row">
                      <label>Default Gateway Offered</label>
                      <input
                        type="text"
                        className="nr-input nr-mono"
                        value={
                          device.services?.dhcp?.defaultGateway || '192.168.1.1'
                        }
                        onChange={(e) =>
                          updateServerServices(device.id, {
                            dhcp: {
                              ...device.services?.dhcp,
                              defaultGateway: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="nr-config-col">
                <div className="nr-form-card">
                  <div className="nr-card-head-between">
                    <h4>DNS Authoritative Server (UDP Port 53)</h4>
                    <input
                      type="checkbox"
                      checked={Boolean(device.services?.dns?.enabled)}
                      onChange={(e) =>
                        updateServerServices(device.id, {
                          dns: {
                            ...device.services?.dns,
                            enabled: e.target.checked,
                          },
                        })
                      }
                    />
                  </div>
                  <table className="nr-data-table">
                    <thead>
                      <tr>
                        <th>Domain Name</th>
                        <th>Type</th>
                        <th>Resolved IPv4</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(device.services?.dns?.records || []).map((rec, i) => (
                        <tr key={`${rec.hostname}-${i}`}>
                          <td className="nr-mono">{rec.hostname}</td>
                          <td>A</td>
                          <td className="nr-mono">{rec.ip}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <form
                    onSubmit={handleAddDnsRecord}
                    className="nr-inline-form"
                  >
                    <input
                      type="text"
                      className="nr-input nr-mono"
                      placeholder="hostname (e.g. intranet.lab)"
                      value={dnsForm.hostname}
                      onChange={(e) =>
                        setDnsForm({ ...dnsForm, hostname: e.target.value })
                      }
                    />
                    <input
                      type="text"
                      className="nr-input nr-mono"
                      placeholder="IPv4 address"
                      value={dnsForm.ip}
                      onChange={(e) =>
                        setDnsForm({ ...dnsForm, ip: e.target.value })
                      }
                    />
                    <button
                      type="submit"
                      className="nr-top-action-btn nr-btn-primary"
                    >
                      <Plus size={13} />
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="nr-modal-footer">
          <button
            type="button"
            className="nr-btn-danger"
            onClick={() => {
              deleteDevice(device.id);
              setActiveModal(null);
            }}
          >
            <Trash2 size={14} />
            <span>Delete {device.name}</span>
          </button>

          <button
            type="button"
            className="nr-top-action-btn nr-btn-primary"
            onClick={() => setActiveModal(null)}
          >
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
}
