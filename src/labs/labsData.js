import {
  createDevice,
  createInterface,
  DEVICE_TYPES,
} from '../engine/deviceModels.js';
import { isSameSubnet, isValidIpv4, longestPrefixMatch } from '../engine/ipUtils.js';

/**
 * Builds the signature "Class 1 — Pixelz Router & Subnet Lab" topology
 * inspired by the reference design, with real multi-interface L2/L3 simulation.
 */
export function createClass1Topology() {
  const ispRouter = createDevice({
    id: 'dev-isp',
    type: DEVICE_TYPES.CLOUD,
    name: 'WRT300N',
    subtitle: 'Internet Service Provider',
    position: { x: 400, y: 75 },
    interfaces: [
      createInterface({
        id: 'eth0',
        name: 'WAN0/0',
        mac: '00:25:90:AA:00:01',
        ip: '203.0.113.1',
        cidr: 30,
        adminUp: true,
      }),
      createInterface({
        id: 'eth1',
        name: 'Gigabit0/1',
        mac: '00:25:90:AA:00:02',
        ip: '8.8.8.8',
        cidr: 24,
        adminUp: true,
      }),
    ],
    routingTable: [
      {
        id: 'rt-isp-lan21',
        type: 'static',
        network: '192.168.21.0',
        mask: '255.255.255.248',
        cidr: 29,
        nextHop: '203.0.113.2',
        interfaceId: 'eth0',
        metric: 1,
        enabled: true,
      },
      {
        id: 'rt-isp-lan31',
        type: 'static',
        network: '192.168.31.0',
        mask: '255.255.255.248',
        cidr: 29,
        nextHop: '203.0.113.2',
        interfaceId: 'eth0',
        metric: 1,
        enabled: true,
      },
    ],
  });

  const pixelzRouter = createDevice({
    id: 'dev-router-1',
    type: DEVICE_TYPES.ROUTER,
    name: 'Pixelz Router 1',
    subtitle: 'Pixelz Router',
    position: { x: 400, y: 270 },
    interfaces: [
      createInterface({
        id: 'eth0',
        name: 'GigabitEthernet0/0 (LAN 21)',
        mac: '00:1E:BD:21:00:01',
        ip: '192.168.21.1',
        cidr: 29,
        adminUp: true,
      }),
      createInterface({
        id: 'eth1',
        name: 'GigabitEthernet0/1 (LAN 31)',
        mac: '00:1E:BD:31:00:01',
        ip: '192.168.31.9',
        cidr: 29,
        adminUp: true,
      }),
      createInterface({
        id: 'eth2',
        name: 'GigabitEthernet0/2 (LAN 32)',
        mac: '00:1E:BD:32:00:01',
        ip: '192.168.32.1',
        cidr: 29,
        adminUp: true,
      }),
      createInterface({
        id: 'eth3',
        name: 'GigabitEthernet0/3 (WAN Uplink)',
        mac: '00:1E:BD:99:00:02',
        ip: '203.0.113.2',
        cidr: 30,
        adminUp: true,
      }),
    ],
    routingTable: [
      {
        id: 'rt-default-isp',
        type: 'static',
        network: '0.0.0.0',
        mask: '0.0.0.0',
        cidr: 0,
        nextHop: '203.0.113.1',
        interfaceId: 'eth3',
        metric: 1,
        enabled: true,
      },
    ],
  });

  const lanHub = createDevice({
    id: 'dev-hub-1',
    type: DEVICE_TYPES.SWITCH,
    name: 'Switch 1',
    subtitle: 'LAN 21 Access Switch',
    position: { x: 225, y: 270 },
  });

  const pc1 = createDevice({
    id: 'dev-pc-1',
    type: DEVICE_TYPES.PC,
    name: 'PC Pixelz 1',
    subtitle: 'Workstation',
    position: { x: 145, y: 155 },
    ip: '192.168.21.2',
    cidr: 29,
    defaultGateway: '192.168.21.1',
    dnsServer: '8.8.8.8',
  });

  const pc2 = createDevice({
    id: 'dev-pc-2',
    type: DEVICE_TYPES.PC,
    name: 'PC Pixelz 2',
    subtitle: 'Workstation',
    position: { x: 645, y: 225 },
    ip: '192.168.21.3',
    cidr: 29,
    defaultGateway: '192.168.21.1',
    dnsServer: '8.8.8.8',
  });

  const phone3 = createDevice({
    id: 'dev-phone-3',
    type: DEVICE_TYPES.SMARTPHONE,
    name: 'Smartphone 3',
    subtitle: 'Mobile Endpoint',
    position: { x: 180, y: 425 },
    ip: '192.168.21.4',
    cidr: 29,
    defaultGateway: '192.168.21.1',
    dnsServer: '8.8.8.8',
  });

  const laptop1 = createDevice({
    id: 'dev-laptop-1',
    type: DEVICE_TYPES.LAPTOP,
    name: 'Laptop Pixelz 1',
    subtitle: 'Subnet 31 Host',
    position: { x: 525, y: 435 },
    ip: '192.168.31.10',
    cidr: 29,
    defaultGateway: '192.168.31.9',
    dnsServer: '8.8.8.8',
  });

  const laptop2 = createDevice({
    id: 'dev-laptop-2',
    type: DEVICE_TYPES.LAPTOP,
    name: 'Laptop Pixelz 2',
    subtitle: 'Subnet 32 Host',
    position: { x: 395, y: 545 },
    ip: '192.168.32.4',
    cidr: 29,
    defaultGateway: '192.168.32.1',
    dnsServer: '8.8.8.8',
  });

  const links = [
    {
      id: 'link-isp-r1',
      source: 'dev-isp',
      sourceHandle: 'eth0',
      target: 'dev-router-1',
      targetHandle: 'eth3',
      status: 'up',
    },
    {
      id: 'link-r1-sw1',
      source: 'dev-router-1',
      sourceHandle: 'eth0',
      target: 'dev-hub-1',
      targetHandle: 'fa0/1',
      status: 'up',
    },
    {
      id: 'link-pc1-sw1',
      source: 'dev-pc-1',
      sourceHandle: 'eth0',
      target: 'dev-hub-1',
      targetHandle: 'fa0/2',
      status: 'up',
    },
    {
      id: 'link-pc2-sw1',
      source: 'dev-pc-2',
      sourceHandle: 'eth0',
      target: 'dev-hub-1',
      targetHandle: 'fa0/3',
      status: 'up',
    },
    {
      id: 'link-phone3-sw1',
      source: 'dev-phone-3',
      sourceHandle: 'eth0',
      target: 'dev-hub-1',
      targetHandle: 'fa0/4',
      status: 'up',
    },
    {
      id: 'link-r1-laptop1',
      source: 'dev-router-1',
      sourceHandle: 'eth1',
      target: 'dev-laptop-1',
      targetHandle: 'eth0',
      status: 'up',
    },
    {
      id: 'link-r1-laptop2',
      source: 'dev-router-1',
      sourceHandle: 'eth2',
      target: 'dev-laptop-2',
      targetHandle: 'eth0',
      status: 'up',
    },
  ];

  return {
    devices: [
      ispRouter,
      pixelzRouter,
      lanHub,
      pc1,
      pc2,
      phone3,
      laptop1,
      laptop2,
    ],
    links,
  };
}

