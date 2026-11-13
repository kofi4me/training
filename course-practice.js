import * as model from './course-practice-models.js';

const flag = (key, label, value) => ({ key, label, value });
const number = (key, label, value) => ({ key, label, value, numeric: true, maxLength: 4 });
const select = (key, label, value, options) => ({ key, label, value, options });
const host = label => ['host', label];
const router = label => ['router', label];
const sw = label => ['switch', label];

const forwarding = {
  id:'switch-route-lab', level:'Advanced', title:'Restore switching and routed forwarding',
  brief:'A new workstation cannot reach its local neighbor or the Engineering subnet. Repair the access assignment, then prove both Layer 2 and Layer 3 delivery without leaking Layer 2 flooding across VLANs.',
  background:'A switch learns the source MAC per VLAN. Unknown unicast is replicated only within the ingress VLAN. A reply lets the switch learn the intended receiver for later directed delivery. Off-link traffic instead uses the gateway, whose IP forwarding decision is independent of local MAC learning.',
  tasks:['Start with PC B on the wrong access VLAN. Inspect the cold table, the return frame, and the warm-table lookup.', 'Move B to VLAN 10. Verify that local delivery now works and that later egress is only B. Keep VLAN 20 out of the flood.', 'Repair the Sales trunk and enable routing as needed. Save a baseline before the repair and compare the local and routed probes.', 'Disable routing again while leaving switching healthy. Explain why the warm-table result is unchanged but Engineering fails.'],
  reflection:'Which settings govern local Ethernet delivery, trunk carriage, and IP routing? Point to one observation proving each.',
  boundary:'Cold-start MAC trials use the switch model. The same PC B access VLAN is applied to the routed topology probe. These are related checks, not a unified router ARP and switch CAM emulator.',
  reference:['RFC 1812: IPv4 forwarding requirements','https://www.rfc-editor.org/rfc/rfc1812.html#section-5.2'],
  fields:[number('accessVlan','PC B access VLAN','20'),flag('trunk','Sales uplink allows VLAN 10',false),flag('routing','Inter-VLAN routing enabled',true)],
  nodes:[host('PC A / source'),sw('Access switch'),host('Local peers'),router('R1 / routed path')],
  run:model.forwardingTrial
};

