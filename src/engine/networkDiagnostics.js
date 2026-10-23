import { getSubnetDetails, isSameSubnet, isValidIpv4 } from './ipUtils.js';
import { DEVICE_TYPES } from './deviceModels.js';
import { findConnectedLink } from './packetEngine.js';

/**
 * Analyzes a network topology and returns a list of actionable diagnostic findings
 * (errors, warnings, and healthy checks).
 */
export function analyzeTopologyDiagnostics(devices, links) {
  const issues = [];
  const ipOwners = new Map();

  for (const dev of devices) {
    const isL2Only =
      dev.type === DEVICE_TYPES.SWITCH || dev.type === DEVICE_TYPES.HUB;

    // Check if device has any connected link at all
    const connectedLinks = links.filter(
      (l) => l.source === dev.id || l.target === dev.id
    );
    if (connectedLinks.length === 0) {
      issues.push({
        id: `unconnected-${dev.id}`,
        severity: 'warning',
        deviceId: dev.id,
        deviceName: dev.name,
        code: 'UNCONNECTED_DEVICE',
        title: `${dev.name} is disconnected`,
        detail: `${dev.name} has no virtual network cables attached to any interface.`,
        remediation: 'Use the Cable tool or drag between device ports to connect this device.',
      });
    }

    if (isL2Only) continue;

    for (const iface of dev.interfaces || []) {
      const hasLink = Boolean(findConnectedLink(links, dev.id, iface.id));

      if (hasLink && !iface.adminUp) {
        issues.push({
          id: `ifdown-${dev.id}-${iface.id}`,
          severity: 'error',
          deviceId: dev.id,
          deviceName: dev.name,
          code: 'INTERFACE_DOWN',
          title: `Port ${iface.name} on ${dev.name} is DOWN`,
          detail: `A cable is attached to ${iface.name}, but the port is administratively disabled.`,
          remediation: `Open ${dev.name} configuration and toggle ${iface.name} status to UP.`,
        });
      }

      if (!iface.ip && hasLink) {
        issues.push({
          id: `noip-${dev.id}-${iface.id}`,
          severity: 'warning',
          deviceId: dev.id,
          deviceName: dev.name,
          code: 'MISSING_IP',
          title: `Unassigned IP on ${dev.name} (${iface.name})`,
          detail: `Connected interface ${iface.name} has no IPv4 address configured.`,
          remediation: `Assign a valid IPv4 address and subnet mask to ${dev.name} (${iface.name}).`,
        });
        continue;
      }

      if (iface.ip) {
        if (!isValidIpv4(iface.ip)) {
          issues.push({
            id: `badip-${dev.id}-${iface.id}`,
            severity: 'error',
            deviceId: dev.id,
            deviceName: dev.name,
            code: 'INVALID_IPV4',
            title: `Invalid IPv4 "${iface.ip}" on ${dev.name}`,
            detail: `The configured IP "${iface.ip}" is not a valid dotted-decimal IPv4 address.`,
            remediation: 'Enter a valid IPv4 address (e.g. 192.168.1.10).',
          });
          continue;
        }

        // Duplicate IP check
        if (ipOwners.has(iface.ip)) {
          const prev = ipOwners.get(iface.ip);
          issues.push({
            id: `dupip-${dev.id}-${iface.ip}`,
            severity: 'error',
            deviceId: dev.id,
            deviceName: dev.name,
            code: 'DUPLICATE_IP',
            title: `IP Address Conflict: ${iface.ip}`,
            detail: `Both ${prev.deviceName} (${prev.ifaceName}) and ${dev.name} (${iface.name}) are assigned ${iface.ip}.`,
            remediation: `Assign a unique host IP address to ${dev.name} or ${prev.deviceName}.`,
          });
        } else {
          ipOwners.set(iface.ip, {
            deviceId: dev.id,
            deviceName: dev.name,
            ifaceName: iface.name,
          });
        }

        // Check usable host address
        const sub = getSubnetDetails(iface.ip, iface.cidr ?? iface.subnetMask);
        if (sub && !sub.isValidHostIp) {
          issues.push({
            id: `nonhost-${dev.id}-${iface.id}`,
            severity: 'error',
            deviceId: dev.id,
            deviceName: dev.name,
            code: 'RESERVED_SUBNET_IP',
            title: `Reserved Subnet Address on ${dev.name}`,
            detail: `${iface.ip}/${sub.cidr} is the ${
              sub.isNetworkAddress ? 'Network ID' : 'Broadcast Address'
            } for subnet ${sub.networkAddress}/${sub.cidr}.`,
            remediation: `Choose a usable host IP between ${sub.firstUsableHost} and ${sub.lastUsableHost}.`,
          });
        }
      }
    }

    // End-host gateway validation
    const isEndHost = [
      DEVICE_TYPES.PC,
      DEVICE_TYPES.LAPTOP,
      DEVICE_TYPES.SMARTPHONE,
      DEVICE_TYPES.SERVER,
    ].includes(dev.type);

    if (isEndHost && dev.defaultGateway) {
      const iface = dev.interfaces?.[0];
      if (!isValidIpv4(dev.defaultGateway)) {
        issues.push({
          id: `badgw-${dev.id}`,
          severity: 'error',
          deviceId: dev.id,
          deviceName: dev.name,
          code: 'INVALID_GATEWAY',
          title: `Malformed Default Gateway on ${dev.name}`,
          detail: `"${dev.defaultGateway}" is not a valid IPv4 address.`,
          remediation: 'Set Default Gateway to the local router interface IP.',
        });
      } else if (
        iface &&
        isValidIpv4(iface.ip) &&
        !isSameSubnet(iface.ip, dev.defaultGateway, iface.cidr ?? iface.subnetMask)
      ) {
        const sub = getSubnetDetails(iface.ip, iface.cidr ?? iface.subnetMask);
        issues.push({
          id: `unreachable-gw-${dev.id}`,
          severity: 'error',
          deviceId: dev.id,
          deviceName: dev.name,
          code: 'GATEWAY_SUBNET_MISMATCH',
          title: `Default Gateway Unreachable on ${dev.name}`,
          detail: `Gateway ${dev.defaultGateway} is outside ${dev.name}'s subnet (${sub?.networkAddress}/${sub?.cidr}, range ${sub?.firstUsableHost}–${sub?.lastUsableHost}).`,
          remediation: `Update ${dev.name}'s IP/Subnet Mask or set Default Gateway to an IP inside ${sub?.networkAddress}/${sub?.cidr}.`,
        });
      }
    }
  }

  return issues;
}
