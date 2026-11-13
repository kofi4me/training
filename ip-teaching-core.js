import { ipv4, address, subnet } from './core.js';

export const bitWeights = Object.freeze([128, 64, 32, 16, 8, 4, 2, 1]);
export const bitsOf = value => value.toString(2).padStart(8, '0');
export const dottedBits = value => address(value).split('.').map(octet => bitsOf(Number(octet))).join('.');

export function octetCalculation(mode, raw) {
  raw = String(raw).trim();
  if (!['decimal', 'binary'].includes(mode)) throw Error('Choose decimal or binary notation.');
  if (mode === 'decimal' && !/^\d{1,3}$/.test(raw)) throw Error('Enter a decimal integer from 0 to 255.');
  if (mode === 'binary' && !/^[01]{8}$/.test(raw)) throw Error('Enter exactly eight binary digits: only 0 and 1.');
  const decimal = mode === 'decimal' ? Number(raw) : parseInt(raw, 2);
  if (decimal > 255) throw Error('An octet cannot exceed 255: its eight weights add to 255.');
  const binary = bitsOf(decimal);
  let sum = 0;
  const frames = [...binary].map((digit, index) => {
    const bit = Number(digit), weight = bitWeights[index], before = decimal - sum, previousSum = sum;
    sum += bit * weight;
    return {
      bit, weight, index, before, remaining: decimal - sum, sum, previousSum,
      message: mode === 'decimal'
        ? `${weight} ${bit ? 'fits' : 'does not fit'} into the remaining ${before}. Write ${bit}: ${bit} x ${weight} = ${bit * weight}. ${before} - ${bit * weight} = ${decimal - sum} remaining.`
        : `Read the ${weight} position: ${bit} means ${bit ? 'include' : 'exclude'} its weight. ${previousSum} + (${bit} x ${weight}) = ${sum}.`
    };
  });
  frames.push({ index: 8, sum: decimal, remaining: 0, message: `Result: ${decimal} decimal = ${binary} binary. The included weights are ${bitWeights.filter((_, i) => binary[i] === '1').join(' + ') || 'none (zero)'}.` });
  return { decimal, binary, mode, frames };
}

