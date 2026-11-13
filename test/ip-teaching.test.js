import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { address, ipv4 } from '../core.js';
import { octetCalculation, cidrCalculation, ipv6PrefixCalculation, prefixForHosts, splitPrefix, vlsmAllocation, aggregatePrefixes, checkCidrAnswers } from '../ip-teaching-core.js';
import { prefixFromMask } from '../ip-teaching-core.js';
import { ipv6Site, ipv6Lab } from '../ipv6-lab.js';
const context = { window: {} };
vm.runInNewContext(readFileSync(new URL('../vendor/ipaddr.min.js', import.meta.url), 'utf8'), context);
globalThis.ipaddr = context.ipaddr;

test('every IPv4 mask round trips and discontiguous masks do not get a CIDR length', () => {
  for (let prefix = 0; prefix <= 32; prefix++) {
    const {mask} = cidrCalculation('192.0.2.1', prefix);
    assert.equal(prefixFromMask(mask).prefix, prefix);
  }
  assert.deepEqual(prefixFromMask('255.255.255.224').counts, [8, 8, 8, 3]);
  assert.throws(() => prefixFromMask('255.255.250.0'), /first 0/);
  assert.throws(() => prefixFromMask('255.255.256.0'));
});

test('IPv6 planning separates local reachability, SLAAC, default router and unique subnets', () => {
  const defaults = Object.fromEntries(ipv6Lab.fields.map(f => [f.key, f.value]));
  const result = patch => ipv6Site({ ...defaults, ...patch }).checks.map(c => c.ok);
  assert.deepEqual(result({}), [true, true, true, true, false]);
  assert.deepEqual(result({lifetime: '1800'}), [true, true, true, true, true]);
  assert.deepEqual(result({lifetime: '1800', duplicate: true}), [true, false, true, false, false]);
  assert.deepEqual(result({lifetime: '1800', ra: false}), [true, false, true, false, false]);
  assert.deepEqual(result({lifetime: '1800', autonomous: false}), [true, false, true, false, false]);
  assert.deepEqual(result({lifetime: '1800', guest: '0010'}), [false, true, true, true, false]);
  assert.throws(() => result({staff: '10000'}), /hexadecimal/);
});

test('all 256 octets convert in both directions and conserve the remaining value at every step', () => {
  for (let n = 0; n <= 255; n++) {
    for (const mode of ['decimal', 'binary']) {
      const result = octetCalculation(mode, mode === 'decimal' ? n : n.toString(2).padStart(8, '0'));
      assert.equal(result.decimal, n); assert.equal(result.binary.length, 8);
      for (const frame of result.frames.slice(0, 8)) {
        assert.equal(frame.sum + frame.remaining, n);
        assert.equal(frame.sum - frame.previousSum, frame.bit * frame.weight);
        assert.equal(frame.before - frame.bit * frame.weight, frame.remaining);
      }
      assert.equal(result.frames.at(-1).sum, n); assert.equal(result.frames.at(-1).remaining, 0);
    }
  }
  for (const value of ['256', '-1', '1.2', '', 'Infinity']) assert.throws(() => octetCalculation('decimal', value));
  for (const value of ['101', '00000002', '111111111', '']) assert.throws(() => octetCalculation('binary', value));
});

