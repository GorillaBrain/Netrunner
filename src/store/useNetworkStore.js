import { create } from 'zustand';
import {
  createDevice,
  syncConnectedRoutes,
} from '../engine/deviceModels.js';
import {
  findConnectedLink,
  runPacketSimulation,
} from '../engine/packetEngine.js';
import { LABS_LIST } from '../labs/labsData.js';
import { normalizeMask } from '../engine/ipUtils.js';

const STORAGE_KEY = 'netrunner_saved_topologies_v1';

function findNextFreeInterface(device, links) {
  if (!device || !device.interfaces) return null;
  for (const iface of device.interfaces) {
    const existing = findConnectedLink(links, device.id, iface.id);
    if (!existing) return iface;
  }
  return null;
}

function getInitialSetup() {
  const defaultLab = LABS_LIST[0];
  const { devices, links } = defaultLab.createTopology();

  // Run an initial authentic ping from PC Pixelz 1 to PC Pixelz 2 so the Event List is populated out-of-the-box
  const initialSim = runPacketSimulation({
    devices,
    links,
    sourceDeviceId: 'dev-pc-1',
    targetDeviceId: 'dev-pc-2',
    protocol: 'ICMP',
  });

  return {
    activeLabId: defaultLab.id,
    devices: initialSim.finalDevices,
    links,
    events: initialSim.events,
    currentStepIndex: initialSim.events.length > 0 ? 0 : -1,
    selectedEventId: initialSim.events[0]?.id || null,
    simSummary: initialSim.summary,
    simHistory: [initialSim],
  };
}

const init = getInitialSetup();

