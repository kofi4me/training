import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { assessmentPolicy, courseLabels } from './course-catalog.js';
import { linuxService, restoreChain, scheduledJob } from './systems-models.js';
import { subnet } from './core.js';
import {
  devicePaths, headerPaths, vlanPaths, forwardingTrial, routeSummaryTrial, dhcpTrial, dnsTrial,
  firewallTrial, natTrial, monitoringTrial, mitmTrial, ddosTrial,
} from './course-practice-models.js';

const vendor = {};
vm.runInNewContext(readFileSync(new URL('./vendor/ipaddr.min.js', import.meta.url), 'utf8'), vendor);
globalThis.ipaddr = vendor.ipaddr;

const question = (prompt, correct, ...distractors) => ({ prompt, options: [correct, ...distractors] });
const fault = (change, cause) => ({ change, cause });
const subnetTrial = ({ cidr }, variant) => {
  const assigned = subnet(cidr);
  const parent = subnet(variant === 0 ? '192.0.2.0/24' : '198.51.100.0/24');
  const reserved = subnet(variant === 0 ? '192.0.2.0/26' : '198.51.100.128/26');
  const hosts = variant === 0 ? 40 : 20;
  return { checks: [
    { label: 'Aligned network inside the parent block', ok: assigned.canonical === cidr && assigned.network >= parent.network && assigned.broadcast <= parent.broadcast },
    { label: 'Smallest conventional subnet with sufficient usable addresses', ok: assigned.usable >= hosts && assigned.size / 2 - 2 < hosts },
    { label: 'Reserved subnet remains isolated', ok: assigned.broadcast < reserved.network || assigned.network > reserved.broadcast },
  ] };
};

