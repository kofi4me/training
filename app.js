import './account-nav.js';
import { mountCalculator } from './calculator.js';
import { mountLearning } from './learning.js';
import { createHostTools } from './host-tools.js';
import { checkNetworkActivity } from './practical-checks.js';
import { restoreMessages } from './messages.js';
import { initialState, restoredState, subnet, address, validate, ping, packetFrames } from './core.js';
const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icons = () => globalThis.lucide?.createIcons();
let state = initialState(), selected = 'router', highlighted = [], toastTimer, packet = null, packetIndex = 0;
function upgrade() { state.version = 2; state.positions ||= {}; }
function point(id, fallback) { return state.positions?.[id] || fallback; }
function restoreNetwork(value) { const network = restoredState(value); network.messages = restoreMessages(value.messages, network.hosts); return network; }
try { const saved = localStorage.getItem('network-workshop-v1'); if (saved) state = restoreNetwork(JSON.parse(saved)); } catch { /* Invalid saved data falls back to the starter network. */ }
function notify(message) { $('#toast').textContent = message; $('#toast').style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').style.display = 'none', 3500); }
function save() { try { localStorage.setItem('network-workshop-v1', JSON.stringify(state)); } catch { notify('Browser storage is unavailable. Export your configuration to keep it.'); } }
function invalidate() { packet = null; document.querySelector('#packet-controls')?.remove(); highlighted = []; $('#trace').innerHTML = '<div class="empty-state"><i data-lucide="activity"></i><p>Configuration changed. Send a new ping.</p></div>'; $('#feedback').innerHTML = '<p>Configuration changed. Check the network to refresh your assessment.</p>'; $('#issue-count').textContent = 'Not checked'; }
function update() { save(); invalidate(); render(); }
function deviceIcon(type) {
  return `<image class="equipment-image" href="assets/devices/${type}.webp" x="-55" y="-24" width="110" height="48" preserveAspectRatio="xMidYMid meet"/>`;
}
function draw() {
  const lines = [], nodes = [], labels = [];
  const width = Math.max(900, state.departments.length * 300);
  const height = Math.max(490, ...state.departments.map(d => 370 + Math.ceil(state.hosts.filter(h => h.department === d.id).length / 2) * 120), ...Object.values(state.positions || {}).map(p => p.y + 75));
  $('#diagram').setAttribute('viewBox', `0 0 ${width} ${height}`);
  const router = point('router', { x: width / 2, y: 55 });
  function link(a, b, pa, pb, trunk = false) {
    const active = highlighted.some((id, i) => i < highlighted.length - 1 && ((id === a && highlighted[i + 1] === b) || (id === b && highlighted[i + 1] === a)));
    lines.push(`<path class="link ${trunk ? 'trunk' : ''} ${active ? 'active' : ''}" d="M${pa.x} ${pa.y + 20} L${pb.x} ${pb.y - 25}"/>`);
  }
  function node(id, p, type, name, subtitle) {
    const connected = type === 'host' ? state.hosts.find(h => h.id === id).connected !== false : type === 'switch' ? state.departments.find(d => `sw-${d.id}` === id).trunk : true;
    const status = connected ? 'Connected' : 'Link unavailable';
    const unread = type === 'host' ? (state.messages || []).filter(m => m.to === id && !m.read).length : 0;
    nodes.push(`<g class="node ${selected === id ? 'selected' : ''}" data-node="${id}" transform="translate(${p.x},${p.y})" tabindex="0" role="button" aria-label="Configure ${escape(name)}${unread ? ', ' + unread + ' unread messages' : ''}"><title>${escape(name)} / ${status} / Generic ${type === 'host' ? 'workstation' : type}</title><rect class="node-shell" x="-62" y="-32" width="124" height="94" rx="6"/>${deviceIcon(type)}<circle class="equipment-status" cx="53" cy="-23" r="3" fill="${connected ? '#16846b' : '#bf801e'}"/>${unread ? `<g class="mail-badge"><circle cx="-49" cy="-22" r="8" fill="#3568d4"/><text x="-49" y="-19" text-anchor="middle" fill="white" font-size="9">${unread}</text></g>` : ''}<text class="node-name" text-anchor="middle" y="37">${escape(name)}</text><text class="node-ip" text-anchor="middle" y="53">${escape(subtitle)}</text></g>`);
  }
  node('router', router, 'router', 'R1 / Router', state.routing ? 'Inter-VLAN enabled' : 'Routing disabled');
  state.departments.forEach((d, i) => {
    const sw = `sw-${d.id}`, p = point(sw, { x: 150 + i * 300, y: 232 });
    if (d.trunk) link('router', sw, router, p, true);
    node(sw, p, 'switch', `SW-${i + 1}`, `${d.name} / VLAN ${d.vlan}`);
    state.hosts.filter(h => h.department === d.id).forEach((h, j) => {
      const hp = point(h.id, { x: 150 + i * 300 + (j % 2 === 0 ? -72 : 72), y: 370 + Math.floor(j / 2) * 120 });
      if (h.connected !== false) link(sw, h.id, p, hp);
      node(h.id, hp, 'host', h.name, h.ip);
    });
  });
  $('#diagram').innerHTML = lines.join('') + labels.join('') + nodes.join('');
  document.querySelector('.topology .subtle').textContent = `R1 / ${state.departments.length} switches / ${state.hosts.length} hosts`;
}
function textField(label, key, value, options = '') { return `<label class="field">${label}<input data-field="${key}" value="${escape(value)}" ${options}></label>`; }
function inspect() {
  let html = '';
  if (selected === 'router') {
    html = '<div class="device-label">LAYER 3 / GATEWAY</div><div class="device-heading"><i data-lucide="router"></i><h3>R1 / Router</h3></div><label class="toggle-row"><input type="checkbox" data-field="routing" ' + (state.routing ? 'checked' : '') + '>Enable inter-VLAN routing</label><p class="inspector-note">Each department has a router subinterface. Set its gateway in the address plan. Switch uplinks carry tagged VLAN traffic to R1.</p>';
  } else if (selected.startsWith('sw-')) {
    const d = state.departments.find(d => selected === `sw-${d.id}`);
    html = `<div class="device-label">LAYER 2 / ACCESS SWITCH</div><div class="device-heading"><i data-lucide="network"></i><h3>${d.name}</h3></div><label class="toggle-row"><input type="checkbox" data-field="trunk" ${d.trunk ? 'checked' : ''}>Allow VLAN ${d.vlan} on uplink trunk</label><p class="inspector-note">Host links are untagged access ports. Configure each host's access-port VLAN separately. An uplink carries this department's VLAN to R1.</p>`;
  } else {
    const h = state.hosts.find(h => h.id === selected), d = state.departments.find(d => d.id === h.department);
    html = `<div class="device-label">ENDPOINT / ${d.name.toUpperCase()}</div><div class="device-heading"><i data-lucide="monitor"></i><h3>${h.name}</h3></div>` + hostTools.render(h) + textField('IPv4 address', 'ip', h.ip, 'inputmode="decimal"') + textField('Prefix length', 'prefix', h.prefix, 'type="number" min="0" max="32"') + textField('Default gateway', 'gateway', h.gateway, 'inputmode="decimal"') + textField('Switch access-port VLAN', 'vlan', h.vlan, 'type="number" min="1" max="4094"') + `<p class="inspector-note">Physical connection: ${d.name} switch. Changing an access VLAN does not change this host's IP settings.</p>`;
  }
  if (selected !== 'router' && !selected.startsWith('sw-')) {
    const h = state.hosts.find(h => h.id === selected);
    html += `<label class="field">Cable to switch<select data-field="department">${state.departments.map(d => `<option value="${d.id}" ${h.department === d.id ? 'selected' : ''}>${escape(d.name)}</option>`).join('')}</select></label><label class="toggle-row"><input type="checkbox" data-field="connected" ${h.connected !== false ? 'checked' : ''}>Access cable connected</label>`;
  }
  const equipmentType = selected === 'router' ? 'router' : selected.startsWith('sw-') ? 'switch' : 'host';
  html = `<div class="equipment-preview"><img src="assets/devices/${equipmentType}.webp" alt="Generic ${equipmentType === 'host' ? 'desktop workstation' : 'rack-mounted ' + equipmentType}"><span>Generic equipment representation</span></div>` + html;
  const choices = [{ id: 'router', name: 'R1 / Router' }, ...state.departments.map((d, i) => ({ id: `sw-${d.id}`, name: `SW-${i + 1} / ${d.name}` })), ...state.hosts];
  $('#inspector').innerHTML = `<label class="field device-picker">Selected device<select id="device-picker">${choices.map(d => `<option value="${d.id}" ${selected === d.id ? 'selected' : ''}>${escape(d.name)}</option>`).join('')}</select></label>` + html;
}
function plan() {
  $('#plan-body').innerHTML = state.departments.map(d => {
    let range = 'Enter a valid subnet';
    try { const n = subnet(d.cidr); range = state.mode === 'learn' ? `<span class="capacity">${n.usable} usable</span><br>${n.usable ? address(n.first) + ' - ' + address(n.last) : 'No conventional LAN host range'}<br>Broadcast ${address(n.broadcast)}` : 'Calculate, then check'; } catch { /* Validation supplies details. */ }
    return `<tr><td><span class="dept-name"><b class="dot" style="background:${d.color}"></b>${d.name}</span></td><td>${d.demand}</td><td><input aria-label="${d.name} VLAN" class="vlan-input" type="number" min="1" max="4094" data-dept="${d.id}" data-key="vlan" value="${d.vlan}"></td><td><input aria-label="${d.name} subnet" data-dept="${d.id}" data-key="cidr" value="${escape(d.cidr)}"></td><td><input aria-label="${d.name} router gateway" data-dept="${d.id}" data-key="gateway" value="${escape(d.gateway)}"></td><td class="range">${range}</td></tr>`;
  }).join('');
}
function render() {
  draw(); inspect(); plan(); refreshEndpoints();
  document.querySelectorAll('[data-mode]').forEach(button => { button.classList.toggle('active', button.dataset.mode === state.mode); button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)); });
  const challenge = state.mode === 'challenge';
  $('#brief-title').textContent = challenge ? 'Incident 01 / Broken connections' : 'The office network';
  $('#brief-copy').textContent = challenge ? 'Three configuration faults interrupted service. Restore a clean address plan and communication between every workstation. Use Check network to request diagnostic feedback.' : 'Divide 192.168.10.0/24 between three departments. Device counts include each gateway. Keep the subnets separate and connect all six workstations.';
  const count = validate(state).length;
  $('#health').textContent = state.mode === 'challenge' ? 'TROUBLESHOOTING LAB' : count ? `${count} configuration ${count === 1 ? 'issue' : 'issues'}` : 'CONFIGURATION VALID';
  icons();
}
function check() {
  const issues = validate(state);
  const failures = [], total = state.hosts.length * (state.hosts.length - 1);
  for (let i = 0; i < state.hosts.length; i++) for (let j = 0; j < state.hosts.length; j++) if (i !== j && !ping(state, state.hosts[i].id, state.hosts[j].id).ok) failures.push([i, j]);
  $('#issue-count').textContent = `${issues.length} issues / ${total - failures.length} of ${total} paths pass`;
  $('#feedback').innerHTML = `<p class="notebook-intro">${issues.length === 0 && failures.length === 0 ? 'Network verified' : 'Investigation findings'}</p>` + (issues.length ? issues.map(issue => `<div class="issue"><i data-lucide="circle-alert"></i><span>${escape(issue)}</span></div>`).join('') : '<p>Your subnets, gateways, host addresses, and VLAN assignments are consistent.</p>') + (failures.length ? `<div class="issue"><i data-lucide="route"></i><span>${failures.length} directed endpoint paths failed. ${!state.routing ? 'Enable inter-VLAN routing on R1 for traffic between departments.' : 'Use Packet explorer to inspect a failed path.'}</span></div>` : `<div class="concept"><strong>${total - failures.length} / ${total} PATHS REACHABLE</strong><p>${total ? 'Every endpoint can reach every other endpoint in this simulation.' : 'Add at least two endpoints to test connectivity.'}</p></div>`);
  icons();
}
function refreshEndpoints() {
  for (const id of ['source', 'target']) {
    const element = $('#' + id), previous = element.value;
    element.innerHTML = state.hosts.map(h => `<option value="${h.id}">${escape(h.name)}</option>`).join('');
    if (state.hosts.some(h => h.id === previous)) element.value = previous;
    else element.selectedIndex = id === 'target' ? Math.min(2, state.hosts.length - 1) : 0;
  }
}
$('#diagram').addEventListener('click', event => { const node = event.target.closest('[data-node]'); if (node) { selected = node.dataset.node; draw(); inspect(); icons(); } });
$('#diagram').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { const node = event.target.closest('[data-node]'); if (node) { event.preventDefault(); selected = node.dataset.node; draw(); inspect(); icons(); } } });
$('#inspector').addEventListener('change', event => {
  if (event.target.id === 'device-picker') { selected = event.target.value; draw(); inspect(); icons(); return; }
  const field = event.target.dataset.field; if (!field) return;
  if (selected === 'router') state.routing = event.target.checked;
  else if (selected.startsWith('sw-')) state.departments.find(d => selected === `sw-${d.id}`).trunk = event.target.checked;
  else if (field === 'connected') state.hosts.find(h => h.id === selected).connected = event.target.checked;
  else state.hosts.find(h => h.id === selected)[field] = ['prefix', 'vlan'].includes(field) ? Number(event.target.value) : event.target.value.trim();
  upgrade(); update();
});
$('#plan-body').addEventListener('change', event => { const { dept, key } = event.target.dataset; if (dept) { state.departments.find(d => d.id === dept)[key] = key === 'vlan' ? Number(event.target.value) : event.target.value.trim(); update(); } });
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  const mode = button.dataset.mode; if (mode === state.mode) return;
  if (mode === 'challenge') { state = initialState(); hostTools.reset(); state.hosts[2].gateway = '192.168.10.1'; state.hosts[4].vlan = 10; state.departments[0].trunk = false; selected = 'router'; notify('Challenge loaded: investigate three configuration faults.'); }
  state.mode = mode; upgrade(); update();
}));
$('#check').addEventListener('click', check);
function showTraffic(result, kind = 'ping', sourceId, targetId) {
  if (sourceId) $('#source').value = sourceId;
  if (targetId) $('#target').value = targetId;
  document.querySelector('.packet-panel .section-bar .subtle').textContent = kind === 'email' ? 'Simulated application message' : 'Simulated ICMP';
  document.querySelector('#packet-controls')?.remove();
  highlighted = result.ok ? result.path : [];
  $('#trace').innerHTML = `<div class="trace-result ${result.ok ? '' : 'fail'}">${kind === 'email' ? result.ok ? 'Email delivered' : 'Email not delivered' : result.ok ? 'Echo reply received' : 'Destination unreachable'}</div>` + result.steps.map((step, index) => `<div class="trace-step ${step.status}"><i data-lucide="${step.status === 'fail' ? 'circle-x' : 'circle-check'}"></i><span>${index + 1}. ${escape(step.label)}</span></div>`).join(''); draw(); icons();
}
$('#ping').addEventListener('click', () => showTraffic(ping(state, $('#source').value, $('#target').value)));
$('#reset').addEventListener('click', () => { if (confirm('Reset the lab and replace your current configuration and simulated messages?')) { state = initialState(); hostTools.reset(); selected = 'router'; update(); notify('Starter network restored.'); } });
$('#export').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'network-workshop.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Configuration exported.'); });
$('#import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 100000) throw Error('Configuration file is too large.'); const candidate = restoreNetwork(JSON.parse(await file.text())); state = candidate; hostTools.reset(); selected = 'router'; update(); notify('Configuration imported.'); } catch (error) { notify(error.message || 'Unable to import configuration.'); }
  event.target.value = '';
});
const builder = document.createElement('div'); builder.className = 'builder-toolbar';
builder.innerHTML = '<button id="add-switch"><i data-lucide="network"></i>Add switch</button><button id="add-host"><i data-lucide="monitor"></i>Add host</button><button id="remove-device" title="Delete selected device"><i data-lucide="trash-2"></i></button><button id="arrange" title="Reset device positions"><i data-lucide="layout-grid"></i></button><span class="subtle">Single-router network</span>';
document.querySelector('.diagram-wrap').before(builder);
function nextId(prefix) { let i = 1; while (state.hosts.some(h => h.id === prefix + i) || state.departments.some(d => d.id === prefix + i)) i++; return prefix + i; }
$('#add-switch').onclick = () => {
  if (state.departments.length >= 8) return notify('This lab supports up to 8 switches.');
  let free;
  for (let offset = 0; offset < 256; offset += 16) {
    const n = subnet(`192.168.10.${offset}/28`);
    if (state.departments.every(d => { try { const other = subnet(d.cidr); return n.network > other.broadcast || n.broadcast < other.network; } catch { return false; } })) { free = n; break; }
  }
  if (!free) return notify('No free /28 remains in the office address pool. Resize the existing subnets first.');
  let vlan = 10; while (state.departments.some(d => d.vlan === vlan)) vlan += 10;
  const id = nextId('custom-');
  state.departments.push({ id, name: `Network ${vlan}`, vlan, demand: 10, cidr: free.canonical, gateway: address(free.first), trunk: true, color: '#a16b16' });
  selected = `sw-${id}`; upgrade(); update();
};
$('#add-host').onclick = () => {
  if (state.hosts.length >= 24) return notify('This lab supports up to 24 hosts.');
  const d = state.departments.find(d => selected === `sw-${d.id}` || state.hosts.find(h => h.id === selected)?.department === d.id) || state.departments[0];
  let ip = '';
  try { const n = subnet(d.cidr); for (let v = n.first; v <= Math.min(n.last, n.first + 100); v++) { const candidate = address(v); if (candidate !== d.gateway && !state.hosts.some(h => h.ip === candidate)) { ip = candidate; break; } } } catch { /* Leave invalid plans for the learner to repair. */ }
  const id = nextId('pc-'); state.hosts.push({ id, name: `HOST-${id.slice(3)}`, department: d.id, ip, prefix: Number(d.cidr.split('/')[1]) || 24, gateway: d.gateway, vlan: d.vlan, connected: true });
  selected = id; upgrade(); update();
};
$('#remove-device').onclick = () => {
  if (selected === 'router') return notify('R1 is the gateway for this single-router exercise.');
  if (selected.startsWith('sw-')) {
    const id = selected.slice(3);
    if (state.departments.length === 1) return notify('Keep at least one switch.');
    if (state.hosts.some(h => h.department === id)) return notify('Move or delete the switch endpoints before deleting it.');
    state.departments = state.departments.filter(d => d.id !== id);
  } else { state.hosts = state.hosts.filter(h => h.id !== selected); state.messages = (state.messages || []).filter(m => m.from !== selected && m.to !== selected); hostTools.forget(selected); }
  if (state.positions) delete state.positions[selected]; selected = 'router'; upgrade(); update();
};
$('#arrange').onclick = () => { upgrade(); state.positions = {}; save(); draw(); };
let dragging = null, suppressClick = false;
$('#diagram').addEventListener('pointerdown', event => {
  const node = event.target.closest('[data-node]'); if (!node || event.button !== 0) return;
  const svg = $('#diagram'), matrix = svg.getScreenCTM().inverse();
  dragging = { id: node.dataset.node, matrix, startX: event.clientX, startY: event.clientY, width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height, moved: false };
  svg.setPointerCapture(event.pointerId);
});
$('#diagram').addEventListener('pointermove', event => {
  if (!dragging) return;
  if (Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) < 5 && !dragging.moved) return;
  dragging.moved = true; const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(dragging.matrix);
  upgrade(); state.positions[dragging.id] = { x: Math.max(65, Math.min(dragging.width - 65, p.x)), y: Math.max(35, Math.min(Math.min(965, dragging.height - 75), p.y)) }; draw();
});
function endDrag() {
  if (!dragging) return;
  if (dragging.moved) { suppressClick = true; save(); setTimeout(() => suppressClick = false, 100); }
  else { selected = dragging.id; draw(); inspect(); icons(); }
  dragging = null;
}
$('#diagram').addEventListener('pointerup', endDrag);
$('#diagram').addEventListener('pointercancel', endDrag);
$('#diagram').addEventListener('click', event => { if (suppressClick) { event.stopImmediatePropagation(); event.preventDefault(); } }, true);
const stepButton = document.createElement('button'); stepButton.id = 'step-packet'; stepButton.innerHTML = '<i data-lucide="footprints"></i>Step through';
$('#ping').after(stepButton);
function showPacket() {
  document.querySelector('.packet-panel .section-bar .subtle').textContent = 'Simulated ICMP';
  const f = packet[packetIndex]; highlighted = f.path;
  $('#trace').innerHTML = `<div id="packet-controls"><div class="packet-nav"><button id="packet-back" title="Previous hop" ${packetIndex === 0 ? 'disabled' : ''}><i data-lucide="chevron-left"></i></button><strong>Step ${packetIndex + 1} / ${packet.length}</strong><button id="packet-next" title="Next hop" ${packetIndex === packet.length - 1 ? 'disabled' : ''}><i data-lucide="chevron-right"></i></button></div><p class="trace-result ${f.failed ? 'fail' : ''}">${escape(f.label)}</p>${f.failed ? '' : `<dl class="packet-fields"><dt>Source IP</dt><dd>${escape(f.sourceIP)}</dd><dt>Destination IP</dt><dd>${escape(f.destinationIP)}</dd><dt>Source MAC</dt><dd>${f.sourceMAC}</dd><dt>Destination MAC</dt><dd>${f.destinationMAC}</dd><dt>802.1Q tag</dt><dd>${f.tag}</dd><dt>TTL</dt><dd>${f.ttl}</dd></dl><p class="subtle">Illustrative locally administered MACs / ICMP echo request</p>`}</div>`;
  $('#packet-back').onclick = () => { if (packetIndex > 0) { packetIndex--; showPacket(); } };
  $('#packet-next').onclick = () => { if (packetIndex < packet.length - 1) { packetIndex++; showPacket(); } };
  draw(); icons();
}
stepButton.onclick = () => { packet = packetFrames(state, $('#source').value, $('#target').value); packetIndex = 0; showPacket(); };
for (const id of ['source', 'target']) $('#' + id).addEventListener('change', () => { invalidate(); draw(); icons(); });
mountCalculator(() => state, (id, cidr, gateway) => {
  const d = state.departments.find(d => d.id === id);
  if (!d) return notify('Recalculate to refresh the department list.');
  d.cidr = cidr; d.gateway = gateway; upgrade(); update(); notify('Subnet assigned. Configure endpoint IP settings separately.');
});

const hostTools = createHostTools({ getState: () => state, getSelected: () => selected, changed: () => { upgrade(); save(); draw(); inspect(); icons(); }, trace: showTraffic, notify });
window.addEventListener('network-practical-check', event => event.detail.reply(checkNetworkActivity(state,event.detail.index)));
mountLearning();
render();
