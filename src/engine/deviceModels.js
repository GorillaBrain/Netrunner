import {
  generateMac,
  getSubnetDetails,
  isValidIpv4,
  normalizeMask,
} from './ipUtils.js';

export const DEVICE_TYPES = {
  PC: 'pc',
  LAPTOP: 'laptop',
  SMARTPHONE: 'smartphone',
  SERVER: 'server',
  SWITCH: 'switch',
  HUB: 'hub',
  ROUTER: 'router',
  FIREWALL: 'firewall',
  CLOUD: 'cloud',
};

export const DEVICE_CATALOG = [
  {
    type: DEVICE_TYPES.PC,
    category: 'end',
    label: 'Desktop PC',
    shortName: 'PC',
    description: 'Workstation end-host with Ethernet interface, ARP cache, and TCP/IP stack.',
  },
  {
    type: DEVICE_TYPES.LAPTOP,
    category: 'end',
    label: 'Laptop',
    shortName: 'Laptop',
    description: 'Portable host with full IPv4 networking, ping, traceroute, and HTTP/DNS client.',
  },
  {
    type: DEVICE_TYPES.SMARTPHONE,
    category: 'end',
    label: 'Smartphone',
    shortName: 'Phone',
    description: 'Mobile endpoint capable of DHCP, DNS, ICMP, and HTTP traffic simulation.',
  },
  {
    type: DEVICE_TYPES.SERVER,
    category: 'end',
    label: 'Server',
    shortName: 'Server',
    description: 'Multi-service host running configurable HTTP, DNS, and DHCP server daemons.',
  },
  {
    type: DEVICE_TYPES.ROUTER,
    category: 'network',
    label: 'Router',
    shortName: 'Router',
    description: 'Layer 3 router with 4 routed interfaces, ARP table, LPM routing table, and ACLs.',
  },
  {
    type: DEVICE_TYPES.SWITCH,
    category: 'network',
    label: 'Ethernet Switch',
    shortName: 'Switch',
    description: 'Layer 2 8-port managed switch with MAC learning (CAM table) and VLAN support.',
  },
  {
    type: DEVICE_TYPES.HUB,
    category: 'network',
    label: 'Ethernet Hub',
    shortName: 'Hub',
    description: 'Layer 1 multi-port repeater that floods electrical frames out all active ports.',
  },
  {
    type: DEVICE_TYPES.FIREWALL,
    category: 'security',
    label: 'Firewall',
    shortName: 'Firewall',
    description: 'Layer 3/4 security gateway with stateful/stateless packet filtering ACL rules.',
  },
  {
    type: DEVICE_TYPES.CLOUD,
    category: 'wan',
    label: 'ISP / Cloud',
    shortName: 'ISP',
    description: 'Upstream WAN / Internet Service Provider router node with multi-subnet routing.',
  },
];

let macSeedCounter = 1;

export function resetMacCounter(val = 1) {
  macSeedCounter = val;
}

/**
 * Creates a network interface object.
 */
export function createInterface({
  id,
  name,
  mac,
  ip = '',
  subnetMask = '255.255.255.0',
  cidr = 24,
  adminUp = true,
  vlan = 1,
  vlanMode = 'access', // 'access' | 'trunk'
  allowedVlans = [1, 10, 20, 30, 99],
  layer = 3, // 3 for routed port, 2 for switchport, 1 for hub port
}) {
  const norm = normalizeMask(cidr ?? subnetMask);
  return {
    id,
    name: name || id,
    mac: mac || generateMac(macSeedCounter++),
    ip,
    subnetMask: norm.subnetMask,
    cidr: norm.cidr,
    adminUp,
    vlan: Number(vlan) || 1,
    vlanMode,
    allowedVlans,
    layer,
  };
}

/**
 * Rebuilds the connected routes in a router's routing table based on its active L3 interfaces,
 * while preserving user-configured static routes.
 */
export function syncConnectedRoutes(device) {
  if (!device || !['router', 'firewall', 'cloud'].includes(device.type)) {
    return device;
  }

  const staticRoutes = (device.routingTable || []).filter(
    (r) => r.type !== 'connected'
  );

  const connectedRoutes = [];
  for (const iface of device.interfaces || []) {
    if (iface.adminUp && isValidIpv4(iface.ip)) {
      const details = getSubnetDetails(iface.ip, iface.cidr ?? iface.subnetMask);
      if (details) {
        connectedRoutes.push({
          id: `conn-${iface.id}`,
          type: 'connected',
          network: details.networkAddress,
          mask: details.subnetMask,
          cidr: details.cidr,
          nextHop: '0.0.0.0',
          interfaceId: iface.id,
          metric: 0,
          enabled: true,
        });
      }
    }
  }

  return {
    ...device,
    routingTable: [...connectedRoutes, ...staticRoutes],
  };
}

/**
 * Factory to create a complete network device with realistic defaults.
 */
