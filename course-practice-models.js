import { initialState, ping, packetFrames, ipv4, subnet } from './core.js';
import { initialSwitch, configurePort, transmit } from './switching-core.js';
import { initialOperation, advanceOperation, operations } from './operations-core.js';
import { initialMitm, poisonCache, inspectSession, initialLoad, loadStep } from './security-core.js';

const step = (node, message) => ({ node, message });
const check = (label, ok, detail) => ({ label, ok, detail });
const probe = (result, label) => check(label, result.ok, result.steps.at(-1).label);
const transcript = (label, result) => result.steps.map(e => step(e.node, label + ': ' + e.message));
const asInt = (value, min, max, name) => {
  const n = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isInteger(n) || n < min || n > max) throw Error(name + ' must be a whole number from ' + min + ' to ' + max + '.');
  return n;
};

export function devicePaths(c) {
  const state = initialState();
  state.hosts[0].connected = c.access;
  state.departments[0].trunk = c.uplink;
  state.routing = c.routing;
  const local = ping(state, 'pc-1', 'pc-2'), routed = ping(state, 'pc-1', 'pc-3');
  return { events: [
    step(0, 'Source access link: ' + (c.access ? 'up' : 'down') + '.'),
    step(1, 'Same-LAN probe: ' + local.steps.at(-1).label),
    step(1, 'Sales uplink carries VLAN 10: ' + (c.uplink ? 'yes' : 'no') + '.'),
    step(2, 'Inter-VLAN forwarding: ' + (c.routing ? 'enabled' : 'disabled') + '.'),
    step(2, 'Remote probe: ' + routed.steps.at(-1).label)
  ], checks: [probe(local, 'Local path'), probe(routed, 'Routed path')] };
}

export function headerPaths(c) {
  const state = initialState();
  state.hosts[0].prefix = asInt(c.prefix, 1, 30, 'Source prefix');
  state.hosts[0].gateway = c.gateway;
  const local = packetFrames(state, 'pc-1', 'pc-2'), routed = packetFrames(state, 'pc-1', 'pc-3');
  const frames = [...local.map(f => ['Local', f]), ...routed.map(f => ['Routed', f])];
  return {
    events: frames.map(([label, f]) => {
      const hop = f.path.at(-1);
      return step(hop === 'router' ? 2 : hop?.startsWith('sw-') ? 1 : f.path.length === 1 || f.failed ? 0 : 3,
        label + ': ' + f.label + (f.failed ? '' : ' IP ' + f.sourceIP + ' -> ' + f.destinationIP + ', Ethernet ' + f.sourceMAC + ' -> ' + f.destinationMAC + ', TTL ' + f.ttl + ', tag ' + f.tag + '.'));
    }),
    checks: [
      check('Local forwarding', !local[0].failed, local.at(-1).label),
      check('Routed forwarding', !routed[0].failed, routed.at(-1).label),
      check('Address-plan alignment', state.hosts[0].prefix === 26 && c.gateway === '192.168.10.1', 'Sales plan: /26 with gateway 192.168.10.1.')
    ],
    facts: routed[0].failed ? [] : [
      ['First-hop Ethernet destination', routed[0].destinationMAC + ' (gateway)'],
      ['Final Ethernet destination', routed.at(-1).destinationMAC + ' (peer)'],
      ['IP destination throughout', routed[0].destinationIP],
      ['TTL before and after routing', routed[0].ttl + ' -> ' + routed.at(-1).ttl]
    ]
  };
}

export function vlanPaths(c) {
  const state = initialState();
  state.hosts[2].vlan = asInt(c.accessVlan, 1, 4094, 'Engineering access VLAN');
  state.departments[1].trunk = c.engineering;
  state.departments[2].trunk = c.management;
  const local = ping(state, 'pc-1', 'pc-2'), eng = ping(state, 'pc-1', 'pc-3'), mgmt = ping(state, 'pc-1', 'pc-5');
  return { events: [
    step(0, 'Sales access uses VLAN 10. Engineering host access is configured for VLAN ' + c.accessVlan + '.'),
    step(1, 'Trunk allowances: Engineering ' + (c.engineering ? 'allowed' : 'blocked') + '; Management ' + (c.management ? 'allowed' : 'blocked') + '.'),
    step(1, 'Sales local probe: ' + local.steps.at(-1).label),
    step(2, 'Engineering routed probe: ' + eng.steps.at(-1).label),
    step(2, 'Management negative probe: ' + mgmt.steps.at(-1).label)
  ], checks: [probe(local, 'Sales local access'), probe(eng, 'Engineering routed access'),
    check('Management uplink isolation', !mgmt.ok && !c.management, mgmt.ok ? 'Unexpected reachability into Management.' : mgmt.steps.at(-1).label)] };
}