/**
 * Lab 2: Layer 2 Switching & Dynamic MAC Address Table Learning
 */
export function createSwitchingLabTopology() {
  const sw = createDevice({
    id: 'sw-core',
    type: DEVICE_TYPES.SWITCH,
    name: 'Switch-Core-1',
    subtitle: '8-Port Managed L2 Switch',
    position: { x: 400, y: 270 },
  });

  const pcA = createDevice({
    id: 'pc-a',
    type: DEVICE_TYPES.PC,
    name: 'Host-Alpha',
    subtitle: 'Engineering',
    position: { x: 160, y: 130 },
    ip: '192.168.1.11',
    cidr: 24,
  });

  const pcB = createDevice({
    id: 'pc-b',
    type: DEVICE_TYPES.PC,
    name: 'Host-Beta',
    subtitle: 'Engineering',
    position: { x: 640, y: 130 },
    ip: '192.168.1.12',
    cidr: 24,
  });

  const pcC = createDevice({
    id: 'pc-c',
    type: DEVICE_TYPES.LAPTOP,
    name: 'Laptop-Gamma',
    subtitle: 'Design',
    position: { x: 160, y: 420 },
    ip: '192.168.1.13',
    cidr: 24,
  });

  const srvD = createDevice({
    id: 'srv-d',
    type: DEVICE_TYPES.SERVER,
    name: 'Intranet-Server',
    subtitle: 'HTTP & DNS',
    position: { x: 640, y: 420 },
    ip: '192.168.1.100',
    cidr: 24,
  });

  const links = [
    {
      id: 'l-sw-a',
      source: 'pc-a',
      sourceHandle: 'eth0',
      target: 'sw-core',
      targetHandle: 'fa0/1',
      status: 'up',
    },
    {
      id: 'l-sw-b',
      source: 'pc-b',
      sourceHandle: 'eth0',
      target: 'sw-core',
      targetHandle: 'fa0/2',
      status: 'up',
    },
    {
      id: 'l-sw-c',
      source: 'pc-c',
      sourceHandle: 'eth0',
      target: 'sw-core',
      targetHandle: 'fa0/3',
      status: 'up',
    },
    {
      id: 'l-sw-d',
      source: 'srv-d',
      sourceHandle: 'eth0',
      target: 'sw-core',
      targetHandle: 'fa0/4',
      status: 'up',
    },
  ];

  return { devices: [sw, pcA, pcB, pcC, srvD], links };
}

