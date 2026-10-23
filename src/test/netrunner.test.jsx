import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  isValidIpv4,
  subnetMaskToCidr,
  cidrToSubnetMask,
  getSubnetDetails,
  isSameSubnet,
  longestPrefixMatch,
} from '../engine/ipUtils.js';
import { runPacketSimulation } from '../engine/packetEngine.js';
import {
  createClass1Topology,
  createSwitchingLabTopology,
  createSubnetTroubleshootingLab,
  createInterSubnetRoutingLab,
  createStaticRoutingWanLab,
  createSecurityFirewallLab,
} from '../labs/labsData.js';
import App from '../App.jsx';

describe('NetRunner Core IP & Subnet Engine', () => {
  it('validates IPv4 addresses and converts masks/CIDRs accurately', () => {
    expect(isValidIpv4('192.168.21.2')).toBe(true);
    expect(isValidIpv4('256.0.0.1')).toBe(false);
    expect(isValidIpv4('192.168.01.1')).toBe(false);

    expect(cidrToSubnetMask(29)).toBe('255.255.255.248');
    expect(subnetMaskToCidr('255.255.255.248')).toBe(29);
  });

  it('calculates /29 subnet boundaries and usable host ranges accurately', () => {
    const details = getSubnetDetails('192.168.21.2', 29);
    expect(details.networkAddress).toBe('192.168.21.0');
    expect(details.broadcastAddress).toBe('192.168.21.7');
    expect(details.firstUsableHost).toBe('192.168.21.1');
    expect(details.lastUsableHost).toBe('192.168.21.6');
    expect(details.usableHosts).toBe(6);

    expect(isSameSubnet('192.168.21.2', '192.168.21.6', 29)).toBe(true);
    expect(isSameSubnet('192.168.21.2', '192.168.21.9', 29)).toBe(false);
  });

  it('performs Longest Prefix Match (LPM) route lookup', () => {
    const routes = [
      { network: '0.0.0.0', cidr: 0, nextHop: '203.0.113.1', interfaceId: 'eth3' },
      { network: '192.168.0.0', cidr: 16, nextHop: '10.0.0.1', interfaceId: 'eth1' },
      { network: '192.168.21.0', cidr: 29, nextHop: '0.0.0.0', interfaceId: 'eth0', type: 'connected' },
    ];
    const hitSpecific = longestPrefixMatch('192.168.21.4', routes);
    expect(hitSpecific.cidr).toBe(29);
    expect(hitSpecific.interfaceId).toBe('eth0');

    const hitSummary = longestPrefixMatch('192.168.99.5', routes);
    expect(hitSummary.cidr).toBe(16);

    const hitDefault = longestPrefixMatch('8.8.8.8', routes);
    expect(hitDefault.cidr).toBe(0);
  });
});