export function forwardingTrial(c) {
  let sw = initialSwitch();
  sw = configurePort(sw, 2, { vlan: asInt(c.accessVlan, 1, 4094, 'PC B access VLAN') });
  const unknown = transmit(sw, 'A', 'B');
  const reply = transmit(unknown.state, 'B', 'A');
  const learned = transmit(reply.state, 'A', 'B');
  const network = initialState();
  network.hosts[1].vlan = sw.ports[1].vlan;
  network.departments[0].trunk = c.trunk;
  network.routing = c.routing;
  const routed = ping(network, 'pc-2', 'pc-3');
  const frames = packetFrames(network, 'pc-2', 'pc-3');
  const switched = (label, result) => result.steps.map((message, i) => step(i === 0 ? 0 : i === 3 ? 2 : 1, label + ': ' + message));
  return { events: [
    ...switched('Cold table', unknown), ...switched('Return frame', reply), ...switched('Warm table', learned),
    ...frames.map(f => step(f.path.includes('router') ? 3 : 1, 'Routed probe: ' + f.label))
  ], checks: [
    check('Initial same-VLAN delivery', unknown.accepted.includes('B'), 'Egress copies: ' + (unknown.egress.join(', ') || 'none') + '; intended receiver: ' + (unknown.accepted.join(', ') || 'none') + '.'),
    check('Learned unicast is narrowed', learned.decision === 'known' && learned.egress.join() === 'B', 'Final decision: ' + learned.decision + '; egress: ' + (learned.egress.join(', ') || 'none') + '.'),
    check('No Layer 2 flood to VLAN 20', !unknown.egress.includes('D'), 'The separate VLAN must not receive the unknown-unicast copies.'),
    probe(routed, 'Routed probe from PC B to Engineering')
  ], facts: learned.state.table.map(row => ['VLAN ' + row.vlan + ' / ' + row.mac, 'Learned on port ' + row.port]) };
}

export function routeSummaryTrial(c) {
  const reachable = subnet(c.specific.trim());
  if (reachable.canonical !== c.specific.trim() || reachable.network < ipv4('198.51.100.0') || reachable.broadcast > ipv4('198.51.100.255')) throw Error('Enter an aligned prefix inside 198.51.100.0/24.');
  const table = [
    { ...reachable, action: 'LAN', priority: 2 },
    ...(c.discard ? [{ ...subnet('198.51.100.0/24'), action: 'Discard', priority: 1 }] : []),
    { ...subnet('0.0.0.0/0'), action: 'Upstream', priority: 0 }
  ];
  const destinations = ['198.51.100.70', '198.51.100.130', '203.0.113.10'];
  const decisions = destinations.map(ip => {
    const n = ipv4(ip);
    return table.filter(r => n >= r.network && n <= r.broadcast).sort((a,b) => b.prefix - a.prefix || b.priority - a.priority)[0];
  });
  const events = [step(0, 'The upstream router has a route for the site aggregate via the site edge, and forwards matching traffic there.')];
  decisions.forEach((r, i) => {
    events.push(step(1, 'Destination ' + destinations[i] + ' selects ' + r.canonical + ' -> ' + r.action + ' by longest prefix.'));
    events.push(step(r.action === 'Discard' ? 1 : r.action === 'Upstream' ? 0 : 2, i === 1 && r.action === 'Upstream' ? 'The site defaults back upstream. The upstream aggregate sends it back again, risking a forwarding loop until TTL expires.' : r.action === 'Discard' ? 'Drop the uncovered destination at the site boundary.' : 'Hand off toward ' + r.action + '; end-to-end delivery is not implied.'));
  });
  return { events, checks: [
    check('Active LAN destination', decisions[0].action === 'LAN' && reachable.canonical === '198.51.100.64/26', 'Matched ' + decisions[0].canonical + '. The only connected LAN is 198.51.100.64/26.'),
    check('Unassigned aggregate destination', decisions[1].action === 'Discard', 'Selected ' + decisions[1].action + '. Do not send aggregate holes back to the advertising upstream.'),
    check('Outside destination still uses default', decisions[2].action === 'Upstream', 'Selected ' + decisions[2].action + '.')
  ], facts: table.map(r => [r.canonical, r.action]) };
}