const definitions = {
  linux: {
    goal: 'Restore Portal on port 8081 now and after reboot. Keep the legacy listener on port 8080 running.',
    model: linuxService,
    settings: { port: '8081', clientPort: '8081', portOccupied: true, configReadable: true, start: true, enabled: true },
    labels: { port: 'Portal listening port', clientPort: 'Client target port', portOccupied: 'Keep the legacy listener on port 8080', configReadable: 'Portal can read its configuration', start: 'Start Portal now', enabled: 'Enable Portal at boot' },
    variants: [fault({ configReadable: false }, 'The service identity cannot read its configuration.'), fault({ port: '8080' }, 'Portal tries to bind the port held by the legacy listener.')],
    evidence: 'Portal returns its expected application response before and after reboot, and the legacy listener remains active.',
    quiz: [
      question('When will a newly added supplementary group apply to a user process?', 'After starting a session with the updated group credentials', 'As soon as the group database is written', 'After changing the directory owner'),
      question('Which directory permission lets a user look up a known filename?', 'Search (execute)', 'Read', 'Write'),
      question('What does enabling a systemd service configure?', 'Activation at boot through its target', 'A current application health check', 'Immediate activation without starting the unit'),
    ],
  },
  automation: {
    goal: 'Run a job longer than the five-minute scheduling interval. Skip the overlapping run, retain the previous good report after failure, and report the failed writer to the scheduler.',
    model: scheduledJob,
    settings: { duration: '8', lock: true, atomic: true, propagate: true },
    labels: { duration: 'Run duration in minutes (1–15)', lock: 'Hold a lock while the writer runs', atomic: 'Publish only after staging and validation', propagate: 'Return the failed writer’s exit status' },
    variants: [fault({ lock: false }, 'The next scheduled writer can start while the first still runs.'), fault({ atomic: false }, 'The failed writer exposes incomplete output in the live destination.')],
    evidence: 'The overlapping invocation skips, the previous report stays complete, and the wrapper returns a failure status.',
    quiz: [
      question('Where should a script send diagnostic messages when standard output is parsed as data?', 'Standard error', 'Standard output', 'The input stream'),
      question('What result demonstrates that a successful inventory operation is idempotent?', 'A second identical apply performs no additional write', 'The first apply exits successfully', 'The dry run lists the planned change'),
      question('What does a lock protect in a scheduled writer?', 'Mutual exclusion while a run holds the lock', 'Integrity of the report bytes', 'Delivery of the failure exit status'),
    ],
  },
  recovery: {
    goal: 'Restore the latest point in the incremental chain. Verify every required object before writing and keep the live destination untouched.',
    model: restoreChain,
    settings: { point: 'latest', cleanCopy: true, verify: true, target: 'staging' },
    labels: { point: 'Recovery point (full, first, or latest)', cleanCopy: 'Use the verified alternate copy', verify: 'Check the integrity manifest before restoring', target: 'Destination (staging or live)' },
    variants: [fault({ cleanCopy: false }, 'An earlier required increment is damaged and blocks the requested restore.'), fault({ point: 'first' }, 'The selected point is older than the requested recovery target.')],
    evidence: 'Every required object verifies, the latest point restores successfully, and only the isolated destination receives writes.',
    quiz: [
      question('What does the recovery point objective measure?', 'The tolerable data-loss window', 'Time to bring the service back', 'Number of copies kept offline'),
      question('What is needed to restore the latest point in a linear incremental chain?', 'The base backup and all increments through that point', 'The latest increment alone', 'The base and the latest increment only'),
      question('What evidence should precede a service cutover?', 'A validated restore and a successful application probe after restart', 'A successful file-copy exit code alone', 'The newest backup timestamp'),
    ],
  },
  devices: {
    goal: 'Restore both Sales workstation probes, one to a local peer and one routed to Engineering.',
    model: devicePaths,
    settings: { access: true, uplink: true, routing: true },
    labels: { access: 'Source access cable connected', uplink: 'Sales VLAN allowed on uplink', routing: 'Inter-VLAN forwarding enabled' },
    variants: [fault({ access: false }, 'The disconnected source cable prevents local and remote frames from entering the switch.'), fault({ uplink: false }, 'The Sales uplink blocks its VLAN even though the local switch path is working.')],
    evidence: 'The local and routed probes both reach their intended peers.',
    quiz: [
      question('Which device forwards Ethernet frames based on a learned MAC table?', 'Switch', 'Router performing an IP lookup', 'DNS resolver'),
      question('Where does a host send an IPv4 packet destined for another subnet?', 'Its configured default gateway on the local link', 'The remote host’s MAC address directly', 'The local DNS cache'),
      question('Which symptom is most consistent with an unplugged source access cable?', 'Local and routed traffic from the source fail', 'Only requests using a hostname fail', 'Only routed traffic fails while local delivery works'),
    ],
  },
  communications: {
    goal: 'Restore the Sales address plan and both forwarding paths. Sales uses 192.168.10.0/26 and R1 is 192.168.10.1.',
    model: headerPaths,
    settings: { prefix: '26', gateway: '192.168.10.1' },
    labels: { prefix: 'Sales prefix length', gateway: 'Default gateway IPv4 address' },
    variants: [fault({ gateway: '192.168.10.254' }, 'The host chooses a next hop that cannot serve as its local gateway.'), fault({ prefix: '24' }, 'The oversized subnet makes a remote host appear on-link.')],
    evidence: 'Both forwarding traces complete with the Sales prefix and R1 gateway aligned to the address plan.',
    quiz: [
      question('Which identifier normally changes at a router hop in this no-NAT exercise?', 'Ethernet destination MAC', 'Destination IPv4 address', 'Destination TCP port'),
      question('What happens to IPv4 TTL on a forwarding router?', 'It decreases by one', 'It is reset by ARP', 'It changes only on the return path'),
      question('Why does the source first resolve the gateway MAC?', 'The destination IP is off-link', 'The remote peer is on the same switch', 'DNS requires a remote MAC address'),
    ],
  },
  addressing: {
    goal: variant => variant === 0
      ? 'Allocate the smallest aligned conventional IPv4 subnet for 40 usable addresses in 192.0.2.0/24. Reserve 192.0.2.0/26 for another team.'
      : 'Allocate the smallest aligned conventional IPv4 subnet for 20 usable addresses in 198.51.100.0/24. Reserve 198.51.100.128/26 for another team.',
    model: subnetTrial,
    settings: { cidr: '' },
    labels: { cidr: 'New network in CIDR notation' },
    variants: [fault({ cidr: '192.0.2.64/27' }, 'The candidate subnet has too few usable host addresses.'), fault({ cidr: '198.51.100.128/27' }, 'The candidate overlaps the subnet already reserved for another team.')],
    evidence: 'The allocation is aligned, has sufficient usable addresses, and leaves the reserved range untouched.',
    quiz: [
      question('How many usable addresses does a conventional /27 IPv4 LAN have?', '30', '32', '62'),
      question('What does the prefix length count?', 'Leading network bits', 'Usable hosts', 'Reserved multicast addresses'),
      question('Which IPv6 prefix is normally used for SLAAC on an Ethernet LAN?', '/64', '/24', '/128'),
    ],
  },
  vlans: {
    goal: 'Restore Sales-to-Engineering communication using VLAN 20 while keeping the Management uplink isolated.',
    model: vlanPaths,
    settings: { accessVlan: '20', engineering: true, management: false },
    labels: { accessVlan: 'Engineering access VLAN', engineering: 'Engineering allowed on uplink', management: 'Management allowed on uplink' },
    variants: [fault({ accessVlan: '10' }, 'The Engineering access port puts untagged host traffic in the wrong VLAN.'), fault({ engineering: false }, 'The Engineering VLAN is missing from the uplink.')],
    evidence: 'Sales local and Engineering probes pass, and the Management probe remains blocked.',
    quiz: [
      question('How does an access port classify untagged host traffic?', 'It assigns the configured access VLAN', 'It infers VLAN from the TCP port', 'It always forwards to every VLAN'),
      question('What allows a tagged VLAN to cross a trunk?', 'The VLAN is permitted on that trunk', 'The client uses a DNS alias', 'The destination uses an ephemeral port'),
      question('What is required for traffic between two distinct IP subnets on separate VLANs?', 'Layer 3 forwarding with a valid path', 'A shared source MAC', 'A larger Ethernet MTU by itself'),
    ],
  },
  routing: {
    goal: 'Keep the connected 198.51.100.64/26 LAN reachable, discard holes in the advertised /24 and preserve the default path for outside destinations.',
    model: routeSummaryTrial,
    settings: { specific: '198.51.100.64/26', discard: true },
    labels: { specific: 'Connected network prefix', discard: 'Install aggregate discard route' },
    variants: [fault({ specific: '198.51.100.0/24' }, 'A connected route incorrectly claims the entire advertised aggregate.'), fault({ discard: false }, 'The site sends unassigned aggregate destinations back to the advertising upstream.')],
    evidence: 'The connected LAN wins by longest prefix, the aggregate hole is discarded, and outside traffic uses the default.',
    quiz: [
      question('Which matching prefix wins for 198.51.100.70: /24 or /26?', '/26', '/24', 'Whichever was added first'),
      question('Why install a discard route beneath an advertised summary?', 'To stop traffic for unassigned ranges looping back upstream', 'To drop the connected more-specific LAN', 'To replace DNS resolution'),
      question('What route is used when no more-specific destination entry matches?', 'The default route, if present', 'The route with the longest unrelated prefix', 'An ARP broadcast to the Internet'),
    ],
  },
  switching: {
    goal: 'Restore PC B on Sales VLAN 10, verify narrowed learned unicast, keep other VLANs outside the flood, and restore the routed probe.',
    model: forwardingTrial,
    settings: { accessVlan: '10', trunk: true, routing: true },
    labels: { accessVlan: 'PC B access VLAN', trunk: 'Sales uplink allows VLAN 10', routing: 'Inter-VLAN forwarding enabled' },
    variants: [fault({ accessVlan: '20' }, 'PC B has an access VLAN assignment that separates it from the Sales peers.'), fault({ trunk: false }, 'The local switching path is intact but Sales is missing from the routed uplink.')],
    evidence: 'Cold and warm trials reach PC B, learned forwarding narrows to PC B, and no flood leaks across VLANs.',
    quiz: [
      question('What does a switch learn from an incoming Ethernet frame?', 'Source MAC and ingress port within the VLAN', 'Only destination IP', 'The remote router’s default route'),
      question('Where is an unknown unicast ordinarily flooded?', 'Eligible ports in the ingress VLAN except the incoming port', 'All ports in all VLANs', 'Only the management VLAN'),
      question('What changes once the destination MAC is learned on a valid port?', 'The switch can send unicast to the learned egress', 'The switch rewrites the destination IP', 'The frame becomes a broadcast'),
    ],
  },
  dhcp: {
    goal: 'Restore renewal and a usable lease for a fresh client. The gateway for this subnet is 192.168.10.1.',
    model: dhcpTrial,
    settings: { relay: true, server: true, gateway: '192.168.10.1' },
    labels: { relay: 'Remote relay path available', server: 'DHCP server responds', gateway: 'Offered gateway IPv4 address' },
    variants: [fault({ relay: false }, 'The remote DHCP exchange cannot reach the server through the failed relay path.'), fault({ gateway: '192.168.20.1' }, 'The server offers a gateway that is outside the client subnet.')],
    evidence: 'The renewal extends the original expiry and a fresh client receives a lease with an on-link gateway.',
    quiz: [
      question('Which message follows a DHCP Discover in DORA?', 'Offer', 'ACK', 'Decline'),
      question('Why is a relay used with a DHCP server on another subnet?', 'It forwards client exchanges across the routed boundary', 'It expands the local IP prefix', 'It resolves DNS names for clients'),
      question('Why verify the offered gateway after receiving a lease?', 'A lease can be valid while off-link communication fails', 'An ACK always proves routed connectivity', 'DHCP contains only MAC addresses'),
    ],
  },
  dns: {
    goal: 'After an A record change, obtain the new A answer and an independent AAAA answer. The original cache was inspected at t=59 with a 60-second TTL.',
    model: dnsTrial,
    settings: { wait: '1', authority: true },
    labels: { wait: 'Seconds to advance beyond t=59', authority: 'Authoritative server available' },
    variants: [fault({ wait: '0' }, 'The resolver still has a valid cached copy of the previous A record.'), fault({ authority: false }, 'The authoritative server cannot answer fresh queries.')],
    evidence: 'The A query returns the updated address and a separate AAAA lookup succeeds.',
    quiz: [
      question('What governs how long a positive DNS response may remain cached?', 'TTL', 'TCP source port', 'ARP lifetime'),
      question('Which record type normally holds an IPv6 host address?', 'AAAA', 'A', 'MX'),
      question('What does an authoritative NXDOMAIN response indicate?', 'The queried name does not exist', 'A successful cached IPv6 answer', 'An Ethernet trunk timeout'),
    ],
  },
  firewall: {
    goal: 'Permit internal TCP/443 only. Block external TCP/443, internal TCP/22, and internal UDP/443.',
    model: firewallTrial,
    settings: { profile: 'web', reverse: false },
    labels: { profile: 'Policy profile (web or ssh)', reverse: 'Reverse rule order' },
    variants: [fault({ reverse: true }, 'An earlier deny shadows the required HTTPS permit.'), fault({ profile: 'ssh' }, 'The chosen policy permits traffic beyond the intended internal HTTPS exception.')],
    evidence: 'One internal HTTPS probe succeeds while all three disallowed probes are denied.',
    quiz: [
      question('Which rule wins in a first-match ACL?', 'The first matching rule in evaluation order', 'The last rule', 'The newest rule by timestamp'),
      question('Does a TCP/443 permit automatically permit UDP/443?', 'No, the transport protocol differs', 'Yes, the destination port is the same', 'Only if DNS is enabled'),
      question('Why run negative probes after changing an ACL?', 'To detect unintended access as well as confirming required access', 'To make the permit rule appear first', 'To update the ARP table'),
    ],
  },
  nat: {
    goal: 'Recover space for the third outbound flow after the modeled inactivity expiry. The new remote peer is 203.0.113.21. Keep delayed replies from the old peer blocked.',
    model: natTrial,
    settings: { wait: '60', reply: '203.0.113.21' },
    labels: { wait: 'Seconds before opening the third flow', reply: 'Expected source for the new reply' },
    variants: [fault({ wait: '0' }, 'The third flow finds both public mappings still occupied.'), fault({ reply: '203.0.113.20' }, 'The selected reply comes from the old remote endpoint.')],
    evidence: 'The new mapping is allocated, accepts the matching remote reply, and rejects the delayed old reply.',
    quiz: [
      question('What allows multiple inside flows to share one public IPv4 address in PAT?', 'Distinct public ports and translation mappings', 'Distinct VLAN names alone', 'A common DNS TTL'),
      question('Why check the remote tuple when reusing a public port?', 'A delayed packet from the old remote must not enter the new flow', 'The new flow cannot carry TCP', 'It restores the old DNS response'),
      question('What effect does inactivity expiry have on an existing translation?', 'It frees its mapping for reuse', 'It permanently reserves the public port', 'It rewrites every client’s private address'),
    ],
  },
  monitoring: {
    goal: 'Restore the synthetic service by hostname and directly by IP. Both paths must have zero loss and mean successful RTT at most 20 ms.',
    model: monitoringTrial,
    settings: { dns: true, path: 'healthy' },
    labels: { dns: 'Hostname resolves', path: 'Path condition (healthy, intermittent, congestion, or linkdown)' },
    variants: [fault({ dns: false }, 'Name resolution fails before the hostname probe can send packets.'), fault({ path: 'intermittent' }, 'The measured network path has intermittent loss compared with the baseline.')],
    evidence: 'The direct and named probes both meet the loss and latency budget.',
    quiz: [
      question('What should you compare when assessing an RTT increase?', 'A comparable healthy baseline', 'Only the fastest current sample', 'The client MAC address'),
      question('If a hostname fails to resolve before probing, how much packet loss was measured?', 'No packet-loss measurement was made', '100% of packets were lost', 'Zero loss proves the path is healthy'),
      question('Why test direct IP and hostname separately?', 'To distinguish naming failure from path failure', 'To avoid recording latency', 'To keep both test results identical'),
    ],
  },
  mitm: {
    goal: 'Keep the expected gateway mapping, preserve delivery, and keep application content confidential during the comparison without the binding defense.',
    model: mitmTrial,
    settings: { protocol: 'https', forwarding: true, binding: true },
    labels: { protocol: 'Application transport (http or https)', forwarding: 'Intermediary forwards diverted traffic', binding: 'Enforce trusted gateway binding' },
    variants: [fault({ binding: false }, 'A forged ARP update diverts frames from the intended next hop.'), fault({ protocol: 'http' }, 'Plaintext is exposed in the comparison when the gateway binding is removed.')],
    evidence: 'The gateway mapping remains intact, delivery succeeds, and the unbound HTTPS comparison keeps content confidential.',
    quiz: [
      question('What information does ARP resolve on an IPv4 local link?', 'An IPv4 address to a MAC address', 'A domain to an IPv4 address', 'A user to a certificate issuer'),
      question('What does authenticated HTTPS protect if an intermediary can forward frames?', 'Application content confidentiality and integrity', 'Guaranteed delivery through every intermediary', 'The switch access VLAN'),
      question('Which control targets the forged gateway mapping in this simulation?', 'A trusted gateway binding', 'Longer DNS TTL', 'Disabling HTTPS'),
    ],
  },
  ddos: {
    goal: 'Under 40 legitimate and 200 synthetic attack requests per second, preserve legitimate traffic at the upstream link, limiter and service queue.',
    model: ddosTrial,
    settings: { link: '300', limiting: true, limit: '5' },
    labels: { link: 'Upstream capacity in requests per second', limiting: 'Enable per-source limiter', limit: 'Per-source ceiling' },
    variants: [fault({ link: '100' }, 'The ingress link drops legitimate requests before the limiter can act.'), fault({ limiting: false }, 'Unfiltered distributed demand overwhelms the service capacity and queue.')],
    evidence: 'Across the probes, legitimate requests survive ingress and admission and the service completes the full legitimate workload.',
    quiz: [
      question('Why may a downstream limiter fail during upstream link saturation?', 'Legitimate traffic is lost before reaching the limiter', 'The limiter can always recover dropped packets', 'DNS makes the ingress link larger'),
      question('What risk does an overly strict per-source limit introduce?', 'Rejecting legitimate traffic', 'Forcing attacker traffic to use TLS', 'Increasing the physical link speed'),
      question('Which measurement helps distinguish backlog from healthy throughput?', 'Queue growth over successive intervals', 'Only the first packet timestamp', 'The number of VLAN names'),
    ],
  },
};