describe('NetRunner Packet Simulation Engine (L1-L7)', () => {
  it('simulates ARP resolution, L2 Switch MAC learning, and ICMP Echo Reply', () => {
    const { devices, links } = createSwitchingLabTopology();
    const res = runPacketSimulation({
      devices,
      links,
      sourceDeviceId: 'pc-a',
      targetDeviceId: 'pc-b',
      protocol: 'ICMP',
    });

    expect(res.summary.success).toBe(true);
    expect(res.events.some((e) => e.protocol === 'ARP')).toBe(true);
    expect(res.events.some((e) => e.subType === 'ICMP Echo Reply')).toBe(true);

    // Verify Switch-Core-1 learned both source and destination MAC addresses
    const sw = res.finalDevices.find((d) => d.id === 'sw-core');
    expect(sw.macTable.length).toBeGreaterThanOrEqual(2);
  });

  it('detects /29 subnet boundary mismatch and drops packet with diagnostic reason', () => {
    const { devices, links } = createSubnetTroubleshootingLab();
    // pc-sub-2 has IP 10.10.10.12/29 trying to reach 10.10.10.2/29 (gateway 10.10.10.1 is unreachable from 10.10.10.12/29!)
    const res = runPacketSimulation({
      devices,
      links,
      sourceDeviceId: 'pc-sub-2',
      targetDeviceId: 'pc-sub-1',
      protocol: 'ICMP',
    });

    expect(res.summary.success).toBe(false);
    expect(res.summary.failureReasonCode).toBe('INVALID_DEFAULT_GATEWAY');
  });

  it('enforces missing Default Gateway and DOWN router interfaces until fixed', () => {
    const { devices, links } = createInterSubnetRoutingLab();
    // Initially pc-west has no defaultGateway
    const fail1 = runPacketSimulation({
      devices,
      links,
      sourceDeviceId: 'pc-west',
      targetDeviceId: 'srv-east',
      protocol: 'ICMP',
    });
    expect(fail1.summary.success).toBe(false);
    expect(fail1.summary.failureReasonCode).toBe('SUBNET_MISMATCH');

    // Fix defaultGateway on pc-west, but router eth1 is still DOWN
    const fixedGwDevices = devices.map((d) =>
      d.id === 'pc-west' ? { ...d, defaultGateway: '192.168.10.1' } : d
    );
    const fail2 = runPacketSimulation({
      devices: fixedGwDevices,
      links,
      sourceDeviceId: 'pc-west',
      targetDeviceId: 'srv-east',
      protocol: 'ICMP',
    });
    expect(fail2.summary.success).toBe(false);
    expect(fail2.summary.failureReasonCode).toBe('NO_ROUTE_TO_HOST');

    // Now bring router eth1 UP and verify full inter-subnet routing succeeds
    const fixedAllDevices = fixedGwDevices.map((d) =>
      d.id === 'rtr-core'
        ? {
            ...d,
            interfaces: d.interfaces.map((i) =>
              i.id === 'eth1' ? { ...i, adminUp: true } : i
            ),
          }
        : d
    );
    const okRes = runPacketSimulation({
      devices: fixedAllDevices,
      links,
      sourceDeviceId: 'pc-west',
      targetDeviceId: 'srv-east',
      protocol: 'ICMP',
    });
    expect(okRes.summary.success).toBe(true);
  });

  it('simulates DNS resolution + HTTP 200 OK and enforces Firewall ACL rules', () => {
    const { devices, links } = createSecurityFirewallLab();
    // HTTP request by domain name "netrunner.lab"
    const httpRes = runPacketSimulation({
      devices,
      links,
      sourceDeviceId: 'pc-campus',
      targetIpInput: 'netrunner.lab',
      protocol: 'HTTP',
    });
    expect(httpRes.summary.success).toBe(true);
    expect(httpRes.events.some((e) => e.protocol === 'DNS')).toBe(true);
    expect(httpRes.events.some((e) => e.subType === 'HTTP 200 OK')).toBe(true);

    // Add DENY ICMP rule on firewall
    const withDenyIcmp = devices.map((d) =>
      d.id === 'fw-main'
        ? {
            ...d,
            firewallRules: [
              ...d.firewallRules,
              {
                id: 'deny-icmp',
                name: 'Block ICMP',
                action: 'DENY',
                protocol: 'ICMP',
                srcNetwork: 'any',
                dstNetwork: 'any',
                enabled: true,
              },
            ],
          }
        : d
    );
    const blockedPing = runPacketSimulation({
      devices: withDenyIcmp,
      links,
      sourceDeviceId: 'pc-campus',
      targetIpInput: '10.0.2.100',
      protocol: 'ICMP',
    });
    expect(blockedPing.summary.success).toBe(false);
    expect(blockedPing.summary.failureReasonCode).toBe('FIREWALL_BLOCKED');
  });
});

describe('NetRunner UI Integration', () => {
  it('renders the NetRunner workspace, Simulation Panel, and opens modals', () => {
    render(<App />);
    expect(screen.getByText('NetRunner')).toBeInTheDocument();
    expect(screen.getByText('Simulation Panel')).toBeInTheDocument();
    expect(screen.getAllByText('PC Pixelz 1').length).toBeGreaterThan(0);

    // Open Packet Generator Modal
    fireEvent.click(screen.getByText('Send Packet'));
    expect(
      screen.getByText('Packet Generator & Protocol Simulator')
    ).toBeInTheDocument();
  });
});
