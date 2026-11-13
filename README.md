# Network Workshop

A static, interactive IPv4 subnetting and VLAN learning lab. The lab is separate from the existing pentesting application.

## Run

From this directory, run `npm start`, then open http://127.0.0.1:4317. No build is required. Run the network-model tests with `npm test`.

For a fresh checkout, install the locked server dependencies with `npm ci --ignore-scripts` first. The optional PostgreSQL backend, protected-record migration, and website integration boundaries are documented in [POSTGRESQL.md](POSTGRESQL.md). File storage remains the default; no live database is configured by this implementation.

## Exercise

Allocate 192.168.10.0/24 to Sales (50 addresses), Engineering (25), and Management (10). Requirements include gateways. The initial working network is a guided example. Students can replace the subnets, VLAN IDs, gateway interfaces, and endpoint configurations.

Select a workstation in the diagram to edit its address, prefix, gateway, and access-port VLAN. Select a switch to allow/block its department VLAN on the router uplink. Select R1 to enable/disable inter-VLAN routing. Editing an address plan does not automatically reconfigure hosts.

Learn mode displays usable ranges and broadcasts. Practice hides these calculations. Challenge loads three deliberate faults: Sales VLAN missing from its uplink, ENG-01 using the wrong gateway, and MAN-01 in the wrong access VLAN. Entering Challenge replaces the current network; export first to retain it. Check network validates the plan and all 30 directed endpoint pairs. The challenge is complete when the configuration has no issues and all paths pass.

Configurations are stored in browser localStorage and can be exported/imported as JSON. Version 2 adds movable devices, variable host/switch counts, and access-cable state; original version 1 files still import. Data stays in the browser. This is a learning tool, not a secure examination system: calculations and challenge answers are available in source.

## Systems Administration

The [Linux course catalog](linux-courses.html) includes Linux Server
Administration, Automation and Scripting, and Backup, Restore & Recovery.
The three courses provide nine guided browser labs with simulated repairs,
replay, and outcome checks. Each course has a separate server-graded practical
assessment and certificate under the portal's shared assessment policy.

## Interactive tools

## Learning-readiness corrections and pilot status

The reviewed forwarding and load-model defects are corrected. Path tests now use endpoint/link/router conditions rather than rejecting all traffic for unrelated address-plan findings. Check network still reports whole-plan consistency issues separately. The shared-buffer model numerically integrates uniform arrivals and concurrent proportional service in 10 ms intervals; only waiting work counts against the 200-request buffer. Regression tests cover spare capacity, conservation, overload, draining, and local-path isolation.

Security presets start independent empty-queue trials by default. Explicitly enable Keep queued work between presets for recovery experiments. Start fresh baseline resets settings, evidence timeline, and the lesson selection without removing saved comparisons or notes. Network lessons offer a confirmed office-baseline reset and activity-specific model checks. Conceptual explanations and the final server quiz are not falsely marked as automatically verified by these local checks.

Investigation checks now compare learner-selected facts against an immutable incident-probe snapshot. A correct diagnosis label alone is insufficient, and contradictory facts are rejected. Progressive hints guide the investigation. Recovery requires a different probe with protected delivery (MiTM) or restored legitimate service (DoS/DDoS). Written notes are retained for human review and are not semantically auto-graded. Practice results are local study records, not certificate grades. Version-1 saved comparison baselines are excluded from version-2 observations to avoid comparing incompatible model outputs; notes and study markers remain available.

The facilitator workflow is `pilot.html`; the protocol and release criteria are in `BEGINNER-PILOT.md`. No real beginner sessions have been observed by the coding agent. The page records consent acknowledgement, pseudonymous participant/task codes, observed outcomes, elapsed time, and optional notes locally, with JSON export. Automated test fixtures are not human pilot evidence. A public production-readiness claim requires actual pilot observations and a separate deployment/security/privacy review. Security-course quizzes/certificates and full account-based learner identity are not implemented by these corrections.

### Existing laboratory tools

## Security training courses