export function cidrCalculation(ip, rawPrefix) {
  const prefixText = String(rawPrefix).trim();
  if (!/^\d{1,2}$/.test(prefixText) || Number(prefixText) > 32) throw Error('The IPv4 prefix must be a whole number from 0 to 32.');
  const prefix = Number(prefixText), numeric = ipv4(ip), s = subnet(ip + '/' + prefix);
  const hostBits = 32 - prefix, maskBits = '1'.repeat(prefix) + '0'.repeat(hostBits);
  const pivot = prefix === 32 ? null : Math.floor(prefix / 8);
  const maskOctets = s.mask.split('.').map(Number), octets = address(numeric).split('.').map(Number);
  const block = pivot === null ? 1 : 256 - maskOctets[pivot];
  const lower = pivot === null ? octets[3] : Math.floor(octets[pivot] / block) * block;
  const defaultRoute = prefix === 0;
  const first = defaultRoute ? null : prefix < 31 ? address(s.first) : address(s.network);
  const last = defaultRoute ? null : prefix < 31 ? address(s.last) : address(s.broadcast);
  const usable = defaultRoute ? null : prefix < 31 ? s.usable : prefix === 31 ? 2 : 1;
  const rangeMeaning = defaultRoute ? 'Default route (all IPv4 addresses)' : prefix < 31 ? 'Ordinary broadcast LAN' : prefix === 31 ? 'Point-to-point link (RFC 3021)' : 'One address / host route';
  const frames = [
    `Read ${address(numeric)}/${prefix}: four octets give 4 x 8 = 32 bits. The slash number ${prefix} counts network bits, not devices or octets.`,
    `Keep ${prefix} network bits. Host bits = 32 - ${prefix} = ${hostBits}. Only the host portion varies inside this block.`,
    `Build the mask: ${prefix} leading ones, then ${hostBits} zeros. In decimal this is ${s.mask}. A one keeps an address bit; a zero clears it.`,
    `AND means both bits must be 1. Address AND mask = ${address(s.network)}. For example, 1 AND 1 = 1, but 1 AND 0 = 0.`,
    pivot === null ? 'A /32 has no host bits. There is no changing subnet octet; the block contains just this address.'
      : `In octet ${pivot + 1}, block size = 256 - ${maskOctets[pivot]} = ${block}. floor(${octets[pivot]} / ${block}) x ${block} = ${lower}. This octet lies in ${lower}-${lower + block - 1}. All later octets span 0-255.`,
    `Clear every host bit to zero: network prefix ${s.canonical}. The supplied address is a point within the block; the network prefix identifies the entire block.`,
    `There are ${hostBits} host bits, each with two possibilities. Total addresses = 2^${hostBits} = ${s.size}.`,
    defaultRoute ? 'The /0 prefix covers all IPv4 addresses, including special-purpose space. It is a routing prefix, not a LAN. There is no LAN broadcast or assignable host range to calculate.'
      : prefix < 31 ? `Set the host bits to one: broadcast ${address(s.broadcast)}. For an ordinary broadcast LAN, usable = ${s.size} - 2 = ${s.usable}.`
      : prefix === 31 ? 'On an RFC 3021 point-to-point /31, both addresses identify endpoints. There is no directed broadcast; do not subtract two.'
        : 'A /32 identifies one address. It is not a two-host LAN and has no separate directed broadcast address.',
    defaultRoute ? `${s.canonical}: default route. Mask ${s.mask}; address span ${address(s.network)}-${address(s.broadcast)} (${s.size} addresses). LAN host capacity: not applicable.`
      : prefix < 31 ? `Network ${s.canonical}; mask ${s.mask}; broadcast ${address(s.broadcast)}; usable ${first}-${last} (${s.usable}).`
      : `${s.canonical}: ${rangeMeaning}; ${usable} address${usable === 1 ? '' : 'es'}, ${first}${first !== last ? '-' + last : ''}. No ordinary LAN subtract-two rule.`
  ].map((message, index) => ({ index, message }));
  return { ...s, ip: address(numeric), hostBits, maskBits, addressBits: dottedBits(numeric), networkBits: dottedBits(s.network), pivot, block, lower, defaultRoute, firstAddress: first, lastAddress: last, assignable: usable, rangeMeaning, frames };
}

export function ipv6PrefixCalculation(cidr) {
  const [ip, length, ...extra] = String(cidr).split('/');
  const invalid = () => Error('Enter a valid IPv6 address with a prefix from /0 to /128, for example 2001:db8::42/64.');
  if (extra.length || !/^\d{1,3}$/.test(length ?? '') || Number(length) > 128 || !ip.includes(':')) throw invalid();
  let shape = ip;
  if (ip.includes('.')) {
    const end = ip.lastIndexOf(':') + 1;
    try { ipv4(ip.slice(end)); } catch { throw invalid(); }
    shape = ip.slice(0, end) + '0:0';
  }
  // The bundled parser accepts "::" even when all eight groups are supplied.
  const parts = shape.split('::');
  const groups = parts.flatMap(part => part === '' ? [] : part.split(':'));
  if (parts.length > 2 || !groups.every(group => /^[\da-f]{1,4}$/i.test(group)) || (parts.length === 1 ? groups.length !== 8 : groups.length >= 8)) throw invalid();
  const [parsed, prefix] = globalThis.ipaddr.IPv6.parseCIDR(cidr);
  const bits = parsed.parts.map(part => part.toString(2).padStart(16, '0')).join('');
  const networkBits = bits.slice(0, prefix).padEnd(128, '0');
  const network = globalThis.ipaddr.IPv6.parse(networkBits.match(/.{16}/g).map(part => parseInt(part, 2).toString(16)).join(':')).toString();
  return { prefix, bits, canonical: network + '/' + prefix };
}

export function prefixFromMask(mask) {
  const bits = dottedBits(ipv4(mask));
  const flat = bits.replaceAll('.', '');
  if (!/^1*0*$/.test(flat)) throw Error('Not a CIDR mask: a 1 appears after the first 0. Network bits must be consecutive from the left.');
  const prefix = flat.indexOf('0') < 0 ? 32 : flat.indexOf('0');
  return { bits, prefix, counts: bits.split('.').map(octet => octet.replaceAll('0', '').length) };
}