export const useNetworkStore = create((set, get) => ({
  // Topology State
  activeLabId: init.activeLabId,
  devices: init.devices,
  links: init.links,
  selectedDeviceId: 'dev-pc-1',
  selectedLinkId: null,

  // Active Tool & Mode
  activeTool: 'select', // 'select' | 'connect' | 'pdu' | 'inspect' | 'delete'
  executionMode: 'simulation', // 'realtime' | 'simulation'
  pendingConnectSource: null, // { deviceId, interfaceId }
  pendingPduSourceId: null,

  // UI Panels State
  activeModal: null, // 'config' | 'inspector' | 'labs' | 'diagnostics' | 'packetLauncher' | 'saveLoad' | null
  inspectorEventId: null,

  // Simulation Playback State
  events: init.events,
  currentStepIndex: init.currentStepIndex,
  selectedEventId: init.selectedEventId,
  simSummary: init.simSummary,
  simHistory: init.simHistory,
  isPlaying: false,
  playbackSpeedMs: 900,
  protocolFilters: {
    ARP: true,
    ICMP: true,
    DNS: true,
    HTTP: true,
    DHCP: true,
  },

  // Packet Launcher Form State
  packetRequest: {
    sourceDeviceId: 'dev-pc-1',
    targetDeviceId: 'dev-pc-2',
    targetIpInput: '192.168.21.3',
    protocol: 'ICMP', // 'ICMP' | 'HTTP' | 'DNS' | 'DHCP' | 'TRACEROUTE'
    initialTtl: 64,
  },

  // Actions — UI & Mode
  setActiveTool: (tool) =>
    set({
      activeTool: tool,
      pendingConnectSource: null,
      pendingPduSourceId: null,
    }),

  setExecutionMode: (mode) =>
    set((state) => {
      if (mode === 'realtime' && state.events.length > 0) {
        return {
          executionMode: mode,
          isPlaying: false,
          currentStepIndex: state.events.length - 1,
          selectedEventId: state.events[state.events.length - 1]?.id || null,
        };
      }
      return { executionMode: mode };
    }),

  setActiveModal: (modal) => set({ activeModal: modal }),

  selectDevice: (deviceId, openConfig = false) =>
    set((state) => ({
      selectedDeviceId: deviceId,
      selectedLinkId: null,
      activeModal: openConfig ? 'config' : state.activeModal,
    })),

  selectLink: (linkId) =>
    set({
      selectedLinkId: linkId,
      selectedDeviceId: null,
    }),

  // Actions — Device CRUD
  addDevice: (type, position) =>
    set((state) => {
      const countOfType =
        state.devices.filter((d) => d.type === type).length + 1;
      const typeNames = {
        pc: `PC Pixelz ${countOfType}`,
        laptop: `Laptop Pixelz ${countOfType}`,
        smartphone: `Smartphone ${countOfType}`,
        server: `Server ${countOfType}`,
        router: `Pixelz Router ${countOfType}`,
        switch: `Switch ${countOfType}`,
        hub: `Hub ${countOfType}`,
        firewall: `Firewall ${countOfType}`,
        cloud: `ISP Cloud ${countOfType}`,
      };
      const defaultIp =
        type === 'pc' || type === 'laptop' || type === 'smartphone'
          ? `192.168.21.${10 + countOfType}`
          : type === 'server'
          ? `192.168.21.${100 + countOfType}`
          : type === 'router'
          ? `192.168.${20 + countOfType}.1`
          : '';

      const newDev = createDevice({
        type,
        name: typeNames[type] || `Device ${countOfType}`,
        position: position || {
          x: 320 + Math.round((Math.random() - 0.5) * 140),
          y: 260 + Math.round((Math.random() - 0.5) * 140),
        },
        ip: defaultIp,
        cidr: 24,
      });

      return {
        devices: [...state.devices, newDev],
        selectedDeviceId: newDev.id,
      };
    }),

  updateDevicePosition: (deviceId, position) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId ? { ...d, position } : d
      ),
    })),

  updateDeviceBasicInfo: (deviceId, updates) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId ? syncConnectedRoutes({ ...d, ...updates }) : d
      ),
    })),

  updateInterfaceConfig: (deviceId, interfaceId, ifaceUpdates) =>
    set((state) => ({
      devices: state.devices.map((d) => {
        if (d.id !== deviceId) return d;
        const updatedInterfaces = d.interfaces.map((iface) => {
          if (iface.id !== interfaceId) return iface;
          const next = { ...iface, ...ifaceUpdates };
          if (ifaceUpdates.cidr !== undefined || ifaceUpdates.subnetMask !== undefined) {
            const norm = normalizeMask(
              ifaceUpdates.cidr !== undefined
                ? ifaceUpdates.cidr
                : ifaceUpdates.subnetMask
            );
            next.cidr = norm.cidr;
            next.subnetMask = norm.subnetMask;
          }
          return next;
        });
        return syncConnectedRoutes({ ...d, interfaces: updatedInterfaces });
      }),
    })),

  addStaticRoute: (deviceId, route) =>
    set((state) => ({
      devices: state.devices.map((d) => {
        if (d.id !== deviceId) return d;
        const norm = normalizeMask(route.cidr ?? route.mask ?? 24);
        const newRoute = {
          id: `rt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          type: 'static',
          network: route.network.trim(),
          mask: norm.subnetMask,
          cidr: norm.cidr,
          nextHop: route.nextHop.trim(),
          interfaceId: route.interfaceId || d.interfaces?.[0]?.id || 'eth0',
          metric: Number(route.metric ?? 1),
          enabled: true,
        };
        return {
          ...d,
          routingTable: [...(d.routingTable || []), newRoute],
        };
      }),
    })),

  removeStaticRoute: (deviceId, routeId) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId
          ? {
              ...d,
              routingTable: (d.routingTable || []).filter(
                (r) => r.id !== routeId
              ),
            }
          : d
      ),
    })),

  addFirewallRule: (deviceId, rule) =>
    set((state) => ({
      devices: state.devices.map((d) => {
        if (d.id !== deviceId) return d;
        const newRule = {
          id: `acl-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: rule.name || 'Custom Rule',
          action: (rule.action || 'DENY').toUpperCase(),
          protocol: (rule.protocol || 'ICMP').toUpperCase(),
          srcNetwork: rule.srcNetwork?.trim() || 'any',
          dstNetwork: rule.dstNetwork?.trim() || 'any',
          dstPort: rule.dstPort?.trim() || 'any',
          enabled: true,
        };
        return {
          ...d,
          firewallRules: [...(d.firewallRules || []), newRule],
        };
      }),
    })),

  removeFirewallRule: (deviceId, ruleId) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId
          ? {
              ...d,
              firewallRules: (d.firewallRules || []).filter(
                (r) => r.id !== ruleId
              ),
            }
          : d
      ),
    })),

  updateServerServices: (deviceId, servicesUpdate) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId
          ? { ...d, services: { ...d.services, ...servicesUpdate } }
          : d
      ),
    })),

  clearDeviceTables: (deviceId) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        !deviceId || d.id === deviceId
          ? { ...d, arpTable: [], macTable: [] }
          : d
      ),
    })),

  deleteDevice: (deviceId) =>
    set((state) => ({
      devices: state.devices.filter((d) => d.id !== deviceId),
      links: state.links.filter(
        (l) => l.source !== deviceId && l.target !== deviceId
      ),
      selectedDeviceId:
        state.selectedDeviceId === deviceId ? null : state.selectedDeviceId,
    })),

  // Actions — Links / Cables
  connectDevices: (sourceDeviceId, targetDeviceId, explicitSrcIface, explicitDstIface) => {
    const state = get();
    if (sourceDeviceId === targetDeviceId) {
      return { ok: false, error: 'Cannot connect a device to itself.' };
    }
    const srcDev = state.devices.find((d) => d.id === sourceDeviceId);
    const dstDev = state.devices.find((d) => d.id === targetDeviceId);
    if (!srcDev || !dstDev) {
      return { ok: false, error: 'Device not found.' };
    }

    const srcIface = explicitSrcIface
      ? srcDev.interfaces.find((i) => i.id === explicitSrcIface)
      : findNextFreeInterface(srcDev, state.links);
    const dstIface = explicitDstIface
      ? dstDev.interfaces.find((i) => i.id === explicitDstIface)
      : findNextFreeInterface(dstDev, state.links);

    if (!srcIface) {
      return {
        ok: false,
        error: `${srcDev.name} has no free interfaces available.`,
      };
    }
    if (!dstIface) {
      return {
        ok: false,
        error: `${dstDev.name} has no free interfaces available.`,
      };
    }

    // Ensure neither port is already connected
    if (findConnectedLink(state.links, srcDev.id, srcIface.id)) {
      return {
        ok: false,
        error: `${srcDev.name} (${srcIface.name}) already has a cable attached.`,
      };
    }
    if (findConnectedLink(state.links, dstDev.id, dstIface.id)) {
      return {
        ok: false,
        error: `${dstDev.name} (${dstIface.name}) already has a cable attached.`,
      };
    }

    const newLink = {
      id: `link-${srcDev.id}-${srcIface.id}-${dstDev.id}-${dstIface.id}`,
      source: srcDev.id,
      sourceHandle: srcIface.id,
      target: dstDev.id,
      targetHandle: dstIface.id,
      status: 'up',
    };

    set({
      links: [...state.links, newLink],
      pendingConnectSource: null,
    });
    return { ok: true, link: newLink };
  },

  deleteLink: (linkId) =>
    set((state) => ({
      links: state.links.filter((l) => l.id !== linkId),
      selectedLinkId:
        state.selectedLinkId === linkId ? null : state.selectedLinkId,
    })),

  toggleLinkStatus: (linkId) =>
    set((state) => ({
      links: state.links.map((l) =>
        l.id === linkId
          ? { ...l, status: l.status === 'down' ? 'up' : 'down' }
          : l
      ),
    })),

  // Actions — Interactive Canvas Click Handler for Connect / PDU / Delete tools
  handleDeviceCanvasClick: (deviceId) => {
    const state = get();
    const clickedDev = state.devices.find((d) => d.id === deviceId);
    if (!clickedDev) return null;

    if (state.activeTool === 'delete') {
      state.deleteDevice(deviceId);
      return { action: 'deleted', device: clickedDev };
    }

    if (state.activeTool === 'connect') {
      if (!state.pendingConnectSource) {
        set({ pendingConnectSource: deviceId, selectedDeviceId: deviceId });
        return { action: 'connect_source_selected', device: clickedDev };
      }
      const res = state.connectDevices(state.pendingConnectSource, deviceId);
      set({ pendingConnectSource: null, activeTool: 'select' });
      return { action: 'connected', ...res };
    }

    if (state.activeTool === 'pdu') {
      if (!state.pendingPduSourceId) {
        set({
          pendingPduSourceId: deviceId,
          selectedDeviceId: deviceId,
          packetRequest: {
            ...state.packetRequest,
            sourceDeviceId: deviceId,
          },
        });
        return { action: 'pdu_source_selected', device: clickedDev };
      }
      const targetIp =
        clickedDev.interfaces?.find((i) => i.adminUp && i.ip)?.ip ||
        clickedDev.interfaces?.[0]?.ip ||
        '';
      set({
        packetRequest: {
          ...state.packetRequest,
          sourceDeviceId: state.pendingPduSourceId,
          targetDeviceId: deviceId,
          targetIpInput: targetIp,
        },
        pendingPduSourceId: null,
        activeTool: 'select',
      });
      get().launchSimulation({
        sourceDeviceId: state.pendingPduSourceId,
        targetDeviceId: deviceId,
        targetIpInput: targetIp,
        protocol: state.packetRequest.protocol,
      });
      return { action: 'pdu_launched', device: clickedDev };
    }

    if (state.activeTool === 'inspect') {
      set({ selectedDeviceId: deviceId, activeModal: 'config' });
      return { action: 'inspected', device: clickedDev };
    }

    set({ selectedDeviceId: deviceId, selectedLinkId: null });
    return { action: 'selected', device: clickedDev };
  },

  // Actions — Packet Simulation & Playback
  setPacketRequest: (updates) =>
    set((state) => ({
      packetRequest: { ...state.packetRequest, ...updates },
    })),

  launchSimulation: (overrideParams = {}) => {
    const state = get();
    const req = { ...state.packetRequest, ...overrideParams };

    const result = runPacketSimulation({
      devices: state.devices,
      links: state.links,
      sourceDeviceId: req.sourceDeviceId,
      targetDeviceId: req.targetDeviceId,
      targetIpInput: req.targetIpInput,
      protocol: req.protocol || 'ICMP',
      initialTtl: Number(req.initialTtl) || 64,
    });

    const isRealtime = state.executionMode === 'realtime';
    const startIdx = isRealtime
      ? Math.max(0, result.events.length - 1)
      : result.events.length > 0
      ? 0
      : -1;

    set({
      devices: result.finalDevices,
      events: result.events,
      currentStepIndex: startIdx,
      selectedEventId: result.events[startIdx]?.id || null,
      simSummary: result.summary,
      simHistory: [result, ...state.simHistory.slice(0, 19)],
      isPlaying: !isRealtime && result.events.length > 1,
      packetRequest: req,
    });

    return result;
  },

  stepForward: () =>
    set((state) => {
      if (state.events.length === 0) return {};
      const nextIdx = Math.min(
        state.events.length - 1,
        state.currentStepIndex + 1
      );
      const reachedEnd = nextIdx >= state.events.length - 1;
      return {
        currentStepIndex: nextIdx,
        selectedEventId: state.events[nextIdx]?.id || null,
        isPlaying: reachedEnd ? false : state.isPlaying,
      };
    }),

  stepBackward: () =>
    set((state) => {
      if (state.events.length === 0) return {};
      const prevIdx = Math.max(0, state.currentStepIndex - 1);
      return {
        currentStepIndex: prevIdx,
        selectedEventId: state.events[prevIdx]?.id || null,
        isPlaying: false,
      };
    }),

  setStepIndex: (idx, openInspector = false) =>
    set((state) => {
      const clamped = Math.max(0, Math.min(state.events.length - 1, idx));
      const evt = state.events[clamped];
      return {
        currentStepIndex: clamped,
        selectedEventId: evt?.id || null,
        inspectorEventId: openInspector ? evt?.id || null : state.inspectorEventId,
        activeModal: openInspector ? 'inspector' : state.activeModal,
        isPlaying: false,
      };
    }),

  setIsPlaying: (playing) =>
    set((state) => {
      if (
        playing &&
        state.currentStepIndex >= state.events.length - 1 &&
        state.events.length > 0
      ) {
        return {
          isPlaying: true,
          currentStepIndex: 0,
          selectedEventId: state.events[0]?.id || null,
        };
      }
      return { isPlaying: playing };
    }),

  setPlaybackSpeedMs: (ms) => set({ playbackSpeedMs: Number(ms) }),

  toggleProtocolFilter: (proto) =>
    set((state) => ({
      protocolFilters: {
        ...state.protocolFilters,
        [proto]: !state.protocolFilters[proto],
      },
    })),

  resetSimulation: () =>
    set((state) => ({
      isPlaying: false,
      currentStepIndex: state.events.length > 0 ? 0 : -1,
      selectedEventId: state.events[0]?.id || null,
    })),

  clearSimulationEvents: () =>
    set({
      events: [],
      currentStepIndex: -1,
      selectedEventId: null,
      simSummary: null,
      isPlaying: false,
    }),

  // Actions — Labs & Persistence
  loadLab: (labId) => {
    const lab = LABS_LIST.find((l) => l.id === labId);
    if (!lab) return;
    const { devices, links } = lab.createTopology();
    const firstEndHost =
      devices.find((d) =>
        ['pc', 'laptop', 'smartphone'].includes(d.type)
      ) || devices[0];
    const secondHost =
      devices.find(
        (d) =>
          d.id !== firstEndHost?.id &&
          ['pc', 'laptop', 'smartphone', 'server'].includes(d.type)
      ) || devices[1];

    const targetIp =
      secondHost?.interfaces?.find((i) => i.ip)?.ip || '192.168.1.1';

    set({
      activeLabId: lab.id,
      devices,
      links,
      selectedDeviceId: firstEndHost?.id || null,
      selectedLinkId: null,
      events: [],
      currentStepIndex: -1,
      selectedEventId: null,
      simSummary: null,
      simHistory: [],
      isPlaying: false,
      packetRequest: {
        sourceDeviceId: firstEndHost?.id || '',
        targetDeviceId: secondHost?.id || '',
        targetIpInput: targetIp,
        protocol: 'ICMP',
        initialTtl: 64,
      },
    });
  },

  saveTopologyToStorage: (name = 'My Custom Topology') => {
    const state = get();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const entry = {
        id: `save-${Date.now()}`,
        name,
        savedAt: new Date().toISOString(),
        devices: state.devices,
        links: state.links,
        activeLabId: state.activeLabId,
      };
      const updated = [entry, ...list.filter((x) => x.name !== name)].slice(
        0,
        20
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return { ok: true, entry, list: updated };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  getSavedTopologies: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  loadSavedTopology: (entry) => {
    if (!entry || !Array.isArray(entry.devices)) return;
    set({
      devices: entry.devices,
      links: entry.links || [],
      activeLabId: entry.activeLabId || 'custom',
      selectedDeviceId: entry.devices[0]?.id || null,
      events: [],
      currentStepIndex: -1,
      simSummary: null,
      isPlaying: false,
    });
  },

  importTopologyJson: (jsonStr) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed.devices) || !Array.isArray(parsed.links)) {
        return { ok: false, error: 'Invalid topology JSON schema.' };
      }
      set({
        devices: parsed.devices,
        links: parsed.links,
        activeLabId: parsed.activeLabId || 'custom',
        selectedDeviceId: parsed.devices[0]?.id || null,
        events: [],
        currentStepIndex: -1,
        simSummary: null,
        isPlaying: false,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
}));