export function createDevice({
  id,
  type = DEVICE_TYPES.PC,
  name,
  subtitle = '',
  position = { x: 200, y: 200 },
  ip = '',
  subnetMask = '255.255.255.0',
  cidr = 24,
  defaultGateway = '',
  dnsServer = '',
  dhcpEnabled = false,
  interfaces,
  routingTable = [],
  arpTable = [],
  macTable = [],
  firewallRules = [],
  services = null,
}) {
  const norm = normalizeMask(cidr ?? subnetMask);
  const devId = id || `dev-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  let defaultInterfaces = interfaces;

  if (!defaultInterfaces) {
    if (type === DEVICE_TYPES.SWITCH) {
      defaultInterfaces = Array.from({ length: 8 }, (_, idx) =>
        createInterface({
          id: `fa0/${idx + 1}`,
          name: `FastEthernet0/${idx + 1}`,
          mac: generateMac(`${devId}-fa0-${idx + 1}`, '00:50:56'),
          ip: '',
          layer: 2,
          vlan: 1,
          vlanMode: 'access',
        })
      );
    } else if (type === DEVICE_TYPES.HUB) {
      defaultInterfaces = Array.from({ length: 6 }, (_, idx) =>
        createInterface({
          id: `port${idx + 1}`,
          name: `Port ${idx + 1}`,
          mac: generateMac(`${devId}-p-${idx + 1}`, '00:00:0C'),
          ip: '',
          layer: 1,
        })
      );
    } else if (
      type === DEVICE_TYPES.ROUTER ||
      type === DEVICE_TYPES.FIREWALL ||
      type === DEVICE_TYPES.CLOUD
    ) {
      const prefix =
        type === DEVICE_TYPES.FIREWALL
          ? '00:1B:17'
          : type === DEVICE_TYPES.CLOUD
          ? '00:25:90'
          : '00:1E:BD';
      defaultInterfaces = Array.from({ length: 4 }, (_, idx) =>
        createInterface({
          id: `eth${idx}`,
          name: `GigabitEthernet0/${idx}`,
          mac: generateMac(`${devId}-eth${idx}`, prefix),
          ip: idx === 0 && ip ? ip : '',
          subnetMask: norm.subnetMask,
          cidr: norm.cidr,
          adminUp: true,
          layer: 3,
        })
      );
    } else {
      // End host (PC, Laptop, Smartphone, Server)
      const prefix = type === DEVICE_TYPES.SERVER ? '00:16:3E' : '00:1A:2B';
      defaultInterfaces = [
        createInterface({
          id: 'eth0',
          name: 'Ethernet0',
          mac: generateMac(`${devId}-eth0`, prefix),
          ip,
          subnetMask: norm.subnetMask,
          cidr: norm.cidr,
          adminUp: true,
          layer: 3,
        }),
      ];
    }
  }

  const defaultServices =
    services ||
    (type === DEVICE_TYPES.SERVER
      ? {
          http: {
            enabled: true,
            port: 80,
            serverTitle: 'NetRunner Web Server',
            responseBody: '<html><body><h1>200 OK — Welcome to NetRunner Lab Server</h1></body></html>',
          },
          dns: {
            enabled: true,
            records: [
              { hostname: 'netrunner.lab', ip: ip || '192.168.1.100', type: 'A' },
              { hostname: 'portal.internal', ip: ip || '192.168.1.100', type: 'A' },
            ],
          },
          dhcp: {
            enabled: false,
            poolStart: '192.168.1.100',
            poolEnd: '192.168.1.150',
            subnetMask: '255.255.255.0',
            cidr: 24,
            defaultGateway: '192.168.1.1',
            dnsServer: ip || '192.168.1.10',
            leases: [],
          },
        }
      : {
          http: { enabled: false, port: 80, serverTitle: '', responseBody: '' },
          dns: { enabled: false, records: [] },
          dhcp: { enabled: false, leases: [] },
        });

  const baseDevice = {
    id: devId,
    type,
    name: name || `${type.toUpperCase()}-${devId.slice(-3)}`,
    subtitle:
      subtitle ||
      (type === DEVICE_TYPES.ROUTER
        ? 'Pixelz Router'
        : type === DEVICE_TYPES.CLOUD
        ? 'Internet Service Provider'
        : type === DEVICE_TYPES.SWITCH
        ? 'Layer 2 Switch'
        : type === DEVICE_TYPES.HUB
        ? 'Layer 1 Hub'
        : type === DEVICE_TYPES.FIREWALL
        ? 'Security Gateway'
        : ''),
    position,
    defaultGateway,
    dnsServer,
    dhcpEnabled,
    interfaces: defaultInterfaces,
    routingTable,
    arpTable, // [{ ip, mac, interfaceId, type: 'dynamic' | 'static', updatedAt }]
    macTable, // [{ mac, interfaceId, vlan, updatedAt }]
    firewallRules, // [{ id, name, action: 'ALLOW'|'DENY', protocol: 'ANY'|'ICMP'|'TCP'|'UDP'|'HTTP'|'DNS', srcNetwork: 'any', dstNetwork: 'any', dstPort: 'any', enabled: true }]
    services: defaultServices,
  };

  return syncConnectedRoutes(baseDevice);
}

/**
 * Helper to get primary IP display string for canvas node cards (e.g. "192.168.21.2 / 29").
 */
export function getDevicePrimaryIpLabel(device) {
  if (!device || !device.interfaces) return '';
  if (device.type === DEVICE_TYPES.SWITCH || device.type === DEVICE_TYPES.HUB) {
    const activePorts = device.interfaces.filter((i) => i.adminUp).length;
    return `${activePorts} Ports Active`;
  }
  const activeWithIp = device.interfaces.filter(
    (i) => i.adminUp && isValidIpv4(i.ip)
  );
  if (activeWithIp.length === 0) {
    const anyWithIp = device.interfaces.find((i) => isValidIpv4(i.ip));
    if (anyWithIp) {
      return `${anyWithIp.ip} / ${anyWithIp.cidr} (DOWN)`;
    }
    return 'Unassigned IP';
  }
  if (activeWithIp.length === 1) {
    return `${activeWithIp[0].ip} / ${activeWithIp[0].cidr}`;
  }
  return `${activeWithIp[0].ip} / ${activeWithIp[0].cidr} (+${activeWithIp.length - 1})`;
}
