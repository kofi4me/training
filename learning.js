import { mountLessons } from './lessons.js';
const topics = [
  ['.topology', 'builder', 'Network construction procedure', 'Select a device to inspect its settings. Dragging changes its position only; use the endpoint cable selector to change its switch attachment. New devices receive initial settings that must be verified against the address plan.'],
  ['.calculator', 'subnetting', 'Subnetting explanation and worked example', 'For a conventional IPv4 LAN, usable capacity is 2^(32 - prefix) - 2. Include the gateway in the requirement. Choose aligned, non-overlapping blocks; assigning a block updates the department subnet and router gateway, but does not readdress endpoints.'],
  ['.plan:not(.calculator)', 'configuration', 'Address configuration procedure', 'Enter the subnet network address with its prefix, a usable router gateway, and the department VLAN. Endpoint IP addresses must be unique and usable within that subnet. Check network evaluates both configuration consistency and directed host-pair reachability.'],
  ['.packet-panel', 'packets', 'Packet interpretation procedure', 'Begin with a prediction. Compare a local path with a path between departments. Step through displays illustrative Ethernet headers, VLAN tagging, and TTL changes; it is not a packet capture. IP addresses remain unchanged because NAT is not modeled.'],
  ['.feedback-panel', 'investigation', 'Investigation and reporting procedure', 'Record the source, destination, prediction, observation, hypothesis, and corrective action. Change one setting at a time and repeat the original test. A successful simulated ping establishes modeled reachability, not application availability or security.']
];
export function mountLearning() {
  const courses = document.createElement('nav'); courses.className = 'course-switch'; courses.setAttribute('aria-label', 'Select training course'); courses.innerHTML = '<label for="training-course">Training laboratory</label><select id="training-course"><option value="./">Network Fundamentals</option><option value="security.html?lab=mitm">MiTM / ARP Investigation</option><option value="security.html?lab=ddos">DoS / DDoS Investigation</option><option disabled>DNS Security / Coming soon</option><option disabled>Segmentation / Coming soon</option></select><a href="courses.html">View all courses</a>';
  document.querySelector('.heading').after(courses);
  courses.querySelector('select').onchange = event => { location.href = event.target.value; };
  const link = document.createElement('a'); link.className = 'guide-link'; link.href = 'guide.html';
  link.innerHTML = '<i data-lucide="book-open"></i><span>Learning guide</span>';
  document.querySelector('.file-actions').prepend(link);
  const quiz = document.createElement('a'); quiz.href = 'assessment.html'; quiz.className = 'guide-link'; quiz.title = 'Course assessment and certificate'; quiz.innerHTML = '<i data-lucide="graduation-cap"></i><span>Assessment</span>';
  link.after(quiz);
  const introduction = document.createElement('details'); introduction.className = 'learning-orientation';
  introduction.innerHTML = '<summary>Laboratory orientation and learning outcomes</summary><div class="learning-copy"><p>This laboratory develops proficiency in IPv4 subnet planning, VLAN configuration, and evidence-based network troubleshooting. Begin with the supplied network in Learn mode, then use Practice to conceal calculated ranges. Challenge replaces the current network with a fault investigation; export existing work before selecting it.</p><p><strong>Recommended sequence:</strong> calculate the address plan, verify endpoint and VLAN settings, test local communication, test routed communication, and explain the observed packet fields. Refer to the <a href="guide.html">laboratory manual</a> for worked examples, procedures, assessment criteria, and technical references.</p></div>';
  mountLessons();
  document.querySelector('.lesson-path').after(introduction);
  const foundations = document.createElement('nav'); foundations.className = 'foundation-links'; foundations.setAttribute('aria-label', 'Introductory tutorials'); foundations.innerHTML = '<span>Start with the concepts:</span><a href="guide.html#ip-basics">What is an IP address?</a><a href="guide.html#vlan-basics">What is a VLAN?</a>';
  introduction.after(foundations);
  for (const [selector, anchor, title, copy] of topics) {
    const section = document.querySelector(selector); if (!section) continue;
    const details = document.createElement('details'); details.className = 'context-tutorial';
    details.innerHTML = `<summary>${title}</summary><div class="learning-copy"><p>${copy}</p><a href="guide.html#${anchor}">Read the complete tutorial</a></div>`;
    section.querySelector('.section-bar').after(details);
  }
}