test('CIDR calculations work across all 33 prefix lengths without signed-integer overflow', () => {
  for (const ip of ['0.0.0.0', '10.20.30.40', '172.16.35.10', '192.168.10.70', '255.255.255.255']) {
    for (let prefix = 0; prefix <= 32; prefix++) {
      const c = cidrCalculation(ip, prefix), size = 2 ** (32 - prefix), network = Math.floor(ipv4(ip) / size) * size;
      assert.equal(c.network, network); assert.equal(c.broadcast, network + size - 1);
      assert.equal(c.size, size); assert.equal(c.maskBits.replaceAll('0', '').length, prefix);
      assert.equal(c.frames.length, 9);
      assert.equal(c.assignable, prefix === 0 ? null : prefix < 31 ? size - 2 : size);
    }
  }
  const c = cidrCalculation('172.16.35.10', 20);
  assert.equal(c.canonical, '172.16.32.0/20'); assert.equal(c.mask, '255.255.240.0');
  assert.equal(c.block, 16); assert.equal(c.pivot, 2); assert.equal(c.lower, 32);
  assert.equal(c.lastAddress, '172.16.47.254'); assert.equal(c.assignable, 4094);
  assert.equal(cidrCalculation('192.0.2.1', 31).firstAddress, '192.0.2.0');
  assert.equal(cidrCalculation('192.0.2.1', 32).pivot, null);
  for (const value of ['', '33', '-1', '20.1', '1e1', 'abc']) assert.throws(() => cidrCalculation('192.0.2.1', value));
  assert.throws(() => cidrCalculation('invalid', 24));
});

test('IPv4 default route reports address space without treating it as a broadcast LAN', () => {
  const c = cidrCalculation('192.168.10.70', 0);
  assert.equal(c.canonical, '0.0.0.0/0');
  assert.equal(c.size, 4294967296);
  assert.equal(c.firstAddress, null);
  assert.equal(c.lastAddress, null);
  assert.match(c.frames.at(-1).message, /default route.*capacity: not applicable/);
  assert.doesNotMatch(c.frames.map(frame => frame.message).join(' '), /4294967294|Ordinary broadcast LAN/);
  assert.throws(() => checkCidrAnswers(c, {}), /ordinary broadcast LANs only/);
});

test('IPv6 prefix calculation requires valid groups and nonempty zero compression', () => {
  for (const [input, canonical] of [
    ['2001:db8:1234:5::42/64', '2001:db8:1234:5::/64'],
    ['2001:db8:1234:6::42/48', '2001:db8:1234::/48'],
    ['2001:db8:8000::/33', '2001:db8:8000::/33'],
    ['2001:db8::1/0', '::/0'],
    ['2001:0DB8:0:0:0:0:0:1/128', '2001:db8::1/128'],
    ['::ffff:192.0.2.1/96', '::ffff:0:0/96'],
    ['1:2:3:4:5:6:7::/64', '1:2:3:4::/64']
  ]) {
    const result = ipv6PrefixCalculation(input);
    assert.equal(result.bits.length, 128);
    assert.equal(result.canonical, canonical, input);
  }
  for (const input of ['1:2:3:4:5:6:7:8::/64', '::1:2:3:4:5:6:7:8/64', '2001::db8::1/64', '2001:db8:::1/64', '1:2:3:4:5:6:7:/64', '::/129', '::/-1', '::/64/128', '::ffff:192.0.2.999/96', '192.0.2.1/64']) {
    assert.throws(() => ipv6PrefixCalculation(input), /valid IPv6/, input);
  }
});

test('host sizing chooses the smallest conventional LAN and includes the gateway in demand', () => {
  for (const [demand, prefix, usable] of [[1, 30, 2], [2, 30, 2], [3, 29, 6], [50, 26, 62], [62, 26, 62], [63, 25, 126], [254, 24, 254], [255, 23, 510], [2147483646, 1, 2147483646]]) {
    const c = prefixForHosts(demand); assert.equal(c.prefix, prefix); assert.equal(c.usable, usable);
    assert.ok(c.usable >= demand); if (c.hostBits > 2) assert.ok(2 ** (c.hostBits - 1) - 2 < demand);
  }
  for (const value of ['0', '-1', '2.5', '', '2147483647', '4294967295']) assert.throws(() => prefixForHosts(value));
});

