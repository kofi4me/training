import { assessmentPolicy } from './course-catalog.js';

export const course = { id: 'network-fundamentals', title: 'Network Fundamentals', passMark: assessmentPolicy.passMark, questionCount: 10, issuer: 'KryptNet LLC', certificateTitle: 'KryptNet Professional Certificate', revision: 1 };
const choice = (id, topic, prompt, options, answer, explanation) => ({ id, topic, prompt, options, answer, explanation, type: 'choice' });
const numeric = (id, prompt, answer, explanation) => ({ id, topic: 'subnetting', prompt, answer, explanation, type: 'number' });
export const bank = [
  numeric('capacity26', 'How many usable addresses does a conventional /26 IPv4 LAN subnet provide?', 62, 'A /26 leaves six host bits: 2^6 - 2 = 62 usable addresses.'),
  numeric('capacity27', 'How many usable addresses does a conventional /27 IPv4 LAN subnet provide?', 30, 'Five host bits provide 32 addresses. Reserving the network and broadcast addresses leaves 30.'),
  numeric('prefix50', 'Enter the longest prefix length that accommodates 50 required usable addresses, including the gateway. Enter the number without a slash.', 26, 'A /27 provides only 30 usable addresses. A /26 provides 62 and is the smallest suitable conventional LAN block.'),
  numeric('prefix10', 'Enter the longest prefix length that accommodates 10 required usable addresses. Enter the number without a slash.', 28, 'A /28 provides 14 usable addresses; a /29 provides only six.'),
  numeric('pairs', 'With six endpoints, how many directed source-to-destination pairs exist when self-tests are excluded?', 30, 'Each of the six endpoints has five other destinations: 6 x 5 = 30.'),
  numeric('spare', 'A /26 subnet must support 50 addresses including its gateway. How many usable addresses remain unallocated?', 12, 'The subnet provides 62 usable addresses, so 62 - 50 = 12 remain.'),
  choice('broadcast', 'subnetting', 'Which address is the broadcast address of 192.168.10.64/27?', ['192.168.10.64', '192.168.10.94', '192.168.10.95', '192.168.10.127'], 2, 'The /27 spans addresses .64 through .95. The highest address, .95, is the directed broadcast address.'),
  choice('usable', 'configuration', 'Which address is a usable host address in 192.168.10.96/28?', ['192.168.10.96', '192.168.10.110', '192.168.10.111', '192.168.10.112'], 1, 'The subnet spans .96 through .111. Hosts use .97 through .110.'),
  choice('boundary', 'subnetting', 'Which /26 value is aligned to a network boundary within 192.168.10.0/24?', ['192.168.10.32/26', '192.168.10.96/26', '192.168.10.128/26', '192.168.10.160/26'], 2, 'A /26 has a block size of 64. Valid last-octet boundaries are 0, 64, 128, and 192.'),
  choice('mask', 'subnetting', 'Which subnet mask corresponds to /27?', ['255.255.255.0', '255.255.255.192', '255.255.255.224', '255.255.255.240'], 2, 'A /27 mask has 27 leading one bits. Its final octet is 11100000 in binary, or 224.'),
  choice('vlan', 'vlans', 'Which statement correctly distinguishes a VLAN from an IP subnet?', ['A VLAN automatically assigns host IP addresses.', 'A VLAN defines a Layer 2 domain; a subnet defines a Layer 3 address range.', 'A subnet number must equal the VLAN ID.', 'Changing a VLAN always changes the host default gateway.'], 1, 'VLAN membership and IP addressing are separate configuration decisions. This laboratory pairs one subnet with each department VLAN.'),
  choice('gateway', 'vlans', 'R1 routing is disabled. SAL-01 and SAL-02 have valid settings in the same VLAN and subnet. What should happen to their local ping?', ['It succeeds through their access switch.', 'It fails because every packet must use R1.', 'It succeeds only if NAT is enabled.', 'It fails because an uplink must add a VLAN tag.'], 0, 'Local communication remains on the access switch. It does not require an inter-VLAN routing operation.'),
  choice('trunk', 'vlans', 'The Sales VLAN is blocked on its uplink. Local Sales traffic passes but routed Sales traffic fails. Which configuration is directly relevant?', ['The workstation display resolution.', 'The Sales switch uplink VLAN allowance.', 'The certificate ID.', 'The network diagram position.'], 1, 'Traffic to R1 must traverse the Sales uplink with its department VLAN allowed.'),
  choice('arp', 'packets', 'When a host sends to a remote subnet, which MAC address normally appears as the next-hop destination on its first Ethernet frame?', ['The remote host MAC, regardless of location.', 'The default gateway interface MAC.', 'The host own MAC.', 'The DNS server MAC in every case.'], 1, 'The host sends the frame to its reachable next hop, normally the gateway. The IP destination remains the remote endpoint.'),
  choice('ttl', 'packets', 'An illustrated packet starts with TTL 64 and crosses R1 once. What TTL does this lab show after routing?', ['64', '65', '63', '0'], 2, 'R1 decrements TTL for the forwarded IPv4 packet, resulting in 63.'),
  choice('ipconstant', 'packets', 'Which statement describes the routed packet view in this lab, where NAT is not implemented?', ['Source and destination IPs remain constant while Ethernet headers change.', 'IP addresses are replaced at every switch.', 'VLAN tags remain on every endpoint access link.', 'The router increases TTL.'], 0, 'The router creates an outgoing Ethernet header; the original IP endpoints remain unchanged in this model.'),
  choice('cable', 'builder', 'You move a host cable from Sales to Engineering. What additional action is required?', ['No action: the cable automatically reconfigures every host setting.', 'Verify and configure its IP, prefix, gateway, and access-port VLAN for Engineering.', 'Change only the device position.', 'Disable every router interface.'], 1, 'Changing a physical attachment does not automatically align the independent address and VLAN settings.'),
  choice('method', 'investigation', 'Which investigation method provides the strongest evidence for a suspected configuration fault?', ['Change several settings until the message disappears.', 'Form a hypothesis, change one setting, and repeat the original test.', 'Assume any green indicator proves application availability.', 'Delete the network before recording the fault.'], 1, 'A controlled change followed by the same test makes the cause-and-effect interpretation more defensible.'),
  choice('reachability', 'investigation', 'What does a successful simulated ping establish?', ['The service is secure and production-ready.', 'The application is functioning correctly.', 'The modeled path and return-path settings permit endpoint reachability.', 'The network has no possible bottlenecks.'], 2, 'Reachability within this model does not establish application correctness, security policy, or real-network performance.'),
  choice('certificate', 'scope', 'What does this course certificate represent?', ['An independently verified professional qualification.', 'Completion of an unsupervised, server-graded course assessment.', 'An accredited degree.', 'A verified identity and supervised examination.'], 1, 'The server records the grade and locked learner details, but registration is self-declared and the assessment is not supervised or accredited.')
];
export function selectQuestions(random = Math.random) {
  const groups = [bank.filter(q => q.topic === 'subnetting').map(q => q.id), bank.filter(q => q.topic !== 'subnetting').map(q => q.id)];
  const shuffle = list => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };
  return shuffle([...shuffle(groups[0]).slice(0, 4), ...shuffle(groups[1]).slice(0, 6)]);
}
export function grade(ids, answers) {
  if (!Array.isArray(ids) || ids.length !== course.questionCount || new Set(ids).size !== ids.length) throw Error('Invalid assessment question set.');
  const results = ids.map(id => {
    const q = bank.find(q => q.id === id); if (!q) throw Error('Unknown assessment question.');
    const value = answers?.[id];
    const answered = q.type === 'number' ? typeof value === 'string' && /^\d+$/.test(value.trim()) : Number.isInteger(value) && value >= 0 && value < q.options.length;
    return { id, answered, correct: answered && (q.type === 'number' ? Number(value.trim()) === q.answer : value === q.answer) };
  });
  const correct = results.filter(r => r.correct).length, score = correct * 100 / ids.length;
  return { results, correct, total: ids.length, score, complete: results.every(r => r.answered), passed: results.every(r => r.answered) && score >= course.passMark };
}
export function validName(name) { return typeof name === 'string' && name.trim().length >= 2 && [...name.trim()].length <= 80 && !/[\u0000-\u001f\u007f]/.test(name); }
export function validRecord(record) {
  try { return record?.revision === course.revision && validName(record.name) && /^NW-[A-F0-9-]{36}$/.test(record.id) && typeof record.date === 'string' && Number.isFinite(Date.parse(record.date)) && grade(record.ids, record.answers).passed; } catch { return false; }
}
