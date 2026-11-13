const departments = [
  { id: 'sales', name: 'Sales', vlan: 10, demand: 50, cidr: '192.168.10.0/26', gateway: '192.168.10.1', color: '#16846b' },
  { id: 'engineering', name: 'Engineering', vlan: 20, demand: 25, cidr: '192.168.10.64/27', gateway: '192.168.10.65', color: '#3568d4' },
  { id: 'management', name: 'Management', vlan: 30, demand: 10, cidr: '192.168.10.96/28', gateway: '192.168.10.97', color: '#a35090' }
];
export function ipv4(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(value)) throw Error('Enter a dotted-decimal IPv4 address without leading zeros.');
  const parsed = globalThis.ipaddr.parse(value);
  if (parsed.kind() !== 'ipv4') throw Error('IPv4 is required.');
  return parsed.octets.reduce((n, octet) => n * 256 + octet, 0);
}
export function address(n) { return [24, 16, 8, 0].map(shift => Math.floor(n / 2 ** shift) % 256).join('.'); }
export function subnet(cidr) {
  const parts = String(cidr).split('/');
  if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1])) throw Error('Use IPv4/prefix, for example 192.168.10.0/26.');
  const ip = ipv4(parts[0]), prefix = Number(parts[1]);
  if (prefix > 32) throw Error('Prefix must be between 0 and 32.');
  const size = 2 ** (32 - prefix), network = Math.floor(ip / size) * size, broadcast = network + size - 1;
  return { prefix, size, network, broadcast, mask: address(2 ** 32 - size), usable: Math.max(0, size - 2), first: network + 1, last: broadcast - 1, canonical: `${address(network)}/${prefix}` };
}
export function initialState() {
  return { version: 1, mode: 'learn', routing: true,
    departments: departments.map(d => ({ ...d, trunk: true })),
    hosts: departments.flatMap((d, i) => [0, 1].map((offset) => ({ id: `pc-${i * 2 + offset + 1}`, name: `${d.name === 'Engineering' ? 'ENG' : d.name.slice(0, 3).toUpperCase()}-0${offset + 1}`, department: d.id, ip: address(ipv4(d.gateway) + offset + 1), prefix: Number(d.cidr.split('/')[1]), gateway: d.gateway, vlan: d.vlan }))) };
}
export function validate(state) {
  const issues = [], nets = new Map(), parent = subnet('192.168.10.0/24');
  for (const d of state.departments) {
    try {
      const n = subnet(d.cidr); nets.set(d.id, n);
      if (d.cidr !== n.canonical) issues.push(`${d.name}: use the network boundary ${n.canonical}.`);
      if (n.network < parent.network || n.broadcast > parent.broadcast) issues.push(`${d.name}: subnet must stay inside 192.168.10.0/24.`);
      if (n.usable < d.demand) issues.push(`${d.name}: ${n.usable} usable addresses cannot fit ${d.demand} devices, including the gateway.`);
    } catch { issues.push(`${d.name}: invalid subnet.`); }
    try {
      const g = ipv4(d.gateway), n = nets.get(d.id);
      if (n && (g < n.first || g > n.last || n.usable === 0)) issues.push(`${d.name}: router gateway must be a usable subnet address.`);
    } catch { issues.push(`${d.name}: invalid router gateway.`); }
    if (!Number.isInteger(d.vlan) || d.vlan < 1 || d.vlan > 4094) issues.push(`${d.name}: VLAN ID must be 1-4094.`);
    if (!d.trunk) issues.push(`${d.name}: VLAN is missing from the switch uplink trunk.`);
  }
  for (let i = 0; i < state.departments.length; i++) for (let j = i + 1; j < state.departments.length; j++) {
    const a = state.departments[i], b = state.departments[j], an = nets.get(a.id), bn = nets.get(b.id);
    if (a.vlan === b.vlan) issues.push(`${a.name} and ${b.name}: department VLAN IDs must be distinct.`);
    if (an && bn && an.network <= bn.broadcast && bn.network <= an.broadcast) issues.push(`${a.name} and ${b.name}: subnet ranges overlap.`);
  }
  for (const h of state.hosts) {
    const d = state.departments.find(d => d.id === h.department), n = nets.get(h.department);
    if (h.connected === false) issues.push(`${h.name}: access cable is disconnected.`);
    try {
      const ip = ipv4(h.ip);
      if (!n || n.usable === 0 || ip < n.first || ip > n.last) issues.push(`${h.name}: IP must be a usable address in ${d.cidr}.`);
      if (!n || h.prefix !== n.prefix) issues.push(`${h.name}: prefix does not match its department subnet.`);
      if (state.hosts.some(other => other.id !== h.id && other.ip === h.ip) || state.departments.some(d => d.gateway === h.ip)) issues.push(`${h.name}: IP address is already assigned to a host or gateway.`);
    } catch { issues.push(`${h.name}: invalid IPv4 address.`); }
    try { ipv4(h.gateway); } catch { issues.push(`${h.name}: invalid default gateway.`); }
    if (h.vlan !== d.vlan) issues.push(`${h.name}: access-port VLAN must match VLAN ${d.vlan}.`);
    if (h.gateway !== d.gateway) issues.push(`${h.name}: default gateway does not match ${d.gateway}.`);
  }
  return issues;
}
export function ping(state, sourceId, targetId) {
  const a = state.hosts.find(h => h.id === sourceId), b = state.hosts.find(h => h.id === targetId);
  const steps = [];
  const fail = message => ({ ok: false, steps: [...steps, { label: message, status: 'fail' }] });
  if (!a || !b) return fail('Select two valid endpoints.');
  if (a.id === b.id) return fail('Choose different endpoints for a network test.');
  const da = state.departments.find(d => d.id === a.department), db = state.departments.find(d => d.id === b.department);
  const path = a.department === b.department ? [a.id, `sw-${da.id}`, b.id] : [a.id, `sw-${da.id}`, 'router', `sw-${db.id}`, b.id];
  steps.push({ label: `${a.name} (${a.ip}) sends an ICMP echo request.`, status: 'pass' });
  const hostNets = new Map();
  for (const h of [a, b]) {
    const d = state.departments.find(d => d.id === h.department);
    if (h.connected === false) return fail(`${h.name}: access cable is disconnected.`);
    if (!Number.isInteger(h.vlan) || h.vlan < 1 || h.vlan > 4094 || h.vlan !== d.vlan) return fail(`${h.name}: access-port VLAN must match VLAN ${d.vlan}.`);
    try {
      const n = subnet(`${h.ip}/${h.prefix}`), ip = ipv4(h.ip);
      if (!Number.isInteger(h.prefix) || n.usable === 0 || ip < n.first || ip > n.last) return fail(`${h.name}: address is not a usable host address for its prefix.`);
      hostNets.set(h.id, n);
      if (state.hosts.some(other => other.id !== h.id && other.department === h.department && other.connected !== false && other.vlan === h.vlan && other.ip === h.ip) || d.gateway === h.ip) return fail(`${h.name}: duplicate address in its local segment.`);
    } catch { return fail(`${h.name}: invalid IPv4 address or prefix.`); }
  }
  const seesLocal = (source, target) => { const n = hostNets.get(source.id), ip = ipv4(target.ip); return ip >= n.network && ip <= n.broadcast; };
  if (a.department === b.department) {
    if (!seesLocal(a,b) || !seesLocal(b,a)) return fail('The endpoints do not both regard the peer as local. Check their addresses and prefixes.');
  } else {
    if (seesLocal(a,b) || seesLocal(b,a)) return fail('A host regards the remote endpoint as local and cannot resolve it on its own VLAN. Check the prefix.');
    for (const h of [a,b]) {
      const d = state.departments.find(d => d.id === h.department);
      if (!d.trunk) return fail(`${d.name}: VLAN is missing from the switch uplink trunk.`);
      try {
        const g = ipv4(h.gateway), n = hostNets.get(h.id), routerNet = subnet(d.cidr);
        if (h.gateway !== d.gateway || g < n.first || g > n.last || g < routerNet.first || g > routerNet.last) return fail(`${h.name}: default gateway is not the reachable router interface.`);
        if (ipv4(h.ip) < routerNet.first || ipv4(h.ip) > routerNet.last) return fail(`${h.name}: the router's connected subnet does not cover the endpoint.`);
      } catch { return fail(`${h.name}: invalid gateway or router subnet.`); }
    }
    const an = subnet(da.cidr), bn = subnet(db.cidr);
    if (da.vlan === db.vlan || (an.network <= bn.broadcast && bn.network <= an.broadcast)) return fail('The selected routed segments have an ambiguous VLAN or subnet configuration.');
  }
  const sourceSwitch = state.departments.indexOf(da) + 1, targetSwitch = state.departments.indexOf(db) + 1;
  steps.push({ label: `SW-${sourceSwitch}: access port places traffic in VLAN ${da.vlan}.`, status: 'pass' });
  if (a.department !== b.department) {
    steps.push({ label: `Destination is outside /${a.prefix}; forward to gateway ${a.gateway} over the tagged uplink.`, status: 'pass' });
    if (!state.routing) return fail('R1 has inter-VLAN routing disabled. No route between the VLANs.');
    steps.push({ label: `R1 routes from VLAN ${da.vlan} to VLAN ${db.vlan}.`, status: 'pass' });
    steps.push({ label: `SW-${targetSwitch} forwards the frame to ${b.name}'s access port.`, status: 'pass' });
  } else steps.push({ label: `Destination is local. ARP resolves ${b.ip}; the switch forwards directly without R1.`, status: 'pass' });
  steps.push({ label: `${b.name} replies. The return path is valid.`, status: 'pass' });
  return { ok: true, steps, path };
}
export function restoredState(value) {
  if (value?.version === 2) {
    if (!['learn', 'practice', 'challenge'].includes(value.mode) || typeof value.routing !== 'boolean' || !Array.isArray(value.departments) || value.departments.length < 1 || value.departments.length > 8 || !Array.isArray(value.hosts) || value.hosts.length > 24) throw Error('Invalid network configuration.');
    const ids = new Set();
    const cleanId = id => { if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(id) || ids.has(id)) throw Error('Invalid or duplicate device ID.'); ids.add(id); return id; };
    const str = v => { if (typeof v !== 'string' || v.length > 64) throw Error('Invalid device text.'); return v; };
    const integer = v => { if (!Number.isInteger(v)) throw Error('Invalid numeric setting.'); return v; };
    const departments = value.departments.map((d, i) => {
      if (typeof d.trunk !== 'boolean' || !Number.isInteger(d.demand) || d.demand < 1 || d.demand > 65534) throw Error('Invalid switch settings.');
      return { id: cleanId(d.id), name: str(d.name), cidr: str(d.cidr), gateway: str(d.gateway), vlan: integer(d.vlan), demand: d.demand, trunk: d.trunk, color: ['#16846b', '#3568d4', '#a35090', '#a16b16'][i % 4] };
    });
    const hosts = value.hosts.map(h => {
      if (!/^pc-[a-z0-9-]+$/.test(h.id)) throw Error('Invalid host ID.');
      if (!departments.some(d => d.id === h.department) || (h.connected !== undefined && typeof h.connected !== 'boolean')) throw Error('Invalid host connection.');
      return { id: cleanId(h.id), name: str(h.name), department: h.department, ip: str(h.ip), gateway: str(h.gateway), prefix: integer(h.prefix), vlan: integer(h.vlan), connected: h.connected !== false };
    });
    const positions = {};
    const valid = new Set(['router', ...departments.map(d => `sw-${d.id}`), ...hosts.map(h => h.id)]);
    for (const [id, p] of Object.entries(value.positions || {})) {
      if (!valid.has(id) || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 65 || p.x > 2335 || p.y < 35 || p.y > 965) throw Error('Invalid device position.');
      positions[id] = { x: p.x, y: p.y };
    }
    return { version: 2, mode: value.mode, routing: value.routing, departments, hosts, positions };
  }
  const base = initialState();
  if (!value || value.version !== 1 || !['learn', 'practice', 'challenge'].includes(value.mode) || typeof value.routing !== 'boolean' || !Array.isArray(value.departments) || !Array.isArray(value.hosts) || value.departments.length !== 3 || value.hosts.length !== 6) throw Error('Not a compatible Network Workshop configuration.');
  base.mode = value.mode; base.routing = value.routing;
  for (const d of base.departments) {
    const v = value.departments.find(x => x.id === d.id);
    if (!v || typeof v.cidr !== 'string' || typeof v.gateway !== 'string' || !Number.isInteger(v.vlan) || typeof v.trunk !== 'boolean') throw Error('Invalid department configuration.');
    Object.assign(d, { cidr: v.cidr.slice(0, 64), gateway: v.gateway.slice(0, 64), vlan: v.vlan, trunk: v.trunk });
  }
  for (const h of base.hosts) {
    const v = value.hosts.find(x => x.id === h.id);
    if (!v || typeof v.ip !== 'string' || typeof v.gateway !== 'string' || !Number.isInteger(v.prefix) || !Number.isInteger(v.vlan)) throw Error('Invalid host configuration.');
    Object.assign(h, { ip: v.ip.slice(0, 64), gateway: v.gateway.slice(0, 64), prefix: v.prefix, vlan: v.vlan });
  }
  return base;
}
export function packetFrames(state, sourceId, targetId) {
  const result = ping(state, sourceId, targetId);
  if (!result.ok) return [{ label: result.steps.at(-1).label, failed: true, path: [] }];
  const a = state.hosts.find(h => h.id === sourceId), b = state.hosts.find(h => h.id === targetId);
  const da = state.departments.find(d => d.id === a.department), db = state.departments.find(d => d.id === b.department);
  const mac = id => {
    let n = 0; for (const c of id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
    return '02:00:' + [24, 16, 8, 0].map(bit => ((n >>> bit) & 255).toString(16).padStart(2, '0')).join(':');
  };
  const local = da.id === db.id, srcMac = mac(a.id), dstMac = mac(b.id), inMac = mac('router-' + da.id), outMac = mac('router-' + db.id);
  const frame = (label, path, sourceMAC, destinationMAC, tag, ttl) => ({ label, path, sourceIP: a.ip, destinationIP: b.ip, sourceMAC, destinationMAC, tag, ttl });
  const swA = `sw-${da.id}`, swB = `sw-${db.id}`;
  if (local) return [
    frame('Source sends an untagged Ethernet frame to the destination MAC learned through ARP.', [a.id], srcMac, dstMac, 'Untagged', 64),
    frame(`The access switch forwards within VLAN ${da.vlan}. No routing or TTL decrement occurs.`, [a.id, swA], srcMac, dstMac, 'Untagged', 64),
    frame('Destination receives the echo request. The simulated return path is valid.', [a.id, swA, b.id], srcMac, dstMac, 'Untagged', 64)
  ];
  return [
    frame('Remote subnet: source addresses the Ethernet frame to its gateway MAC, not the remote host MAC.', [a.id], srcMac, inMac, 'Untagged', 64),
    frame(`Access switch adds VLAN ${da.vlan} on its 802.1Q uplink.`, [a.id, swA], srcMac, inMac, da.vlan, 64),
    frame('R1 receives the frame on the source VLAN subinterface and looks up the destination network.', [a.id, swA, 'router'], srcMac, inMac, da.vlan, 64),
    frame('R1 creates a new Ethernet header for the destination VLAN and decrements the IP TTL.', [a.id, swA, 'router', swB], outMac, dstMac, db.vlan, 63),
    frame('Destination switch removes the VLAN tag on the access port. Destination receives the request; the return path is valid.', result.path, outMac, dstMac, 'Untagged', 63)
  ];
}
