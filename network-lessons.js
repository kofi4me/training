import { ipv4, address, subnet } from './core.js';
import { mountReplay } from './replay.js';
import { mountBeginnerAddressing, mountOctetLesson, mountCidrLesson } from './ip-teaching.js';

function table(head, rows) {
  return '<div class="table-wrap"><table><thead><tr>'+head.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function player(host, build, draw = () => {}) {
  host.insertAdjacentHTML('beforeend','<div class="lab-controls"><button data-play>Play</button><button data-step>Next step</button><button data-reset>Reset</button></div><p class="lesson-status" role="status"></p>');
  const inputs=[...host.querySelectorAll('input:not([data-replay-independent]),select')];
  const replay=mountReplay(host,{build,onFrame:draw,nextSelector:'[data-step]',statusSelector:'.lesson-status',separator:'/'});
  inputs.forEach(node=>node.addEventListener('input',()=>replay.reset()));
  return ()=>replay.destroy();
}
export function mountAddressingLessons(content) {
  const area=document.createElement('section');area.id='ip-deep-dive';
  area.innerHTML=`<details class="ip-reference"><summary>Reference: Historical Classes and Address Types</summary>
    <p>An address is written in a notation; its prefix determines the network boundary. Assignment method, delivery type, and scope are separate classifications. A private address may be static or dynamic, and a public address is not necessarily reachable through a firewall.</p>
    <h3>Historical IPv4 classes</h3><p>Classful addressing inferred a default boundary from leading bits. Modern CIDR carries the prefix explicitly: do not infer a /24 merely because an address starts with 192. IPv6 has no A–E address classes.</p>
    ${table(['Class','Leading bits','First octet','Historical mask','Purpose'],[
      ['A','0','0–127','255.0.0.0 (/8)','Unicast; 0/8 and 127/8 have special meanings'],
      ['B','10','128–191','255.255.0.0 (/16)','Unicast'],
      ['C','110','192–223','255.255.255.0 (/24)','Unicast'],
      ['D','1110','224–239','Not applicable','Multicast; not a normal host subnet'],
      ['E','1111','240–255','Not applicable','Reserved; 255.255.255.255 is limited broadcast']
    ])}
    <p>A historical /8 contains 2^24 addresses, a /16 contains 2^16, and a /24 contains 2^8. In an ordinary IPv4 broadcast subnet, network and broadcast addresses are not assigned to endpoints. Those conventions are not universal: /31 point-to-point links and /32 routes have different semantics.</p>
    <h3>Address types: scope, delivery, and assignment</h3>
    ${table(['Classification','Definition and examples'],[
      ['Private IPv4','10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16. Reusable internal space; not public Internet routing space.'],
      ['Public and special-purpose','Public unicast space is allocated for globally unique routing. Not every non-private address is public: documentation, loopback, multicast, and other reservations exist.'],
      ['Loopback and link-local','127.0.0.0/8 and ::1 identify the local system; 169.254.0.0/16 and fe80::/10 are link-local, not ordinary routed Internet addresses.'],
      ['Unicast','Delivery to an individual interface. IPv4 and IPv6 both support unicast.'],
      ['Broadcast','IPv4 delivery to all hosts in a broadcast domain; directed broadcasts are generally restricted by routers. IPv6 has no broadcast.'],
      ['Multicast and anycast','Multicast delivers to subscribed group members. Anycast assigns the same address at multiple locations and routing selects an instance; it is not broadcast.'],
      ['Static and dynamic','Static settings are configured administratively. DHCP can lease IPv4 settings; IPv6 may use Router Advertisements and SLAAC, DHCPv6, or manual settings.']
    ])}
    </details><h3>Notation and place values</h3><p>An IPv4 octet is eight bits: 128, 64, 32, 16, 8, 4, 2, 1. Binary 11000000 means 128 + 64 = 192. A decimal octet must lie between 0 and 255. The four octets together represent 32 bits; dotted decimal is a readable notation, not four independent network identifiers.</p>
    <details class="ip-reference"><summary>Extension Reference: IPv6 Hexadecimal Notation</summary><p>IPv6 groups contain four hexadecimal digits: each hexadecimal digit represents four bits, so f = 1111 and 0x20 = 32 in decimal. Eight groups give 128 bits. Leading zeros may be omitted within a group; :: compresses one run of zero groups and may appear only once.</p></details>
    <section class="module-lab" id="binary-lab"><h3>Lab 1: Decimal and Binary Conversion</h3><p>Convert 192, 168, and 255 in both directions. Predict the eight-bit result before playing.</p>
      <div class="lab-controls"><label class="field">Direction<select id="conversion-mode"><option value="decimal">Decimal to binary</option><option value="binary">Binary to decimal</option></select></label><label class="field">Value<input id="conversion-value" value="192" maxlength="8"></label></div><div class="conversion-bits" aria-label="Weighted bit positions"></div></section>
    <h3>CIDR and subnet mathematics</h3><p>The slash number is the count of leading network bits. For IPv4 /n, host bits h = 32 − n, total addresses = 2^h, and the mask contains n ones followed by h zeros. Bitwise AND of the address and mask gives the network address. On an ordinary IPv4 broadcast LAN, setting the host bits to one gives the directed broadcast address. The default route /0, point-to-point /31, and single-address /32 are not ordinary LANs.</p>
    <p>For 172.16.35.10/20, the mask is 255.255.240.0. The changing octet has block size 256 − 240 = 16, placing 35 in the 32–47 interval. The network is 172.16.32.0, broadcast 172.16.47.255, and ordinary host range 172.16.32.1–172.16.47.254: 4,094 usable addresses. The next block begins at 172.16.48.0.</p>
    <h3>Classful subnetting versus classless allocation</h3><p>Starting from a historical /24, borrowing two host bits produces /26 subnets: 2^2 = 4 blocks, each with 2^6 = 64 addresses. A modern calculation uses the explicit /26 directly, without requiring a class. Equal-sized subdivisions are FLSM; unequal-sized allocations are VLSM. Aggregation combines aligned contiguous prefixes, such as two adjacent /25 blocks into their covering /24; arbitrary adjacent ranges cannot always be represented by one exact CIDR block.</p>
    <section class="module-lab" id="class-cidr-lab"><h3>Lab 2: Compare Classful and CIDR Calculations</h3><p>Try 192.168.10.70 with /26, then 172.16.35.10 with /20. Compare the default boundary, borrowed bits, masks, and ranges.</p>
      <div class="lab-controls"><label class="field">IPv4 address<input id="class-address" value="192.168.10.70"></label><label class="field">Explicit prefix<input id="class-prefix" type="number" min="0" max="32" value="26"></label></div><div class="calculation-work"></div></section>
    <h3>Practice and explain</h3><ol><li>Convert 10 and 224 to eight-bit binary. Identify their historical leading class bits.</li><li>Calculate 10.20.30.40/12 and explain why modern forwarding does not assume /8.</li><li>Find four /26 blocks inside 192.168.10.0/24. Explain why the final usable address is not the broadcast address.</li><li>Use the IPv6 prefix lab below to compare /48 and /64. Explain why subtracting two is not an IPv6 rule.</li></ol>
    <details class="lab-checkpoint"><summary>Check your work</summary><p>10 = 00001010; 224 = 11100000. The /12 network is 10.16.0.0, broadcast 10.31.255.255. The /26 network starts are .0, .64, .128, and .192. A prefix is an addressing boundary, not evidence of a reachable gateway.</p></details>
    <p>References: <a href="https://www.rfc-editor.org/info/rfc4632/">CIDR (RFC 4632)</a>, <a href="https://www.rfc-editor.org/info/rfc1918/">private IPv4 space (RFC 1918)</a>, <a href="https://www.iana.org/assignments/iana-ipv4-special-registry/">IANA special-purpose registry</a>.</p>`;
  content.insertBefore(area,content.querySelector('#ip-family-reference') || content.querySelector('.module-lab'));
  const pauses=[];
  pauses.push(mountBeginnerAddressing(area,player));
  const binaryHost=area.querySelector('#binary-lab');
  pauses.push(mountOctetLesson(binaryHost,player));
  const classHost=area.querySelector('#class-cidr-lab');
  pauses.push(mountCidrLesson(classHost,player));
  return ()=>pauses.forEach(pause=>pause());
}

export function mountRouting(content) {
  content.innerHTML=`<h2>How Routers Select a Path</h2>
    <p>Routing is the control-plane process of learning and selecting network paths. Forwarding is the data-plane action of sending a particular packet according to the installed table. A route identifies a destination prefix, next hop or outgoing interface, and often a source protocol and metric. Having a route does not prove that the application or return path works.</p>
    <h3>Routing methods and protocol families</h3>
    ${table(['Type','Definition','Example and trade-off'],[
      ['Connected','Installed for an operational, addressed interface.','A router knows its own LAN prefix without a separate static route.'],
      ['Static','An administrator configures the destination and next hop.','Predictable for a small network; ordinary static routes do not automatically learn a remote failure.'],
      ['Default','A /0 route used when no more-specific prefix matches.','A branch forwards unknown destinations to an upstream router. Default describes prefix coverage, not a separate learning protocol.'],
      ['Dynamic','Routers exchange reachability and recompute routes when information changes.','Requires protocol configuration and convergence time; it does not guarantee an available path.'],
      ['Distance vector','Neighbors advertise destination distances; routers select using the protocol rules.','RIP uses hop count. Loop prevention and convergence mechanisms matter.'],
      ['Link state','Routers distribute link information and calculate paths through a topology.','OSPF and IS-IS use link-state methods; their costs and areas require design.'],
      ['Path vector','Advertisements carry path attributes used in policy-driven selection.','BGP exchanges reachability between autonomous systems and within an AS. Its selected route is not simply the fewest physical hops.'],
      ['IGP and EGP','IGPs operate within an autonomous system; BGP supports inter-domain exchange.','Internal OSPF and external BGP can coexist and solve different problems.'],
      ['Policy-based and multicast','Policy routing can select a path using additional fields; multicast routing builds group delivery paths.','These are outside the destination-only unicast exercise below.'],
      ['IPv4 and IPv6','Separate address families and forwarding tables use the same longest-prefix principle.','IPv6 uses Hop Limit rather than IPv4 TTL. The exercise below forwards IPv4 examples.']
    ])}
    <h3>Longest-prefix matching</h3><p>For each packet, find installed routes whose network bits match the destination, then choose the longest prefix. A matching /24 wins over a matching /16 even if the /16 was learned through a preferred protocol. Route-source preference and protocol metrics decide which candidates for the same prefix are installed; they are not a substitute for longest-prefix forwarding. Equal-cost multipath can install multiple paths, but is not simulated here.</p>
    <p>For destination 10.10.20.50, routes 10.10.0.0/16 and 10.10.20.0/24 both match, but /24 is more specific. Destination 10.10.30.50 matches only /16, while 203.0.113.20 uses /0 in this table. A default route is a match of last resort, not proof that an upstream network can deliver a packet.</p>
    <h3>Packet handling and failures</h3><p>A router removes the incoming link-layer frame, checks and decreases TTL, performs a route lookup, resolves the outgoing next hop, and transmits a new frame. The destination IP normally stays unchanged unless translation is configured. TTL expiry prevents indefinite forwarding loops; ICMP errors may report the failure. Troubleshooting should check both directions, interfaces, next-hop reachability, route selection, and access policy.</p>
    <section class="module-lab" id="routing-lab"><h3>Lab: Inspect the Forwarding Decision</h3>
      <p>R1 has three installed routes. Both transit links are directly connected to R1. Edge A and Edge B represent next-hop routers; delivery beyond the selected edge is not modeled.</p>
      <div class="device-line">${['host','router','router','host'].map((kind,i)=>'<figure><img src="assets/devices/'+kind+'.webp" alt=""><figcaption>'+['Client','R1 lookup','Selected edge','Next-hop handoff'][i]+'</figcaption></figure>').join('<span aria-hidden="true">→</span>')}</div>
      <div class="lab-controls"><label class="field">Destination<input id="route-destination" value="10.10.20.50"></label><label class="field">Learn /24 through<select id="route-source"><option value="static">Static configuration</option><option value="dynamic">Dynamic advertisement model</option></select></label><label><input id="route-link" type="checkbox" checked> Edge B link operational</label><label class="field">Incoming TTL<input id="route-ttl" type="number" min="1" max="255" value="64"></label></div>
      <div id="route-table"></div></section>
    <h3>Convergence is not instantaneous</h3><p>The dynamic mode below compresses detection, withdrawal, and recomputation into a narrated trace. Real protocols use timers, adjacencies, topology databases, and protocol-specific calculations. It does not generate RIP, OSPF, IS-IS, or BGP messages. In static mode the configured /24 remains the most-specific route in this teaching scenario even when its next-hop link fails. Real devices may remove recursive static routes when next-hop resolution fails.</p>
    <h3>Practical investigation</h3><ol><li>Trace 10.10.20.50, 10.10.30.50, and 203.0.113.20. Record every matching prefix and the chosen next hop.</li><li>Set TTL to 1. Explain why a valid route cannot make this packet forward.</li><li>Restore TTL 64, set destination 10.10.20.50, and disable Edge B. Compare static failure with dynamic withdrawal and /16 fallback.</li><li>Explain why a next-hop handoff does not prove end-to-end connectivity or successful return traffic.</li></ol>
    <details class="lab-checkpoint"><summary>Compare your conclusions</summary><p>The /24 selects Edge B, the /16 selects Edge A, and /0 selects the upstream. TTL 1 expires at R1. In the simplified dynamic scenario the unavailable /24 is withdrawn, leaving /16 via A. This demonstrates fallback after convergence, not an actual OSPF or BGP implementation.</p></details>
    <p>Reference: <a href="https://www.rfc-editor.org/info/rfc1812/">IPv4 router requirements and longest-prefix matching (RFC 1812)</a>.</p>`;
  const lab=content.querySelector('#routing-lab');
  let rows=[], chosen=-1, selectionStep=0;
  const stopForwarding=player(lab,()=>{
    const destination=ipv4(lab.querySelector('#route-destination').value.trim());
    const ttl=Number(lab.querySelector('#route-ttl').value);if(!Number.isInteger(ttl)||ttl<1||ttl>255)throw Error('TTL must be an integer between 1 and 255.');
    const up=lab.querySelector('#route-link').checked, dynamic=lab.querySelector('#route-source').value==='dynamic';
    rows=[['0.0.0.0/0','Upstream','Default'],['10.10.0.0/16','Edge A','Static'],['10.10.20.0/24','Edge B',dynamic?'Dynamic':'Static']];
    const active=rows.map((r,i)=>({i,s:subnet(r[0])})).filter(r=>!(r.i===2&&dynamic&&!up));
    const matches=active.filter(r=>destination>=r.s.network&&destination<=r.s.broadcast).sort((a,b)=>b.s.prefix-a.s.prefix);
    chosen=matches[0].i;
    const steps=['R1 receives the packet and removes its incoming Ethernet header.'];
    if(ttl===1){chosen=-1;return [...steps,'TTL would reach zero: discard the packet. No forwarding occurs.'];}
    if(dynamic&&!up)steps.push('Detect unavailable Edge B in this compressed failure model.','Withdraw the dynamic /24 and recompute the installed table.');
    steps.push('Matching installed prefixes: '+matches.map(r=>rows[r.i][0]).join(', ')+'.');
    selectionStep=steps.length;
    steps.push('Choose '+rows[chosen][0]+' by longest-prefix match, via '+rows[chosen][1]+'.');
    if(chosen===2&&!up)return [...steps,'Static route still points to unavailable Edge B: handoff fails.'];
    return [...steps,'Decrease TTL to '+(ttl-1)+' and resolve the selected directly connected next hop.','Send a new Ethernet frame toward '+rows[chosen][1]+'. Next-hop handoff succeeds; remote delivery is not tested.'];
  },index=>{
    lab.querySelector('#route-table').innerHTML=table(['Destination prefix','Next hop','Source','Status'],rows.map((r,i)=>[...r,index>=selectionStep&&i===chosen?'Selected':i===2&&!lab.querySelector('#route-link').checked&&lab.querySelector('#route-source').value==='dynamic'?'Withdrawn':'Installed']));
    lab.querySelectorAll('figure').forEach((node,i)=>node.classList.toggle('active',index>=0&&i===Math.min(index,3)));
  });
  const exchange=document.createElement('section');exchange.className='module-lab';exchange.id='protocol-lab';
  exchange.innerHTML=`<h3>Lab 2: How Route Information Is Learned</h3>
    <p>Work through a fixed three-router example. R1–R2 and R2–R3 each cost 1; the direct R1–R3 link costs 5. These narrated exchanges explain the methods; they do not implement real protocol messages or timers.</p>
    <div class="lab-controls"><label class="field">Method<select id="routing-family"><option value="vector">Distance vector</option><option value="state">Link state</option><option value="path">Path vector</option></select></label><label><input id="protocol-failure" type="checkbox"> R2–R3 link fails</label></div>
    <div class="device-line">${['R1 / AS 65001','R2 / AS 65002','R3 / AS 65003'].map(name=>'<figure><img src="assets/devices/router.webp" alt=""><figcaption>'+name+'</figcaption></figure>').join('<span aria-hidden="true">↔</span>')}</div>
    <p>AS labels apply only to the path-vector example. The distance-vector and link-state examples use routers in one routing domain. Costs are illustrative and are not BGP path-selection attributes.</p>`;
  content.querySelector('.lab-checkpoint').before(exchange);
  const stopExchange=player(exchange,()=>{
    const family=exchange.querySelector('#routing-family').value, failed=exchange.querySelector('#protocol-failure').checked;
    if(family==='vector')return ['R1 initially knows direct R3 at distance 5 and neighbor R2 at distance 1.',
      failed?'R2 detects that its path to R3 has failed and advertises that destination as unreachable.':'R2 advertises distance 1 to R3 to neighbor R1.',
      failed?'After the update is processed, R1 no longer has the learned cost-2 path through R2.':'R1 adds its cost 1 to R2’s advertised cost 1: candidate distance 2.',
      failed?'R1 retains its direct cost-5 route. Actual distance-vector convergence requires loop-prevention mechanisms.':'R1 chooses cost 2 via R2 rather than direct cost 5. RIP specifically uses hop count; these arbitrary costs illustrate the family.'];
    if(family==='state')return ['Routers establish adjacencies and describe their local links.',
      failed?'The failed R2–R3 link is reflected in a new link-state advertisement.':'Link-state advertisements distribute the three-link topology within the routing domain.',
      failed?'R1 updates its topology database; the two-hop path is no longer available.':'R1 compares path costs: R1–R2–R3 = 1 + 1 = 2, direct R1–R3 = 5.',
      failed?'A new shortest-path calculation selects direct R1–R3 at cost 5.':'The shortest-path calculation installs the cost-2 route through R2.'];
    return ['AS 65003 originates a destination prefix. AS 65002 advertises that reachability with AS path 65002 65003.',
      'AS 65001 checks policy and rejects any candidate path containing its own AS number, preventing an AS-path loop.',
      failed?'The path through AS 65002 is withdrawn after loss of reachability.':'AS 65001 can compare a direct path 65003 with path 65002 65003. Policy may prefer the longer AS path.',
      failed?'The direct AS 65003 path can remain eligible if policy permits. Its eligibility is not determined by the illustrative IGP cost 5.':'BGP selection applies policy and path attributes. Neither lowest IGP link cost nor fewest physical hops alone determines its choice.'];
  },index=>exchange.querySelectorAll('figure').forEach((node,i)=>node.classList.toggle('active',index>=0&&i===index%3)));
  return ()=>{stopForwarding();stopExchange();};
}