export const hasCourseAssessment = id => Object.hasOwn(definitions, id);
const evidenceDistractors = ['One probe passed, with the other controls left unchecked.', 'The setting was saved, with no fresh probe to verify its outcome.'];

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function startCourseAttempt(id, previous) {
  const lab = definitions[id];
  const variant = previous ? 1 - previous.variant : randomInt(2);
  return {
    id: randomUUID(), variant, guidedComplete: false, submitted: false,
    quizOrder: lab.quiz.map(item => shuffled(item.options)),
    causes: shuffled([...lab.variants.map(item => item.cause), 'The simulation ended before a valid fault was observed.']),
    evidence: shuffled([lab.evidence, ...evidenceDistractors]),
  };
}

function scenario(id, variant) {
  const lab = definitions[id];
  const initial = { ...lab.settings, ...lab.variants[variant].change };
  return {
    goal: typeof lab.goal === 'function' ? lab.goal(variant) : lab.goal,
    fields: Object.entries(initial).map(([key, value]) => ({ key, label: lab.labels[key], value })),
    baseline: lab.model(initial, variant).checks.map(({ label, ok }) => ({ label, ok })),
  };
}

export function courseAttemptView(id, attempt) {
  if (!attempt) return null;
  const visible = { id: attempt.id, guidedComplete: attempt.guidedComplete, submitted: attempt.submitted, result: attempt.result, guidedResult: attempt.guidedResult };
  if (attempt.submitted) return visible;
  if (!attempt.guidedComplete) return { ...visible, scenario: scenario(id, 1 - attempt.variant), guidedConfiguration: attempt.guidedConfiguration };
  return {
    ...visible, scenario: scenario(id, attempt.variant),
    questions: definitions[id].quiz.map(({ prompt }, index) => ({ prompt, options: attempt.quizOrder[index] })),
    causes: attempt.causes, evidence: attempt.evidence,
  };
}

