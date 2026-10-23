import {
  BROADCAST_MAC,
  getSubnetDetails,
  ipMatchesNetwork,
  isSameSubnet,
  isValidIpv4,
  longestPrefixMatch,
} from './ipUtils.js';
import { DEVICE_TYPES, syncConnectedRoutes } from './deviceModels.js';

/**
 * Deep clone helper for deterministic simulation snapshots.
 */
function cloneDeep(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Finds the link connected to a specific (deviceId, interfaceId).
 */
export function findConnectedLink(links, deviceId, interfaceId) {
  return links.find(
    (l) =>
      (l.source === deviceId && l.sourceHandle === interfaceId) ||
      (l.target === deviceId && l.targetHandle === interfaceId)
  );
}

/**
 * Given a link and one endpoint (deviceId, interfaceId), returns the peer endpoint.
 */
export function getPeerEndpoint(link, deviceId, interfaceId) {
  if (!link) return null;
  if (link.source === deviceId && link.sourceHandle === interfaceId) {
    return { deviceId: link.target, interfaceId: link.targetHandle, link };
  }
  if (link.target === deviceId && link.targetHandle === interfaceId) {
    return { deviceId: link.source, interfaceId: link.sourceHandle, link };
  }
  return null;
}

/**
 * Evaluates a device's firewall / ACL rules against an IPv4 packet.
 * Returns { allowed: boolean, matchedRule: object | null }
 */
export function evaluateFirewallRules(device, packet, direction = 'inbound') {
  const rules = device?.firewallRules || [];
  if (rules.length === 0) {
    return { allowed: true, matchedRule: null };
  }

  for (const rule of rules) {
    if (rule.enabled === false) continue;
    if (
      rule.direction &&
      rule.direction !== 'any' &&
      rule.direction !== direction
    ) {
      continue;
    }

    // Check protocol
    const ruleProto = (rule.protocol || 'ANY').toUpperCase();
    const pktProto = (packet.protocol || 'ICMP').toUpperCase();
    const l4Proto = (packet.l4?.protocol || pktProto).toUpperCase();

    if (
      ruleProto !== 'ANY' &&
      ruleProto !== pktProto &&
      ruleProto !== l4Proto
    ) {
      continue;
    }

    // Check source network
    if (
      rule.srcNetwork &&
      rule.srcNetwork !== 'any' &&
      !ipMatchesNetwork(packet.srcIp, rule.srcNetwork)
    ) {
      continue;
    }

    // Check destination network
    if (
      rule.dstNetwork &&
      rule.dstNetwork !== 'any' &&
      !ipMatchesNetwork(packet.dstIp, rule.dstNetwork)
    ) {
      continue;
    }

    // Check destination port
    if (
      rule.dstPort &&
      String(rule.dstPort).toLowerCase() !== 'any' &&
      Number(rule.dstPort) !== Number(packet.l4?.dstPort)
    ) {
      continue;
    }

    return {
      allowed: (rule.action || 'ALLOW').toUpperCase() === 'ALLOW',
      matchedRule: rule,
    };
  }

  // Default implicit allow in educational lab unless explicit deny-all rule is added
  return { allowed: true, matchedRule: null };
}

/**
 * Determines the egress interface and next-hop IP for a Layer 3 device originating or forwarding a packet.
 */
export function resolveLayer3Egress(device, dstIp, links) {
  if (!device) {
    return {
      errorCode: 'DEVICE_NOT_FOUND',
      errorMessage: 'Source device does not exist.',
    };
  }

  const isRouterLike = [
    DEVICE_TYPES.ROUTER,
    DEVICE_TYPES.FIREWALL,
    DEVICE_TYPES.CLOUD,
  ].includes(device.type);

  if (!isRouterLike) {
    // End Host (PC, Laptop, Smartphone, Server)
    const iface = device.interfaces?.[0];
    if (!iface) {
      return {
        errorCode: 'NO_INTERFACE',
        errorMessage: `${device.name} has no network interface installed.`,
      };
    }
    if (!iface.adminUp) {
      return {
        errorCode: 'INTERFACE_DOWN',
        errorMessage: `Interface ${iface.name} on ${device.name} is administratively DOWN. Enable the port in Device Configuration.`,
        interface: iface,
      };
    }
    if (!isValidIpv4(iface.ip)) {
      return {
        errorCode: 'INVALID_SOURCE_IP',
        errorMessage: `${device.name} (${iface.name}) does not have a valid IPv4 address configured.`,
        interface: iface,
      };
    }
    const subnetInfo = getSubnetDetails(iface.ip, iface.cidr ?? iface.subnetMask);
    if (subnetInfo && !subnetInfo.isValidHostIp) {
      return {
        errorCode: 'INVALID_HOST_IP',
        errorMessage: `${iface.ip}/${iface.cidr} on ${device.name} is a ${
          subnetInfo.isNetworkAddress ? 'network address' : 'broadcast address'
        } and cannot be assigned to a host interface. Usable range: ${
          subnetInfo.firstUsableHost
        } – ${subnetInfo.lastUsableHost}.`,
        interface: iface,
      };
    }

    const link = findConnectedLink(links, device.id, iface.id);
    if (!link || link.status === 'down') {
      return {
        errorCode: 'LINK_DISCONNECTED',
        errorMessage: `${device.name} (${iface.name}) is not connected to an active network cable.`,
        interface: iface,
      };
    }

    // Check if destination IP is on the local subnet
    if (isSameSubnet(iface.ip, dstIp, iface.cidr ?? iface.subnetMask)) {
      return {
        egressInterface: iface,
        nextHopIp: dstIp,
        isLocalSubnet: true,
        decision: `${dstIp} is within ${device.name}'s local subnet (${subnetInfo.networkAddress}/${subnetInfo.cidr}). Sending directly via ${iface.name} (ARP target: ${dstIp}).`,
      };
    }

    // Destination is on a remote subnet — check Default Gateway
    if (!device.defaultGateway || !isValidIpv4(device.defaultGateway) || device.defaultGateway === '0.0.0.0') {
      return {
        errorCode: 'NO_DEFAULT_GATEWAY',
        errorMessage: `Destination ${dstIp} is outside ${device.name}'s local subnet (${subnetInfo.networkAddress}/${subnetInfo.cidr}, usable ${subnetInfo.firstUsableHost}–${subnetInfo.lastUsableHost}), and ${device.name} has no Default Gateway configured.`,
        interface: iface,
      };
    }

    if (!isSameSubnet(iface.ip, device.defaultGateway, iface.cidr ?? iface.subnetMask)) {
      return {
        errorCode: 'INVALID_DEFAULT_GATEWAY',
        errorMessage: `Default Gateway ${device.defaultGateway} is unreachable because it is not in ${device.name}'s local subnet (${subnetInfo.networkAddress}/${subnetInfo.cidr}).`,
        interface: iface,
      };
    }

    return {
      egressInterface: iface,
      nextHopIp: device.defaultGateway,
      isLocalSubnet: false,
      decision: `${dstIp} is outside local subnet ${subnetInfo.networkAddress}/${subnetInfo.cidr}. Forwarding to Default Gateway ${device.defaultGateway} via ${iface.name}.`,
    };
  }

  // Router / Firewall / Cloud LPM routing table lookup
  const syncedDevice = syncConnectedRoutes(device);
  const matchedRoute = longestPrefixMatch(dstIp, syncedDevice.routingTable);

  if (!matchedRoute) {
    return {
      errorCode: 'NO_ROUTE_TO_HOST',
      errorMessage: `Router ${device.name} has no matching route in its routing table for destination ${dstIp}. Packet dropped (ICMP Destination Unreachable).`,
    };
  }

  let egressInterface = syncedDevice.interfaces.find(
    (i) => i.id === matchedRoute.interfaceId
  );

  // If static route didn't specify interfaceId or specified nextHop, find interface sharing subnet with nextHop
  if (
    (!egressInterface || !egressInterface.adminUp) &&
    matchedRoute.nextHop &&
    matchedRoute.nextHop !== '0.0.0.0'
  ) {
    egressInterface = syncedDevice.interfaces.find(
      (i) =>
        i.adminUp &&
        isValidIpv4(i.ip) &&
        isSameSubnet(i.ip, matchedRoute.nextHop, i.cidr ?? i.subnetMask)
    );
  }

  if (!egressInterface) {
    return {
      errorCode: 'NO_EGRESS_INTERFACE',
      errorMessage: `Route ${matchedRoute.network}/${matchedRoute.cidr} on ${device.name} points to an invalid or inactive egress interface.`,
    };
  }

  if (!egressInterface.adminUp) {
    return {
      errorCode: 'INTERFACE_DOWN',
      errorMessage: `Egress interface ${egressInterface.name} on ${device.name} is administratively DOWN.`,
      interface: egressInterface,
    };
  }

  const link = findConnectedLink(links, device.id, egressInterface.id);
  if (!link || link.status === 'down') {
    return {
      errorCode: 'LINK_DISCONNECTED',
      errorMessage: `Router interface ${egressInterface.name} on ${device.name} has no cable connected.`,
      interface: egressInterface,
    };
  }

  const isDirectlyConnected =
    matchedRoute.type === 'connected' ||
    !matchedRoute.nextHop ||
    matchedRoute.nextHop === '0.0.0.0' ||
    matchedRoute.nextHop === 'connected';

  const nextHopIp = isDirectlyConnected ? dstIp : matchedRoute.nextHop;

  return {
    egressInterface,
    nextHopIp,
    isLocalSubnet: isDirectlyConnected,
    matchedRoute,
    decision: isDirectlyConnected
      ? `Routing table match: ${matchedRoute.network}/${matchedRoute.cidr} is directly connected on ${egressInterface.name}. Next-hop is destination ${dstIp}.`
      : `Routing table Longest Prefix Match: ${matchedRoute.network}/${matchedRoute.cidr} via next-hop ${nextHopIp} out ${egressInterface.name}.`,
  };
}

/**
 * Builds structured OSI Layers inspector metadata for an event.
 */
function buildOsiLayers({
  frame,
  lastDevice,
  lastInterfaceId,
  atDevice,
  atInterfaceId,
}) {
  const isArp = frame.etherType === '0x0806';
  const pkt = frame.payload;

  const l1 = {
    layer: 'Layer 1 — Physical',
    medium: '1000BASE-T Twisted Pair Ethernet',
    sourcePort: lastDevice
      ? `${lastDevice.name} (${lastInterfaceId || 'local'})`
      : 'Internal Stack',
    receivingPort: atDevice
      ? `${atDevice.name} (${atInterfaceId || 'local'})`
      : 'N/A',
    signalStatus: 'Link UP / Full-Duplex 1 Gbps',
    frameSizeBits: `${(isArp ? 64 : 98) * 8} bits on wire`,
  };

  const l2 = {
    layer: 'Layer 2 — Data Link (Ethernet II)',
    srcMac: frame.srcMac,
    dstMac: frame.dstMac,
    etherType: isArp ? '0x0806 (ARP)' : '0x0800 (IPv4)',
    vlanId: frame.vlanId || 1,
    fcs: '0x8F4C2109 (CRC-32 Valid)',
  };

  let l3 = null;
  let l4 = null;
  let l7 = null;

  if (isArp) {
    l3 = {
      layer: 'Layer 2.5 — Address Resolution Protocol (ARP)',
      opcode: pkt.arpType === 'REQUEST' ? '1 (ARP Request)' : '2 (ARP Reply)',
      hardwareType: '0x0001 (Ethernet)',
      protocolType: '0x0800 (IPv4)',
      senderMac: pkt.senderMac,
      senderIp: pkt.senderIp,
      targetMac: pkt.targetMac,
      targetIp: pkt.targetIp,
      summary:
        pkt.arpType === 'REQUEST'
          ? `Who has ${pkt.targetIp}? Tell ${pkt.senderIp} (${pkt.senderMac})`
          : `${pkt.senderIp} is at ${pkt.senderMac}`,
    };
  } else if (pkt) {
    const protoNum =
      pkt.protocol === 'ICMP'
        ? '1 (ICMP)'
        : pkt.protocol === 'TCP' || pkt.protocol === 'HTTP'
        ? '6 (TCP)'
        : '17 (UDP)';
    l3 = {
      layer: 'Layer 3 — Network (IPv4)',
      version: 4,
      headerLength: '20 bytes',
      dscpEcn: '0x00 (Best Effort)',
      totalLength: `${pkt.totalLength || 84} bytes`,
      identification: pkt.identification || '0x4A12',
      flags: '0x02 (Don\'t Fragment)',
      ttl: pkt.ttl,
      protocol: protoNum,
      headerChecksum: '0xB27E (Verified)',
      srcIp: pkt.srcIp,
      dstIp: pkt.dstIp,
    };

    if (pkt.protocol === 'ICMP') {
      l4 = {
        layer: 'Layer 4 — Control Message (ICMP)',
        type:
          pkt.icmpType === 'ECHO_REQUEST'
            ? '8 (Echo Request / Ping)'
            : pkt.icmpType === 'ECHO_REPLY'
            ? '0 (Echo Reply / Pong)'
            : pkt.icmpType === 'TIME_EXCEEDED'
            ? '11 (Time Exceeded — TTL Expired)'
            : '3 (Destination Unreachable)',
        code: 0,
        checksum: '0x4D5B',
        identifier: '0x0001',
        sequenceNumber: pkt.seq ?? 1,
        payloadData: '32 bytes: 6162636465666768696a6b6c6d6e6f70...',
      };
    } else if (pkt.protocol === 'DNS') {
      l4 = {
        layer: 'Layer 4 — Transport (UDP)',
        srcPort: pkt.l4?.srcPort || 54120,
        dstPort: pkt.l4?.dstPort || 53,
        length: '46 bytes',
        checksum: '0x71A0',
      };
      l7 = {
        layer: 'Layer 7 — Application (DNS)',
        transactionId: '0x883A',
        flags:
          pkt.dnsType === 'QUERY'
            ? '0x0100 (Standard Query)'
            : '0x8180 (Standard Query Response)',
        question: `${pkt.hostname} IN A`,
        answer:
          pkt.dnsType === 'RESPONSE'
            ? pkt.resolvedIp
              ? `${pkt.hostname} -> ${pkt.resolvedIp} (TTL 300s)`
              : 'NXDOMAIN (Domain Not Found)'
            : '(Awaiting response)',
      };
    } else if (pkt.protocol === 'HTTP') {
      l4 = {
        layer: 'Layer 4 — Transport (TCP)',
        srcPort: pkt.l4?.srcPort || 49812,
        dstPort: pkt.l4?.dstPort || 80,
        sequenceNumber: pkt.httpType === 'REQUEST' ? 1001 : 2048,
        ackNumber: pkt.httpType === 'REQUEST' ? 1 : 1120,
        flags: '0x018 (PSH, ACK)',
        windowSize: 65535,
      };
      l7 = {
        layer: 'Layer 7 — Application (HTTP/1.1)',
        methodOrStatus:
          pkt.httpType === 'REQUEST'
            ? `GET ${pkt.path || '/'} HTTP/1.1`
            : `${pkt.statusCode || '200 OK'} HTTP/1.1`,
        hostHeader: pkt.hostHeader || pkt.dstIp,
        contentType: 'text/html; charset=utf-8',
        bodyPreview:
          pkt.httpType === 'RESPONSE'
            ? pkt.responseBody || '<html><body><h1>200 OK</h1></body></html>'
            : '(Empty Request Body)',
      };
    } else if (pkt.protocol === 'DHCP') {
      l4 = {
        layer: 'Layer 4 — Transport (UDP)',
        srcPort: pkt.dhcpType === 'DISCOVER' ? 68 : 67,
        dstPort: pkt.dhcpType === 'DISCOVER' ? 67 : 68,
        length: '300 bytes',
      };
      l7 = {
        layer: 'Layer 7 — Application (DHCP)',
        messageType: pkt.dhcpType,
        clientMac: pkt.clientMac,
        offeredIp: pkt.offeredIp || '0.0.0.0',
        subnetMask: pkt.offeredMask || '0.0.0.0',
        routerGateway: pkt.offeredGateway || '0.0.0.0',
        dnsServer: pkt.offeredDns || '0.0.0.0',
      };
    }
  }

  return { l1, l2, l3, l4, l7 };
}

/**
 * Executes a full, authentic discrete-event network simulation for a user action
 * (Ping / ICMP, HTTP Request, DNS Query, DHCP Request, or Traceroute).
 *
 * Returns:
 * - events: Chronological list of SimulationEvents (each with full OSI inspection, device snapshots, and link animations)
 * - finalDevices: Mutated devices array (with updated ARP tables, Switch MAC tables, DHCP leases)
 * - summary: Overall outcome summary ({ success, protocol, statusText, failureReasonCode, failureDiagnosis, rttMs })
 */
export function runPacketSimulation({
  devices: initialDevices,
  links,
  sourceDeviceId,
  targetDeviceId,
  targetIpInput,
  protocol = 'ICMP', // 'ICMP' | 'HTTP' | 'DNS' | 'DHCP' | 'TRACEROUTE'
  initialTtl = 64,
  httpHost = '',
}) {
  // Clone devices so we can mutate ARP & MAC tables deterministically step-by-step
  const devicesMap = new Map();
  for (const d of cloneDeep(initialDevices)) {
    devicesMap.set(d.id, syncConnectedRoutes(d));
  }

  const events = [];
  let simTimeSec = 0.251; // Realistic millisecond timer matching reference UI
  let stepCounter = 0;

  const getDevice = (id) => devicesMap.get(id);

  const findDeviceByIp = (ip) => {
    for (const dev of devicesMap.values()) {
      for (const iface of dev.interfaces || []) {
        if (iface.ip === ip) {
          return { device: dev, interface: iface };
        }
      }
    }
    return null;
  };

  const recordEvent = ({
    protocolName,
    subType,
    lastDevice,
    lastInterfaceId,
    atDevice,
    atInterfaceId,
    linkId = null,
    status = 'in_transit', // 'in_transit' | 'delivered' | 'dropped' | 'info'
    dropReasonCode = null,
    dropDiagnostic = null,
    frame,
    decisions = [],
  }) => {
    simTimeSec = Number((simTimeSec + 0.001 + Math.random() * 0.0005).toFixed(3));
    const osiLayers = frame
      ? buildOsiLayers({
          frame,
          lastDevice,
          lastInterfaceId,
          atDevice,
          atInterfaceId,
        })
      : null;

    const snapshotDevices = {};
    for (const [id, d] of devicesMap.entries()) {
      snapshotDevices[id] = {
        arpTable: cloneDeep(d.arpTable || []),
        macTable: cloneDeep(d.macTable || []),
        routingTable: cloneDeep(d.routingTable || []),
        interfaces: cloneDeep(d.interfaces || []),
      };
    }

    const evt = {
      id: `evt-${stepCounter}`,
      stepIndex: stepCounter++,
      timeSec: simTimeSec.toFixed(3),
      protocol: protocolName,
      subType,
      lastDeviceId: lastDevice?.id || null,
      lastDeviceName: lastDevice ? lastDevice.name : '---',
      lastInterfaceId: lastInterfaceId || null,
      atDeviceId: atDevice?.id || null,
      atDeviceName: atDevice ? atDevice.name : '---',
      atInterfaceId: atInterfaceId || null,
      linkId,
      status,
      dropReasonCode,
      dropDiagnostic,
      osiLayers,
      decisions,
      snapshotDevices,
    };
    events.push(evt);
    return evt;
  };

  const sourceDevice = getDevice(sourceDeviceId);
  if (!sourceDevice) {
    return {
      events: [],
      finalDevices: initialDevices,
      summary: {
        success: false,
        protocol,
        statusText: 'Invalid source device.',
        failureReasonCode: 'DEVICE_NOT_FOUND',
        failureDiagnosis: 'Please select a valid source device.',
      },
    };
  }

  // Resolve target IP or hostname
  let targetIp = targetIpInput?.trim() || '';
  let targetHostname = '';

  if (!targetIp && targetDeviceId) {
    const tDev = getDevice(targetDeviceId);
    const activeIface =
      tDev?.interfaces?.find((i) => i.adminUp && isValidIpv4(i.ip)) ||
      tDev?.interfaces?.[0];
    targetIp = activeIface?.ip || '';
  }

  // Special case: DHCP Discover broadcast
  if (protocol === 'DHCP') {
    return runDhcpSimulation({
      devicesMap,
      links,
      sourceDevice,
      recordEvent,
      events,
    });
  }

  if (!isValidIpv4(targetIp)) {
    // User entered a hostname like 'netrunner.lab' or 'portal.internal' or target device has no IP
    if (targetIp && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(targetIp)) {
      targetHostname = targetIp;
    } else {
      const targetDev = targetDeviceId ? getDevice(targetDeviceId) : null;
      const diag = targetDev
        ? `Target device ${targetDev.name} does not have a valid IPv4 address assigned on its interface.`
        : `Invalid target IPv4 address or domain name: "${targetIp || 'empty'}".`;
      recordEvent({
        protocolName: protocol,
        subType: `${protocol} Init Failed`,
        lastDevice: null,
        atDevice: sourceDevice,
        atInterfaceId: sourceDevice.interfaces?.[0]?.id,
        status: 'dropped',
        dropReasonCode: 'INVALID_TARGET_IP',
        dropDiagnostic: diag,
        frame: null,
        decisions: [diag],
      });
      return {
        events,
        finalDevices: Array.from(devicesMap.values()),
        summary: {
          success: false,
          protocol,
          statusText: 'Destination IP Invalid',
          failureReasonCode: 'INVALID_TARGET_IP',
          failureDiagnosis: diag,
        },
      };
    }
  }

  /**
   * Propagates a Layer 2 Ethernet frame starting from (senderDevice, egressInterfaceId)
   * across switches/hubs until it reaches Layer 3 endpoint(s).
   * Returns a list of L3 deliveries: [{ device, interface, frame, lastHopDevice, lastHopInterfaceId, linkId }]
   */
  const propagateLayer2Frame = (senderDevice, egressInterfaceId, frame) => {
    const deliveries = [];
    const visitedSwitchPorts = new Set();

    const queue = [
      {
        fromDevice: senderDevice,
        fromInterfaceId: egressInterfaceId,
        currentFrame: cloneDeep(frame),
      },
    ];

    let safetyCount = 0;
    while (queue.length > 0 && safetyCount++ < 100) {
      const { fromDevice, fromInterfaceId, currentFrame } = queue.shift();
      const link = findConnectedLink(links, fromDevice.id, fromInterfaceId);
      if (!link || link.status === 'down') {
        recordEvent({
          protocolName: currentFrame.etherType === '0x0806' ? 'ARP' : currentFrame.payload.protocol,
          subType: 'Link Down Drop',
          lastDevice: fromDevice,
          lastInterfaceId: fromInterfaceId,
          atDevice: fromDevice,
          atInterfaceId: fromInterfaceId,
          status: 'dropped',
          dropReasonCode: 'LINK_DISCONNECTED',
          dropDiagnostic: `Link on ${fromDevice.name} (${fromInterfaceId}) is disconnected or down.`,
          frame: currentFrame,
          decisions: [`Physical link on ${fromInterfaceId} is down; frame dropped.`],
        });
        continue;
      }

      const peer = getPeerEndpoint(link, fromDevice.id, fromInterfaceId);
      if (!peer) continue;

      const rxDevice = getDevice(peer.deviceId);
      const rxInterface = rxDevice?.interfaces?.find(
        (i) => i.id === peer.interfaceId
      );
      if (!rxDevice || !rxInterface) continue;

      const visitKey = `${rxDevice.id}:${rxInterface.id}`;
      if (visitedSwitchPorts.has(visitKey)) continue;
      visitedSwitchPorts.add(visitKey);

      const protoLabel =
        currentFrame.etherType === '0x0806'
          ? 'ARP'
          : currentFrame.payload?.protocol || 'ICMP';
      const subTypeLabel =
        currentFrame.etherType === '0x0806'
          ? `ARP ${currentFrame.payload.arpType === 'REQUEST' ? 'Request' : 'Reply'}`
          : currentFrame.payload?.subType || protoLabel;

      if (!rxInterface.adminUp) {
        recordEvent({
          protocolName: protoLabel,
          subType: `${subTypeLabel} (Port Down)`,
          lastDevice: fromDevice,
          lastInterfaceId: fromInterfaceId,
          atDevice: rxDevice,
          atInterfaceId: rxInterface.id,
          linkId: link.id,
          status: 'dropped',
          dropReasonCode: 'INTERFACE_DOWN',
          dropDiagnostic: `Receiving interface ${rxInterface.name} on ${rxDevice.name} is administratively DOWN.`,
          frame: currentFrame,
          decisions: [
            `Frame arrived at ${rxDevice.name} (${rxInterface.name}), but interface is administratively DOWN. Dropped at Layer 1.`,
          ],
        });
        continue;
      }

      // Case 1: Hub (Layer 1 Repeater)
      if (rxDevice.type === DEVICE_TYPES.HUB) {
        const activeOtherPorts = rxDevice.interfaces.filter(
          (i) =>
            i.id !== rxInterface.id &&
            i.adminUp &&
            findConnectedLink(links, rxDevice.id, i.id)
        );
        recordEvent({
          protocolName: protoLabel,
          subType: subTypeLabel,
          lastDevice: fromDevice,
          lastInterfaceId: fromInterfaceId,
          atDevice: rxDevice,
          atInterfaceId: rxInterface.id,
          linkId: link.id,
          status: 'in_transit',
          frame: currentFrame,
          decisions: [
            `Layer 1 Hub ${rxDevice.name} received electrical signal on ${rxInterface.name}.`,
            `Repeating frame out ${activeOtherPorts.length} other active port(s): ${
              activeOtherPorts.map((p) => p.name).join(', ') || 'none'
            }.`,
          ],
        });

        for (const outPort of activeOtherPorts) {
          queue.push({
            fromDevice: rxDevice,
            fromInterfaceId: outPort.id,
            currentFrame: cloneDeep(currentFrame),
          });
        }
        continue;
      }

      // Case 2: Switch (Layer 2 MAC Learning & VLAN Switching)
      if (rxDevice.type === DEVICE_TYPES.SWITCH) {
        const ingressVlan =
          rxInterface.vlanMode === 'trunk'
            ? currentFrame.vlanId || 1
            : rxInterface.vlan || 1;
        currentFrame.vlanId = ingressVlan;

        const decisions = [
          `Frame received on ${rxInterface.name} (VLAN ${ingressVlan}).`,
        ];

        // Learn Source MAC in Switch CAM Table
        const existingMacIdx = rxDevice.macTable.findIndex(
          (entry) =>
            entry.mac.toUpperCase() === currentFrame.srcMac.toUpperCase() &&
            entry.vlan === ingressVlan
        );
        if (existingMacIdx >= 0) {
          rxDevice.macTable[existingMacIdx].interfaceId = rxInterface.id;
          rxDevice.macTable[existingMacIdx].updatedAt = simTimeSec.toFixed(3);
          decisions.push(
            `MAC Table refreshed: ${currentFrame.srcMac} -> ${rxInterface.id} (VLAN ${ingressVlan}).`
          );
        } else {
          rxDevice.macTable.push({
            mac: currentFrame.srcMac,
            interfaceId: rxInterface.id,
            vlan: ingressVlan,
            type: 'DYNAMIC',
            updatedAt: simTimeSec.toFixed(3),
          });
          decisions.push(
            `MAC Table learned new source MAC: ${currentFrame.srcMac} on port ${rxInterface.id} (VLAN ${ingressVlan}).`
          );
        }

        // Determine egress port(s)
        const isBroadcast = currentFrame.dstMac === BROADCAST_MAC;
        const macHit = !isBroadcast
          ? rxDevice.macTable.find(
              (entry) =>
                entry.mac.toUpperCase() === currentFrame.dstMac.toUpperCase() &&
                entry.vlan === ingressVlan
            )
          : null;

        let outPorts = [];
        if (macHit) {
          if (macHit.interfaceId === rxInterface.id) {
            decisions.push(
              `Destination MAC ${currentFrame.dstMac} is on ingress port ${rxInterface.id}; filtering frame.`
            );
          } else {
            const targetPort = rxDevice.interfaces.find(
              (i) => i.id === macHit.interfaceId && i.adminUp
            );
            if (targetPort) {
              outPorts = [targetPort];
              decisions.push(
                `Unicast MAC Table hit: ${currentFrame.dstMac} -> forwarding exclusively out ${targetPort.name}.`
              );
            }
          }
        } else {
          // Broadcast or Unknown Unicast flood within same VLAN
          outPorts = rxDevice.interfaces.filter((i) => {
            if (i.id === rxInterface.id || !i.adminUp) return false;
            if (!findConnectedLink(links, rxDevice.id, i.id)) return false;
            if (i.vlanMode === 'trunk') {
              return (i.allowedVlans || [1, 10, 20, 30, 99]).includes(ingressVlan);
            }
            return (i.vlan || 1) === ingressVlan;
          });
          decisions.push(
            isBroadcast
              ? `Destination MAC is Broadcast (${BROADCAST_MAC}). Flooding out all active VLAN ${ingressVlan} ports (${
                  outPorts.map((p) => p.id).join(', ') || 'none'
                }).`
              : `Destination MAC ${currentFrame.dstMac} unknown in CAM table. Flooding out all active VLAN ${ingressVlan} ports (${
                  outPorts.map((p) => p.id).join(', ') || 'none'
                }).`
          );
        }

        recordEvent({
          protocolName: protoLabel,
          subType: subTypeLabel,
          lastDevice: fromDevice,
          lastInterfaceId: fromInterfaceId,
          atDevice: rxDevice,
          atInterfaceId: rxInterface.id,
          linkId: link.id,
          status: 'in_transit',
          frame: currentFrame,
          decisions,
        });

        for (const outPort of outPorts) {
          queue.push({
            fromDevice: rxDevice,
            fromInterfaceId: outPort.id,
            currentFrame: cloneDeep(currentFrame),
          });
        }
        continue;
      }

      // Case 3: Layer 3 Device (End Host, Server, Router, Firewall, Cloud)
      deliveries.push({
        device: rxDevice,
        interface: rxInterface,
        frame: cloneDeep(currentFrame),
        lastHopDevice: fromDevice,
        lastHopInterfaceId: fromInterfaceId,
        linkId: link.id,
      });
    }

    return deliveries;
  };

  /**
   * Resolves ARP for nextHopIp out of (device, egressInterface).
   * If already in device.arpTable, returns the MAC immediately.
   * Otherwise broadcasts an ARP Request, processes L2 deliveries, updates ARP caches,
   * and sends the unicast ARP Reply back to requester.
   */
  const ensureArpResolution = (device, egressInterface, nextHopIp) => {
    const existingArp = (device.arpTable || []).find(
      (a) => a.ip === nextHopIp
    );
    if (existingArp) {
      return {
        resolvedMac: existingArp.mac,
        arpSucceeded: true,
      };
    }

    // Build ARP Request frame
    const arpReqFrame = {
      srcMac: egressInterface.mac,
      dstMac: BROADCAST_MAC,
      etherType: '0x0806',
      vlanId: egressInterface.vlan || 1,
      payload: {
        protocol: 'ARP',
        arpType: 'REQUEST',
        senderMac: egressInterface.mac,
        senderIp: egressInterface.ip,
        targetMac: '00:00:00:00:00:00',
        targetIp: nextHopIp,
      },
    };

    recordEvent({
      protocolName: 'ARP',
      subType: 'ARP Request',
      lastDevice: null,
      lastInterfaceId: null,
      atDevice: device,
      atInterfaceId: egressInterface.id,
      status: 'in_transit',
      frame: arpReqFrame,
      decisions: [
        `${device.name} needs MAC address for next-hop IP ${nextHopIp}, which is not in its ARP cache.`,
        `Holding IPv4 packet in ARP buffer and broadcasting ARP Request (Who has ${nextHopIp}? Tell ${egressInterface.ip}) out ${egressInterface.name}.`,
      ],
    });

    const l3Deliveries = propagateLayer2Frame(
      device,
      egressInterface.id,
      arpReqFrame
    );

    let replierDelivery = null;

    for (const delivery of l3Deliveries) {
      const {
        device: rxDev,
        interface: rxIface,
        lastHopDevice,
        lastHopInterfaceId,
        linkId,
      } = delivery;

      if (rxIface.ip === nextHopIp) {
        // Target matched! Check if rxIface considers senderIp on the same subnet
        const sameSub = isSameSubnet(
          rxIface.ip,
          egressInterface.ip,
          rxIface.cidr ?? rxIface.subnetMask
        );

        // Learn requester's MAC in target's ARP table
        const existingIdx = rxDev.arpTable.findIndex(
          (a) => a.ip === egressInterface.ip
        );
        if (existingIdx >= 0) {
          rxDev.arpTable[existingIdx].mac = egressInterface.mac;
        } else {
          rxDev.arpTable.push({
            ip: egressInterface.ip,
            mac: egressInterface.mac,
            interfaceId: rxIface.id,
            type: 'dynamic',
          });
        }

        if (!sameSub) {
          const rxSub = getSubnetDetails(
            rxIface.ip,
            rxIface.cidr ?? rxIface.subnetMask
          );
          const diag = `${rxDev.name} (${rxIface.ip}/${rxIface.cidr}) received ARP Request from ${egressInterface.ip}, but ${egressInterface.ip} is outside ${rxDev.name}'s configured subnet (${rxSub?.networkAddress}/${rxSub?.cidr}). Subnet mask mismatch prevented ARP reply!`;
          recordEvent({
            protocolName: 'ARP',
            subType: 'ARP Subnet Mismatch',
            lastDevice: lastHopDevice,
            lastInterfaceId: lastHopInterfaceId,
            atDevice: rxDev,
            atInterfaceId: rxIface.id,
            linkId,
            status: 'dropped',
            dropReasonCode: 'SUBNET_MISMATCH',
            dropDiagnostic: diag,
            frame: arpReqFrame,
            decisions: [diag],
          });
          return {
            resolvedMac: null,
            arpSucceeded: false,
            errorCode: 'SUBNET_MISMATCH',
            errorMessage: diag,
          };
        }

        recordEvent({
          protocolName: 'ARP',
          subType: 'ARP Request',
          lastDevice: lastHopDevice,
          lastInterfaceId: lastHopInterfaceId,
          atDevice: rxDev,
          atInterfaceId: rxIface.id,
          linkId,
          status: 'in_transit',
          frame: arpReqFrame,
          decisions: [
            `${rxDev.name} (${rxIface.name}) owns target IP ${nextHopIp}!`,
            `Learned ${egressInterface.ip} -> ${egressInterface.mac} in ${rxDev.name}'s ARP cache.`,
            `Generating unicast ARP Reply to ${egressInterface.ip} (${egressInterface.mac}).`,
          ],
        });
        replierDelivery = delivery;
      } else {
        // Non-target host ignores ARP request
        recordEvent({
          protocolName: 'ARP',
          subType: 'ARP Ignored',
          lastDevice: lastHopDevice,
          lastInterfaceId: lastHopInterfaceId,
          atDevice: rxDev,
          atInterfaceId: rxIface.id,
          linkId,
          status: 'info',
          frame: arpReqFrame,
          decisions: [
            `${rxDev.name} (${rxIface.ip || 'unassigned'}) inspected broadcast ARP Request for ${nextHopIp}: target IP does not match local interface. Frame discarded.`,
          ],
        });
      }
    }

    if (!replierDelivery) {
      // Check why nobody answered ARP: does any device in topology have nextHopIp on a different subnet or wrong VLAN?
      const ownerAnywhere = findDeviceByIp(nextHopIp);
      let detailedDiag = `ARP Request for ${nextHopIp} timed out: no device on the local broadcast domain responded.`;
      let reasonCode = 'ARP_TIMEOUT';

      if (ownerAnywhere) {
        const ownerDev = ownerAnywhere.device;
        const ownerIface = ownerAnywhere.interface;
        if (!ownerIface.adminUp) {
          detailedDiag = `ARP failed because ${ownerDev.name}'s interface ${ownerIface.name} (${nextHopIp}) is administratively DOWN.`;
          reasonCode = 'INTERFACE_DOWN';
        } else {
          detailedDiag = `ARP Request for ${nextHopIp} did not reach ${ownerDev.name} (${ownerIface.name}). Check physical cable connections, Switch VLAN assignments, or whether ${nextHopIp} is actually on a different router port/LAN.`;
        }
      } else {
        // Check if user was trying to reach a target device whose IP is outside sender's subnet or misconfigured
        const srcSub = getSubnetDetails(
          egressInterface.ip,
          egressInterface.cidr ?? egressInterface.subnetMask
        );
        detailedDiag = `No device on the local LAN owns IP ${nextHopIp} (Subnet ${srcSub?.networkAddress}/${srcSub?.cidr}, usable range ${srcSub?.firstUsableHost}–${srcSub?.lastUsableHost}). Verify the target IP address, subnet mask, or Default Gateway configuration.`;
      }

      recordEvent({
        protocolName: 'ARP',
        subType: 'ARP Timeout',
        lastDevice: device,
        lastInterfaceId: egressInterface.id,
        atDevice: device,
        atInterfaceId: egressInterface.id,
        status: 'dropped',
        dropReasonCode: reasonCode,
        dropDiagnostic: detailedDiag,
        frame: arpReqFrame,
        decisions: [detailedDiag],
      });

      return {
        resolvedMac: null,
        arpSucceeded: false,
        errorCode: reasonCode,
        errorMessage: detailedDiag,
      };
    }

    // Send unicast ARP Reply from replier back to requester
    const { device: replierDev, interface: replierIface } = replierDelivery;
    const arpReplyFrame = {
      srcMac: replierIface.mac,
      dstMac: egressInterface.mac,
      etherType: '0x0806',
      vlanId: replierIface.vlan || 1,
      payload: {
        protocol: 'ARP',
        arpType: 'REPLY',
        senderMac: replierIface.mac,
        senderIp: replierIface.ip,
        targetMac: egressInterface.mac,
        targetIp: egressInterface.ip,
      },
    };

    const replyDeliveries = propagateLayer2Frame(
      replierDev,
      replierIface.id,
      arpReplyFrame
    );

    const reachedRequester = replyDeliveries.find(
      (d) => d.device.id === device.id && d.interface.id === egressInterface.id
    );

    if (!reachedRequester) {
      const diag = `ARP Reply from ${replierDev.name} (${replierIface.ip}) could not reach ${device.name}.`;
      return {
        resolvedMac: null,
        arpSucceeded: false,
        errorCode: 'ARP_TIMEOUT',
        errorMessage: diag,
      };
    }

    // Update requester's ARP cache
    const reqArpIdx = device.arpTable.findIndex((a) => a.ip === nextHopIp);
    if (reqArpIdx >= 0) {
      device.arpTable[reqArpIdx].mac = replierIface.mac;
    } else {
      device.arpTable.push({
        ip: nextHopIp,
        mac: replierIface.mac,
        interfaceId: egressInterface.id,
        type: 'dynamic',
      });
    }

    recordEvent({
      protocolName: 'ARP',
      subType: 'ARP Reply',
      lastDevice: reachedRequester.lastHopDevice,
      lastInterfaceId: reachedRequester.lastHopInterfaceId,
      atDevice: device,
      atInterfaceId: egressInterface.id,
      linkId: reachedRequester.linkId,
      status: 'in_transit',
      frame: arpReplyFrame,
      decisions: [
        `${device.name} received ARP Reply: ${nextHopIp} is at ${replierIface.mac}.`,
        `Updated ARP cache on ${device.name} and releasing queued IPv4 packet.`,
      ],
    });

    return {
      resolvedMac: replierIface.mac,
      arpSucceeded: true,
    };
  };

  /**
   * Sends a single IPv4 packet from (originDevice) to (packet.dstIp) across as many L3 router hops as needed.
   * Returns { delivered: boolean, receivingDevice, receivingInterface, errorCode, errorMessage }
   */
  const transmitIpv4Packet = (originDevice, packet) => {
    let currentL3Device = originDevice;
    let currentPacket = cloneDeep(packet);
    let hopCount = 0;

    while (hopCount++ < 16) {
      // Check outbound firewall on originating host (hop 1) or forward ACL on router
      const aclDirection = hopCount === 1 ? 'outbound' : 'forward';
      const fwCheck = evaluateFirewallRules(
        currentL3Device,
        currentPacket,
        aclDirection
      );
      if (!fwCheck.allowed) {
        const ruleName = fwCheck.matchedRule?.name || fwCheck.matchedRule?.id || 'ACL Rule';
        const diag = `Firewall on ${currentL3Device.name} blocked ${currentPacket.protocol} packet (${currentPacket.srcIp} -> ${currentPacket.dstIp}) via rule "${ruleName}" (${fwCheck.matchedRule?.action} ${fwCheck.matchedRule?.protocol}).`;
        recordEvent({
          protocolName: currentPacket.protocol,
          subType: `${currentPacket.subType} (Blocked)`,
          lastDevice: currentL3Device,
          atDevice: currentL3Device,
          status: 'dropped',
          dropReasonCode: 'FIREWALL_BLOCKED',
          dropDiagnostic: diag,
          frame: {
            srcMac: currentL3Device.interfaces?.[0]?.mac || '00:00:00:00:00:00',
            dstMac: '00:00:00:00:00:00',
            etherType: '0x0800',
            payload: currentPacket,
          },
          decisions: [diag],
        });
        return {
          delivered: false,
          errorCode: 'FIREWALL_BLOCKED',
          errorMessage: diag,
        };
      }

      // Resolve Layer 3 Egress Interface & Next-Hop IP
      const routeResult = resolveLayer3Egress(
        currentL3Device,
        currentPacket.dstIp,
        links
      );

      if (routeResult.errorCode) {
        // Check if this is a subtle subnet mismatch between source and target on the same LAN!
        let enhancedDiag = routeResult.errorMessage;
        let finalCode = routeResult.errorCode;

        if (routeResult.errorCode === 'NO_DEFAULT_GATEWAY') {
          const targetOwner = findDeviceByIp(currentPacket.dstIp);
          if (targetOwner) {
            const srcIface = currentL3Device.interfaces?.[0];
            const srcSub = getSubnetDetails(srcIface?.ip, srcIface?.cidr);
            enhancedDiag = `${currentL3Device.name} (${srcIface?.ip}/${srcIface?.cidr}) determined that ${currentPacket.dstIp} (${targetOwner.device.name}) is in a DIFFERENT subnet (local subnet range is ${srcSub?.networkAddress} – ${srcSub?.broadcastAddress}). Because ${currentL3Device.name} has no Default Gateway configured—or has an incorrect IP/Subnet Mask—the packet cannot be sent.`;
            finalCode = 'SUBNET_MISMATCH';
          }
        }

        recordEvent({
          protocolName: currentPacket.protocol,
          subType: `${currentPacket.subType} (Drop)`,
          lastDevice: null,
          atDevice: currentL3Device,
          atInterfaceId: routeResult.interface?.id || currentL3Device.interfaces?.[0]?.id,
          status: 'dropped',
          dropReasonCode: finalCode,
          dropDiagnostic: enhancedDiag,
          frame: {
            srcMac:
              routeResult.interface?.mac ||
              currentL3Device.interfaces?.[0]?.mac ||
              '00:00:00:00:00:00',
            dstMac: '00:00:00:00:00:00',
            etherType: '0x0800',
            payload: currentPacket,
          },
          decisions: [enhancedDiag],
        });

        return {
          delivered: false,
          errorCode: finalCode,
          errorMessage: enhancedDiag,
        };
      }

      const { egressInterface, nextHopIp, decision: routeDecision } = routeResult;

      // Ensure source IP is set on hop 1
      if (hopCount === 1 && !currentPacket.srcIp) {
        currentPacket.srcIp = egressInterface.ip;
      }

      // Resolve next-hop MAC via ARP
      const arpResult = ensureArpResolution(
        currentL3Device,
        egressInterface,
        nextHopIp
      );
      if (!arpResult.arpSucceeded) {
        return {
          delivered: false,
          errorCode: arpResult.errorCode || 'ARP_TIMEOUT',
          errorMessage: arpResult.errorMessage,
        };
      }

      const ipv4Frame = {
        srcMac: egressInterface.mac,
        dstMac: arpResult.resolvedMac,
        etherType: '0x0800',
        vlanId: egressInterface.vlan || 1,
        payload: cloneDeep(currentPacket),
      };

      if (hopCount === 1) {
        recordEvent({
          protocolName: currentPacket.protocol,
          subType: currentPacket.subType,
          lastDevice: null,
          atDevice: currentL3Device,
          atInterfaceId: egressInterface.id,
          status: 'in_transit',
          frame: ipv4Frame,
          decisions: [
            routeDecision,
            `ARP cache hit: next-hop ${nextHopIp} -> ${arpResult.resolvedMac}.`,
            `Encapsulating IPv4 packet (${currentPacket.srcIp} -> ${currentPacket.dstIp}, TTL=${currentPacket.ttl}) in Ethernet II frame and transmitting out ${egressInterface.name}.`,
          ],
        });
      }

      // Propagate across Layer 2 to next Layer 3 interface
      const l3Deliveries = propagateLayer2Frame(
        currentL3Device,
        egressInterface.id,
        ipv4Frame
      );

      const matchingL3Delivery = l3Deliveries.find(
        (d) =>
          d.interface.mac.toUpperCase() === arpResult.resolvedMac.toUpperCase() ||
          d.frame.dstMac === BROADCAST_MAC
      );

      if (!matchingL3Delivery) {
        const diag = `Frame addressed to MAC ${arpResult.resolvedMac} (${nextHopIp}) was lost in transit across Layer 2.`;
        return {
          delivered: false,
          errorCode: 'L2_DELIVERY_FAILED',
          errorMessage: diag,
        };
      }

      const {
        device: arrivedDevice,
        interface: arrivedInterface,
        lastHopDevice,
        lastHopInterfaceId,
        linkId,
      } = matchingL3Delivery;

      // Check inbound Firewall on arrivedDevice
      const inboundFw = evaluateFirewallRules(
        arrivedDevice,
        currentPacket,
        'inbound'
      );
      if (!inboundFw.allowed) {
        const ruleName =
          inboundFw.matchedRule?.name || inboundFw.matchedRule?.id || 'ACL Rule';
        const diag = `Inbound Firewall on ${arrivedDevice.name} (${arrivedInterface.name}) dropped ${currentPacket.protocol} packet (${currentPacket.srcIp} -> ${currentPacket.dstIp}) matching rule "${ruleName}".`;
        recordEvent({
          protocolName: currentPacket.protocol,
          subType: `${currentPacket.subType} (Firewall Drop)`,
          lastDevice: lastHopDevice,
          lastInterfaceId: lastHopInterfaceId,
          atDevice: arrivedDevice,
          atInterfaceId: arrivedInterface.id,
          linkId,
          status: 'dropped',
          dropReasonCode: 'FIREWALL_BLOCKED',
          dropDiagnostic: diag,
          frame: ipv4Frame,
          decisions: [diag],
        });
        return {
          delivered: false,
          errorCode: 'FIREWALL_BLOCKED',
          errorMessage: diag,
        };
      }

      // Does arrivedDevice own currentPacket.dstIp on ANY of its active interfaces?
      const ownsDestinationIp = arrivedDevice.interfaces.some(
        (i) => i.adminUp && i.ip === currentPacket.dstIp
      );

      if (ownsDestinationIp) {
        recordEvent({
          protocolName: currentPacket.protocol,
          subType: currentPacket.subType,
          lastDevice: lastHopDevice,
          lastInterfaceId: lastHopInterfaceId,
          atDevice: arrivedDevice,
          atInterfaceId: arrivedInterface.id,
          linkId,
          status:
            currentPacket.isFinalResponse ? 'delivered' : 'in_transit',
          frame: ipv4Frame,
          decisions: [
            `${arrivedDevice.name} received frame on ${arrivedInterface.name}.`,
            `Destination MAC matches ${arrivedInterface.mac}; decapsulating Ethernet II header.`,
            `Destination IP ${currentPacket.dstIp} matches local interface. Passing packet up to ${currentPacket.protocol} stack.`,
          ],
        });

        return {
          delivered: true,
          receivingDevice: arrivedDevice,
          receivingInterface: arrivedInterface,
        };
      }

      // Packet arrived at a device that does NOT own dstIp — check if it can route (Router/Firewall/Cloud)
      const canRoute = [
        DEVICE_TYPES.ROUTER,
        DEVICE_TYPES.FIREWALL,
        DEVICE_TYPES.CLOUD,
      ].includes(arrivedDevice.type);

      if (!canRoute) {
        const diag = `${arrivedDevice.name} received packet for ${currentPacket.dstIp}, which is not its IP (${arrivedInterface.ip}), and ${arrivedDevice.name} is an end-host with IP forwarding disabled.`;
        recordEvent({
          protocolName: currentPacket.protocol,
          subType: 'Misrouted Drop',
          lastDevice: lastHopDevice,
          lastInterfaceId: lastHopInterfaceId,
          atDevice: arrivedDevice,
          atInterfaceId: arrivedInterface.id,
          linkId,
          status: 'dropped',
          dropReasonCode: 'NOT_A_ROUTER',
          dropDiagnostic: diag,
          frame: ipv4Frame,
          decisions: [diag],
        });
        return {
          delivered: false,
          errorCode: 'NOT_A_ROUTER',
          errorMessage: diag,
        };
      }

      // Router decrements TTL
      currentPacket.ttl = (currentPacket.ttl || 64) - 1;
      if (currentPacket.ttl <= 0) {
        const diag = `TTL expired in transit at router ${arrivedDevice.name} (${arrivedInterface.name}) while forwarding toward ${currentPacket.dstIp}.`;
        recordEvent({
          protocolName: 'ICMP',
          subType: 'ICMP Time Exceeded (TTL=0)',
          lastDevice: lastHopDevice,
          lastInterfaceId: lastHopInterfaceId,
          atDevice: arrivedDevice,
          atInterfaceId: arrivedInterface.id,
          linkId,
          status: 'dropped',
          dropReasonCode: 'TTL_EXCEEDED',
          dropDiagnostic: diag,
          frame: ipv4Frame,
          decisions: [
            `${arrivedDevice.name} decremented IPv4 TTL to 0.`,
            diag,
          ],
        });
        return {
          delivered: false,
          errorCode: 'TTL_EXCEEDED',
          errorMessage: diag,
          hopRouter: arrivedDevice,
          hopInterface: arrivedInterface,
        };
      }

      recordEvent({
        protocolName: currentPacket.protocol,
        subType: `${currentPacket.subType} (Routed)`,
        lastDevice: lastHopDevice,
        lastInterfaceId: lastHopInterfaceId,
        atDevice: arrivedDevice,
        atInterfaceId: arrivedInterface.id,
        linkId,
        status: 'in_transit',
        frame: ipv4Frame,
        decisions: [
          `Router ${arrivedDevice.name} received packet for ${currentPacket.dstIp} on ${arrivedInterface.name}.`,
          `Decremented IPv4 TTL to ${currentPacket.ttl} and recomputed header checksum.`,
          `Consulting routing table on ${arrivedDevice.name} for next hop...`,
        ],
      });

      currentL3Device = arrivedDevice;
    }

    return {
      delivered: false,
      errorCode: 'ROUTING_LOOP',
      errorMessage: 'Maximum hop count exceeded (possible routing loop).',
    };
  };

  // Step 0: If user entered a domain name or selected DNS protocol, resolve via DNS Server first!
  if (targetHostname || protocol === 'DNS') {
    const queryHost = targetHostname || httpHost || 'netrunner.lab';
    const dnsServerIp =
      sourceDevice.dnsServer ||
      (protocol === 'DNS' && isValidIpv4(targetIp) ? targetIp : '');

    if (!isValidIpv4(dnsServerIp)) {
      const diag = `${sourceDevice.name} cannot resolve domain "${queryHost}" because no valid DNS Server IP is configured on ${sourceDevice.name}.`;
      recordEvent({
        protocolName: 'DNS',
        subType: 'DNS Config Error',
        lastDevice: null,
        atDevice: sourceDevice,
        atInterfaceId: sourceDevice.interfaces?.[0]?.id,
        status: 'dropped',
        dropReasonCode: 'NO_DNS_SERVER',
        dropDiagnostic: diag,
        frame: null,
        decisions: [diag],
      });
      return {
        events,
        finalDevices: Array.from(devicesMap.values()),
        summary: {
          success: false,
          protocol: 'DNS',
          statusText: 'Missing DNS Server IP',
          failureReasonCode: 'NO_DNS_SERVER',
          failureDiagnosis: diag,
        },
      };
    }

    const dnsQueryPkt = {
      protocol: 'DNS',
      subType: `DNS Query (${queryHost})`,
      dnsType: 'QUERY',
      hostname: queryHost,
      srcIp: sourceDevice.interfaces?.[0]?.ip,
      dstIp: dnsServerIp,
      ttl: initialTtl,
      l4: { protocol: 'UDP', srcPort: 54120, dstPort: 53 },
    };

    const dnsTx = transmitIpv4Packet(sourceDevice, dnsQueryPkt);
    if (!dnsTx.delivered) {
      return {
        events,
        finalDevices: Array.from(devicesMap.values()),
        summary: {
          success: false,
          protocol: 'DNS',
          statusText: `DNS Query Failed: ${dnsTx.errorCode}`,
          failureReasonCode: dnsTx.errorCode,
          failureDiagnosis: dnsTx.errorMessage,
        },
      };
    }

    const dnsServerDev = dnsTx.receivingDevice;
    if (!dnsServerDev.services?.dns?.enabled) {
      const diag = `${dnsServerDev.name} (${dnsServerIp}) received DNS Query, but the DNS Server service is disabled on ${dnsServerDev.name}.`;
      recordEvent({
        protocolName: 'DNS',
        subType: 'DNS Service Down',
        lastDevice: dnsServerDev,
        atDevice: dnsServerDev,
        status: 'dropped',
        dropReasonCode: 'SERVICE_DOWN',
        dropDiagnostic: diag,
        frame: null,
        decisions: [diag],
      });
      return {
        events,
        finalDevices: Array.from(devicesMap.values()),
        summary: {
          success: false,
          protocol: 'DNS',
          statusText: 'DNS Service Disabled',
          failureReasonCode: 'SERVICE_DOWN',
          failureDiagnosis: diag,
        },
      };
    }

    const recordHit = (dnsServerDev.services.dns.records || []).find(
      (r) => r.hostname.toLowerCase() === queryHost.toLowerCase()
    );

    const dnsReplyPkt = {
      protocol: 'DNS',
      subType: recordHit
        ? `DNS Response (${recordHit.ip})`
        : 'DNS NXDOMAIN',
      dnsType: 'RESPONSE',
      hostname: queryHost,
      resolvedIp: recordHit?.ip || null,
      srcIp: dnsServerIp,
      dstIp: sourceDevice.interfaces?.[0]?.ip,
      ttl: 64,
      isFinalResponse: protocol === 'DNS',
      l4: { protocol: 'UDP', srcPort: 53, dstPort: 54120 },
    };

    const dnsReplyTx = transmitIpv4Packet(dnsServerDev, dnsReplyPkt);
    if (!dnsReplyTx.delivered || !recordHit) {
      const diag = !recordHit
        ? `DNS Server ${dnsServerDev.name} returned NXDOMAIN: no A-record found for "${queryHost}".`
        : dnsReplyTx.errorMessage;
      return {
        events,
        finalDevices: Array.from(devicesMap.values()),
        summary: {
          success: false,
          protocol: 'DNS',
          statusText: !recordHit ? `NXDOMAIN (${queryHost})` : 'DNS Reply Lost',
          failureReasonCode: !recordHit ? 'DNS_NXDOMAIN' : dnsReplyTx.errorCode,
          failureDiagnosis: diag,
        },
      };
    }

    targetIp = recordHit.ip;
    if (protocol === 'DNS') {
      return {
        events,
        finalDevices: Array.from(devicesMap.values()),
        summary: {
          success: true,
          protocol: 'DNS',
          statusText: `Resolved ${queryHost} -> ${targetIp}`,
          failureReasonCode: null,
          failureDiagnosis: null,
          rttMs: Math.round((simTimeSec - 0.251) * 1000),
        },
      };
    }
  }

  // Case: TRACEROUTE (iterative TTL=1, 2, 3... up to destination)
  if (protocol === 'TRACEROUTE') {
    let reachedDest = false;
    for (let ttl = 1; ttl <= 8 && !reachedDest; ttl++) {
      const probePkt = {
        protocol: 'ICMP',
        subType: `Traceroute Probe (TTL=${ttl})`,
        icmpType: 'ECHO_REQUEST',
        seq: ttl,
        srcIp: sourceDevice.interfaces?.[0]?.ip,
        dstIp: targetIp,
        ttl,
        l4: { protocol: 'ICMP', srcPort: 0, dstPort: 0 },
      };
      const tx = transmitIpv4Packet(sourceDevice, probePkt);
      if (tx.delivered) {
        reachedDest = true;
        const replyPkt = {
          protocol: 'ICMP',
          subType: `ICMP Echo Reply (Hop ${ttl})`,
          icmpType: 'ECHO_REPLY',
          seq: ttl,
          srcIp: targetIp,
          dstIp: sourceDevice.interfaces?.[0]?.ip,
          ttl: 64,
          isFinalResponse: true,
          l4: { protocol: 'ICMP', srcPort: 0, dstPort: 0 },
        };
        const rep = transmitIpv4Packet(tx.receivingDevice, replyPkt);
        if (!rep.delivered) {
          return {
            events,
            finalDevices: Array.from(devicesMap.values()),
            summary: {
              success: false,
              protocol: 'TRACEROUTE',
              statusText: `Return path failed: ${rep.errorCode}`,
              failureReasonCode: rep.errorCode,
              failureDiagnosis: rep.errorMessage,
            },
          };
        }
      } else if (tx.errorCode === 'TTL_EXCEEDED' && tx.hopRouter) {
        // Router sends ICMP Time Exceeded back to source
        const timeExPkt = {
          protocol: 'ICMP',
          subType: `ICMP Time Exceeded (from ${tx.hopRouter.name})`,
          icmpType: 'TIME_EXCEEDED',
          seq: ttl,
          srcIp: tx.hopInterface?.ip || tx.hopRouter.interfaces?.[0]?.ip,
          dstIp: sourceDevice.interfaces?.[0]?.ip,
          ttl: 64,
          l4: { protocol: 'ICMP', srcPort: 0, dstPort: 0 },
        };
        transmitIpv4Packet(tx.hopRouter, timeExPkt);
      } else {
        return {
          events,
          finalDevices: Array.from(devicesMap.values()),
          summary: {
            success: false,
            protocol: 'TRACEROUTE',
            statusText: `Traceroute Failed at TTL=${ttl}: ${tx.errorCode}`,
            failureReasonCode: tx.errorCode,
            failureDiagnosis: tx.errorMessage,
          },
        };
      }
    }

    return {
      events,
      finalDevices: Array.from(devicesMap.values()),
      summary: {
        success: reachedDest,
        protocol: 'TRACEROUTE',
        statusText: reachedDest
          ? `Traceroute completed to ${targetIp}`
          : 'Destination unreachable within hop limit',
        failureReasonCode: reachedDest ? null : 'TTL_EXCEEDED',
        failureDiagnosis: null,
        rttMs: Math.round((simTimeSec - 0.251) * 1000),
      },
    };
  }

  // Case: HTTP GET Request & Response
  if (protocol === 'HTTP') {
    const httpReqPkt = {
      protocol: 'HTTP',
      subType: 'HTTP GET /',
      httpType: 'REQUEST',
      path: '/',
      hostHeader: targetHostname || httpHost || targetIp,
      srcIp: sourceDevice.interfaces?.[0]?.ip,
      dstIp: targetIp,
      ttl: initialTtl,
      l4: { protocol: 'TCP', srcPort: 49812, dstPort: 80 },
    };

    const reqTx = transmitIpv4Packet(sourceDevice, httpReqPkt);
    if (!reqTx.delivered) {
      return {
        events,
        finalDevices: Array.from(devicesMap.values()),
        summary: {
          success: false,
          protocol: 'HTTP',
          statusText: `HTTP Request Failed: ${reqTx.errorCode}`,
          failureReasonCode: reqTx.errorCode,
          failureDiagnosis: reqTx.errorMessage,
        },
      };
    }

    const webServer = reqTx.receivingDevice;
    if (!webServer.services?.http?.enabled) {
      const diag = `${webServer.name} (${targetIp}) rejected TCP port 80 connection because the HTTP Web Server daemon is not enabled on ${webServer.name}.`;
      recordEvent({
        protocolName: 'HTTP',
        subType: 'TCP RST (Port 80 Closed)',
        lastDevice: webServer,
        atDevice: webServer,
        status: 'dropped',
        dropReasonCode: 'SERVICE_DOWN',
        dropDiagnostic: diag,
        frame: null,
        decisions: [diag],
      });
      return {
        events,
        finalDevices: Array.from(devicesMap.values()),
        summary: {
          success: false,
          protocol: 'HTTP',
          statusText: 'Connection Refused (HTTP Disabled)',
          failureReasonCode: 'SERVICE_DOWN',
          failureDiagnosis: diag,
        },
      };
    }

    const httpRespPkt = {
      protocol: 'HTTP',
      subType: 'HTTP 200 OK',
      httpType: 'RESPONSE',
      statusCode: '200 OK',
      responseBody:
        webServer.services.http.responseBody ||
        '<html><body><h1>200 OK</h1></body></html>',
      srcIp: targetIp,
      dstIp: sourceDevice.interfaces?.[0]?.ip,
      ttl: 64,
      isFinalResponse: true,
      l4: { protocol: 'TCP', srcPort: 80, dstPort: 49812 },
    };

    const respTx = transmitIpv4Packet(webServer, httpRespPkt);
    if (!respTx.delivered) {
      return {
        events,
        finalDevices: Array.from(devicesMap.values()),
        summary: {
          success: false,
          protocol: 'HTTP',
          statusText: `HTTP Response Failed: ${respTx.errorCode}`,
          failureReasonCode: respTx.errorCode,
          failureDiagnosis: respTx.errorMessage,
        },
      };
    }

    return {
      events,
      finalDevices: Array.from(devicesMap.values()),
      summary: {
        success: true,
        protocol: 'HTTP',
        statusText: `HTTP 200 OK from ${webServer.name} (${targetIp})`,
        failureReasonCode: null,
        failureDiagnosis: null,
        rttMs: Math.max(1, Math.round((simTimeSec - 0.251) * 1000)),
      },
    };
  }

  // Default Case: ICMP Echo Request & Echo Reply (Ping)
  const echoReqPkt = {
    protocol: 'ICMP',
    subType: 'ICMP Echo Request',
    icmpType: 'ECHO_REQUEST',
    seq: 1,
    srcIp: sourceDevice.interfaces?.[0]?.ip,
    dstIp: targetIp,
    ttl: initialTtl,
    l4: { protocol: 'ICMP', srcPort: 0, dstPort: 0 },
  };

  const reqTx = transmitIpv4Packet(sourceDevice, echoReqPkt);
  if (!reqTx.delivered) {
    return {
      events,
      finalDevices: Array.from(devicesMap.values()),
      summary: {
        success: false,
        protocol: 'ICMP',
        statusText: `Ping Failed (${reqTx.errorCode})`,
        failureReasonCode: reqTx.errorCode,
        failureDiagnosis: reqTx.errorMessage,
      },
    };
  }

  const destDevice = reqTx.receivingDevice;
  const echoReplyPkt = {
    protocol: 'ICMP',
    subType: 'ICMP Echo Reply',
    icmpType: 'ECHO_REPLY',
    seq: 1,
    srcIp: targetIp,
    dstIp: sourceDevice.interfaces?.[0]?.ip,
    ttl: 64,
    isFinalResponse: true,
    l4: { protocol: 'ICMP', srcPort: 0, dstPort: 0 },
  };

  const replyTx = transmitIpv4Packet(destDevice, echoReplyPkt);
  if (!replyTx.delivered) {
    return {
      events,
      finalDevices: Array.from(devicesMap.values()),
      summary: {
        success: false,
        protocol: 'ICMP',
        statusText: `Echo Reply Dropped (${replyTx.errorCode})`,
        failureReasonCode: replyTx.errorCode,
        failureDiagnosis: `Echo Request reached ${destDevice.name} (${targetIp}), but the return Echo Reply failed: ${replyTx.errorMessage}`,
      },
    };
  }

  return {
    events,
    finalDevices: Array.from(devicesMap.values()),
    summary: {
      success: true,
      protocol: 'ICMP',
      statusText: `Echo Reply from ${destDevice.name} (${targetIp}) — 0% packet loss`,
      failureReasonCode: null,
      failureDiagnosis: null,
      rttMs: Math.max(1, Math.round((simTimeSec - 0.251) * 1000)),
    },
  };
}

/**
 * Simulates DHCP DORA (Discover -> Offer -> Request -> ACK) to dynamically assign an IPv4 lease.
 */
function runDhcpSimulation({
  devicesMap,
  links,
  sourceDevice,
  recordEvent,
  events,
}) {
  const clientIface = sourceDevice.interfaces?.[0];
  if (!clientIface || !clientIface.adminUp) {
    const diag = `${sourceDevice.name} cannot send DHCP Discover because interface ${
      clientIface?.name || 'eth0'
    } is DOWN.`;
    recordEvent({
      protocolName: 'DHCP',
      subType: 'DHCP Failed',
      lastDevice: null,
      atDevice: sourceDevice,
      status: 'dropped',
      dropReasonCode: 'INTERFACE_DOWN',
      dropDiagnostic: diag,
      frame: null,
      decisions: [diag],
    });
    return {
      events,
      finalDevices: Array.from(devicesMap.values()),
      summary: {
        success: false,
        protocol: 'DHCP',
        statusText: 'Interface Down',
        failureReasonCode: 'INTERFACE_DOWN',
        failureDiagnosis: diag,
      },
    };
  }

  // Find a DHCP-enabled server in the topology
  let dhcpServer = null;
  for (const dev of devicesMap.values()) {
    if (dev.services?.dhcp?.enabled) {
      dhcpServer = dev;
      break;
    }
  }

  const discoverFrame = {
    srcMac: clientIface.mac,
    dstMac: BROADCAST_MAC,
    etherType: '0x0800',
    vlanId: clientIface.vlan || 1,
    payload: {
      protocol: 'DHCP',
      subType: 'DHCP Discover',
      dhcpType: 'DISCOVER',
      clientMac: clientIface.mac,
      srcIp: '0.0.0.0',
      dstIp: '255.255.255.255',
      ttl: 64,
    },
  };

  recordEvent({
    protocolName: 'DHCP',
    subType: 'DHCP Discover',
    lastDevice: null,
    atDevice: sourceDevice,
    atInterfaceId: clientIface.id,
    status: 'in_transit',
    frame: discoverFrame,
    decisions: [
      `${sourceDevice.name} broadcasting DHCPDISCOVER (0.0.0.0:68 -> 255.255.255.255:67) to request an IPv4 address lease.`,
    ],
  });

  if (!dhcpServer) {
    const diag =
      'No active DHCP Server responded on the broadcast domain. Enable the DHCP service on a Server or configure a static IP.';
    recordEvent({
      protocolName: 'DHCP',
      subType: 'DHCP Timeout',
      lastDevice: sourceDevice,
      atDevice: sourceDevice,
      status: 'dropped',
      dropReasonCode: 'NO_DHCP_SERVER',
      dropDiagnostic: diag,
      frame: discoverFrame,
      decisions: [diag],
    });
    return {
      events,
      finalDevices: Array.from(devicesMap.values()),
      summary: {
        success: false,
        protocol: 'DHCP',
        statusText: 'No DHCP Server Found',
        failureReasonCode: 'NO_DHCP_SERVER',
        failureDiagnosis: diag,
      },
    };
  }

  const pool = dhcpServer.services.dhcp;
  const baseParts = (pool.poolStart || '192.168.1.100').split('.').map(Number);
  const leaseOffset = (pool.leases?.length || 0) + 1;
  const assignedIp = `${baseParts[0]}.${baseParts[1]}.${baseParts[2]}.${Math.min(
    250,
    baseParts[3] + leaseOffset
  )}`;

  clientIface.ip = assignedIp;
  clientIface.cidr = pool.cidr || 24;
  clientIface.subnetMask = pool.subnetMask || '255.255.255.0';
  sourceDevice.defaultGateway = pool.defaultGateway || '';
  sourceDevice.dnsServer = pool.dnsServer || '';

  const ackFrame = {
    srcMac: dhcpServer.interfaces?.[0]?.mac || '00:16:3E:00:00:01',
    dstMac: clientIface.mac,
    etherType: '0x0800',
    vlanId: clientIface.vlan || 1,
    payload: {
      protocol: 'DHCP',
      subType: `DHCP ACK (${assignedIp})`,
      dhcpType: 'ACK',
      clientMac: clientIface.mac,
      offeredIp: assignedIp,
      offeredMask: clientIface.subnetMask,
      offeredGateway: sourceDevice.defaultGateway,
      offeredDns: sourceDevice.dnsServer,
      srcIp: dhcpServer.interfaces?.[0]?.ip || '192.168.1.10',
      dstIp: assignedIp,
      ttl: 64,
    },
  };

  recordEvent({
    protocolName: 'DHCP',
    subType: `DHCP ACK (${assignedIp})`,
    lastDevice: dhcpServer,
    lastInterfaceId: dhcpServer.interfaces?.[0]?.id,
    atDevice: sourceDevice,
    atInterfaceId: clientIface.id,
    status: 'delivered',
    frame: ackFrame,
    decisions: [
      `DHCP Server ${dhcpServer.name} allocated lease ${assignedIp}/${clientIface.cidr} to ${sourceDevice.name}.`,
      `Configured Default Gateway: ${sourceDevice.defaultGateway || 'None'}, DNS: ${sourceDevice.dnsServer || 'None'}.`,
    ],
  });

  return {
    events,
    finalDevices: Array.from(devicesMap.values()),
    summary: {
      success: true,
      protocol: 'DHCP',
      statusText: `DHCP Lease Assigned: ${assignedIp}/${clientIface.cidr}`,
      failureReasonCode: null,
      failureDiagnosis: null,
      rttMs: 12,
    },
  };
}
