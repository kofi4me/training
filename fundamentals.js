import './account-nav.js';
import { subnet } from './core.js';
import { mountAddressingLessons, mountRouting } from './network-lessons.js';
import { mountSwitching } from './switching.js';
import { operationCourses, mountOperationCourse, addOperationNavigation } from './operations-courses.js';
import { mountReplay } from './replay.js';
import { cidrCalculation, ipv6PrefixCalculation } from './ip-teaching-core.js';
import { ipv6Lab, maskLab } from './ipv6-lab.js';
import { mountLabWorkbench } from './lab-workbench.js';
import { appliedLabs } from './course-practice.js';

const content = document.querySelector('#module-content');
const modules = ['devices', 'communications', 'addressing', 'vlans', 'routing', 'switching', ...Object.keys(operationCourses)];
const names = ['Network Fundamentals', 'Network Communication', 'IP Addressing', 'VLANs', 'Routing', 'Switching and MAC Address Learning', ...Object.values(operationCourses).map(c=>c.title)];
addOperationNavigation();
const figure = (kind, name) => `<figure><img src="assets/devices/${kind}.webp" alt=""><figcaption>${name}</figcaption></figure>`;
const diagram = (...devices) => `<div class="device-line" aria-label="Network path">${devices.map(([kind, name]) => figure(kind, name)).join('<span aria-hidden="true">&#8594;</span>')}</div>`;
const controls = '<div class="lab-controls"><button type="button" data-play>Play trace</button><button type="button" data-next>Next step</button><button type="button" data-reset>Reset trace</button></div><p class="module-result" role="status"></p>';
let stop = () => {};
let stopAdditional = () => {};

function trace(makeSteps, display = () => {}, inputEvent = 'change') {
  const inputs=[...content.querySelectorAll('.module-lab input,.module-lab select')];
  const replay=mountReplay(content.querySelector('.module-lab'),{build:makeSteps,onFrame:display,playLabel:'Play trace',pauseLabel:'Pause trace'});
  inputs.forEach(input=>input.addEventListener(inputEvent,()=>replay.reset()));
  stop=()=>replay.destroy();
}
function highlight(selector, index) {
  content.querySelectorAll(selector).forEach((node, i) => node.classList.toggle('active', i === index));
}
const selected = id => content.querySelector('#' + id).value;
const checked = id => content.querySelector('#' + id).checked;

function devices() {
  content.innerHTML = `<h2>Networks and Devices</h2>
    <p>A network connects devices so they can exchange data and share services. A local area network (LAN) serves a limited area, such as an office. A wide area network (WAN) links networks over a larger area. A wired Ethernet link or wireless connection provides access; it does not by itself guarantee that an application can reach its destination.</p>
    <h3>Follow the equipment</h3>
    ${diagram(['host','Workstation'],['switch','Access switch'],['router','Router'],['host','Remote server'])}
    <dl><dt><strong>Endpoint</strong></dt><dd>A workstation, phone, or server sends and receives application data through a network interface.</dd>
    <dt><strong>Switch</strong></dt><dd>Connects Ethernet devices in a LAN. It learns source MAC addresses and uses its forwarding table to send known unicast frames toward the appropriate port.</dd>
    <dt><strong>Router</strong></dt><dd>Connects IP networks. A host normally sends off-link traffic to a default gateway, which chooses a next hop using its routing table.</dd>
    <dt><strong>Wireless access point</strong></dt><dd>Connects wireless clients to a LAN, commonly by bridging Wi-Fi and Ethernet. A home device may combine an access point, switch, and router.</dd></dl>
    <section class="module-lab"><h3>Lab: Choose a Path</h3><p>Predict which device is needed for each destination. Then disconnect the workstation cable and repeat.</p>
    <div class="lab-controls"><label class="field">Destination<select id="destination"><option value="local">Local printer</option><option value="remote">Remote server</option></select></label><label><input id="cable" type="checkbox" checked> Workstation cable connected</label></div>
    ${diagram(['host','Workstation'],['switch','Access switch'],['router','Gateway'],['host','Destination'])}${controls}</section>
    <h3>Practical Checkpoint: Isolate a Fault</h3>
    <ol><li>Trace a successful delivery to the local printer. Record which devices handle the frame.</li><li>Disconnect the workstation cable. Try both destinations and identify the first failed step.</li><li>Restore the link and verify remote delivery. Explain why changing the router would not fix the disconnected cable.</li></ol>
    <details class="lab-checkpoint"><summary>Compare your diagnosis</summary><p>Both destinations fail at the workstation when the link is down. Local delivery uses the switch but not the router; remote delivery adds the gateway. Restoring the link repairs the fault before either forwarding decision is made.</p></details>
    <p>Continue with the <a href="index.html">advanced topology workshop</a> to configure endpoints and test reachability in a larger network.</p>`;
  trace(() => {
    if (!checked('cable')) return ['No link: the workstation cannot send a frame onto the network.'];
    if (selected('destination') === 'local') return ['The destination is on-link. The workstation sends a frame toward the printer MAC address.', 'The switch forwards within the LAN. No router is needed.', 'The local printer receives the frame.'];
    return ['The destination is off-link. The workstation addresses the Ethernet frame to its gateway.', 'The access switch forwards the frame to the gateway port.', 'The router removes the incoming frame and forwards the IP packet toward the remote network.', 'The remote server receives the packet over its own local link.'];
  }, index => {
    const local = selected('destination') === 'local';
    const figures = content.querySelectorAll('.module-lab figure');
    figures[2].hidden = local;
    figures[2].nextElementSibling.hidden = local;
    figures[3].querySelector('figcaption').textContent = local ? 'Local printer' : 'Remote server';
    highlight('.module-lab figure', local && index === 2 ? 3 : index);
  });
}