test('equal subnet division covers the parent exactly and bounds large visual samples', () => {
  const c = splitPrefix('192.168.10.0/24', 26);
  assert.equal(c.count, 4); assert.equal(c.borrowed, 2); assert.equal(c.size, 64);
  assert.deepEqual(c.blocks.map(s => s.canonical), ['192.168.10.0/26', '192.168.10.64/26', '192.168.10.128/26', '192.168.10.192/26']);
  assert.equal(c.blocks.at(-1).broadcast, c.parent.broadcast);
  const large = splitPrefix('0.0.0.0/0', 32);
  assert.equal(large.count, 2 ** 32); assert.equal(large.blocks.length, 6);
  assert.equal(large.blocks.at(-1).canonical, '255.255.255.255/32');
  assert.throws(() => splitPrefix('192.168.10.70/24', 26), /aligned/);
  assert.throws(() => splitPrefix('192.168.10.0/24', 23), /smaller slash/);
  assert.throws(() => splitPrefix('192.168.10.0/24', 33));
});

test('VLSM sorts requirements, aligns allocations, prevents overlap and rejects exhaustion', () => {
  const c = vlsmAllocation('192.168.10.0/24', [50, 25, 10]);
  assert.deepEqual(c.allocations.map(s => s.canonical), ['192.168.10.0/26', '192.168.10.64/27', '192.168.10.96/28']);
  assert.equal(c.used, 112); assert.equal(c.remaining, 144);
  const reordered = vlsmAllocation('192.168.10.0/24', [10, 50, 25]);
  assert.deepEqual(reordered.allocations.map(s => s.label), ['B', 'C', 'A']);
  c.allocations.forEach((s, i) => { assert.equal(s.network % s.size, 0); assert.ok(s.usable >= s.demand); if (i) assert.ok(c.allocations[i - 1].broadcast < s.network); });
  assert.throws(() => vlsmAllocation('192.168.10.0/26', [50, 25, 10]), /fit/);
  assert.throws(() => vlsmAllocation('192.168.10.0/24', []));
  assert.throws(() => vlsmAllocation('192.168.10.0/24', [0]));
});

test('aggregation distinguishes an exact union from a covering prefix with unintended space', () => {
  const exact = aggregatePrefixes('192.168.10.0/25', '192.168.10.128/25');
  assert.equal(exact.summary.canonical, '192.168.10.0/24'); assert.equal(exact.exact, true); assert.equal(exact.extra, 0);
  const cover = aggregatePrefixes('192.168.10.0/25', '192.168.11.0/25');
  assert.equal(cover.summary.canonical, '192.168.10.0/23'); assert.equal(cover.exact, false); assert.equal(cover.extra, 256);
  assert.equal(aggregatePrefixes('192.168.10.0/24', '192.168.10.128/25').extra, 0);
  assert.equal(aggregatePrefixes('0.0.0.0/1', '128.0.0.0/1').summary.canonical, '0.0.0.0/0');
  assert.throws(() => aggregatePrefixes('192.168.10.1/25', '192.168.10.128/25'), /aligned/);
});

test('practice checks each actual quantity, rejects plausible errors, and never awards a course pass', () => {
  const c = cidrCalculation('192.168.20.77', 27);
  const input = { mask: c.mask, network: address(c.network), broadcast: address(c.broadcast), total: c.size, usable: c.usable };
  assert.ok(checkCidrAnswers(c, input).every(item => item.correct));
  for (const key of Object.keys(input)) {
    const results = checkCidrAnswers(c, { ...input, [key]: 'wrong' });
    assert.equal(results.filter(item => !item.correct).length, 1); assert.equal(results.find(item => !item.correct).key, key);
    assert.equal(results.passed, undefined);
  }
  assert.ok(checkCidrAnswers(c, {}).every(item => !item.correct));
  assert.equal(checkCidrAnswers(c, { ...input, usable: '30abc' }).find(item => item.key === 'usable').correct, false);
  assert.throws(() => checkCidrAnswers(cidrCalculation('192.0.2.1', 31), input), /ordinary/);
});
