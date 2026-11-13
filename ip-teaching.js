import { address, initialState, ping } from './core.js';
import { bitWeights, octetCalculation, cidrCalculation, prefixForHosts, splitPrefix, vlsmAllocation, aggregatePrefixes, checkCidrAnswers } from './ip-teaching-core.js';

const table = (headers, rows) => '<div class="table-wrap"><table><thead><tr>' + headers.map(h => '<th scope="col">' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
const icon = name => '<i data-lucide="' + name + '" aria-hidden="true"></i>';
const field = (id, label, value, extra = '') => '<label class="field" for="' + id + '">' + label + '<input id="' + id + '" value="' + value + '" ' + extra + '></label>';

function positionCalculationReplay(host, selector) {
  const work = host.querySelector(selector), bar = host.querySelector('[data-play]').parentElement, status = host.querySelector('.lesson-status');
  status.classList.add('ip-step-status');
  work.before(bar, status);
}

export function mountOctetLesson(host, player) {
  host.querySelector('h3').textContent = 'Lab 1: Explain Every Binary Decision';
  host.querySelector('p').textContent = 'Objective: convert one octet and justify every 0 or 1. In decimal-to-binary conversion, test each weight against what remains. In binary-to-decimal conversion, add only the weights whose bits are 1. Leading zeros preserve all eight positions.';
  host.querySelector('.conversion-bits').insertAdjacentHTML('afterend', '<div class="octet-decision" aria-label="Current arithmetic"></div><div class="lab-controls">' + field('binary-prediction', 'Your predicted result', '', 'maxlength="8" autocomplete="off" data-replay-independent') + '<button type="button" id="check-binary">' + icon('check') + 'Check prediction</button></div><p id="binary-feedback" role="status"></p>');
  let calculation;
  const stop = player(host, () => {
    host.querySelector('#binary-feedback').textContent = '';
    calculation = octetCalculation(host.querySelector('#conversion-mode').value, host.querySelector('#conversion-value').value);
    host.querySelector('label[for="binary-prediction"]').firstChild.textContent = calculation.mode === 'decimal' ? 'Predicted eight-bit binary' : 'Predicted decimal value';
    return calculation.frames;
  }, index => {
    host.querySelector('.conversion-bits').innerHTML = bitWeights.map((weight, i) => {
      const known = index >= i, bit = known ? calculation.binary[i] : '?';
      return '<span class="' + (index === i ? 'current-bit ' : '') + (known && bit === '1' ? 'included-bit' : '') + '"><small>Weight ' + weight + '</small><strong>' + bit + '</strong><small>' + (known ? Number(bit) * weight : 'Not decided') + '</small></span>';
    }).join('');
    const box = host.querySelector('.octet-decision');
    if (index < 0) { box.innerHTML = '<p>Each position has a weight. A 1 includes it; a 0 excludes it. Begin with the largest weight, 128.</p>'; return; }
    const step = calculation.frames[index];
    const included = bitWeights.filter((_, i) => i <= index && calculation.binary[i] === '1');
    box.innerHTML = index < 8
      ? '<h4>' + (calculation.mode === 'decimal' ? 'Does ' + step.weight + ' fit into ' + step.before + '?' : 'What does this ' + step.bit + ' contribute?') + '</h4><p class="arithmetic-line">' + (calculation.mode === 'decimal' ? step.before + ' - (' + step.bit + ' x ' + step.weight + ') = <strong>' + step.remaining + ' remaining</strong>' : step.previousSum + ' + (' + step.bit + ' x ' + step.weight + ') = <strong>' + step.sum + '</strong>') + '</p><p>' + (step.bit ? 'Use this weight: write 1.' : 'Do not use this weight: write 0. A zero is a decision, not an empty position.') + '</p>'
      : '<h4>The two notations represent the same value</h4><p class="arithmetic-line">' + calculation.binary + '<sub>2</sub> = ' + calculation.decimal + '<sub>10</sub></p><p>The small base labels name the number system: base 2 uses 0 and 1; base 10 uses digits 0 to 9.</p>';
    box.innerHTML += '<p>Included weights: <strong>' + (included.join(' + ') || '0') + ' = ' + step.sum + '</strong></p>';
  });
  host.querySelector('#check-binary').onclick = () => {
    try {
      const c = octetCalculation(host.querySelector('#conversion-mode').value, host.querySelector('#conversion-value').value);
      const expected = c.mode === 'decimal' ? c.binary : String(c.decimal), answer = host.querySelector('#binary-prediction').value.trim();
      host.querySelector('#binary-feedback').textContent = answer === expected ? 'Correct. Your prediction agrees with the weighted sum.' : c.mode === 'decimal' ? 'Not yet. Use eight digits, then add the weights under the 1 bits. That sum must equal your decimal input.' : 'Not yet. Add only the weights whose input bits are 1, and enter a decimal integer.';
    } catch (error) { host.querySelector('#binary-feedback').textContent = error.message; }
  };
  globalThis.lucide?.createIcons();
  return stop;
}

function bitBoard(c, networkOnly = false) {
  const bits = (networkOnly ? c.networkBits : c.addressBits).replaceAll('.', '');
  return '<div class="cidr-bit-board" aria-label="32 address bits with network and host labels">' + [0, 1, 2, 3].map(octet => '<div><p>Octet ' + (octet + 1) + '</p><div class="octet-row">' + [...bits.slice(octet * 8, octet * 8 + 8)].map((bit, i) => '<span class="' + (octet * 8 + i < c.prefix ? 'bit-network' : 'bit-host') + '"><b>' + bit + '</b><small>' + (octet * 8 + i < c.prefix ? 'N' : 'H') + '</small></span>').join('') + '</div></div>').join('') + '</div>';
}

export function mountCidrLesson(host, player) {
  host.querySelector('h3').textContent = 'Lab 2: Calculate a CIDR Block, Step by Step';
  host.querySelector('p').innerHTML = 'Objective: derive the mask, network, block boundary, address count, broadcast, and host range from an interface address and an explicit prefix. Start with <code>192.168.10.70/26</code>, then compare <code>172.16.35.10/20</code>, where the boundary falls inside the third octet.';
  host.querySelector('.lab-controls').insertAdjacentHTML('afterbegin', '<label class="field">Worked example<select id="cidr-example"><option value="">Custom address/prefix</option><option value="192.168.10.70/26" selected>Last-octet boundary: /26</option><option value="172.16.35.10/20">Third-octet boundary: /20</option><option value="10.20.30.40/12">Second-octet boundary: /12</option><option value="192.168.10.70/24">Whole-octet boundary: /24</option><option value="192.0.2.1/31">Point-to-point exception: /31</option><option value="192.0.2.1/32">Single-address exception: /32</option></select></label>');
  host.querySelector('#cidr-example').add(new Option('IPv4 default route: /0', '0.0.0.0/0'));
  host.querySelector('#cidr-example').addEventListener('input', event => {
    if (!event.target.value) return;
    const [ip, prefix] = event.target.value.split('/');
    host.querySelector('#class-address').value = ip; host.querySelector('#class-prefix').value = prefix;
  });
  for (const id of ['#class-address', '#class-prefix']) host.querySelector(id).addEventListener('input', () => { host.querySelector('#cidr-example').value = ''; });
  let c, historical;
  const stop = player(host, () => {
    const ip = host.querySelector('#class-address').value.trim(), prefix = host.querySelector('#class-prefix').value;
    c = cidrCalculation(ip, prefix);
    const first = Number(ip.split('.')[0]);
    if (c.defaultRoute) {
      historical = null;
      return c.frames;
    }
    if (first === 0 || first === 127 || first >= 224) throw Error('Use an ordinary historical A, B, or C unicast example, not 0/8, 127/8, multicast, or reserved space.');
    const base = first < 128 ? 8 : first < 192 ? 16 : 24;
    historical = { base, label: base === 8 ? 'A' : base === 16 ? 'B' : 'C', calculation: cidrCalculation(ip, base) };
    return c.frames;
  }, index => {
    const work = host.querySelector('.calculation-work');
    if (index < 0) { work.innerHTML = '<p>The calculation begins with the supplied prefix. The historical address class does not choose the modern mask.</p>'; return; }
    let html = '<p class="arithmetic-line"><strong>' + c.ip + '/' + c.prefix + '</strong></p>';
    if (index >= 1) html += '<p><strong>N = network bit; H = host bit.</strong> N positions remain the same within this block. H positions may vary.</p>' + bitBoard(c, index >= 5);
    if (index >= 2) {
      const parts = c.maskBits.match(/.{8}/g);
      html += table(['Mask octet', 'Binary mask', 'Included weights', 'Decimal mask'], parts.map((bits, i) => [i + 1, '<code>' + bits + '</code>', bitWeights.filter((_, j) => bits[j] === '1').join(' + ') || '0', c.mask.split('.')[i]]));
      html += '<p><code>' + parts.join('.') + '</code> = <strong>' + c.mask + '</strong></p>';
    }
    if (index >= 3) html += '<h4>Bitwise AND: keep only positions that are 1 in both rows</h4><p><code>1 AND 1 = 1</code>. All other bit pairs produce 0. Apply that rule separately to each column; this is not ordinary decimal multiplication.</p><div class="and-octets">' + c.addressBits.split('.').map((bits, i) => '<section><h5>Octet ' + (i + 1) + ': ' + c.ip.split('.')[i] + ' AND ' + c.mask.split('.')[i] + ' = ' + address(c.network).split('.')[i] + '</h5>' + table(['Row', 'Eight aligned bits'], [['Address', '<code>' + bits + '</code>'], ['Mask', '<code>' + c.maskBits.slice(i * 8, i * 8 + 8) + '</code>'], ['Network', '<code>' + c.networkBits.split('.')[i] + '</code>']]) + '</section>').join('') + '</div>';
    if (index >= 4 && c.pivot !== null) {
      const chosen = Math.floor(c.lower / c.block), count = 256 / c.block;
      const indexes = count <= 8 ? Array.from({ length: count }, (_, i) => i) : [...new Set([0, Math.max(0, chosen - 1), chosen, Math.min(count - 1, chosen + 1), count - 1])];
      html += '<h4>Locate octet ' + (c.pivot + 1) + ' in its aligned interval</h4><p>Block size = 256 - ' + c.mask.split('.')[c.pivot] + ' = ' + c.block + '. ' + (count > 8 ? 'Selected and neighboring intervals are shown, not every interval.' : 'These intervals divide this octet without overlap.') + '</p><div class="block-intervals">' + indexes.map(i => '<span class="' + (i === chosen ? 'selected-interval' : '') + '">' + (i * c.block) + '-' + ((i + 1) * c.block - 1) + (i === chosen ? '<b>Contains ' + c.ip.split('.')[c.pivot] + '</b>' : '') + '</span>').join('') + '</div>';
    }
    if (index >= 6) html += '<p class="arithmetic-line">Host bits: 32 - ' + c.prefix + ' = ' + c.hostBits + '<br>Total: 2^' + c.hostBits + ' = ' + c.size + '</p>';
    if (index >= 7) html += table(['Quantity', 'Derived result'], [['Network prefix', c.canonical], ['Mask', c.mask], ['Directed broadcast', c.prefix > 0 && c.prefix < 31 ? address(c.broadcast) : 'Not applicable'], ['Assignable range in the stated context', c.defaultRoute ? 'Not applicable' : c.firstAddress + ' - ' + c.lastAddress], ['Assignable count', c.assignable ?? 'Not applicable'], ['Context', c.rangeMeaning]]);
    if (index >= 8 && historical) html += '<h4>Why this is classless</h4><p>A historical class ' + historical.label + ' interpretation would start at /' + historical.base + ': <code>' + historical.calculation.canonical + '</code>. The explicit /' + c.prefix + ' instead gives <code>' + c.canonical + '</code>. ' + (c.prefix >= historical.base ? 'The difference is ' + (c.prefix - historical.base) + ' extra network bits: 2^' + (c.prefix - historical.base) + ' equal subdivisions of that historical block.' : 'The shorter prefix covers more than that historical block; it is a classless covering prefix, not a negative number of borrowed bits.') + '</p><p>This is address arithmetic, not a connectivity test. Reserved addresses and operational policy still constrain real assignments.</p>';
    if (index >= 8 && c.defaultRoute) html += '<h4>Where the default route is used</h4><p>Because /0 fixes no bits, it matches every destination. A router selects it only when no more specific installed route matches. The default route itself does not guarantee delivery.</p>';
    work.innerHTML = html;
  });
  positionCalculationReplay(host, '.calculation-work');
  return stop;
}

export function mountBeginnerAddressing(area, player) {
  const stops = [];
  const primer = document.createElement('section'); primer.id = 'ip-start';
  primer.innerHTML = `<h2>Start Here: What Are We Calculating?</h2>
    <p>An Internet Protocol (IP) address identifies a network interface, such as a computer's Ethernet connection. This lesson begins with one IPv4 address, <code>192.168.10.70</code>. Its four decimal numbers are called <strong>octets</strong>. An octet contains eight binary digits, or <strong>bits</strong>. Each bit can be 0 or 1; four octets therefore contain 32 bits.</p>
    <nav class="ip-learning-path" aria-label="IP calculation lesson sequence"><a href="#bit-builder">1. Build an octet</a><a href="#binary-lab">2. Convert notation</a><a href="#class-cidr-lab">3. Derive a CIDR block</a><a href="#host-sizing-lab">4. Choose a prefix</a><a href="#subnet-split-lab">5. Divide a network</a><a href="#vlsm-lab">6. Allocate unequal blocks</a><a href="#aggregate-lab">7. Summarize routes</a><a href="#cidr-practice">8. Practise independently</a></nav>
    <div class="ip-interface-example"><img src="assets/devices/host.webp" alt="Workstation network interface"><div><strong>PC-A / Ethernet interface</strong><p><code>192 . 168 . 10 . 70</code></p><p>Each number occupies eight bits. The dots separate octets; they do not, by themselves, mark the network boundary.</p></div></div>
    <h3>Decimal and binary describe the same value</h3><p>Decimal uses ten digits (0-9). Binary uses two (0 and 1). The position of a digit gives it a weight. In an octet, the weights double from right to left: 1, 2, 4, 8, 16, 32, 64, 128. A 1 includes a weight; a 0 excludes it. Thus <code>00000101</code> represents <code>4 + 1 = 5</code>. Interpret those digits using binary place values, not decimal place values.</p>
    <p>The largest octet is <code>11111111</code>: <code>128 + 64 + 32 + 16 + 8 + 4 + 2 + 1 = 255</code>. All zeros represent 0. This is why a decimal IPv4 octet ranges from 0 to 255.</p>
    <section class="module-lab" id="bit-builder"><h3>Warm-Up: Build an Octet Yourself</h3><p>Objective: make 5 from the weights, then make 192 and 168. Treat each bit as a decision about including its weight. The sum below is calculated from your current choices.</p><div class="conversion-bits builder-bits">${bitWeights.map((weight, i) => '<span><small>Weight ' + weight + '</small><button type="button" data-bit="' + i + '" aria-pressed="false" aria-label="Weight ' + weight + ', bit 0">0</button></span>').join('')}</div><p class="arithmetic-line" id="bit-equation">0 = 0</p><p><strong>Binary:</strong> <output id="built-binary">00000000</output> <strong>Decimal:</strong> <output id="built-decimal">0</output></p><div class="lab-controls">${field('octet-target', 'Target decimal octet', '5', 'inputmode="numeric" maxlength="3"')}<button type="button" id="check-octet">${icon('check')}Check octet</button><button type="button" id="clear-octet" title="Clear all eight bits" aria-label="Clear all eight bits">${icon('rotate-ccw')}</button></div><p id="octet-feedback" role="status"></p></section>
    <h3>What does the slash mean?</h3><p>An address alone does not tell us which nearby addresses belong to its network. A <strong>prefix length</strong> supplies that boundary. In <code>192.168.10.70/26</code>, /26 means the first 26 of the 32 bits identify the network. The remaining <code>32 - 26 = 6</code> bits identify positions within that block. It does not mean 26 computers, nor 26 available addresses.</p><p>A <strong>subnet mask</strong> writes that same boundary as 32 bits: network positions are 1 and host positions are 0. A <strong>network address</strong> is the beginning of the block. A <strong>broadcast address</strong> has all host bits set to 1 in an ordinary IPv4 broadcast subnet. Interface addresses normally come from the positions between those two endpoints.</p>
    <p><strong>Powers of two:</strong> 2^3 means 2 x 2 x 2 = 8. Three host bits can form eight different combinations. Six host bits form 2^6 = 64 combinations. In an ordinary IPv4 LAN, reserving the network and broadcast leaves 64 - 2 = 62 interface addresses, including any gateway interface.</p>`;
  area.prepend(primer);
  primer.querySelector('#bit-equation').setAttribute('role', 'status');
  const practiceLink = primer.querySelector('.ip-learning-path a[href="#cidr-practice"]');
  const repairLink = document.createElement('a'); repairLink.href = '#address-repair-lab'; repairLink.textContent = '8. Diagnose a wrong prefix';
  practiceLink.before(repairLink); practiceLink.textContent = '9. Practise independently';
  primer.querySelectorAll('.ip-learning-path a').forEach(link => link.setAttribute('href', '?course=addressing' + link.getAttribute('href')));
  const bits = Array(8).fill(0);
  function drawBuilder() {
    const sum = bits.reduce((total, bit, i) => total + bit * bitWeights[i], 0);
    primer.querySelector('#built-binary').textContent = bits.join(''); primer.querySelector('#built-decimal').textContent = sum;
    primer.querySelector('#bit-equation').textContent = (bitWeights.filter((_, i) => bits[i]).join(' + ') || '0') + ' = ' + sum;
    primer.querySelectorAll('[data-bit]').forEach((button, i) => { button.textContent = bits[i]; button.setAttribute('aria-pressed', String(Boolean(bits[i]))); button.setAttribute('aria-label', 'Weight ' + bitWeights[i] + ', bit ' + bits[i]); });
    primer.querySelector('#octet-feedback').textContent = '';
    return sum;
  }
  primer.querySelectorAll('[data-bit]').forEach((button, i) => button.onclick = () => { bits[i] = 1 - bits[i]; drawBuilder(); });
  primer.querySelector('#clear-octet').onclick = () => { bits.fill(0); drawBuilder(); };
  primer.querySelector('#check-octet').onclick = () => {
    try {
      const target = octetCalculation('decimal', primer.querySelector('#octet-target').value).decimal, sum = drawBuilder();
      primer.querySelector('#octet-feedback').textContent = sum === target ? 'Correct. Your included weights add to ' + target + '.' : 'Your weights total ' + sum + ', not ' + target + '. ' + (sum > target ? 'Exclude a weight or replace it with smaller weights.' : 'Consider an unused weight that fits the difference of ' + (target - sum) + '.');
    } catch (error) { primer.querySelector('#octet-feedback').textContent = error.message; }
  };

  const extended = document.createElement('section'); extended.id = 'cidr-applications';
  extended.innerHTML = `<h2>Apply Classless Addressing</h2><p><strong>Classless Inter-Domain Routing (CIDR)</strong> makes the prefix explicit. A larger slash number leaves fewer host bits and therefore makes a smaller block. Subnetting divides a parent block; aggregation describes several destinations with a covering prefix. Both depend on binary alignment, not on the historical class letter.</p>
    <section class="module-lab" id="host-sizing-lab"><h3>Lab 3: Find a Prefix from a Host Requirement</h3><p>Scenario: a department needs 50 interface addresses, including its gateway. Test increasing host-bit counts until <code>2^h - 2</code> meets that requirement. The first suitable count gives the smallest ordinary LAN block. A gateway consumes an address; it is not an additional subtraction from the formula.</p><div class="lab-controls">${field('required-hosts', 'Required interfaces, including gateway', '50', 'inputmode="numeric" maxlength="10"')}</div><div class="sizing-work"></div></section>
    <section class="module-lab" id="subnet-split-lab"><h3>Lab 4: Divide a Parent into Equal Subnets</h3><p>Scenario: divide <code>192.168.10.0/24</code> into /26 networks. The child prefix adds two network bits, so <code>2^(26 - 24) = 4</code> equal blocks fit. Each contains <code>2^(32 - 26) = 64</code> addresses. Advancing by 64 gives starts .0, .64, .128, and .192. All four subnets are valid; there is no modern rule to discard the first and last subnet.</p><div class="lab-controls">${field('split-parent', 'Parent network prefix', '192.168.10.0/24')}${field('split-child', 'Child prefix length', '26', 'type="number" min="0" max="32"')}</div><div class="split-work"></div></section>
    <section class="module-lab" id="vlsm-lab"><h3>Lab 5: Allocate Unequal Subnets with VLSM</h3><p><strong>Variable-Length Subnet Masking (VLSM)</strong> uses different prefix lengths inside a parent network. For requirements of 50, 25, and 10 interfaces, allocate the largest block first, then the next largest. Each start must be a multiple of its block size. This prevents overlap and avoids wasting a large block on every small department.</p><div class="lab-controls">${field('vlsm-parent', 'Parent network prefix', '192.168.10.0/24')}${field('vlsm-demands', 'Interface requirements, separated by commas', '50,25,10', 'maxlength="80"')}</div><div class="vlsm-work"></div><p>Each requirement includes that department's gateway. This model produces one valid contiguous allocation, not the only possible non-overlapping design.</p></section>
    <section class="module-lab" id="aggregate-lab"><h3>Lab 6: Calculate a CIDR Route Summary</h3><p>Two adjacent /25 networks can form one /24 only when they are aligned siblings: their first 24 bits agree. Compare <code>192.168.10.0/25</code> and <code>192.168.10.128/25</code>. Then replace the second with <code>192.168.11.0/25</code>. A covering summary still exists, but it also includes addresses outside the supplied networks. An unsafe summary may attract traffic for destinations that are not reachable.</p><div class="lab-controls">${field('summary-left', 'First network prefix', '192.168.10.0/25')}${field('summary-right', 'Second network prefix', '192.168.10.128/25')}</div><div class="summary-work"></div></section>
    <section class="module-lab" id="cidr-practice"><h3>Practice: Calculate without the Worked Solution</h3><p>For the assigned ordinary IPv4 LAN, derive all five quantities. Keep the calculation in your own notes, then check it. Feedback identifies which quantities need revision without filling in the answers. This is browser-local study practice, not a graded certificate examination.</p><p class="arithmetic-line" id="practice-scenario"></p><form id="cidr-practice-form"><div class="lab-controls">${field('answer-mask', 'Subnet mask', '', 'required autocomplete="off"')}${field('answer-network', 'Network address (without slash)', '', 'required autocomplete="off"')}${field('answer-broadcast', 'Broadcast address', '', 'required autocomplete="off"')}${field('answer-total', 'Total addresses', '', 'required inputmode="numeric"')}${field('answer-usable', 'Usable interface addresses', '', 'required inputmode="numeric"')}</div><button type="submit">${icon('check')}Check calculations</button> <button type="button" id="new-cidr-practice">${icon('shuffle')}New example</button></form><p id="cidr-practice-feedback" role="status"></p></section>
    <h3>Verify the result and investigate mistakes</h3><ol><li>The network must start on a block boundary, not at the supplied interface address.</li><li>For an ordinary IPv4 LAN, <code>broadcast - network + 1</code> must equal <code>2^(32 - prefix)</code>. Count both endpoints.</li><li>Usable addresses begin one above the network and end one below the broadcast. The gateway is chosen from that usable range, not always automatically the first address.</li><li>Compare a larger slash number with a smaller one. Explain why /27 contains fewer addresses than /26.</li><li>Use the <a href="index.html">topology workshop</a> to apply your plan to interfaces and run a fresh reachability test. Correct arithmetic alone does not prove cabling, VLAN membership, routing, or return-path operation.</li></ol>
    <p>Context matters: /31 point-to-point links can use both endpoint addresses; /32 represents one address. IPv6 has no broadcast, so do not apply the ordinary IPv4 subtract-two rule. A /0 calculation covers all IPv4 addresses mathematically, including special-purpose ranges; that does not make all of them assignable.</p>
    <p>Technical references: <a href="https://www.rfc-editor.org/rfc/rfc4632.html">RFC 4632: classless prefix notation and aggregation</a>, <a href="https://www.rfc-editor.org/rfc/rfc1878.html">RFC 1878: informational IPv4 subnet table</a>, and <a href="https://www.rfc-editor.org/rfc/rfc3021.html">RFC 3021: /31 point-to-point semantics</a>.</p>`;
  area.querySelector('#class-cidr-lab').after(extended);
  const repair = document.createElement('section'); repair.className = 'module-lab'; repair.id = 'address-repair-lab';
  repair.innerHTML = `<h3>Lab 7: Diagnose a Wrong IPv4 Prefix</h3>
    <p><strong>Objective:</strong> Explain why a workstation can reach its local peer but fail to reach a different subnet. Correct the workstation prefix without changing its address, gateway, or VLAN.</p>
    <p><strong>Topology:</strong> Sales and Engineering connect through a router. Sales uses <code>192.168.10.0/26</code> on VLAN 10 with gateway <code>192.168.10.1</code>. Engineering uses <code>192.168.10.64/27</code> on VLAN 20. The links, gateways, and routing are working.</p>
    <p>The affected workstation is <code>192.168.10.2/24</code>. Its Sales peer is <code>192.168.10.3/26</code> and the Engineering destination is <code>192.168.10.66/27</code>. A prefix tells a host which addresses it treats as directly reachable on its link. A destination outside that range goes through the gateway in this lab.</p>
    <ol><li>Predict whether each destination appears local to the affected workstation. Run both simulated pings with the original prefix and record which one fails.</li><li>Change only the workstation prefix so it matches the Sales address plan. Predict what changes about the Engineering path.</li><li>Run both pings again. Confirm that the Sales peer is still reachable, Engineering is now reachable through the gateway, and the prefix matches the plan.</li></ol>
    <form class="lab-controls"><label class="field">Workstation prefix length<input id="repair-prefix" type="number" value="24" min="1" max="30" step="1" required></label><button type="submit">${icon('play')}Run both pings</button></form>
    <div id="repair-result" role="status"></div>
    <details class="lab-checkpoint"><summary>Compare your explanation</summary><p>With /24, the workstation treats .66 as local and looks for it on VLAN 10. Engineering is on VLAN 20, so the local lookup cannot reach it. With /26, the Sales block ends at .63, so .66 is outside it and the workstation sends the packet to its Sales gateway. The local peer remains inside the Sales block in both cases.</p><p>A successful ping does not prove the address plan is correct. Try /27: these two pings can pass in the model, but /27 does not match the Sales plan and gives only 30 ordinary LAN host addresses instead of the required capacity for 50.</p></details>
    <p><strong>Takeaway:</strong> Verify local and routed communication as well as the intended subnet configuration. This guided practice uses the workshop simulation and does not affect assessment or course credit.</p>`;
  extended.querySelector('#cidr-practice').before(repair);
  const repairInput = repair.querySelector('#repair-prefix'), repairResult = repair.querySelector('#repair-result');
  repairInput.addEventListener('input', () => { repairResult.textContent = ''; });
  repair.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const state = initialState(), [source, local, remote] = state.hosts;
    // The first two endpoints are in Sales; the third is in Engineering.
    source.prefix = repairInput.valueAsNumber;
    const localProbe = ping(state, source.id, local.id), routedProbe = ping(state, source.id, remote.id);
    const calculation = cidrCalculation(source.ip, source.prefix);
    const matchesPlan = calculation.canonical === state.departments[0].cidr;
    const path = probe => (probe.ok ? 'Passed. ' : 'Failed. ') + probe.steps.slice(1).map(step => step.label).join(' ');
    const evidence = document.createElement('dl'); evidence.className = 'repair-evidence';
    for (const [label, result] of [
      ['Local peer', path(localProbe)], ['Engineering peer', path(routedProbe)],
      ['Address plan', calculation.canonical + (matchesPlan ? ' matches the Sales plan.' : ' does not match the Sales plan.')]
    ]) {
      const row = document.createElement('div'), term = document.createElement('dt'), detail = document.createElement('dd');
      term.textContent = label; detail.textContent = result;
      row.append(term, detail); evidence.append(row);
    }
    const verdict = document.createElement('p');
    verdict.textContent = localProbe.ok && routedProbe.ok && matchesPlan ? 'Repair verified: both paths work and the workstation matches the Sales plan.' : 'Repair not yet verified. Compare both probes and the intended prefix.';
    repairResult.replaceChildren(evidence, verdict);
  });
  function animated(id, build, draw) {
    const host = extended.querySelector('#' + id); let model;
    stops.push(player(host, () => { model = build(host); return model.frames; }, index => {
      const box = host.querySelector('[class$="-work"]');
      box.innerHTML = index < 0 ? '<p>The trace will derive each result from the current inputs.</p>' : draw(model, index);
    }));
    positionCalculationReplay(host, '[class$="-work"]');
  }
  animated('host-sizing-lab', host => {
    const c = prefixForHosts(host.querySelector('#required-hosts').value);
    return { ...c, frames: [...c.trials.map(t => ({ message: 'Try ' + t.hostBits + ' host bits: 2^' + t.hostBits + ' - 2 = ' + t.usable + '. ' + (t.fits ? 'Enough for ' : 'Too small for ') + c.demand + ' interfaces.' })), { message: 'Choose /' + c.prefix + ': 32 - ' + c.hostBits + ' = ' + c.prefix + ' network bits. ' + c.usable + ' usable addresses satisfy ' + c.demand + ' interfaces.' }] };
  }, (c, index) => table(['Host bits', 'Calculation', 'Fits requirement?'], c.trials.slice(0, index + 1).map(t => [t.hostBits, '2^' + t.hostBits + ' - 2 = ' + t.usable, t.fits ? 'Yes: smallest suitable block' : 'No'])) + (index >= c.trials.length ? '<p class="arithmetic-line">32 - ' + c.hostBits + ' = /' + c.prefix + '<br>' + c.total + ' total - 2 reserved = ' + c.usable + ' usable</p>' : ''));
  animated('subnet-split-lab', host => {
    const c = splitPrefix(host.querySelector('#split-parent').value.trim(), host.querySelector('#split-child').value);
    return { ...c, frames: [{ message: 'Extra network bits = ' + c.child + ' - ' + c.parent.prefix + ' = ' + c.borrowed + '. Subnet count = 2^' + c.borrowed + ' = ' + c.count + '.' }, ...c.blocks.map(s => ({ message: 'Block ' + (s.index + 1) + ': ' + s.canonical + ', size ' + s.size + '. The next aligned start is ' + (s.broadcast < 2 ** 32 - 1 ? address(s.broadcast + 1) : 'outside IPv4 space') + '.' })), { message: c.count + ' blocks x ' + c.size + ' addresses = ' + c.parent.size + ' addresses in ' + c.parent.canonical + '. ' + (c.omitted ? c.omitted + ' intermediate rows are omitted from the display; the count includes them.' : 'All blocks are shown.') }] };
  }, (c, index) => '<p>2^' + c.borrowed + ' = ' + c.count + ' equal blocks; each contains ' + c.size + ' addresses.</p>' + table(['Block', 'Network prefix', 'Address span', 'Assignable count and context'], c.blocks.slice(0, index).map(s => [s.index + 1, s.canonical, address(s.network) + ' - ' + address(s.broadcast), (s.assignable ?? 'Not applicable') + ' / ' + s.rangeMeaning])) + (c.omitted ? '<p>' + c.omitted + ' intermediate rows are omitted; no additional blocks are implied to be adjacent to the displayed sample.</p>' : ''));
  animated('vlsm-lab', host => {
    const raw = host.querySelector('#vlsm-demands').value.trim();
    if (!/^\d+(\s*,\s*\d+){0,5}$/.test(raw)) throw Error('Enter one to six whole-number requirements separated by commas.');
    const c = vlsmAllocation(host.querySelector('#vlsm-parent').value.trim(), raw.split(',').map(x => x.trim()));
    return { ...c, frames: [{ message: 'Sort by required block size, largest first. Group labels retain the original input order.' }, ...c.allocations.map(s => ({ message: 'Group ' + s.label + ' needs ' + s.demand + '. 2^' + s.hostBits + ' - 2 = ' + s.usable + ' fits; reserve aligned ' + s.canonical + ' (' + s.size + ' total addresses).' })), { message: 'Allocated ' + c.used + ' of ' + c.parent.size + ' addresses without overlap. ' + c.remaining + ' addresses remain unallocated.' }] };
  }, (c, index) => table(['Group', 'Required', 'Host bits', 'Prefix', 'Usable range', 'Capacity'], c.allocations.slice(0, index).map(s => [s.label, s.demand, s.hostBits, s.canonical, s.firstAddress + ' - ' + s.lastAddress, s.usable])) + (index > c.allocations.length ? '<p>' + c.used + ' addresses allocated; ' + c.remaining + ' remain.</p>' : ''));
  animated('aggregate-lab', host => {
    const c = aggregatePrefixes(host.querySelector('#summary-left').value.trim(), host.querySelector('#summary-right').value.trim());
    return { ...c, frames: [{ message: 'Compare the lowest covered address with the highest covered address in binary.' }, { message: c.commonBits + ' leading bits agree. The first differing bit cannot be part of a common prefix.' }, { message: 'Clear the remaining bits: smallest covering prefix = ' + c.summary.canonical + ' (' + c.summary.size + ' addresses).' }, { message: c.exact ? 'Exact summary: the input networks fill the covering block with no extra addresses.' : 'Not an exact summary: ' + c.extra + ' extra addresses are included. Do not advertise this cover without checking reachability and policy for them.' }] };
  }, (c, index) => table(['Boundary', '32 bits'], [['Lowest covered address', c.startBits], ['Highest covered address', c.endBits]]) + (index >= 1 ? '<p>Matching leading bits: <strong>' + c.commonBits + '</strong>.</p>' : '') + (index >= 2 ? '<p class="arithmetic-line">Covering prefix: ' + c.summary.canonical + '</p>' : '') + (index >= 3 ? '<p class="' + (c.exact ? 'practice-correct' : 'practice-revise') + '">' + (c.exact ? 'Exact: no extra addresses.' : 'Caution: ' + c.extra + ' additional addresses are included.') + '</p>' : ''));

  const cases = [['192.168.20.77', 27], ['172.20.37.18', 20], ['10.34.78.9', 12], ['192.168.44.146', 28], ['198.51.100.173', 26]];
  let caseIndex = -1, currentCase, attempts = 0;
  function newCase() {
    const random = crypto.getRandomValues(new Uint32Array(1))[0];
    caseIndex = (caseIndex + 1 + random % (cases.length - 1)) % cases.length;
    currentCase = cidrCalculation(...cases[caseIndex]); attempts = 0;
    extended.querySelector('#practice-scenario').textContent = currentCase.ip + '/' + currentCase.prefix;
    extended.querySelector('#cidr-practice-form').reset(); extended.querySelector('#cidr-practice-feedback').textContent = '';
    extended.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
  }
  extended.querySelector('#new-cidr-practice').onclick = newCase;
  extended.querySelector('#cidr-practice-form').onsubmit = event => {
    event.preventDefault(); attempts++;
    const input = Object.fromEntries(['mask', 'network', 'broadcast', 'total', 'usable'].map(key => [key, extended.querySelector('#answer-' + key).value]));
    const results = checkCidrAnswers(currentCase, input), hints = { mask: 'Count the leading 1 bits, then convert each octet.', network: 'Clear all host bits; check alignment.', broadcast: 'Set all host bits to 1.', total: 'Use 2^(32 - prefix).', usable: 'For this ordinary LAN, subtract two from the total.' };
    results.forEach(result => extended.querySelector('#answer-' + result.key).setAttribute('aria-invalid', String(!result.correct)));
    const correct = results.filter(result => result.correct).length;
    extended.querySelector('#cidr-practice-feedback').textContent = 'Attempt ' + attempts + ': ' + correct + '/5 correct. ' + (correct === 5 ? 'All quantities agree. Explain how the network and broadcast delimit your block, then try a different example.' : results.filter(result => !result.correct).map(result => result.key + ': ' + hints[result.key]).join(' '));
  };
  newCase();
  globalThis.lucide?.createIcons();
  return () => stops.forEach(stop => stop());
}
