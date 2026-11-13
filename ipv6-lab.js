import { ipv6PrefixCalculation, prefixFromMask } from './ip-teaching-core.js';

const event = (node, message) => ({ node, message });
const check = (label, ok, detail) => ({ label, ok, detail });

export function ipv6Site(c) {
  const ids = [c.staff, c.guest, c.management].map(value => {
    const id = String(value).trim();
    if (!/^[\da-f]{1,4}$/i.test(id)) throw Error('Subnet IDs must contain one to four hexadecimal digits, such as 10 or 00af.');
    return parseInt(id, 16).toString(16);
  });
  const [staff, guest, management] = ids.map(id => ipv6PrefixCalculation('2001:db8:1234:' + id + '::/64').canonical);
  const unique = new Set(ids).size === ids.length;
  const global = c.ra && c.autonomous;
  const usable = global && !c.duplicate;
  const route = c.ra && Number(c.lifetime) > 0;
  const local = usable;
  const remote = usable && route && unique;
  const address = ipv6PrefixCalculation('2001:db8:1234:' + ids[0] + '::10/128').canonical.split('/')[0];
  const events = [
    event(1, 'Split the site /48 with a 16-bit subnet ID. Staff ' + staff + '; Guest ' + guest + '; Management ' + management + '. ' + (unique ? 'No prefixes overlap.' : 'At least two distinct links reuse the same /64.')),
    event(0, 'Staff workstation forms its link-local address fe80::10 and sends a Router Solicitation. Its link-local address is unique in this scenario.'),
    event(1, c.ra ? 'R1 advertises ' + staff + ' from fe80::1. The on-link flag is set; the autonomous flag is ' + (c.autonomous ? 'set' : 'clear') + '; router lifetime is ' + c.lifetime + ' seconds.' : 'No Router Advertisement arrives in this fresh trial. No SLAAC prefix or default router is learned.'),
    event(0, !global ? 'No autonomous global address is formed. The link-local address still works on the Staff link.' : 'SLAAC forms tentative address ' + address + '. Duplicate Address Detection sends a Neighbor Solicitation.'),
    event(0, !global ? 'Global-address duplicate detection is not applicable without a tentative address.' : c.duplicate ? 'A node responds for the tentative address. Duplicate detection fails; do not use that address.' : 'No duplicate is observed. The address becomes usable in the model.'),
    event(2, local ? 'Neighbor Discovery resolves the Staff peer on-link and the same-subnet echo succeeds without the default router.' : 'The Staff global-address probe cannot use a valid global source. A separate link-local probe still succeeds.'),
    event(1, !usable ? 'Off-link probe stops: no usable global source address.' : !unique ? 'Off-link probe stops: the plan assigns an overlapping connected prefix to separate links.' : !route ? 'Off-link probe stops: no default router is installed. The address alone is not enough.' : 'Resolve the link-local gateway fe80::1 on the Staff link. R1 selects the connected Guest prefix and forwards the packet.'),
    event(2, remote ? 'Guest receives the echo and its modeled return path reaches Staff.' : 'Guest global-address reachability is not verified. Correct the failed prerequisite and repeat the same probes.')
  ];
  return { events, checks: [
    check('Distinct /64 allocations', unique, 'Three separate links require three distinct prefixes.'),
    check('Usable SLAAC address', usable, global ? address + (usable ? ' / preferred in this model' : ' / duplicate, not usable') : 'No SLAAC address'),
    check('Same-link link-local probe', true, 'fe80::10 to fe80::20 on the Staff link; never forwarded.'),
    check('Same-link global-address probe', local, local ? 'Staff peer replies.' : 'No usable global source.'),
    check('Routed Guest probe', remote, remote ? 'Guest replies via R1.' : !usable ? 'No usable global source.' : !unique ? 'The connected prefixes overlap.' : 'No default router installed.')
  ], facts: [
    ['Staff /64', staff], ['Guest /64', guest], ['Management /64', management],
    ['Router Advertisement', c.ra ? 'Received' : 'Missing'],
    ['Default router on Staff', route ? 'fe80::1' : 'None'],
    ['Neighbor evidence', !usable ? 'Link-local peer only' : remote ? 'Staff peer and gateway resolved on Staff link' : 'Staff peer resolved on Staff link']
  ] };
}

