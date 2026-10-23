/**
 * NetRunner Core IPv4, Subnetting, CIDR, and MAC Address Utilities
 * Pure deterministic networking calculations with zero UI dependencies.
 */

/**
 * Validates whether a string is a valid dotted-decimal IPv4 address.
 * @param {string} ip
 * @returns {boolean}
 */
export function isValidIpv4(ip) {
  if (typeof ip !== 'string') return false;
  const trimmed = ip.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false;
    if (part.length > 1 && part.startsWith('0')) return false;
    const num = Number(part);
    if (num < 0 || num > 255) return false;
  }
  return true;
}

/**
 * Converts a dotted-decimal IPv4 string to an unsigned 32-bit integer.
 * @param {string} ip
 * @returns {number}
 */
export function ipToInt(ip) {
  if (!isValidIpv4(ip)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  const parts = ip.trim().split('.').map(Number);
  return (
    ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
  );
}

/**
 * Converts an unsigned 32-bit integer to a dotted-decimal IPv4 string.
 * @param {number} intVal
 * @returns {string}
 */
export function intToIp(intVal) {
  const unsigned = intVal >>> 0;
  return [
    (unsigned >>> 24) & 255,
    (unsigned >>> 16) & 255,
    (unsigned >>> 8) & 255,
    unsigned & 255,
  ].join('.');
}

/**
 * Converts CIDR prefix length (0-32) to a 32-bit unsigned subnet mask integer.
 * @param {number} prefix
 * @returns {number}
 */
export function cidrToMaskInt(prefix) {
  const p = Number(prefix);
  if (!Number.isInteger(p) || p < 0 || p > 32) {
    throw new Error(`Invalid CIDR prefix: ${prefix}`);
  }
  if (p === 0) return 0;
  return (0xffffffff << (32 - p)) >>> 0;
}

/**
 * Converts CIDR prefix length (0-32) to dotted-decimal subnet mask string.
 * @param {number} prefix
 * @returns {string}
 */
export function cidrToSubnetMask(prefix) {
  return intToIp(cidrToMaskInt(prefix));
}

/**
 * Validates whether a dotted-decimal string is a contiguous IPv4 subnet mask.
 * @param {string} mask
 * @returns {boolean}
 */
export function isValidSubnetMask(mask) {
  if (!isValidIpv4(mask)) return false;
  const maskInt = ipToInt(mask);
  if (maskInt === 0) return true;
  const inverted = (~maskInt) >>> 0;
  return ((inverted + 1) & inverted) === 0;
}

/**
 * Converts a dotted-decimal subnet mask to its CIDR prefix length (0-32).
 * @param {string} mask
 * @returns {number}
 */
export function subnetMaskToCidr(mask) {
  if (typeof mask === 'number') {
    if (mask >= 0 && mask <= 32) return mask;
    throw new Error(`Invalid CIDR number: ${mask}`);
  }
  const str = String(mask).trim();
  if (str.startsWith('/')) {
    const p = Number(str.slice(1));
    if (Number.isInteger(p) && p >= 0 && p <= 32) return p;
  }
  if (/^\d{1,2}$/.test(str)) {
    const p = Number(str);
    if (p >= 0 && p <= 32) return p;
  }
  if (!isValidSubnetMask(str)) {
    throw new Error(`Invalid subnet mask: ${mask}`);
  }
  const maskInt = ipToInt(str);
  let bits = 0;
  let temp = maskInt;
  while (temp & 0x80000000) {
    bits++;
    temp = (temp << 1) >>> 0;
  }
  return bits;
}

/**
 * Normalizes a mask input (either '/24', 24, or '255.255.255.0') into both mask and cidr.
 * @param {string|number} maskOrCidr
 * @returns {{ subnetMask: string, cidr: number }}
 */
export function normalizeMask(maskOrCidr) {
  try {
    const cidr = subnetMaskToCidr(maskOrCidr);
    return {
      cidr,
      subnetMask: cidrToSubnetMask(cidr),
    };
  } catch {
    return {
      cidr: 24,
      subnetMask: '255.255.255.0',
    };
  }
}

/**
 * Computes full subnet details for a given IPv4 address and subnet mask / CIDR.
 * @param {string} ip
 * @param {string|number} maskOrCidr
 */
export function getSubnetDetails(ip, maskOrCidr) {
  if (!isValidIpv4(ip)) {
    return null;
  }
  let cidr;
  try {
    cidr = subnetMaskToCidr(maskOrCidr);
  } catch {
    return null;
  }
  const ipInt = ipToInt(ip);
  const maskInt = cidrToMaskInt(cidr);
  const networkInt = (ipInt & maskInt) >>> 0;
  const wildcardInt = (~maskInt) >>> 0;
  const broadcastInt = (networkInt | wildcardInt) >>> 0;

  const firstHostInt = cidr >= 31 ? networkInt : (networkInt + 1) >>> 0;
  const lastHostInt = cidr >= 31 ? broadcastInt : (broadcastInt - 1) >>> 0;
  const usableHosts =
    cidr === 32 ? 1 : cidr === 31 ? 2 : Math.max(0, Math.pow(2, 32 - cidr) - 2);

  const isNetworkAddress = cidr < 31 && ipInt === networkInt;
  const isBroadcastAddress = cidr < 31 && ipInt === broadcastInt;
  const isLoopback = (ipInt >>> 24) === 127;
  const isMulticast = (ipInt >>> 24) >= 224 && (ipInt >>> 24) <= 239;

  return {
    ip,
    cidr,
    subnetMask: intToIp(maskInt),
    networkAddress: intToIp(networkInt),
    broadcastAddress: intToIp(broadcastInt),
    firstUsableHost: intToIp(firstHostInt),
    lastUsableHost: intToIp(lastHostInt),
    usableHosts,
    isNetworkAddress,
    isBroadcastAddress,
    isLoopback,
    isMulticast,
    isValidHostIp: !isNetworkAddress && !isBroadcastAddress && !isLoopback && !isMulticast,
  };
}

/**
 * Checks whether two IPv4 addresses belong to the same subnet from the perspective of a given mask.
 * @param {string} ipA
 * @param {string} ipB
 * @param {string|number} maskOrCidr
 * @returns {boolean}
 */
export function isSameSubnet(ipA, ipB, maskOrCidr) {
  if (!isValidIpv4(ipA) || !isValidIpv4(ipB)) return false;
  try {
    const cidr = subnetMaskToCidr(maskOrCidr);
    const maskInt = cidrToMaskInt(cidr);
    return ((ipToInt(ipA) & maskInt) >>> 0) === ((ipToInt(ipB) & maskInt) >>> 0);
  } catch {
    return false;
  }
}

/**
 * Checks whether an IP address matches a target network + mask/CIDR.
 * Supports CIDR strings like '192.168.1.0/24', '0.0.0.0/0', 'any', or separate network & mask.
 * @param {string} ip
 * @param {string} networkOrCidr
 * @param {string|number} [explicitMask]
 * @returns {boolean}
 */
export function ipMatchesNetwork(ip, networkOrCidr, explicitMask) {
  if (!isValidIpv4(ip)) return false;
  if (!networkOrCidr || networkOrCidr === 'any' || networkOrCidr === '*') return true;

  let netStr = networkOrCidr.trim();
  let maskSpec = explicitMask;

  if (netStr.includes('/')) {
    const [n, c] = netStr.split('/');
    netStr = n;
    maskSpec = Number(c);
  } else if (maskSpec === undefined) {
    maskSpec = 32;
  }

  if (!isValidIpv4(netStr)) return false;
  try {
    const cidr = subnetMaskToCidr(maskSpec);
    if (cidr === 0) return true;
    const maskInt = cidrToMaskInt(cidr);
    return ((ipToInt(ip) & maskInt) >>> 0) === ((ipToInt(netStr) & maskInt) >>> 0);
  } catch {
    return false;
  }
}

/**
 * Performs Longest Prefix Match (LPM) route lookup in a routing table.
 * Each route has: { network: '192.168.1.0', mask: '255.255.255.0' (or cidr), nextHop: '10.0.0.2' | 'connected', interfaceId: 'eth0', metric?: number, enabled?: boolean }
 * @param {string} dstIp
 * @param {Array} routes
 * @returns {object|null} Matching route with longest prefix (and lowest metric tie-breaker)
 */
export function longestPrefixMatch(dstIp, routes) {
  if (!isValidIpv4(dstIp) || !Array.isArray(routes)) return null;

  let bestRoute = null;
  let bestPrefix = -1;
  let bestMetric = Infinity;

  for (const route of routes) {
    if (route.enabled === false) continue;
    const maskInput = route.cidr !== undefined ? route.cidr : route.mask;
    let cidr;
    try {
      cidr = subnetMaskToCidr(maskInput);
    } catch {
      continue;
    }

    if (ipMatchesNetwork(dstIp, route.network, cidr)) {
      const metric = Number(route.metric ?? (route.type === 'connected' ? 0 : 1));
      if (cidr > bestPrefix || (cidr === bestPrefix && metric < bestMetric)) {
        bestPrefix = cidr;
        bestMetric = metric;
        bestRoute = { ...route, cidr };
      }
    }
  }

  return bestRoute;
}

/**
 * Validates a MAC address (e.g., '00:1A:2B:3C:4D:5E').
 * @param {string} mac
 * @returns {boolean}
 */
export function isValidMac(mac) {
  if (typeof mac !== 'string') return false;
  return /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(mac.trim());
}

/**
 * Deterministically generates a clean, realistic MAC address from a seed counter or string.
 * @param {number|string} seed
 * @param {string} prefix - OUI prefix, default '00:1A:2B'
 * @returns {string}
 */
export function generateMac(seed, prefix = '00:1A:2B') {
  let num = typeof seed === 'number' ? seed : 0;
  if (typeof seed === 'string') {
    for (let i = 0; i < seed.length; i++) {
      num = (num * 31 + seed.charCodeAt(i)) >>> 0;
    }
  }
  const b1 = ((num >>> 16) & 0xff).toString(16).padStart(2, '0').toUpperCase();
  const b2 = ((num >>> 8) & 0xff).toString(16).padStart(2, '0').toUpperCase();
  const b3 = (num & 0xff).toString(16).padStart(2, '0').toUpperCase();
  return `${prefix.toUpperCase()}:${b1}:${b2}:${b3}`;
}

export const BROADCAST_MAC = 'FF:FF:FF:FF:FF:FF';