export function prefixForHosts(raw) {
  if (!/^\d{1,10}$/.test(String(raw)) || Number(raw) < 1 || Number(raw) > 2 ** 31 - 2) throw Error('Enter 1 to 2147483646 required interfaces, including the gateway. /0 is not a LAN allocation.');
  const demand = Number(raw);
  let hostBits = 2;
  while (2 ** hostBits - 2 < demand) hostBits++;
  const trials = [];
  for (let h = Math.max(2, hostBits - 2); h <= hostBits; h++) trials.push({ hostBits: h, total: 2 ** h, usable: 2 ** h - 2, fits: 2 ** h - 2 >= demand });
  return { demand, hostBits, prefix: 32 - hostBits, total: 2 ** hostBits, usable: 2 ** hostBits - 2, trials };
}

function canonicalBlock(raw) {
  const s = subnet(raw);
  if (raw !== s.canonical) throw Error('Enter an aligned network prefix, such as ' + s.canonical + ', not an interface address.');
  return s;
}

export function splitPrefix(parentText, rawChild) {
  const parent = canonicalBlock(parentText);
  if (!/^\d{1,2}$/.test(String(rawChild))) throw Error('Enter a whole-number child prefix.');
  const child = Number(rawChild);
  if (child < parent.prefix || child > 32) throw Error('The child prefix must be between the parent length and 32. A smaller slash number creates a larger block, not a subdivision.');
  const count = 2 ** (child - parent.prefix), size = 2 ** (32 - child);
  const indexes = count <= 8 ? Array.from({ length: count }, (_, i) => i) : [0, 1, 2, 3, count - 2, count - 1];
  const blocks = indexes.map(index => ({ index, ...cidrCalculation(address(parent.network + index * size), child) }));
  return { parent, child, count, size, borrowed: child - parent.prefix, blocks, omitted: count - blocks.length };
}

export function vlsmAllocation(parentText, demands) {
  const parent = canonicalBlock(parentText);
  if (!Array.isArray(demands) || !demands.length || demands.length > 6) throw Error('Provide one to six interface requirements.');
  const requirements = demands.map((demand, index) => ({ label: String.fromCharCode(65 + index), ...prefixForHosts(demand) })).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  let next = parent.network;
  const allocations = requirements.map(requirement => {
    if (requirement.prefix < parent.prefix || next + requirement.total - 1 > parent.broadcast) throw Error('These requirements do not fit in the parent block. Reduce demand or supply a larger parent prefix.');
    const network = Math.ceil(next / requirement.total) * requirement.total;
    if (network + requirement.total - 1 > parent.broadcast) throw Error('No aligned block remains inside the parent.');
    const calculation = cidrCalculation(address(network), requirement.prefix);
    next = network + requirement.total;
    return { ...requirement, ...calculation, demand: requirement.demand };
  });
  return { parent, allocations, used: next - parent.network, remaining: parent.broadcast - next + 1 };
}

export function aggregatePrefixes(leftText, rightText) {
  const left = canonicalBlock(leftText), right = canonicalBlock(rightText);
  const start = Math.min(left.network, right.network), end = Math.max(left.broadcast, right.broadcast);
  const a = start.toString(2).padStart(32, '0'), b = end.toString(2).padStart(32, '0');
  let prefix = 0;
  while (prefix < 32 && a[prefix] === b[prefix]) prefix++;
  const summary = subnet(address(start) + '/' + prefix);
  const overlap = Math.max(0, Math.min(left.broadcast, right.broadcast) - Math.max(left.network, right.network) + 1);
  const represented = left.size + right.size - overlap;
  return { left, right, summary, commonBits: prefix, startBits: a, endBits: b, extra: summary.size - represented, exact: summary.size === represented };
}

export function checkCidrAnswers(calculation, input) {
  const expected = { mask: calculation.mask, network: address(calculation.network), broadcast: address(calculation.broadcast), total: calculation.size, usable: calculation.usable };
  if (calculation.prefix === 0 || calculation.prefix >= 31) throw Error('This practice task uses ordinary broadcast LANs only.');
  return Object.entries(expected).map(([key, value]) => {
    const raw = String(input?.[key] ?? '').trim();
    const valid = typeof value === 'number' ? /^\d+$/.test(raw) && Number(raw) === value : raw === value;
    return { key, correct: valid };
  });
}