export const appliedLabs = {
  devices:[{
    id:'equipment-path-lab',level:'Intermediate',title:'Isolate an access fault from a routed fault',
    brief:'Restore two communication paths from a Sales workstation: one to a peer on the same switch, and one to Engineering through R1.',
    background:'A disconnected access link prevents the switch receiving frames at all. An uplink fault can leave access-switch forwarding intact. A working Ethernet path still does not prove IP routing is enabled.',
    tasks:['Record both outcomes with the source access cable disconnected.', 'Reconnect the source, then check whether a successful local probe also restores the remote path.', 'Restore the uplink and compare routing enabled versus disabled. Change one setting at a time and save the final evidence.'],
    reflection:'Why is a local probe more useful than a remote probe for isolating the first failed segment?',
    reference:['RFC 1812: Router forwarding','https://www.rfc-editor.org/rfc/rfc1812.html#section-5.2'],
    fields:[flag('access','Source access cable connected',false),flag('uplink','Sales VLAN allowed on uplink',false),flag('routing','R1 routes between VLANs',true)],
    nodes:[host('Sales workstation'),sw('Sales access switch'),router('R1 / Engineering')],
    run:model.devicePaths
  }],
  communications:[{
    id:'header-evidence-lab',level:'Intermediate',title:'Prove which headers change across a hop',
    brief:'Diagnose a workstation that reaches its local peer but cannot send traffic to Engineering. Inspect real output from the simulated packet model rather than assuming every header changes.',
    background:'IPv4 source and destination identify the endpoints in this no-NAT topology. Ethernet addresses identify the current link delivery. An access frame is untagged; a modeled trunk carries a VLAN ID. A router rewrites the Ethernet header and decrements the IPv4 TTL.',
    tasks:['Run the baseline with the wrong gateway. Compare the local frame path with the routed failure.', 'Correct the gateway to 192.168.10.1 and follow the routed trace. Compare the gateway MAC with the final host MAC while holding the IP destination constant.', 'Change the source prefix to /24 and explain why a correct gateway is not used if the remote destination is classified as on-link. Restore /26 and verify again.'],
    reflection:'Which fields tell you who is on the current link, and which survive the router hop?',
    boundary:'Ethernet/IPv4 ICMP echo and a modeled return-path check. No live capture, NAT, TCP transport, or cryptography.',
    reference:['RFC 826: ARP and address resolution','https://www.rfc-editor.org/rfc/rfc826.html'],
    fields:[number('prefix','Sales source prefix length','26'),{key:'gateway',label:'Sales source default gateway',value:'192.168.10.254'}],
    nodes:[host('Source'),sw('Switch / VLAN tag'),router('Router / TTL'),host('Destination')],
    run:model.headerPaths
  }],
  vlans:[{
    id:'vlan-policy-lab',level:'Advanced',title:'Repair reachability without breaking isolation',
    brief:'Sales must reach its local peer and Engineering, but the Management uplink must remain isolated. Repair both the Engineering access port and its trunk path.',
    background:'An access port classifies untagged frames into a VLAN; an uplink may allow or block that VLAN independently. A correct gateway cannot compensate for either error. Restoring a path by opening every trunk defeats the scenario policy.',
    tasks:['Predict the affected path with Engineering in VLAN 10 and its uplink blocked.', 'Set the access VLAN to 20, then verify the fault that remains. Allow Engineering on its uplink.', 'Turn on Management trunk carriage temporarily. Confirm that the negative probe fails the intended policy, then remove it and verify all three outcomes.'],
    reflection:'Why does correcting the host access VLAN not remove a trunk restriction? Why is positive reachability alone insufficient?',
    boundary:'One departmental VLAN per simulated switch with tagged router uplinks. No STP or switch-to-switch trunk negotiation.',
    reference:['RFC 4363: IEEE 802.1Q bridge VLAN management model','https://www.rfc-editor.org/rfc/rfc4363.html'],
    fields:[number('accessVlan','Engineering host access VLAN','10'),flag('engineering','Allow Engineering on its uplink',false),flag('management','Allow Management on its uplink',false)],
    nodes:[host('Sales source'),sw('Access and trunk policy'),router('Inter-VLAN probes')],
    run:model.vlanPaths
  }],
  switching:[forwarding],
  routing:[forwarding,{
    id:'route-summary-lab',level:'Advanced',title:'Protect a route summary from forwarding loops',
    brief:'The upstream sends the site aggregate 198.51.100.0/24 to the site edge. Only 198.51.100.64/26 is attached locally. Keep the active LAN reachable while dropping packets for unassigned parts of the aggregate.',
    background:'The longest matching prefix wins. If a destination matches the advertised aggregate but no active more-specific route, forwarding it back through the default can return it to the router that sent it. A matching discard route covers those holes without defeating a more-specific live route.',
    tasks:['Inspect the initial active, uncovered, and outside destination probes with no discard route.', 'Install the aggregate discard and compare the three outcomes. The live /26 must outrank the discard /24, and an unrelated destination must still use /0.', 'Enter a broader connected /24 to simulate an erroneous claim of reachability. Observe why the uncovered probe is no longer dropped, then restore the real /26.'],
    reflection:'Why is it safe to install a less-specific discard alongside a valid connected route but unsafe to fake a connected summary?',
    boundary:'A bounded installed route table with explicit tie preference for connected routes over discard. It illustrates loop risk, not BGP exchange, route redistribution, or packet-by-packet loop timing.',
    reference:['RFC 4632: Aggregation and loop avoidance','https://www.rfc-editor.org/rfc/rfc4632.html#section-5.2'],
    fields:[{key:'specific',label:'Connected network prefix',value:'198.51.100.64/26'},flag('discard','Install site aggregate discard route',false)],
    nodes:[router('Upstream'),router('Site edge'),host('Connected LAN / next hop')],
    run:model.routeSummaryTrial
  }],
  dhcp:[{
    id:'lease-failure-lab',level:'Advanced',title:'Recover a lease without trusting an ACK alone',
    brief:'A client starts with a 120-second lease from a remote server. Diagnose renewal and fresh-client failures after a relay problem; verify the supplied gateway as well as the lease.',
    background:'The existing lease remains valid until expiry if a renewal fails. In this model, T1 is 60 seconds and T2 is 105 seconds from the original lease start. When no renewal succeeds, the client rebinds before expiry. Receiving a lease is separate from receiving usable off-link configuration.',
    tasks:['Observe the baseline grant and the probes at 60 and 105 seconds with the relay disabled. Compare the first attempted renewal with the original expiry.', 'Restore the relay and compare the new expiry. Then change the gateway offered to a new client and distinguish ACK from usable network settings.', 'Disable the server independently of the relay. Repeat with both restored and an on-link gateway.'],
    reflection:'Why can an existing client remain online while a newly connected client fails, and why does a successful ACK not guarantee reachability?',
    boundary:'Fixed two-address pool and simplified relay path for both lease acquisition and later probes; a real unicast renewal may have a different path. Manual requests and fixed simulated times, not real DHCP packets.',
    reference:['RFC 2131: DHCP client behavior and lease timers','https://www.rfc-editor.org/rfc/rfc2131.html#section-4.4.5'],
    fields:[flag('relay','Remote DHCP relay path is available',false),flag('server','DHCP server responds',true),
      select('gateway','Gateway offered to fresh clients','192.168.10.1',[['192.168.10.1','192.168.10.1 (on-link)'],['192.168.20.1','192.168.20.1 (different subnet)']])],
    nodes:[host('DHCP clients'),router('Relay path'),host('Remote server'),sw('Client configuration')],
    run:model.dhcpTrial
  }],
  dns:[{
    id:'dns-cutover-lab',level:'Advanced',title:'Verify a DNS cutover at the TTL boundary',
    brief:'An authoritative A record changes from 192.0.2.10 to 192.0.2.20. Prove when the resolver can answer from cache and when it must query the authority.',
    background:'A positive cache entry remains usable for its original TTL. Reading it does not refresh the clock. A and AAAA are separate record types; one cached answer does not establish the other. An expired entry in this model is not served when the authority is down.',
    tasks:['Observe the old A answer at 59 seconds. Keep the additional wait at zero and confirm the update has not taken effect.', 'Advance one second and compare the fresh A query with the separate AAAA query.', 'Repeat with the authority offline. Explain why the earlier cached answer succeeds but the expired and uncached queries do not.'],
    reflection:'Which evidence distinguishes a cached answer, a fresh authoritative answer, and a failure to obtain one?',
    boundary:'Single recursive resolver with no serve-stale or DNSSEC validation. Reserved synthetic names and addresses; no external DNS traffic.',
    reference:['RFC 1034: DNS resolution and caching','https://www.rfc-editor.org/rfc/rfc1034.html'],
    fields:[number('wait','Additional seconds after t=59','0'),flag('authority','Authoritative server available',true)],
    nodes:[host('DNS client'),router('Recursive cache'),host('Authority')],
    run:model.dnsTrial
  }],
  firewall:[{
    id:'acl-regression-lab',level:'Advanced',title:'Prove that an ACL repair preserves denials',
    brief:'Allow internal HTTPS only. A single successful web probe is insufficient: a safe change must still block external HTTPS, internal SSH, and internal UDP on port 443.',
    background:'The stateless ingress model stops on the first matching rule. A broader rule above a narrower rule can shadow it. Protocol and destination port are separate fields, so UDP/443 does not match a TCP/443 permit.',
    tasks:['Start with the deny-all above the internal HTTPS permit and observe the shadowed rule.', 'Compare the broader alternative profile; notice that it can let one desired probe through while allowing prohibited traffic.', 'Select the HTTPS policy and restore the correct order. Verify one permit and three denials.'],
    reflection:'Why is testing only the requested application flow a weak regression test?',
    reference:['RFC 8519: Access control list model','https://www.rfc-editor.org/rfc/rfc8519.html'],
    fields:[select('profile','Rule set','web',[['web','Internal HTTPS only'],['ssh','Deny internal SSH; otherwise permit']]),flag('reverse','Reverse rule order',true)],
    nodes:[host('Test sources'),router('Ingress ACL'),host('Permitted handoff')],
    run:model.firewallTrial
  }],
  nat:[{
    id:'nat-reuse-lab',level:'Advanced',title:'Exhaust and recover a PAT port pool',
    brief:'Two outgoing sessions fill the public port pool. Recover space for a third session without letting a delayed reply from the previous remote use the reallocated mapping.',
    background:'The model identifies the outbound flow using the inside address, inside source port, and remote endpoint. The return lookup needs the public port and expected remote endpoint. The public port alone cannot identify a safe return path after reuse.',
    tasks:['Keep the wait at zero. Observe the two occupied ports and the third flow failure.', 'Try 59 seconds, then 60 seconds. Inspect the new public mapping and which entries survive.', 'Switch the reply source to the old remote. Verify that only the new matching remote reply reaches the inside flow.'],
    reflection:'Why does reusing the same public port not automatically give the old remote access to the new session?',
    boundary:'Two synthetic TCP mappings, a fixed modeled inactivity limit, and endpoint-matched return traffic. This is not a TCP state machine or production NAT timer recommendation.',
    reference:['RFC 5382: NAT behavioral requirements for TCP','https://www.rfc-editor.org/rfc/rfc5382.html'],
    fields:[number('wait','Wait before the third flow (seconds)','0'),
      select('reply','Selected reply source','203.0.113.21',[['203.0.113.21','203.0.113.21 (new remote)'],['203.0.113.20','203.0.113.20 (old remote)']])],
    nodes:[host('Inside TCP flows'),router('PAT table'),host('Remote peers')],
    run:model.natTrial
  }],
  monitoring:[{
    id:'monitoring-evidence-lab',level:'Advanced',title:'Separate name resolution from a degraded path',
    brief:'A service is reported unavailable by name. Isolate the naming failure before judging the path against a healthy baseline and the exercise service budget.',
    background:'When DNS fails before a probe, zero packets were sent and loss is unmeasured. RTT averages only successful samples, so loss and response time must be interpreted together. A higher RTT and loss suggest a changed path or endpoint behavior, not a unique cause.',
    tasks:['Compare the direct-IP and hostname runs with name resolution disabled. Record how many probes were actually sent.', 'Restore name resolution while leaving the intermittent path in place. Explain why the service remains outside the exercise budget.', 'Restore the healthy path, then compare zero loss and mean RTT against the baseline. Save the initial result as a baseline for comparison.'],
    reflection:'What extra evidence would you collect before attributing loss to congestion, endpoint throttling, or a physical link?',
    boundary:'Deterministic probe samples with a teaching-only budget of zero loss and at most 20 ms mean RTT. No network measurements or automatic real-world diagnosis.',
    reference:['RFC 7680: Packet loss metric and measurement context','https://www.rfc-editor.org/rfc/rfc7680.html'],
    fields:[flag('dns','Hostname resolves',false),select('path','Modeled path condition','intermittent',[['intermittent','Intermittent loss'],['congestion','Congestion-like symptoms'],['linkdown','Link unavailable'],['healthy','Healthy baseline path']])],
    nodes:[host('Probe source'),router('Name / path failure'),host('Reply source'),sw('Measurement summary')],
    run:model.monitoringTrial
  }],
  mitm:[{
    id:'mitm-defense-lab',level:'Advanced',title:'Verify layered defenses under a control trial',
    brief:'A same-link intermediary tries to alter the client gateway mapping and modify a synthetic order. Preserve the intended path, delivery, and confidentiality even if the mapping defense is removed in a comparison trial.',
    background:'An accepted ARP mapping can redirect frames without providing access to authenticated TLS content. TLS does not guarantee availability. A trusted mapping and authenticated encryption protect different properties.',
    tasks:['Record the original redirected plaintext result. Disable intermediary forwarding and compare disclosure with delivery.', 'Enable authenticated HTTPS without the binding. Check which properties improve and which do not.', 'Enable the binding and compare it with the deliberate control trial that removes the binding. Verify the original mapping and unchanged delivery while keeping the encrypted fallback.'],
    reflection:'Which control protects the path, which protects content, and which evidence proves that delivery actually continued?',
    boundary:'Synthetic isolated ARP and TLS visibility model, not real interception, cryptography, or switch security configuration.',
    reference:['RFC 826: ARP mapping','https://www.rfc-editor.org/rfc/rfc826.html'],
    fields:[select('protocol','Application transport','http',[['http','HTTP plaintext'],['https','Authenticated HTTPS']]),flag('binding','Enforce trusted gateway mapping',false),flag('forwarding','Intermediary forwards redirected traffic',true)],
    nodes:[host('Client'),router('Intermediary / ARP mapping'),host('Recipient')],
    run:model.mitmTrial
  }],
  ddos:[{
    id:'ddos-budget-lab',level:'Advanced',title:'Preserve legitimate demand at two bottlenecks',
    brief:'A fixed synthetic workload offers 40 legitimate and 200 attack requests per second. Protect legitimate service without removing the workload or hiding loss behind average throughput.',
    background:'The ingress link drops traffic before the admission limiter. The limiter can reject legitimate traffic if its per-source threshold is too low. The application then competes for the remaining service and buffer capacity.',
    tasks:['Run at link capacity 100 with the limiter active. Identify where legitimate requests are lost before admission.', 'Increase the link to 300 but disable limiting. Distinguish service queuing from upstream loss.', 'Enable the limiter with a ceiling of 1 to show legitimate rejection. Adjust to 5 and verify zero legitimate drops, no growing queue, and all 40 legitimate requests served each second.'],
    reflection:'Why does a downstream control fail to repair a saturated upstream link, and why can aggressive filtering still violate the service objective?',
    boundary:'Four synthetic one-second intervals and the existing bounded fluid model. No external targets, real traffic generation, or production capacity claims.',
    reference:['RFC 4732: Internet denial-of-service considerations','https://www.rfc-editor.org/rfc/rfc4732.html'],
    fields:[number('link','Upstream capacity (requests/s)','100'),flag('limiting','Enable per-source limiter',true),number('limit','Per-source ceiling (requests/s)','5')],
    nodes:[router('Upstream link'),sw('Admission limiter'),host('Application service')],
    run:model.ddosTrial
  }]
};