Open `courses.html` or use the Training laboratory selector in the network lab. `security.html?lab=mitm` provides a synthetic gateway-ARP mapping investigation, HTTP versus authenticated-HTTPS visibility, intermediary forwarding, content modification, and a simplified pinned-binding defense. `security.html?lab=ddos` provides a bounded fluid workload model with 20 legitimate clients, configurable attack-source count and rate, link capacity, application capacity, a 200-request buffer, and a per-source admission limiter. It displays legitimate processed/lost volumes, queued work, a timeline, and per-step evidence. Neither lab generates network traffic or provides real interception or attack tooling. Reports export browser-local synthetic evidence as JSON. Each lab's settings persist independently; DDoS time-series evidence is not persisted across reloads.

Both labs include guided experiments, interpretation boundaries, and primary references. They model synthetic traffic for instruction. Each security course has its own server-graded assessment and completion certificate. Include `courses.html`, the three category pages, `training-home.js`, and the lab pages and scripts with static assets if publishing practice separately. Assessments require the backend.

Security experiments now include scenario presets and motion controls. MiTM offers a frame replay with pause/play, hop stepping, replay speed, and clickable device roles. DoS/DDoS includes an admission-flow scene with upstream link, rate limiter, queue occupancy, and application capacity; moving particles illustrate traffic categories rather than literal request counts. The numerical model, not particle positions, determines outcomes. Reduced-motion preferences disable automatic movement; manual hop stepping remains available. Per-step exports retain workload settings to support comparisons across presets. Include `security-motion.js` in static deployments.

Each security course now has five guided lessons, three instructional incidents, and a baseline notebook. Incidents initially conceal configuration controls but expose diagrams and probe results. Learners must run a probe and write supporting evidence before receiving diagnosis feedback; controls can also be explicitly revealed for exploration. Repair and recovery must be tested with another probe. This is instructional feedback, not a secure exam or certificate assessment: incident definitions are inspectable in source. Loading an incident replaces current settings and timeline, while preserving its course's saved baseline. Switching to guided mode restores visible controls without resetting the experiment.

The baseline comparison stores actual probe results separately for MiTM and DoS/DDoS. Availability comparisons use latest-step measurements rather than cumulative run totals; buffered work can affect later steps. MiTM comparisons become stale when settings change and require a fresh message probe. Baselines, notes, and self-reported lesson markers persist locally and appear in exported reports. Active challenge state is page-local and does not resume across reloads. Include `security-class.js` in static deployments.

### Network laboratory tools

The guided class has eight stages: network concepts, subnet planning, endpoint configuration, local communication, routed packet interpretation, messaging, troubleshooting, and assessment. Each stage provides an objective, explanation, procedure, expected observation, interpretation, and reflection question. A tool-navigation button links the lesson to the relevant working panel. The guide follows the same sequence; network construction is an optional extension. Lesson selection and completion markers are saved separately from network settings and are self-reported study aids, not certificate eligibility checks. Navigation does not reset the learner's network.

Each PC now has Ping, Email, Inbox, and Sent views in its inspector. Select a destination PC, compose up to 1000 characters (optional subject up to 80 characters), and send. Successful delivery creates a local inbox entry and unread badge on the destination. Select that PC, open Inbox, and select the message to read or reply. The shared lab retains up to 20 messages, saved/exported with the network. Deleting a message removes it from both simulated mailboxes; deleting a host removes its associated messages. Reset, Challenge, or importing another network replaces the current messages.

This is a peer-to-peer application-message teaching simulation, not real email delivery. It uses the simulator's bidirectional reachability check and visualizes the delivery path. SMTP, mail servers, DNS, TLS, and authentication are not implemented; real email availability cannot be inferred from successful ICMP alone. No messages are sent to external addresses or to the assessment registration email. Include `host-tools.js` and `messages.js` in a static deployment.

The Learning guide (`guide.html`) provides learning outcomes, conceptual explanations, a worked subnetting example, six laboratory procedures, reflection questions, a suggested assessment rubric, simulation limitations, and primary protocol references. Expand the orientation or contextual tutorial beneath a tool heading for concise instructions. Include `guide.html` and `learning.js` in any static deployment.