/**
 * Lab 3: The /29 Subnet Mask Mystery (Troubleshooting Broken CIDR Boundaries)
 */
export function createSubnetTroubleshootingLab() {
  const sw = createDevice({
    id: 'sw-sub',
    type: DEVICE_TYPES.SWITCH,
    name: 'Lab-Switch-1',
    subtitle: 'Layer 2 Switch',
    position: { x: 400, y: 260 },
  });

  const pc1 = createDevice({
    id: 'pc-sub-1',
    type: DEVICE_TYPES.PC,
    name: 'Workstation-1',
    subtitle: 'Subnet 10.10.10.0/29',
    position: { x: 150, y: 180 },
    ip: '10.10.10.2',
    cidr: 29,
    defaultGateway: '10.10.10.1',
  });

  // Intentionally misconfigured IP outside 10.10.10.0/29 (usable .1 - .6)
  const pc2 = createDevice({
    id: 'pc-sub-2',
    type: DEVICE_TYPES.PC,
    name: 'Workstation-2 (Broken)',
    subtitle: 'Misconfigured /29 IP!',
    position: { x: 650, y: 180 },
    ip: '10.10.10.12',
    cidr: 29,
    defaultGateway: '10.10.10.1',
  });

  const router = createDevice({
    id: 'rtr-sub-1',
    type: DEVICE_TYPES.ROUTER,
    name: 'Gateway-Router',
    subtitle: '10.10.10.1 / 29',
    position: { x: 400, y: 450 },
    interfaces: [
      createInterface({
        id: 'eth0',
        name: 'GigabitEthernet0/0',
        mac: '00:1E:BD:10:10:01',
        ip: '10.10.10.1',
        cidr: 29,
        adminUp: true,
      }),
    ],
  });

  const links = [
    {
      id: 'l-sub-1',
      source: 'pc-sub-1',
      sourceHandle: 'eth0',
      target: 'sw-sub',
      targetHandle: 'fa0/1',
      status: 'up',
    },
    {
      id: 'l-sub-2',
      source: 'pc-sub-2',
      sourceHandle: 'eth0',
      target: 'sw-sub',
      targetHandle: 'fa0/2',
      status: 'up',
    },
    {
      id: 'l-sub-rtr',
      source: 'rtr-sub-1',
      sourceHandle: 'eth0',
      target: 'sw-sub',
      targetHandle: 'fa0/3',
      status: 'up',
    },
  ];

  return { devices: [sw, pc1, pc2, router], links };
}

/**
 * Lab 4: Inter-Subnet Routing & Default Gateways
 */