export function dhcpTrial(c) {
  const base = { client:'PC-A', server:true, remote:true, relay:true, gateway:'192.168.10.1' };
  const initial = operations.dhcp(initialOperation('dhcp'), base);
  const changed = { ...base, server:c.server, relay:c.relay, gateway:c.gateway };
  const renew = operations.dhcp(advanceOperation(initial.state, 60), changed);
  const expiry = renew.state.leases.find(l => l.client === 'PC-A')?.expires;
  const at105 = advanceOperation(renew.state, 45);
  const rebinding = expiry === 120 ? operations.dhcp(at105, changed) : null;
  const later = operations.dhcp(advanceOperation(rebinding?.state ?? at105, 121), { ...changed, client:'PC-B' });
  return { events: [...transcript('t=0 baseline', initial), ...transcript('t=60', renew),
    ...(rebinding ? transcript('t=105', rebinding) : [step(0, 't=105: renewal at t=60 restarted the timers. The client is still BOUND and does not rebind at the old T2.')]),
    ...transcript('t=226 fresh client', later)],
    checks: [
      check('Lease refreshed at T1', expiry > 120, 'Original expiry: t=120. Expiry after first renewal probe: t=' + expiry + '.'),
      check('Fresh client receives a usable lease', later.outcome === 'Lease usable', later.outcome + '. A lease alone does not validate the gateway.')
    ], facts: later.rows.map(row => [row[0], row.slice(1).join(' / ')]) };
}

export function dnsTrial(c) {
  const base = { name:'www.training.test', type:'A', record:'192.0.2.10', resolver:true, authority:true };
  const seeded = operations.dns(initialOperation('dns'), base);
  const switched = { ...base, record:'192.0.2.20', authority:c.authority };
  const cached = operations.dns(advanceOperation(seeded.state, 59), switched);
  const fresh = operations.dns(advanceOperation(cached.state, asInt(c.wait, 0, 60, 'Additional wait')), switched);
  const ipv6 = operations.dns(fresh.state, { ...switched, type:'AAAA' });
  const a = fresh.state.cache.find(r => r.key === 'www.training.test|A' && r.expires > fresh.state.time);
  return { events: [...transcript('Prime A cache', seeded), ...transcript('t=59 after record change', cached),
    ...transcript('Fresh A probe', fresh), ...transcript('Independent AAAA probe', ipv6)],
    checks: [
      check('New A answer', fresh.outcome === 'NOERROR' && a?.answer === '192.0.2.20', fresh.outcome + (a ? ': ' + a.answer : '') + '.'),
      check('Independent AAAA answer', ipv6.outcome === 'NOERROR', ipv6.outcome + '. A cache entry cannot answer AAAA.')
    ], facts: ipv6.rows.map(row => [row[0], row.slice(1).join(' / ')]) };
}

export function firewallTrial(c) {
  const tests = [
    ['Internal HTTPS', '10.0.0.10', 'TCP', 443, 'permit'], ['External HTTPS', '203.0.113.10', 'TCP', 443, 'deny'],
    ['Internal SSH', '10.0.0.10', 'TCP', 22, 'deny'], ['Internal UDP/443', '10.0.0.10', 'UDP', 443, 'deny']
  ];
  let state = initialOperation('firewall');
  const events = [], checks = [];
  for (const [label, source, protocol, port, expected] of tests) {
    const observed = operations.firewall(state, { profile:c.profile, reverse:c.reverse, source, protocol, port });
    state = observed.state;
    events.push(...transcript(label, observed));
    checks.push(check(label, observed.outcome === expected, 'Expected ' + expected + '; observed ' + observed.outcome + '.'));
  }
  return { events, checks, facts: [['Permits', state.allowed], ['Denials', state.denied]] };
}

export function natTrial(c) {
  const base = { direction:'outbound', client:'192.168.10.10', insidePort:51000, remote:'203.0.113.20', publicPort:40000 };
  const first = operations.nat(initialOperation('nat'), base);
  const second = operations.nat(first.state, { ...base, insidePort:51001 });
  const later = operations.nat(advanceOperation(second.state, asInt(c.wait, 0, 120, 'Wait')), { ...base, insidePort:51002, remote:'203.0.113.21' });
  const mapping = later.state.mappings.find(m => m.insidePort === 51002);
  const inbound = { ...base, direction:'return', publicPort: mapping?.publicPort ?? 40000 };
  const right = operations.nat(later.state, { ...inbound, remote:c.reply });
  const old = operations.nat(right.state, inbound);
  return { events: [...transcript('Flow 1', first), ...transcript('Flow 2', second), ...transcript('New flow', later),
    ...transcript('Selected reply source', right), ...transcript('Delayed reply from old remote', old)],
    checks: [
      check('New flow has a mapping', !!mapping, later.outcome + '.'),
      check('Expected remote reply', !!mapping && right.outcome === 'Translated return' && c.reply === '203.0.113.21', right.outcome + '.'),
      check('Old remote denied after port reuse', !!mapping && old.outcome === 'No matching mapping', old.outcome + '.')
    ], facts: later.rows.map(row => [row[0], row.slice(1).join(' / ')]) };
}

