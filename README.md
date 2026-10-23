# NetRunner — Interactive Network Simulator, Packet Visualizer & Networking Lab

**Build networks. Trace packets. Understand the internet.**

NetRunner is an interactive browser-based network simulation engine and packet laboratory inspired by Cisco Packet Tracer. Every action on the canvas is backed by a real, deterministic Layer 1–Layer 7 networking engine—never decorative or fake animations.

---

## Key Capabilities

- **Interactive Visual Topology Builder**: Drag and drop Desktop PCs, Laptops, Smartphones, Multi-Service Servers, Layer 2 Managed Switches, Layer 1 Hubs, Layer 3 Routers, Security Firewalls, and ISP Cloud nodes. Connect interfaces with virtual Ethernet cables.
- **Real Subnetting & CIDR Engine**: Configure IPv4 addresses, subnet masks, and CIDR prefixes (`/8` to `/32`) with a live Subnet Calculator that computes Network ID, Broadcast Address, and Usable Host Range, and flags reserved network/broadcast assignments.
- **Layer 2 Switching & Dynamic MAC Learning**: Managed switches dynamically learn source MAC addresses in their CAM tables, support port-level VLAN IDs (`access` and `802.1Q trunk`), flood broadcast/unknown-unicast frames, and unicast-forward known MAC destinations.
- **Authentic ARP Resolution**: Before any IPv4 packet is transmitted, devices inspect their ARP cache. On an ARP miss, the IPv4 packet is held while a broadcast `ARP Request (FF:FF:FF:FF:FF:FF)` is transmitted across the broadcast domain and resolved via a unicast `ARP Reply`.
- **Layer 3 Routing & Longest Prefix Match (LPM)**: Multi-interface routers maintain connected and static routes, perform Longest Prefix Match lookups, decrement IPv4 TTL on each hop, and emit `ICMP Time Exceeded` when TTL reaches zero.
- **Layer 4–7 Protocols & Firewall ACLs**: Simulate `ICMP Echo Request/Reply` (Ping), `Traceroute`, `DNS Queries` (A-record resolution), `HTTP GET / 200 OK`, `DHCP Leases (DORA)`, and ordered `ALLOW / DENY` Firewall ACL rules.
- **Deep OSI Layer 1–7 Packet Inspector**: Click any event in the Simulation Panel to inspect the exact L1 physical medium, L2 Ethernet II headers, L3 IPv4/ARP headers, L4 TCP/UDP/ICMP segments, L7 payloads, and internal device stack decisions.
- **6 Progressive Networking Labs & Live Diagnostics**: Guided hands-on challenges with real-time objective verification and an automated topology health analyzer.

---

## Architecture

1. **`src/engine/ipUtils.js`** — Pure IPv4 validation, 32-bit bitwise subnetting, CIDR conversion, same-subnet verification, and Longest Prefix Match (LPM) route lookup.
2. **`src/engine/deviceModels.js`** — Device factories, multi-interface schemas, and automatic connected-route synchronization.
3. **`src/engine/packetEngine.js`** — Discrete-event L1–L7 simulation engine handling ARP broadcasts, Switch CAM learning, VLAN filtering, Router LPM forwarding, TTL expiration, DNS/HTTP/DHCP services, and Firewall ACL evaluation.
4. **`src/engine/networkDiagnostics.js`** — Real-time topology audit engine detecting duplicate IPs, subnet mismatches, down interfaces, and unreachable gateways.
5. **`src/labs/labsData.js`** — 6 interactive labs with automated objective verification.
6. **`src/store/useNetworkStore.js` & `src/components/`** — Zustand state store and React + `@xyflow/react` workspace UI.

---

## Getting Started

```bash
npm install
npm run dev
```

### Run Unit & Integration Tests

```bash
npm test
```

### Build for Production

```bash
npm run build
```