const layers = [
  ['Application', 'A browser prepares an HTTP request.'],
  ['Presentation', 'Data representation is agreed. Encryption and encoding illustrate presentation concerns; real protocols do not map neatly onto one layer.'],
  ['Session', 'The communicating applications manage the dialogue. This example does not add a separate session header.'],
  ['Transport', 'TCP adds source port 53000 and destination port 80. It provides reliable, ordered delivery.'],
  ['Network', 'IPv4 adds client address 192.168.10.70, server address 203.0.113.20, and TTL 64.'],
  ['Data Link', 'Ethernet encloses the IP packet in a frame addressed to the gateway MAC, not the remote server MAC.'],
  ['Physical', 'The interface transmits signals over the link.']
];
function communications() {
  content.innerHTML = `<h2>Protocols, Encapsulation, and Delivery</h2>
    <p>Communication relies on protocols: agreed rules for addressing, encoding, transmission, and interpretation. A browser uses an application protocol such as HTTP; TCP or another transport carries its data; IP addresses and routes packets; Ethernet or Wi-Fi carries them on individual links.</p>
    <h3>Local delivery and routed delivery</h3><p>A sender selects a local next hop using its routing information. IPv4 ARP or IPv6 Neighbor Discovery can resolve a next-hop address on the local link. At a router, the Layer 2 frame is replaced for the next link; absent translation, the source and destination IP addresses stay the same. IPv4 TTL or IPv6 Hop Limit decreases at each forwarding router.</p>
    <h3>OSI reference model</h3><p>The seven layers separate responsibilities for learning and troubleshooting. Real Internet protocols often combine functions across layers. Encapsulation adds protocol information as data moves down the stack; the receiver interprets and removes it on the way up.</p>
    <ol reversed start="7">${layers.map(([name, text]) => `<li><strong>${name}.</strong> ${text}</li>`).join('')}</ol>
    <section class="module-lab"><h3>Lab: Encapsulate and Deliver a Request</h3><p>Compare the sender and receiver. At which steps are IP addresses and Ethernet addresses used?</p>
    ${diagram(['host','Client'],['switch','LAN switch'],['router','Gateway'],['host','Web server'])}
    <div class="trace-steps">${layers.map(([name], i) => `<span>${7-i}. ${name}</span>`).join('')}</div>${controls}</section>
    <h3>Practical Checkpoint: Read the Headers</h3>
    <ol><li>Pause the trace at the sender transport layer. Identify the field used to distinguish application endpoints.</li><li>Step down to IP and Ethernet. Compare the remote server's IP address with the Ethernet destination on the first link.</li><li>Continue to the receiver. Explain why a router forwards the packet without consuming the web request.</li></ol>
    <details class="lab-checkpoint"><summary>Compare your interpretation</summary><p>TCP ports distinguish application endpoints. The IP destination is the remote server, while the first-link Ethernet destination is the local gateway. The router forwards at the network layer; the server interprets the HTTP request at the application layer.</p></details>
    <p>Reference: <a href="https://www.itu.int/rec/T-REC-X.200/en/">ITU-T X.200</a>.</p>`;
  const receive = ['The web server interprets the HTTP request.', 'The receiver interprets the agreed representation.', 'The applications continue their dialogue.', 'TCP delivers the ordered data to the receiving application.', 'IP checks the destination and delivers the payload to the upper-layer protocol.', 'The interface accepts the frame and extracts its IP packet.', 'The receiving interface converts signals into bits.'];
  const transit = ['The LAN switch forwards the frame toward the gateway using the destination MAC.',
    'The gateway removes the incoming Ethernet frame, decrements TTL to 63, and forwards the packet in a new frame on the server link. The IP addresses are unchanged in this example.'];
  trace(() => [...layers.map(([name, text]) => 'Sender / ' + name + ': ' + text), ...transit, ...receive.map((text, i) => 'Receiver / ' + layers[i][0] + ': ' + text).reverse()], index => {
    highlight('.trace-steps span', index < 7 ? index : index < 9 ? -1 : 15 - index);
    highlight('.module-lab figure', index < 0 ? -1 : index < 7 ? 0 : index < 9 ? index - 6 : 3);
  });
}