export function monitoringTrial(c) {
  const baseline = operations.monitoring(initialOperation('monitoring'), { scenario:'healthy', byName:false, baseline:true });
  const direct = operations.monitoring(baseline.state, { scenario:c.path, byName:false });
  const named = operations.monitoring(baseline.state, { scenario:c.dns ? c.path : 'dns', byName:true });
  const metrics = Object.fromEntries(direct.rows), namedMetrics = Object.fromEntries(named.rows);
  const pathOK = metrics.Loss === '0.0%' && Number.parseFloat(metrics['Mean successful RTT']) <= 20;
  return { events: [...transcript('Healthy baseline', baseline), ...transcript('Direct IP', direct), ...transcript('By hostname', named)],
    checks: [
      check('Direct path meets this exercise budget', pathOK, metrics.Loss + ' loss; mean RTT ' + metrics['Mean successful RTT'] + '. Target: zero loss and at most 20 ms.'),
      check('Name resolves and named path meets budget', named.outcome === 'Probe run complete' && pathOK, named.outcome === 'Probe run complete' ? 'Named probes sent: ' + namedMetrics['Sent / received'] + ' (sent / received).' : 'No network probes sent. Loss was not measured.')
    ], facts: [['Direct IP / sent and received', metrics['Sent / received']], ['Baseline loss / mean RTT', metrics['Saved baseline loss / mean']],
      ['Hostname / measurement', namedMetrics['Sent / received'] || '0 sent; no network loss measurement']] };
}

export function mitmTrial(c) {
  const synthetic = 'Synthetic order: 12 training units';
  const settings = { ...initialMitm(), protocol:c.protocol, forwarding:c.forwarding, binding:c.binding, tamper:true };
  const attack = poisonCache(settings), actual = inspectSession(attack, synthetic);
  const fallback = inspectSession(poisonCache({ ...settings, binding:false }), synthetic);
  return { events: [
    step(0, 'Client resolves its gateway mapping. A same-link intermediary attempts a forged ARP update.'),
    step(1, attack.poisoned ? 'Mapping changed; first-hop frames now traverse the intermediary.' : 'The trusted binding rejects the forged mapping.'),
    step(1, 'Observer evidence: ' + actual.observer),
    step(2, !actual.delivered ? 'No delivery. Encryption cannot compel forwarding.' : actual.changed ? 'The recipient sees modified plaintext.' : 'The recipient sees unchanged application content.'),
    step(1, 'Control trial without the binding: ' + fallback.observer)
  ], checks: [
    check('Expected gateway mapping', !actual.intercepted, 'Observed MAC: ' + actual.gatewayMAC + '.'),
    check('Delivered without modification', actual.delivered && !actual.changed, actual.delivered ? 'Delivery continued.' : 'Intermediary dropped the redirected flow.'),
    check('Content protected even without binding', c.protocol === 'https' && !fallback.readable && !fallback.changed, fallback.observer)
  ] };
}

export function ddosTrial(c) {
  const config = { legitimate:40, sources:10, rate:20, capacity:100, link:asInt(c.link, 50, 500, 'Link capacity'),
    limit:asInt(c.limit, 1, 20, 'Per-source ceiling'), limiting:c.limiting, attack:true };
  let state = initialLoad();
  const baseline = loadStep(state, { ...config, attack:false, limiting:false }).history[0];
  const number = n => Number(n.toFixed(2));
  const events = [step(0, 'No-attack baseline delivers ' + number(baseline.servedL) + ' legitimate requests in one synthetic second.')];
  for (let i = 0; i < 4; i++) {
    state = loadStep(state, config);
    const r = state.history.at(-1);
    events.push(step(0, 't=' + r.tick + 's: ' + r.incoming + ' offered requests; legitimate upstream loss ' + number(r.upstreamLostL) + '.'),
      step(1, 'Limiter: ' + number(r.filtered) + ' requests filtered; legitimate limiter loss ' + number(r.limiterLostL) + '.'),
      step(2, 'Service completes ' + number(r.servedL) + ' legitimate requests; queued work ' + number(r.queue) + '; legitimate buffer loss ' + number(r.bufferLostL) + '.'));
  }
  const last = state.history.at(-1), every = predicate => state.history.every(predicate);
  return { events, checks: [
    check('No legitimate upstream loss', every(r => r.upstreamLostL < 0.001), number(last.upstreamLostL) + ' legitimate requests lost before the limiter in the final interval.'),
    check('Limiter preserves legitimate traffic', every(r => r.limiterLostL < 0.001), number(last.limiterLostL) + ' legitimate requests rejected by policy in the final interval.'),
    check('Service keeps up with legitimate demand', every(r => r.servedL >= 39.99 && r.queue < 0.001 && r.bufferLostL < 0.001), number(last.servedL) + ' served of 40 legitimate arrivals in the final interval; ' + number(last.queue) + ' queued.')
  ], facts: [['Offered demand', '40 legitimate + 200 synthetic attack requests/s'], ['Service capacity', '100 requests/s']] };
}