export function createInterSubnetRoutingLab() {
  const router = createDevice({
    id: 'rtr-core',
    type: DEVICE_TYPES.ROUTER,
    name: 'Core-Router-1',
    subtitle: 'Inter-LAN Gateway',
    position: { x: 410, y: 240 },
    interfaces: [
      createInterface({
        id: 'eth0',
        name: 'GigabitEthernet0/0 (West LAN)',
        mac: '00:1E:BD:AA:10:01',
        ip: '192.168.10.1',
        cidr: 24,
        adminUp: true,
      }),
      createInterface({
        id: 'eth1',
        name: 'GigabitEthernet0/1 (East LAN)',
        mac: '00:1E:BD:AA:20:01',
        ip: '192.168.20.1',
        cidr: 24,
        // Intentionally down for student to enable!
        adminUp: false,
      }),
    ],
  });

  const swWest = createDevice({
    id: 'sw-west',
    type: DEVICE_TYPES.SWITCH,
    name: 'Switch-West',
    subtitle: '192.168.10.0/24',
    position: { x: 190, y: 240 },
  });

  const swEast = createDevice({
    id: 'sw-east',
    type: DEVICE_TYPES.SWITCH,
    name: 'Switch-East',
    subtitle: '192.168.20.0/24',
    position: { x: 630, y: 240 },
  });

  const pcWest = createDevice({
    id: 'pc-west',
    type: DEVICE_TYPES.PC,
    name: 'PC-West-1',
    subtitle: 'Missing Gateway!',
    position: { x: 120, y: 420 },
    ip: '192.168.10.10',
    cidr: 24,
    // Intentionally missing defaultGateway!
    defaultGateway: '',
  });

  const srvEast = createDevice({
    id: 'srv-east',
    type: DEVICE_TYPES.SERVER,
    name: 'Server-East-1',
    subtitle: 'Production Web Server',
    position: { x: 690, y: 420 },
    ip: '192.168.20.50',
    cidr: 24,
    defaultGateway: '192.168.20.1',
  });

  const links = [
    {
      id: 'l-rw',
      source: 'rtr-core',
      sourceHandle: 'eth0',
      target: 'sw-west',
      targetHandle: 'fa0/1',
      status: 'up',
    },
    {
      id: 'l-re',
      source: 'rtr-core',
      sourceHandle: 'eth1',
      target: 'sw-east',
      targetHandle: 'fa0/1',
      status: 'up',
    },
    {
      id: 'l-pw',
      source: 'pc-west',
      sourceHandle: 'eth0',
      target: 'sw-west',
      targetHandle: 'fa0/2',
      status: 'up',
    },
    {
      id: 'l-se',
      source: 'srv-east',
      sourceHandle: 'eth0',
      target: 'sw-east',
      targetHandle: 'fa0/2',
      status: 'up',
    },
  ];

  return { devices: [router, swWest, swEast, pcWest, srvEast], links };
}

/**
 * Lab 5: Multi-Router Static Routing Across WAN
 */
