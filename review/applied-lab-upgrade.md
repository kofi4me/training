# Applied Lab Upgrade

This pass adds 14 distinct guided labs across all 13 existing modules. The forwarding capstone is available from both parts of the new Switching & Routing track, giving 15 placements. Existing exercises and practice records remain available; module URLs and IDs did not change. The catalogue groups the track into one entry with two module links.

## Course Coverage

| Module | Applied experiment | Verification |
| --- | --- | --- |
| Network Fundamentals | Intermediate: isolate access, uplink and router faults | Same-switch and routed probes must pass independently. |
| Network Communication | Intermediate: inspect Ethernet and IP headers after a gateway or prefix fault | Compare the first and last MAC headers, IP destination, VLAN tags and TTL; verify the address plan. |
| IP Addressing | Intermediate: reverse masks; advanced: allocate and repair a three-LAN IPv6 site | Reject non-contiguous masks; distinguish missing Router Advertisements, no default router, duplicate addresses and overlapping allocations. |
| VLANs | Advanced: repair access and trunk carriage without weakening isolation | Restore Sales and Engineering; keep the Management negative probe blocked. |
| Switching | Advanced: joint forwarding capstone | Verify cold-table flooding, source learning, warm-table egress, VLAN isolation and a routed probe. |
| Routing | Advanced: joint capstone and aggregate discard | Verify live longer-prefix forwarding, discard of uncovered destinations and unrelated default routing. |
| DHCP | Advanced: diagnose renewal, rebinding and fresh-client options | Check the new lease deadline and verify the offered gateway instead of accepting an ACK alone. |
| DNS | Advanced: record cutover at the TTL boundary | Distinguish a stale-but-valid cache hit, fresh A answer, independent AAAA and authoritative outage. |
| Firewalls/ACLs | Advanced: policy regression after reordering | Preserve one intended TCP permit and three required denials. |
| NAT/PAT | Advanced: port pool exhaustion, expiry and reuse | Accept the new remote's return packet and deny the old remote's delayed reply. |
| Monitoring | Advanced: compare hostname and IP probes | Separate an unmeasured path from measured loss, then check the exercise budget. |
| MiTM | Advanced: defense and comparison trial | Prove correct gateway mapping, delivery without modification and content protection without the binding. |
| DDoS | Advanced: recover legitimate service through two constraints | Test ingress loss, limiter rejection, service throughput and queueing without reducing offered load. |

## Instruction and Interaction

Each applied lab supplies a scenario, technical background, guided steps, an evidence-based reflection, a source reference and model boundaries. The shared workbench replays actual simulator output, highlights the active component, and supports speed, backward inspection, restart and a per-page before/after baseline. Editing settings clears the previous result and requires a fresh trace. Controlled tests include plausible false repairs, not only successful configurations.

The IPv6 site lab models one SLAAC host and static peers in fresh deterministic trials. It separates the router lifetime from autonomous prefix advertisement, uses a fixed known-good link-local path as a control, and tests the effect of duplicate address detection and overlap. It does not implement full ICMPv6, cache/lifetime state machines, DHCPv6 or live traffic.

## Evidence and Scope

- The focused model run passed 26 tests, including all prefix masks, the IPv6 fault matrix, and original/verified/false-repair outcomes for the applied scenarios.
- The applied browser walkthrough exercised 15 lab placements, with keyboard replay, frame highlighting, baseline comparison, configuration reset, fault repair, grouped navigation and mobile layout. The full catalogue regression run is recorded separately in the QA results.
- These are guided exercises, not protected server-graded practical examinations. No learner record or certificate is changed by these results. The existing release gate and human review requirements remain in force.
