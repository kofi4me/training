import { subnet, address, ipv4 } from './core.js';
export function splitSubnet(cidr, prefix) {
  const parent = subnet(cidr);
  if (!Number.isInteger(prefix) || prefix < parent.prefix || prefix > 30 || prefix - parent.prefix > 8) throw Error('Choose a child prefix up to /30 and at most 8 bits longer than the parent.');
  const size = 2 ** (32 - prefix);
  return Array.from({ length: parent.size / size }, (_, i) => subnet(`${address(parent.network + i * size)}/${prefix}`));
}
export function mountCalculator(getState, apply) {
  const section = document.createElement('section'); section.className = 'calculator plan';
  section.innerHTML = `<div class="section-bar"><h2><i data-lucide="grid-2x2"></i>Subnet workbench</h2><span class="subtle">IPv4 / VLSM</span></div><div class="calculator-controls"><label class="field">Parent network<input id="calc-parent" value="192.168.10.0/24"></label><label class="field">Child prefix<input id="calc-prefix" type="number" min="0" max="30" value="26"></label><label class="field">Required IPs (including gateway)<input id="calc-demand" type="number" min="1" max="65534" value="50"></label><button id="calc-run" class="primary">Calculate</button></div><div id="calc-output" aria-live="polite"></div>`;
  document.querySelector('.plan').before(section);
  const output = section.querySelector('#calc-output');
  let children = [], active = 0;
  function details() {
    const n = children[active], demand = Number(section.querySelector('#calc-demand').value);
    const bits = ipv4(address(n.network)).toString(2).padStart(32, '0');
    output.innerHTML = `<div class="subnet-strip">${children.map((c, i) => `<button class="subnet-block ${i === active ? 'chosen' : ''}" data-child="${i}">${c.canonical}<small>${c.usable} usable</small></button>`).join('')}</div><div class="subnet-detail"><div><strong>${n.canonical}</strong><p>Mask ${n.mask} / Broadcast ${address(n.broadcast)}</p><p>Hosts ${address(n.first)} - ${address(n.last)}</p><p>2<sup>${32 - n.prefix}</sup> total addresses - 2 reserved = ${n.usable} usable. ${n.usable >= demand ? `${n.usable - demand} spare after ${demand} required IPs.` : `Too small: ${demand - n.usable} more addresses needed.`}</p><div class="binary"><span>${bits.slice(0, n.prefix)}</span><b>${bits.slice(n.prefix)}</b></div><p>Network bits / host bits</p></div><label class="field">Assign subnet to<select id="calc-department"></select><button id="calc-apply" class="primary">Assign subnet & gateway</button></label></div>`;
    const select = output.querySelector('select');
    for (const d of getState().departments) select.add(new Option(d.name, d.id));
    output.querySelector('#calc-apply').onclick = () => apply(select.value, n.canonical, address(n.first));
  }
  function calculate() {
    try {
      const demand = Number(section.querySelector('#calc-demand').value);
      if (!Number.isInteger(demand) || demand < 1 || demand > 65534) throw Error('Required addresses must be 1-65534.');
      children = splitSubnet(section.querySelector('#calc-parent').value.trim(), Number(section.querySelector('#calc-prefix').value)); active = 0; details();
    } catch (error) { output.textContent = error.message; }
  }
  section.querySelector('#calc-run').onclick = calculate;
  output.onclick = event => { const button = event.target.closest('[data-child]'); if (button) { active = Number(button.dataset.child); details(); } };
  calculate();
}