export function createStaticRoutingWanLab() {
  const rtrWest = createDevice({
    id: 'rtr-west',
    type: DEVICE_TYPES.ROUTER,
    name: 'Router-Branch-West',
    subtitle: 'Missing Route to 192.168.200.0/24',
    position: { x: 280, y: 240 },
    interfaces: [
      createInterface({
        id: 'eth0',
        name: 'Gigabit0/0 (LAN)',
        mac: '00:1E:BD:01:00:01',
        ip: '192.168.100.1',
        cidr: 24,
        adminUp: true,
      }),
      createInterface({
        id: 'eth1',
        name: 'Serial/WAN0/1',
        mac: '00:1E:BD:01:00:02',
        ip: '172.16.0.1',
        cidr: 30,
        adminUp: true,
      }),
    ],
    routingTable: [],
  });

  const rtrEast = createDevice({
    id: 'rtr-east',
    type: DEVICE_TYPES.ROUTER,
    name: 'Router-HQ-East',
    subtitle: 'Missing Route to 192.168.100.0/24',
    position: { x: 560, y: 240 },
    interfaces: [
      createInterface({
        id: 'eth0',
        name: 'Gigabit0/0 (LAN)',
        mac: '00:1E:BD:02:00:01',
        ip: '192.168.200.1',
        cidr: 24,
        adminUp: true,
      }),
      createInterface({
        id: 'eth1',
        name: 'Serial/WAN0/1',
        mac: '00:1E:BD:02:00:02',
        ip: '172.16.0.2',
        cidr: 30,
        adminUp: true,
      }),
    ],
    routingTable: [],
  });

  const pcBranch = createDevice({
    id: 'pc-branch',
    type: DEVICE_TYPES.LAPTOP,
    name: 'Branch-Laptop',
    subtitle: '192.168.100.10/24',
    position: { x: 110, y: 410 },
    ip: '192.168.100.10',
    cidr: 24,
    defaultGateway: '192.168.100.1',
  });

  const srvHq = createDevice({
    id: 'srv-hq',
    type: DEVICE_TYPES.SERVER,
    name: 'HQ-Core-Server',
    subtitle: '192.168.200.50/24',
    position: { x: 720, y: 410 },
    ip: '192.168.200.50',
    cidr: 24,
    defaultGateway: '192.168.200.1',
  });

  const links = [
    {
      id: 'l-wan-we',
      source: 'rtr-west',
      sourceHandle: 'eth1',
      target: 'rtr-east',
      targetHandle: 'eth1',
      status: 'up',
    },
    {
      id: 'l-lan-w',
      source: 'pc-branch',
      sourceHandle: 'eth0',
      target: 'rtr-west',
      targetHandle: 'eth0',
      status: 'up',
    },
    {
      id: 'l-lan-e',
      source: 'srv-hq',
      sourceHandle: 'eth0',
      target: 'rtr-east',
      targetHandle: 'eth0',
      status: 'up',
    },
  ];

  return { devices: [rtrWest, rtrEast, pcBranch, srvHq], links };
}

/**
 * Lab 6: DNS Resolution, HTTP Web Traffic & Firewall Security ACLs
 */
export function createSecurityFirewallLab() {
  const firewall = createDevice({
    id: 'fw-main',
    type: DEVICE_TYPES.FIREWALL,
    name: 'ZeroTrust-FW1',
    subtitle: 'Stateful Security Appliance',
    position: { x: 410, y: 260 },
    interfaces: [
      createInterface({
        id: 'eth0',
        name: 'Inside-Campus (eth0)',
        mac: '00:1B:17:00:01:01',
        ip: '10.0.1.1',
        cidr: 24,
        adminUp: true,
      }),
      createInterface({
        id: 'eth1',
        name: 'DMZ-Servers (eth1)',
        mac: '00:1B:17:00:02:01',
        ip: '10.0.2.1',
        cidr: 24,
        adminUp: true,
      }),
    ],
    firewallRules: [
      {
        id: 'acl-1',
        name: 'Permit DNS Queries',
        action: 'ALLOW',
        protocol: 'DNS',
        srcNetwork: 'any',
        dstNetwork: '10.0.2.100/32',
        dstPort: '53',
        enabled: true,
      },
      {
        id: 'acl-2',
        name: 'Permit Web HTTP',
        action: 'ALLOW',
        protocol: 'HTTP',
        srcNetwork: 'any',
        dstNetwork: '10.0.2.100/32',
        dstPort: '80',
        enabled: true,
      },
    ],
  });

  const clientPc = createDevice({
    id: 'pc-campus',
    type: DEVICE_TYPES.PC,
    name: 'Analyst-PC',
    subtitle: 'Campus Client',
    position: { x: 140, y: 260 },
    ip: '10.0.1.25',
    cidr: 24,
    defaultGateway: '10.0.1.1',
    dnsServer: '10.0.2.100',
  });

  const dmzServer = createDevice({
    id: 'srv-dmz',
    type: DEVICE_TYPES.SERVER,
    name: 'DMZ-Web-DNS',
    subtitle: 'netrunner.lab (10.0.2.100)',
    position: { x: 680, y: 260 },
    ip: '10.0.2.100',
    cidr: 24,
    defaultGateway: '10.0.2.1',
    services: {
      http: {
        enabled: true,
        port: 80,
        serverTitle: 'NetRunner DMZ Portal',
        responseBody:
          '<html><body><h1>200 OK — Secure DMZ Portal Reached!</h1></body></html>',
      },
      dns: {
        enabled: true,
        records: [
          { hostname: 'netrunner.lab', ip: '10.0.2.100', type: 'A' },
          { hostname: 'dmz.internal', ip: '10.0.2.100', type: 'A' },
        ],
      },
      dhcp: { enabled: false, leases: [] },
    },
  });

  const links = [
    {
      id: 'l-fw-pc',
      source: 'pc-campus',
      sourceHandle: 'eth0',
      target: 'fw-main',
      targetHandle: 'eth0',
      status: 'up',
    },
    {
      id: 'l-fw-srv',
      source: 'fw-main',
      sourceHandle: 'eth1',
      target: 'srv-dmz',
      targetHandle: 'eth0',
      status: 'up',
    },
  ];

  return { devices: [firewall, clientPc, dmzServer], links };
}

