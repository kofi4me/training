import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ipv4, subnet, address, initialState, validate, ping, restoredState, packetFrames } from '../core.js';
import { splitSubnet } from '../calculator.js';
import { prepareMessage, restoreMessages } from '../messages.js';
const context = { window: {} };
vm.runInNewContext(readFileSync(new URL('../vendor/ipaddr.min.js', import.meta.url), 'utf8'), context);
globalThis.ipaddr = context.ipaddr;
test('VLSM /26, /27 and /28 boundaries and capacity', () => {
  assert.deepEqual([26, 27, 28].map(p => subnet(`192.168.10.0/${p}`).usable), [62, 30, 14]);
  const n = subnet('192.168.10.75/27');
  assert.equal(n.canonical, '192.168.10.64/27');
  assert.equal(address(n.last), '192.168.10.94');
  assert.equal(address(n.broadcast), '192.168.10.95');
  assert.equal(n.mask, '255.255.255.224');
});
test('invalid and ambiguous addresses are rejected', () => {
  for (const value of ['300.1.1.1', '192.168.010.1', '127.1', '::1', '1.1.1.-1']) assert.throws(() => ipv4(value));
  for (const cidr of ['1.1.1.1/33', '1.1.1.1/', '1.1.1.1/-1', '1.1.1.1/24/2']) assert.throws(() => subnet(cidr));
});
test('full IPv4 range and /31 /32 have no conventional LAN host capacity', () => {
  assert.equal(subnet('0.0.0.0/0').size, 4294967296);
  assert.equal(subnet('1.1.1.1/31').usable, 0);
  assert.equal(subnet('1.1.1.1/32').usable, 0);
});
test('starter network passes validation and all 30 directed paths', () => {
  const s = initialState(); assert.deepEqual(validate(s), []);
  for (const a of s.hosts) for (const b of s.hosts) if (a.id !== b.id) assert.equal(ping(s, a.id, b.id).ok, true);
});
test('routing disabled blocks inter-VLAN but preserves same-VLAN communication', () => {
  const s = initialState(); s.routing = false;
  assert.equal(ping(s, 'pc-1', 'pc-2').ok, true);
  assert.equal(ping(s, 'pc-1', 'pc-3').ok, false);
});
test('local traffic needs neither a working gateway nor an uplink', () => {
  const s = initialState(); s.hosts[0].gateway = 'bad'; s.departments[0].trunk = false;
  assert.equal(ping(s, 'pc-1', 'pc-2').ok, true);
  assert.equal(ping(s, 'pc-1', 'pc-3').ok, false);
});
test('incorrect access VLAN blocks communication', () => {
  const s = initialState(); s.hosts[0].vlan = 20;
  assert.equal(ping(s, 'pc-1', 'pc-2').ok, false);
});
test('return path needs destination gateway for routed traffic', () => {
  const s = initialState(); s.hosts[2].gateway = '192.168.10.1';
  assert.equal(ping(s, 'pc-1', 'pc-3').ok, false);
});
test('network, broadcast, prefix mismatch and duplicate IP are detected', () => {
  for (const ip of ['192.168.10.0', '192.168.10.63', '192.168.10.1', '192.168.10.3']) {
    const s = initialState(); s.hosts[0].ip = ip; assert.equal(ping(s, 'pc-1', 'pc-3').ok, false);
  }
  const s = initialState(); s.hosts[0].prefix = 24; assert.ok(validate(s).some(x => x.includes('prefix')));
});
test('overlap, parent pool, capacity, canonical boundary and duplicate VLAN are checked', () => {
  for (const cidr of ['192.168.10.0/27', '192.168.11.0/26', '192.168.10.70/27']) {
    const s = initialState(); s.departments[1].cidr = cidr; assert.ok(validate(s).length > 0);
  }
  const s = initialState(); s.departments[1].vlan = 10; assert.ok(validate(s).some(x => x.includes('distinct')));
});
test('invalid endpoint selection has explicit feedback', () => {
  assert.equal(ping(initialState(), 'pc-1', 'pc-1').ok, false);
  assert.equal(ping(initialState(), 'missing', 'pc-1').ok, false);
});
test('unrelated subnet overlap does not stop local switching or local messages',()=>{
 const s=initialState();s.departments[2].cidr='192.168.10.64/28';
 assert.ok(validate(s).some(issue=>issue.includes('overlap')));
 assert.equal(ping(s,'pc-1','pc-2').ok,true);
 assert.equal(prepareMessage(s,'pc-1','pc-2','','Still local').ok,true);
});
test('address-plan capacity is feedback rather than a local forwarding dependency',()=>{
 const s=initialState();s.departments[0].demand=100;
 assert.ok(validate(s).some(issue=>issue.includes('cannot fit')));
 assert.equal(ping(s,'pc-1','pc-2').ok,true);
 s.hosts[0].prefix=24;assert.equal(ping(s,'pc-1','pc-2').ok,true);
 assert.equal(ping(s,'pc-1','pc-3').ok,false);
});
test('configuration import round trips and rejects invalid shapes', () => {
  const s = initialState(); assert.deepEqual(restoredState(JSON.parse(JSON.stringify(s))), s);
  assert.throws(() => restoredState({ version: 1 }));
  s.hosts[0].id = 'unexpected'; assert.throws(() => restoredState(s));
});
test('subnet split fully covers the parent without gaps or overlaps', () => {
  const blocks = splitSubnet('192.168.10.0/24', 26);
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0].canonical, '192.168.10.0/26');
  assert.equal(address(blocks[3].broadcast), '192.168.10.255');
  assert.equal(blocks[0].broadcast + 1, blocks[1].network);
  assert.throws(() => splitSubnet('192.168.10.0/24', 23));
  assert.throws(() => splitSubnet('0.0.0.0/0', 30));
});
test('packet walk keeps IPs constant while routed MACs, VLAN and TTL change', () => {
  const frames = packetFrames(initialState(), 'pc-1', 'pc-3');
  assert.equal(frames.length, 5);
  assert.equal(frames[1].tag, 10); assert.equal(frames[3].tag, 20);
  assert.notEqual(frames[0].sourceMAC, frames[3].sourceMAC);
  assert.equal(frames[0].sourceIP, frames[4].sourceIP);
  assert.equal(frames[4].ttl, 63); assert.equal(frames[4].tag, 'Untagged');
  assert.equal(packetFrames(initialState(), 'pc-1', 'pc-2').at(-1).ttl, 64);
});
test('disconnected cable blocks local and routed traffic', () => {
  const s = initialState(); s.hosts[0].connected = false;
  assert.equal(ping(s, 'pc-1', 'pc-2').ok, false);
  assert.equal(packetFrames(s, 'pc-1', 'pc-3')[0].failed, true);
});
test('dynamic topology imports preserve wiring, positions and additional hosts', () => {
  const s = initialState(); s.version = 2; s.positions = { 'pc-1': { x: 100, y: 500 } };
  s.hosts.push({ ...s.hosts[0], id: 'pc-7', name: 'Extra', ip: '192.168.10.4', connected: false });
  const loaded = restoredState(s);
  assert.equal(loaded.hosts.length, 7); assert.equal(loaded.hosts[6].connected, false);
  assert.deepEqual(loaded.positions['pc-1'], { x: 100, y: 500 });
  s.hosts[6].department = 'missing'; assert.throws(() => restoredState(s));
});
test('simulated messages require valid connectivity and preserve literal message text', () => {
  const s = initialState();
  const result = prepareMessage(s, 'pc-1', 'pc-3', 'Lab note', '<b>Literal message</b>');
  assert.equal(result.ok, true); assert.equal(result.message.body, '<b>Literal message</b>');
  assert.equal(result.message.read, false); assert.equal(result.path.length, 5);
  s.routing = false;
  assert.equal(prepareMessage(s, 'pc-1', 'pc-3', '', 'Test').ok, false);
  assert.equal(prepareMessage(s, 'pc-1', 'pc-2', '', 'Local test').ok, true);
  assert.equal(prepareMessage(s, 'pc-1', 'pc-1', '', 'Self').ok, false);
  assert.equal(prepareMessage(s, 'pc-1', 'pc-2', '', ' ').ok, false);
  assert.equal(prepareMessage(s, 'pc-1', 'pc-2', '', 'x'.repeat(1001)).ok, false);
});
test('mailbox import validates endpoints, size, read state and timestamps', () => {
  const s = initialState();
  const m = { ...prepareMessage(s, 'pc-1', 'pc-2', '', 'Message').message, id: '12345678-1234-1234-1234-123456789abc', date: '2026-10-31T12:00:00Z' };
  assert.deepEqual(restoreMessages([m], s.hosts), [m]);
  assert.throws(() => restoreMessages([{ ...m, to: 'missing' }], s.hosts));
  assert.throws(() => restoreMessages([{ ...m, date: 'invalid' }], s.hosts));
  assert.throws(() => restoreMessages([m, m], s.hosts));
  s.messages = Array(20).fill(m); assert.equal(prepareMessage(s, 'pc-1', 'pc-2', '', 'Full').ok, false);
});