function addressing() {
  content.innerHTML = `<h2>From One Address to a Complete Network Plan</h2>
    <p>Begin with what the numbers represent, build a binary octet, then derive a subnet one decision at a time. The later exercises apply the same reasoning to prefix selection, equal and unequal subnet allocation, and CIDR route summaries.</p>
    <details id="ip-family-reference" class="ip-reference"><summary>Continue: IPv4 and IPv6 Addressing Reference</summary>
    <h3>IPv4: 32 bits</h3><p>Four decimal octets represent 32 bits. For <code>192.168.10.70/26</code>, six host bits give a block of 64 addresses. The fourth-octet blocks begin at 0, 64, 128, and 192. Address 70 falls in the 64–127 block. In this ordinary LAN subnet, .64 is the network address, .127 is the broadcast address, and .65–.126 are usable host addresses. /31 point-to-point links and /32 host routes follow different rules.</p>
    <p>Private IPv4 ranges (10/8, 172.16/12, and 192.168/16) are for internal use, not public Internet routing. A gateway address is a configured next hop; it is not automatically the first usable address.</p>
    <h3>IPv6: 128 bits</h3><p>Eight hexadecimal groups represent 128 bits. Omit leading zeros within groups and use <code>::</code> once to compress consecutive zero groups. For <code>2001:db8:1234:5::42/64</code>, the first four groups form the network prefix. IPv6 has no broadcast; multicast serves group delivery. Do not subtract two from an IPv6 block size.</p>
    <p>Global unicast addresses can be routed globally where allocated and advertised. Link-local addresses in <code>fe80::/10</code> are limited to a link; unique-local addresses in <code>fc00::/7</code> are intended for local routing. IPv6 uses Neighbor Discovery; Router Advertisements can provide prefix and default-router information. A /64 is common on LANs, particularly with SLAAC. The examples here use the documentation prefix <code>2001:db8::/32</code>.</p>
    </details><section class="module-lab"><h3>Extension Lab: Compare IPv4 and IPv6 Prefixes</h3><p>Predict the network address, then step through the bit calculation. Change the prefix and compare the resulting block. IPv6 has 128 bits and no broadcast address; the ordinary IPv4 usable-host formula does not transfer to it.</p>
    <div class="lab-controls"><label class="field">Address family<select id="family"><option value="4">IPv4</option><option value="6">IPv6</option></select></label><label class="field">Address/prefix<input id="cidr" value="192.168.10.70/26"></label></div>
    <div class="prefix-bits" aria-label="Address bits"></div>${controls}</section>
    <h3>Practice: Allocate Unequal Subnets</h3>
    <p>Divide <code>192.168.10.0/24</code> among groups needing 50, 25, and 10 usable addresses, including gateways. Allocate the largest block first and align each block to its size. Use the calculator above to check that each block has enough addresses and that its range ends before the next block begins.</p>
    <details><summary>Compare with one valid allocation</summary><p><code>192.168.10.0/26</code> gives 62 usable addresses; <code>192.168.10.64/27</code> gives 30; <code>192.168.10.96/28</code> gives 14. Other aligned, non-overlapping placements can also be correct.</p></details>
    <h3>Practical Checkpoint: Compare IPv6 Networks</h3>
    <p>Calculate the prefixes of <code>2001:db8:1234:5::42/64</code> and <code>2001:db8:1234:6::42/64</code>. Predict the result before each trace. Repeat at /48 and explain why the answer changes.</p>
    <details class="lab-checkpoint"><summary>Compare your calculation</summary><p>The addresses differ in the fourth hexadecimal group, so they have different /64 prefixes. Both share <code>2001:db8:1234::/48</code>, which includes only the first three groups.</p></details>
    <p>References: <a href="https://www.rfc-editor.org/info/rfc4632/">IPv4 CIDR</a>, <a href="https://www.rfc-editor.org/info/rfc4291/">IPv6 addressing architecture</a>, <a href="https://www.rfc-editor.org/info/rfc8200/">IPv6 specification</a>.</p>`;
  let bits = '', prefix = 0;
  content.querySelector('#family').addEventListener('input', () => {
    content.querySelector('#cidr').value = selected('family') === '4' ? '192.168.10.70/26' : '2001:db8:1234:5::42/64';
  });
  trace(() => {
    bits = '';
    const cidr = selected('cidr').trim();
    if (selected('family') === '4') {
      const s = subnet(cidr);
      const calculation = cidrCalculation(cidr.split('/')[0], s.prefix);
      prefix = s.prefix; bits = calculation.addressBits.replaceAll('.', '');
      return ['Expand the four octets into 32 bits.', `Keep ${prefix} network bits. The remaining ${32-prefix} bits give a block of ${s.size} addresses.`, `Zero the host bits. Network: ${s.canonical}. Mask: ${s.mask}.`, calculation.frames.at(-1).message];
    }
    const calculation = ipv6PrefixCalculation(cidr);
    prefix = calculation.prefix; bits = calculation.bits;
    return ['Expand the hexadecimal groups into 128 bits.', `Keep ${prefix} leading bits and separate the remaining ${128-prefix} bits.`, `Zero the remaining bits. Network prefix: ${calculation.canonical}.`, `The prefix contains 2^${128-prefix} addresses. IPv6 has no broadcast address; the block size is not a usable-host count.`];
  }, index => {
    content.querySelector('.prefix-bits').replaceChildren(...(index < 0 ? [] : [...bits].map((bit, i) => {
      const cell = document.createElement('span');
      cell.textContent = index >= 2 && i >= prefix ? '0' : bit;
      if (index >= 1) cell.className = i < prefix ? 'network-bit' : 'host-bit';
      return cell;
    })));
  }, 'input');
}

