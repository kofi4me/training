import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { appliedLabs } from '../course-practice.js';
import { ipv6Lab, maskLab } from '../ipv6-lab.js';
import { courseForLocation, courseLabels } from '../course-catalog.js';

const context = { window: {} };
vm.runInNewContext(readFileSync(new URL('../vendor/ipaddr.min.js', import.meta.url), 'utf8'), context);
globalThis.ipaddr = context.ipaddr;

const runs = [
  ['devices', 0, { access:true, uplink:true }, { access:true, uplink:true, routing:false }],
  ['communications', 0, { gateway:'192.168.10.1' }, { gateway:'192.168.10.1', prefix:'24' }],
  ['vlans', 0, { accessVlan:'20', engineering:true }, { accessVlan:'20', engineering:true, management:true }],
  ['switching', 0, { accessVlan:'10', trunk:true }, { accessVlan:'10', trunk:true, routing:false }],
  ['routing', 0, { accessVlan:'10', trunk:true }, { accessVlan:'10', trunk:false }],
  ['routing', 1, { discard:true }, { specific:'198.51.100.0/24', discard:true }],
  ['dhcp', 0, { relay:true }, { relay:true, gateway:'192.168.20.1' }],
  ['dns', 0, { wait:'1' }, { wait:'1', authority:false }],
  ['firewall', 0, { reverse:false }, { reverse:false, profile:'ssh' }],
  ['nat', 0, { wait:'60' }, { wait:'60', reply:'203.0.113.20' }],
  ['monitoring', 0, { dns:true, path:'healthy' }, { dns:false, path:'healthy' }],
  ['mitm', 0, { protocol:'https', binding:true }, { protocol:'https', binding:false }],
  ['ddos', 0, { link:'300' }, { link:'300', limit:'1' }]
];
const settings = lab => Object.fromEntries(lab.fields.map(f => [f.key, f.value]));

test('all 13 networking and security modules retain a scenario with a playable result trace', () => {
  const all = { ...appliedLabs, addressing:[maskLab, ipv6Lab] };
  const networkAndSecurity = Object.keys(courseLabels).filter(id => id !== 'network' && courseForLocation('/systems.html', `?course=${id}`) !== id);
  assert.deepEqual(Object.keys(all).sort(), networkAndSecurity.sort());
  for (const labs of Object.values(all)) for (const lab of labs) {
    const result = lab.run(settings(lab));
    assert.ok(result.events.length >= 3, lab.id);
    assert.ok(result.events.every(e => typeof e.message === 'string' && Number.isInteger(e.node) && e.node >= 0 && e.node < lab.nodes.length), lab.id);
    assert.ok(result.checks.every(c => typeof c.ok === 'boolean'), lab.id);
  }
});

for (const [course, index, repair, unsafe] of runs) test(course + ' applied lab ' + (index + 1) + ' checks fault, repair, and false recovery', () => {
  const lab = appliedLabs[course][index], starting = settings(lab);
  const baseline = lab.run(starting);
  const repaired = lab.run({ ...starting, ...repair });
  const regression = lab.run({ ...starting, ...unsafe });
  assert.equal(baseline.checks.every(c => c.ok), false);
  assert.equal(repaired.checks.every(c => c.ok), true);
  assert.equal(regression.checks.every(c => c.ok), false);
  assert.deepEqual(lab.run(starting), baseline, 'Trials must be independent and reproducible');
});

test('configured inputs are bounded and models show distinct observations at the boundaries', () => {
  const dhcp = appliedLabs.dhcp[0], dns = appliedLabs.dns[0], nat = appliedLabs.nat[0];
  assert.ok(dhcp.run(settings(dhcp)).events.some(e => e.message.includes('REBINDING')));
  assert.ok(dhcp.run({ ...settings(dhcp), relay:true }).events.some(e => e.message.includes('does not rebind')));
  assert.equal(dns.run(settings(dns)).checks[0].detail, 'NOERROR: 192.0.2.10.');
  assert.match(nat.run({ ...settings(nat), wait:'59' }).checks[0].detail, /exhausted/);
  assert.throws(() => nat.run({ ...settings(nat), wait:'' }), /whole number/);
  assert.throws(() => appliedLabs.routing[1].run({ specific:'192.168.1.0/24', discard:true }), /inside/);
});