- Subnet workbench: enter a parent network, child prefix, and required address count. Select an address block to see its mask, host range, broadcast, spare capacity, and binary network/host boundary. Assign a block and its first usable gateway to a department; endpoint settings remain independent. Equal-size splits can be repeated at different prefixes for VLSM planning. Splits are limited to 256 child blocks and /30 for conventional LANs.
- Packet step-through: inspect the simulated echo request hop by hop using Previous/Next. IP addresses stay fixed, the router rewrites Ethernet headers, tagged uplinks carry VLAN IDs, and routing reduces TTL. MACs are deterministic illustrative addresses, not real hardware identities. Failed configurations show their diagnostic instead of a successful walk. Return-path reachability is checked but reply frames are not stepped through.
- Network builder: add up to 8 access switches and 24 hosts, drag devices, and reset their layout. New switches receive a free /28 from the office pool. New hosts use an available address when possible. Select a host's cable destination and connection checkbox to rewire/disconnect it. Moving a cable does not silently change IP or VLAN configuration. Delete hosts before deleting their switch, or move them to another switch. R1 is retained as the single router. Network checks evaluate the actual number of directed host pairs.

## Simulation scope

This is a deterministic Ethernet/IPv4 teaching model, not real packet or device emulation. It models a single router-on-a-stick with access switches, one subnet per department/VLAN, tagged uplinks, conventional LAN host ranges, endpoint gateways, and routing. Host-to-switch cabling is editable; additional routers and switch-to-switch links are not modeled. It abstracts ARP/ICMP exchanges; it does not send traffic, measure latency, implement VLAN hopping, or model DHCP, NAT, firewalls, spanning tree, or routing protocols. /31 point-to-point and /32 host-route semantics are outside this conventional LAN exercise.

## GitHub Pages

Publish this folder as its own GitHub repository. Under repository Settings > Pages, choose deployment from the main branch root. Alternatively copy its static files into an existing Pages source directory. Required files: `index.html`, `style.css`, `app.js`, `core.js`, `calculator.js`, and `vendor/`. All asset paths are relative so repository project URLs work. Do not upload `node_modules`, screenshots, or the downloaded dependency archive. A custom server is unnecessary for GitHub Pages.

No repository has been created or published by this local implementation.

## Issuer-controlled assessment and certificate

For persistent learner accounts, administrator reporting, hardened deployment, and outstanding release checks, read [PRODUCTION.md](PRODUCTION.md). Learners may practise anonymously, but must sign in before registering for a quiz. Production mode requires configured OpenID Connect sign-in and protected external storage. The legacy anonymous session implementation described below is retained for isolated assessment-service tests; the HTTP server no longer permits anonymous quiz registration, even in local preview.

Assessments now require the Node backend. GitHub Pages alone can still serve the network lab and guide, but cannot enforce grading or issue authoritative certificates. The previous browser-only records are not accepted as issuer records. The old assessment.js and certificate.js are legacy files and are not served by the backend.

Before the quiz, a learner confirms full name and email, with optional organization and learner ID. The server locks these details to a seven-day HttpOnly, SameSite=Strict session; retakes cannot change them. Registration is self-declared: deleting a cookie permits a separate registration, and email ownership is not verified. A deployed service needs account authentication if records must be tied to a persistent real identity. Corrections require issuer assistance; no learner profile-edit endpoint exists.

Each course has its own Authorize.Net enrollment. The $25 USD fee includes the first assessment and one retake. Each further attempt costs $20 USD and is available 28 days after the last unsuccessful submission. Learners verify a guided repair first, then submit knowledge answers, a simulated repair, and an explanation. The server requires at least 75% overall and a pass on every practical check before it issues the course certificate. The legacy quiz also uses a 75% pass mark. See the [staging setup](deploy/KRYPTNET-STAGING.md) for payment configuration and launch checks.

The server keeps assessment answers and grading logic private. Persisted learner records and certificate PDFs belong in protected storage. The default local directory is the ignored `.assessment-data` directory. Keep it outside static hosting and back it up.