export const maskLab = {
  id: 'reverse-mask', level: 'Intermediate', title: 'Read a subnet mask in reverse',
  brief: 'Turn a dotted-decimal IPv4 mask into a CIDR length. Distinguish a valid boundary from a number with the same count of 1 bits in the wrong positions.',
  background: 'Convert every octet to eight bits before counting. A CIDR mask is a single run of 1 bits followed by a single run of 0 bits. The count alone is insufficient if the mask is not contiguous.',
  tasks: ['Predict the prefix for 255.255.255.224. Compare the four per-octet counts.', 'Try 255.255.250.0 and explain where contiguity breaks. Then compare 255.255.248.0.', 'Verify that 0.0.0.0 means /0 and 255.255.255.255 means /32. These describe a default prefix and one address, not normal LAN capacities.'],
  reflection: 'Why can two masks with the same number of 1 bits differ in validity?',
  reference: ['RFC 4632: CIDR and contiguous masks', 'https://www.rfc-editor.org/rfc/rfc4632.html#section-5.1'],
  fields: [{ key: 'mask', label: 'IPv4 subnet mask', value: '255.255.255.224' }],
  nodes: [['host', 'Dotted decimal'], ['switch', 'Binary boundary'], ['router', 'CIDR result']],
  run(c) {
    const m = prefixFromMask(c.mask.trim());
    return { events: [event(0, 'Read the four octets of ' + c.mask.trim() + '.'),
      event(1, 'Write all 32 bits: ' + m.bits + '. The 1 bits form one uninterrupted run from the left.'),
      event(2, m.counts.join(' + ') + ' = ' + m.prefix + ' network bits. Prefix: /' + m.prefix + '.')],
    checks: [check('Valid contiguous mask', true, 'CIDR prefix /' + m.prefix)],
    facts: [['Binary mask', m.bits], ['Host bits', String(32 - m.prefix)]] };
  }
};

export const ipv6Lab = {
  id: 'ipv6-site', level: 'Advanced', title: 'Plan and repair an IPv6 site',
  brief: 'Build three LAN prefixes from documentation site block 2001:db8:1234::/48, then restore Staff-to-Guest IPv6 connectivity while preserving link boundaries.',
  background: 'The fourth hexadecimal group selects one of 65,536 possible /64s in this /48. Reserve unused subnet IDs for growth. Router Advertisements describe prefixes and independently advertise default-router lifetime. SLAAC forms an address from an autonomous prefix. Duplicate Address Detection tests a tentative address before use. Neighbor Discovery resolves the local next hop, not the remote host across a router.',
  tasks: ['Assign distinct Staff, Guest, and Management IDs. Predict which checks should still pass if the router lifetime is zero. Capture that result as your baseline.', 'Set a nonzero router lifetime and compare the Staff and Guest probes. Then suppress the Router Advertisement and distinguish no address from no default route.', 'Introduce a duplicate global address and then clear it. Prove that link-local communication alone does not demonstrate routed connectivity.', 'Reuse a subnet ID across two links. Restore a non-overlapping plan and verify all checks without disabling duplicate detection.'],
  reflection: 'Compare a valid address with no default router, a duplicate address, and an overlapping prefix plan. Which observation distinguishes each?',
  boundary: 'Fresh deterministic trials on three modeled LANs. One router, one SLAAC host, and static peers are assumed. No real packets, DHCPv6, address lifetimes beyond the router-lifetime choice, or Neighbor Discovery cache timers.',
  reference: ['RFC 4861: Router and Prefix Discovery', 'https://www.rfc-editor.org/rfc/rfc4861.html#section-6'],
  fields: [
    { key: 'staff', label: 'Staff subnet ID (hex)', value: '10', maxLength: 4 },
    { key: 'guest', label: 'Guest subnet ID (hex)', value: '20', maxLength: 4 },
    { key: 'management', label: 'Management subnet ID (hex)', value: '30', maxLength: 4 },
    { key: 'ra', label: 'Router Advertisements reach Staff', value: true },
    { key: 'autonomous', label: 'Advertise autonomous address configuration', value: true },
    { key: 'lifetime', label: 'Default-router lifetime', value: '0', options: [['0', '0 seconds (not a default router)'], ['1800', '1,800 seconds']] },
    { key: 'duplicate', label: 'Another Staff node uses the same global address', value: false }
  ],
  nodes: [['host', 'Staff PC'], ['router', 'R1 / three LANs'], ['host', 'Local and Guest peers']],
  run: ipv6Site
};