function evaluateConfiguration(id, variant, supplied) {
  const lab = definitions[id];
  const fields = Object.keys(lab.settings);
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied) ||
      Object.keys(supplied).length !== fields.length || fields.some(key => !Object.hasOwn(supplied, key) ||
      typeof supplied[key] !== typeof lab.settings[key] ||
      (typeof supplied[key] === 'string' && (!supplied[key].trim() || supplied[key].length > 64)))) {
    throw new Error('Enter a value for each configuration field.');
  }
  const config = Object.fromEntries(fields.map(key => [key, typeof supplied[key] === 'string' ? supplied[key].trim() : supplied[key]]));
  return lab.model(config, variant).checks.map(({ label, ok }) => ({ label, ok }));
}

export function checkGuidedExercise(id, attempt, config) {
  const checks = evaluateConfiguration(id, 1 - attempt.variant, config);
  return { checks, passed: checks.every(check => check.ok) };
}

export function gradeCourseAttempt(id, attempt, input) {
  const lab = definitions[id];
  if (!attempt.guidedComplete) throw new Error('Complete the guided exercise before submitting the assessment.');
  if (!Array.isArray(input.answers) || input.answers.length !== lab.quiz.length ||
      input.answers.some((answer, index) => !attempt.quizOrder[index].includes(answer)) ||
      !attempt.causes.includes(input.cause) || !attempt.evidence.includes(input.evidence)) {
    throw new Error('Answer each knowledge question and identify the cause and verification evidence.');
  }
  const checks = evaluateConfiguration(id, attempt.variant, input.configuration);
  const knowledge = Math.round(100 * lab.quiz.filter((item, index) => item.options[0] === input.answers[index]).length / lab.quiz.length);
  const practical = Math.round(100 * checks.filter(check => check.ok).length / checks.length);
  const explanation = Number(input.cause === lab.variants[attempt.variant].cause) * 50 +
    Number(input.evidence === lab.evidence) * 50;
  const score = Math.round(knowledge * .3 + practical * .6 + explanation * .1);
  return { knowledge, practical, explanation, score, checks, passed: score >= assessmentPolicy.passMark && checks.every(check => check.ok) };
}

export const assessedCourses = Object.keys(courseLabels).filter(hasCourseAssessment);