Certificate PDFs are generated by Python 3 with ReportLab. Install reportlab in the server Python environment, or set NETWORK_LAB_PYTHON to an interpreter with ReportLab available. The bundled Bitstream Vera font and its license are in assets/fonts/. The issuer is KryptNet LLC and the user-supplied logo is assets/kryptnet-logo.jpg.

A PDF contains no editable form fields, but external software can still modify its content. verify.html compares a learner-selected file against the issuer-held SHA-256 fingerprint; it also displays the completion record for its unguessable certificate ID. Public verification exposes name, course, score, completion date, and file fingerprint, never email. This is not a cryptographic PDF signature or an accredited qualification.

For deployment, run the Node server behind HTTPS and set NETWORK_LAB_HTTPS=1 for Secure cookies and HTTPS origin validation. Serve the app and API on the same origin. The current listener binds to 127.0.0.1 for local preview; production authentication, email verification, issuer administration, rate limiting, and operational privacy/retention policy remain separate deployment work. The lab is not published.

### Course development roadmap

The IP Addressing course now begins with an interactive bit builder and explicit conversion decisions, then adds worked CIDR examples, host-based prefix sizing, equal subnet division, VLSM allocation, and aggregation with extra-space warnings. Varied calculation practice provides per-quantity correction hints without issuing completion credit. The existing IPv6 extension and routing lessons remain available. See `review/ip-beginner-upgrade.md` for the scoped audit, test evidence, and remaining release requirements.

All 13 modules now include an applied lab alongside their original teaching exercises. IP Addressing adds reverse mask validation and a three-LAN IPv6 planning, SLAAC and troubleshooting scenario. Switching and Routing appear as one track in the catalogue while retaining their module URLs and progress IDs. The track has a shared forwarding repair and Routing adds aggregate discard verification. See [Applied Lab Upgrade](review/applied-lab-upgrade.md) for the course-by-course scenarios, verification scope and remaining release gates.

The user's mandatory standard is preserved in `review/development-standard.txt`. The baseline audit and prioritized implementation plan cover all 13 modules in `review/course-audit.json`; run `npm run review:report` to build the readable report. `npm run review:gate` intentionally fails until all release criteria, practical verification, and human sign-offs have evidence. No current course is approved against the complete standard.

The first infrastructure milestone shares replay speed, backward event inspection, timelines, and keyboard controls across the foundational calculation/path courses and five operations courses. The switching and security replay implementations remain separate pending migration. Operations labs additionally have validated browser-local practice checkpoints, JSON import/export, notes, and before/after evidence. Restored files are editable practice data, never assessment credit; running a new probe is still required for fresh verification. Existing account, assessment and progress storage formats are unchanged. Run `node review/run-qa.cjs PLAYWRIGHT_MODULE_PATH` against the running preview to record the automated regression checks. Human instructional, screen-reader, beginner and production deployment review remain outstanding.

Switching and MAC Address Learning, DHCP Operations, DNS Operations, Firewalls/ACLs, NAT/PAT, and Network Monitoring/Troubleshooting now have independently launchable courses. The operations courses share playback and evidence presentation, but use separate lease, cache, policy, translation, and measurement models. Timers are simulated and advance only through an explicit clock control; no external network requests are generated by the laboratories. Their tutorials describe the implemented boundaries, including stateless ACLs, bounded TCP PAT, fixed DNS records, and synthetic probe samples. These new courses do not issue graded completion certificates. The homepage's Planned courses section preserves the remaining networking, investigation, cloud, and AI-security proposals for later development. Existing courses remain available; continued technical, accessibility, and beginner review is required.

### Equipment imagery

The diagram and inspector use locally bundled, AI-generated unbranded equipment imagery in `assets/devices/`. These are generic visual representations; visible hardware ports and LEDs do not expand the simulation's capabilities. Include `assets/`, `guide.html`, and `learning.js` alongside the other required static files when publishing. Asset provenance and prompts are recorded in `assets/devices/README.md`.