export const LABS_LIST = [
  {
    id: 'class-1-pixelz',
    number: 1,
    title: 'Class 1 — Multi-Subnet & ISP Topology',
    difficulty: 'Beginner',
    category: 'Foundations & Inspection',
    summary:
      'Explore a pre-wired multi-subnet topology with an ISP router, central gateway router, L2 switch, and 5 endpoints. Send ICMP pings and trace packets layer-by-layer.',
    instructions: [
      'Click "Send Packet / Ping" or press the Play button in the Simulation Panel to watch ARP and ICMP packets traverse the network.',
      'Click any event row in the Simulation Panel on the right to open the deep OSI Layer 1–7 Packet Inspector.',
      'Try pinging from PC Pixelz 1 (192.168.21.2) to Laptop Pixelz 1 (192.168.31.10) across Pixelz Router 1 and watch TTL decrement from 64 to 63.',
      'Try pinging from PC Pixelz 1 to WRT300N ISP (8.8.8.8) to verify the default static route!',
    ],
    createTopology: createClass1Topology,
    checkObjectives: (devices, links, simHistory) => {
      const hasPingSuccess = simHistory.some((s) => s.summary?.success);
      const router = devices.find((d) => d.id === 'dev-router-1');
      const hasLearnedArp = (router?.arpTable?.length || 0) > 0;
      return [
        {
          id: 'obj-1',
          text: 'Run a packet simulation and observe ARP + ICMP delivery',
          completed: hasPingSuccess,
        },
        {
          id: 'obj-2',
          text: 'Populate Pixelz Router 1 or Switch MAC/ARP tables through live traffic',
          completed: hasLearnedArp || hasPingSuccess,
        },
      ];
    },
  },
  {
    id: 'lab-2-switching',
    number: 2,
    title: 'Lab 2 — Ethernet Switching & MAC Learning',
    difficulty: 'Beginner',
    category: 'Layer 2 Switching',
    summary:
      'Observe how a Layer 2 Switch dynamically learns source MAC addresses in its CAM table and transitions from broadcast flooding to unicast forwarding.',
    instructions: [
      'Select Host-Alpha (192.168.1.11) and send an ICMP Ping to Host-Beta (192.168.1.12).',
      'Inspect Switch-Core-1: notice how the initial ARP Request (FF:FF:FF:FF:FF:FF) is flooded out all active ports, while the switch learns Host-Alpha’s MAC on fa0/1.',
      'Check Switch-Core-1’s MAC Table tab to verify both Host-Alpha and Host-Beta MAC addresses are learned.',
    ],
    createTopology: createSwitchingLabTopology,
    checkObjectives: (devices, links, simHistory) => {
      const sw = devices.find((d) => d.id === 'sw-core');
      const macCount = sw?.macTable?.length || 0;
      const pingOk = simHistory.some((s) => s.summary?.success);
      return [
        {
          id: 'obj-sw-1',
          text: 'Switch-Core-1 has learned at least 2 MAC addresses in its CAM table',
          completed: macCount >= 2,
        },
        {
          id: 'obj-sw-2',
          text: 'Successfully complete an end-to-end ping across Switch-Core-1',
          completed: pingOk,
        },
      ];
    },
  },
  {
    id: 'lab-3-subnet-mismatch',
    number: 3,
    title: 'Lab 3 — The /29 Subnet Mask Mystery',
    difficulty: 'Intermediate',
    category: 'Subnetting & CIDR',
    summary:
      'Workstation-2 (10.10.10.12/29) cannot ping Workstation-1 (10.10.10.2/29) or the Gateway (10.10.10.1/29). Diagnose the /29 subnet boundary error and fix it!',
    instructions: [
      'Attempt to ping from Workstation-2 to Workstation-1 (10.10.10.2). Observe the SUBNET_MISMATCH / unreachable gateway drop reason.',
      'A /29 subnet (mask 255.255.255.248) has block size 8: subnet 10.10.10.0/29 only covers usable hosts 10.10.10.1 through 10.10.10.6 (10.10.10.7 is broadcast).',
      'Click Workstation-2 and change its IPv4 address to a valid unused host inside 10.10.10.0/29 (for example, 10.10.10.3/29), then ping 10.10.10.1 or 10.10.10.2!',
    ],
    createTopology: createSubnetTroubleshootingLab,
    checkObjectives: (devices, links, simHistory) => {
      const pc2 = devices.find((d) => d.id === 'pc-sub-2');
      const iface = pc2?.interfaces?.[0];
      const inSameSubnet =
        iface &&
        isValidIpv4(iface.ip) &&
        iface.ip !== '10.10.10.1' &&
        iface.ip !== '10.10.10.2' &&
        isSameSubnet(iface.ip, '10.10.10.1', 29);
      const pingSuccess = simHistory.some((s) => s.summary?.success);
      return [
        {
          id: 'obj-sub-1',
          text: 'Reconfigure Workstation-2 with a valid host IP inside 10.10.10.0/29 (10.10.10.3 – 10.10.10.6)',
          completed: Boolean(inSameSubnet),
        },
        {
          id: 'obj-sub-2',
          text: 'Verify connectivity by pinging between Workstation-2 and Workstation-1',
          completed: Boolean(inSameSubnet && pingSuccess),
        },
      ];
    },
  },
  {
    id: 'lab-4-inter-subnet',
    number: 4,
    title: 'Lab 4 — Inter-Subnet Routing & Gateways',
    difficulty: 'Intermediate',
    category: 'Layer 3 Routing',
    summary:
      'Connect the West LAN (192.168.10.0/24) and East LAN (192.168.20.0/24) through Core-Router-1 by fixing a missing Default Gateway and enabling a shut-down router port.',
    instructions: [
      'Try pinging from PC-West-1 (192.168.10.10) to Server-East-1 (192.168.20.50). Notice it fails immediately with NO_DEFAULT_GATEWAY.',
      'Select PC-West-1 and set its Default Gateway to 192.168.10.1.',
      'Select Core-Router-1, inspect GigabitEthernet0/1 (192.168.20.1), and toggle its administrative status to UP.',
      'Ping from PC-West-1 to Server-East-1 (192.168.20.50) and verify full two-way ICMP Echo Reply!',
    ],
    createTopology: createInterSubnetRoutingLab,
    checkObjectives: (devices, links, simHistory) => {
      const pcWest = devices.find((d) => d.id === 'pc-west');
      const router = devices.find((d) => d.id === 'rtr-core');
      const eth1 = router?.interfaces?.find((i) => i.id === 'eth1');
      const gwOk = pcWest?.defaultGateway === '192.168.10.1';
      const portUp = Boolean(eth1?.adminUp);
      const pingOk = simHistory.some((s) => s.summary?.success);
      return [
        {
          id: 'obj-r-1',
          text: 'Configure Default Gateway 192.168.10.1 on PC-West-1',
          completed: gwOk,
        },
        {
          id: 'obj-r-2',
          text: 'Enable interface GigabitEthernet0/1 (192.168.20.1) on Core-Router-1',
          completed: portUp,
        },
        {
          id: 'obj-r-3',
          text: 'Ping successfully between PC-West-1 and Server-East-1',
          completed: gwOk && portUp && pingOk,
        },
      ];
    },
  },
  {
    id: 'lab-5-static-wan',
    number: 5,
    title: 'Lab 5 — Dual-Router WAN Static Routing',
    difficulty: 'Advanced',
    category: 'Static Routing & LPM',
    summary:
      'Configure static routes across two routers linked by a 172.16.0.0/30 WAN transit subnet so Branch-Laptop can reach HQ-Core-Server.',
    instructions: [
      'Select Router-Branch-West and add a Static Route: Network 192.168.200.0, Mask /24 (255.255.255.0), Next-Hop 172.16.0.2.',
      'Select Router-HQ-East and add a return Static Route: Network 192.168.100.0, Mask /24 (255.255.255.0), Next-Hop 172.16.0.1.',
      'Send a Ping or Traceroute from Branch-Laptop (192.168.100.10) to HQ-Core-Server (192.168.200.50).',
    ],
    createTopology: createStaticRoutingWanLab,
    checkObjectives: (devices, links, simHistory) => {
      const rWest = devices.find((d) => d.id === 'rtr-west');
      const rEast = devices.find((d) => d.id === 'rtr-east');
      const westHasRoute = Boolean(
        rWest && longestPrefixMatch('192.168.200.50', rWest.routingTable)
      );
      const eastHasRoute = Boolean(
        rEast && longestPrefixMatch('192.168.100.10', rEast.routingTable)
      );
      const pingOk = simHistory.some((s) => s.summary?.success);
      return [
        {
          id: 'obj-wan-1',
          text: 'Add route on Router-Branch-West for 192.168.200.0/24 via 172.16.0.2',
          completed: westHasRoute,
        },
        {
          id: 'obj-wan-2',
          text: 'Add return route on Router-HQ-East for 192.168.100.0/24 via 172.16.0.1',
          completed: eastHasRoute,
        },
        {
          id: 'obj-wan-3',
          text: 'Verify end-to-end ping between Branch-Laptop and HQ-Core-Server',
          completed: westHasRoute && eastHasRoute && pingOk,
        },
      ];
    },
  },
  {
    id: 'lab-6-firewall-dns',
    number: 6,
    title: 'Lab 6 — DNS, HTTP & Zero-Trust Firewall ACL',
    difficulty: 'Advanced',
    category: 'Security & Application Layer',
    summary:
      'Test domain name resolution (netrunner.lab) and HTTP web traffic across ZeroTrust-FW1, then enforce a Firewall ACL policy that blocks ICMP pings while permitting HTTP.',
    instructions: [
      'Send an HTTP request from Analyst-PC to hostname "netrunner.lab" (or IP 10.0.2.100) and watch the DNS Query + DNS Response followed by HTTP GET + 200 OK.',
      'Select ZeroTrust-FW1, open the Firewall / ACL tab, and add a DENY rule for protocol ICMP (src: any, dst: any).',
      'Verify that ICMP Ping from Analyst-PC to DMZ-Web-DNS is blocked by ZeroTrust-FW1 while HTTP requests still succeed!',
    ],
    createTopology: createSecurityFirewallLab,
    checkObjectives: (devices, links, simHistory) => {
      const fw = devices.find((d) => d.id === 'fw-main');
      const hasDenyIcmp = (fw?.firewallRules || []).some(
        (r) =>
          r.enabled !== false &&
          r.action === 'DENY' &&
          (r.protocol === 'ICMP' || r.protocol === 'ANY')
      );
      const hasHttpSuccess = simHistory.some(
        (s) => s.summary?.protocol === 'HTTP' && s.summary?.success
      );
      const hasBlockedIcmp = simHistory.some(
        (s) => s.summary?.failureReasonCode === 'FIREWALL_BLOCKED'
      );
      return [
        {
          id: 'obj-fw-1',
          text: 'Complete an HTTP 200 OK request from Analyst-PC to DMZ-Web-DNS',
          completed: hasHttpSuccess,
        },
        {
          id: 'obj-fw-2',
          text: 'Configure a DENY ICMP rule on ZeroTrust-FW1',
          completed: hasDenyIcmp,
        },
        {
          id: 'obj-fw-3',
          text: 'Verify that ICMP Ping is blocked by the Firewall ACL',
          completed: hasDenyIcmp && hasBlockedIcmp,
        },
      ];
    },
  },
];