function vlans() {
  content.innerHTML = `<h2>Segmentation, Trunks, and Routing</h2>
    <p>A virtual LAN separates a switched network into Layer 2 broadcast domains. VLAN membership is a switching decision; an IP subnet is a Layer 3 addressing decision. A common design uses one subnet per VLAN and a gateway interface for each routed VLAN.</p>
    <h3>Access ports and 802.1Q trunks</h3><p>An access port normally carries one VLAN's untagged traffic. The switch associates an incoming untagged frame with that port's configured VLAN. A trunk carries multiple VLANs between network devices; IEEE 802.1Q tags identify the VLAN for tagged frames. Both ends must agree on which VLANs are allowed. If a native VLAN carries untagged traffic, configure it consistently on both ends.</p>
    <h3>Routing and isolation</h3><p>Same-VLAN devices can exchange frames through switches. Different VLANs require Layer 3 forwarding for IP communication, often using router subinterfaces or switched virtual interfaces. A router changes the Layer 2 encapsulation as it forwards into the destination VLAN. Use firewall or ACL rules where policy must restrict routed traffic; VLAN membership alone does not enforce those rules.</p>
    <h3>Plan VLANs by purpose</h3><p>Data, voice, guest, and management VLANs describe intended traffic, not different tagging formats. For example, keep management interfaces in a restricted subnet, and apply routing policy to control which administrators can reach them. Keep an inventory of VLAN IDs, subnets, gateways, access ports, and permitted trunk paths.</p>
    <h3>Diagnose in order</h3><ol><li>Check physical links and endpoint VLAN assignments.</li><li>Check that the VLAN exists at both switches and is allowed on the trunk. Check whether spanning tree is blocking an expected forwarding path.</li><li>For cross-VLAN traffic, verify subnet masks, gateway addresses, routing, and policy.</li></ol>
    <section class="module-lab"><h3>Lab: Trace VLAN Forwarding</h3><p>PC A starts in VLAN 10. PC B is connected to Switch B, which also provides the gateway. Assume both hosts have correct addresses for their selected VLAN. First try same-VLAN delivery, then remove VLAN 10 from the trunk, then restore it and test routing to VLAN 20.</p>
    <div class="lab-controls"><label class="field">PC B access VLAN<select id="vlan-target"><option value="10">10</option><option value="20">20</option></select></label><label><input type="checkbox" id="trunk" checked> Allow VLAN 10 on trunk</label><label><input type="checkbox" id="routing"> Enable inter-VLAN routing</label></div>
    ${diagram(['host','PC A'],['switch','Switch A'],['switch','Switch B / Gateway'],['host','PC B'])}${controls}</section>
    <h3>Practical Checkpoint: Repair Without Removing Isolation</h3>
    <ol><li>Set PC B to VLAN 20, remove VLAN 10 from the trunk, and enable routing. Run the trace and identify the first failure.</li><li>Restore VLAN 10 on the trunk but disable routing. Identify how the failure moves.</li><li>Enable routing without changing PC B's access VLAN. Verify delivery and distinguish the trunk tag from the access-port frame.</li></ol>
    <details class="lab-checkpoint"><summary>Compare your repair</summary><p>First the frame stops at Switch A. After restoring the trunk, it reaches Switch B but cannot cross into VLAN 20 without routing. With both settings repaired, the gateway routes the packet and PC B receives an untagged frame on its access port.</p></details>
    <p>Reference: <a href="https://www.cisco.com/en/US/docs/switches/datacenter/sw/5_x/nx-os/interfaces/configuration/guide/if_cli/if_access_trunk.html">Cisco access and trunk interfaces</a>. Continue with the <a href="index.html">advanced topology workshop</a> to configure subnet and VLAN settings together.</p>`;
  trace(() => {
    const same = selected('vlan-target') === '10';
    const steps = ['PC A sends an untagged Ethernet frame. Switch A classifies it into VLAN 10.'];
    if (!checked('trunk')) return [...steps, 'Blocked at Switch A: VLAN 10 is not allowed on the trunk.'];
    steps.push('Switch A sends the frame across the trunk with VLAN tag 10.');
    if (!same && !checked('routing')) return [...steps, 'Blocked at Switch B: VLAN 10 cannot reach the VLAN 20 access port without routing.'];
    steps.push(same ? 'Switch B forwards within VLAN 10 and sends an untagged frame out the access port.' : 'The gateway routes the packet into VLAN 20. Switch B sends the new Ethernet frame untagged on the destination access port.');
    return [...steps, 'Delivered to PC B.'];
  }, index => highlight('.device-line figure', index));
}

const renderers = [devices, communications, addressing, vlans, () => { stopAdditional = mountRouting(content); }, () => { stopAdditional = mountSwitching(content); }, ...Object.keys(operationCourses).map(id=>()=>{stopAdditional=mountOperationCourse(content,id);})];
function openCourse() {
  stop();
  stopAdditional();
  stop = () => {};
  stopAdditional = () => {};
  const requested = new URLSearchParams(location.search).get('course') || location.hash.slice(1);
  const index = Math.max(0, modules.indexOf(requested));
  document.title = `${names[index]} | KryptNet`;
  document.querySelector('#training-title').textContent = names[index];
  document.querySelectorAll('.training-nav [data-course]').forEach(link => {
    if (link.dataset.course === modules[index]) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  renderers[index]();
  const course = modules[index];
  if (course === 'addressing') stopAdditional = mountAddressingLessons(content);
  const labs = course === 'addressing' ? [maskLab, ipv6Lab] : appliedLabs[course];
  const courseCleanup = stopAdditional;
  const labCleanup = labs.map(lab => mountLabWorkbench(content, lab));
  stopAdditional = () => { courseCleanup(); labCleanup.forEach(stopLab => stopLab()); };
  const shortcuts = document.createElement('nav'); shortcuts.className = 'course-lab-nav'; shortcuts.setAttribute('aria-label', 'Applied labs');
  for (const lab of labs) {
    const link = document.createElement('a'); link.href = '?course=' + course + '#' + lab.id; link.textContent = lab.title;
    shortcuts.append(link);
  }
  content.prepend(shortcuts);
  if (course === 'switching' || course === 'routing') {
    const track = document.createElement('p'); track.className = 'forwarding-track';
    track.innerHTML = course === 'switching'
      ? '<strong>Switching &amp; Routing track / Part 1</strong> <a href="?course=routing">Continue to Part 2: Routing</a>'
      : '<strong>Switching &amp; Routing track / Part 2</strong> <a href="?course=switching">Review Part 1: Switching</a>';
    shortcuts.before(track);
  }
}
window.addEventListener('hashchange', () => {
  if (!new URLSearchParams(location.search).has('course') && modules.includes(location.hash.slice(1))) {
    openCourse(); window.scrollTo(0, 0);
  }
});
openCourse();
