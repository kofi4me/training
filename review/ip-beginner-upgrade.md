# IP Addressing: Beginner Teaching and CIDR Upgrade

## Audit and objective

The previous conversion animation correctly produced eight-bit results, but assumed learners already understood bits, octets, place values, and prefixes. Its uniformly revealed bit cells did not distinguish an included weight from an excluded one. CIDR calculations were concentrated in a short comparison trace, with limited opportunities to derive, apply, and verify a network plan.

This revision builds the sequence from one interface address to binary notation, prefix boundaries, subnet derivation, capacity planning, equal and unequal allocations, and aggregation. Existing course URLs, IPv6 extension work, routing lessons, account keys, assessment endpoints, and certificates are preserved.

## Launch-Day Content Review (2026-11-09)

- Both IPv4 prefix lessons distinguish the default route from an assignable LAN. The /0 worked example reports 4,294,967,296 addresses in the block, with LAN host capacity and directed broadcast marked not applicable. Ordinary LAN sizing cannot recommend /0.
- The IPv6 lab checks complete address syntax before calculating prefixes. It rejects empty compression, repeated compression, invalid IPv4 suffixes, and out-of-range lengths. Editing the inputs immediately resets the trace and clears stale results.
- The new wrong-prefix lab uses the existing simulated network to compare local and routed reachability. It rejects /27 as a repair even though both test pings work, and verifies /26 only when both probes and the intended address plan agree.
- The full local regression suite passed 80 tests. The IP/routing browser regression passed. The beginner browser checks include /0 in both lessons, invalid and valid IPv6 input, and wrong-prefix failure, false recovery, and verified repair.
- This is content and functional QA for guided practice. It is not a full course release approval. The practical assessment/credential gate is unchanged. Human technical, instructional, beginner, and screen-reader evidence remains outstanding. No live deployment or sign-in changes were made.

## Implemented Content and Labs

1. Definitions of interface address, octet, bit, decimal/binary notation, place value, prefix, mask, network, broadcast, host capacity, and powers of two precede their calculations.
2. A keyboard-operable bit builder calculates the sum from eight actual bit choices, with target checking and correction hints.
3. Decimal-to-binary and binary-to-decimal animations show the current weight, decision, contribution, running sum, and remainder. Zero bits remain visually distinct from included weights. Predictions receive feedback from the same arithmetic model.
4. CIDR derivation exposes all 32 labeled network/host bits, mask-octet sums, AND rows, aligned intervals, total capacity, broadcast, host range, and comparison with a historical class boundary. Worked presets cover /26, /20, /12, /24, /31, and /32.
5. Host sizing derives the smallest conventional LAN prefix from a required interface count that includes the gateway.
6. Equal-size subnetting calculates additional network bits, subnet count, child block size, aligned starts, and address spans. Large subdivisions use a bounded, explicitly incomplete display sample.
7. VLSM sorts requirements, allocates aligned blocks, reports usable capacity, and rejects exhaustion or malformed requirements.
8. Aggregation computes the smallest cover and distinguishes exact coverage from extra address space, rather than calling every covering prefix a safe exact summary.
9. Varied local practice checks mask, network, broadcast, total, and usable counts independently. Feedback supports revision without filling in correct answers. New examples clear answers and invalid states.
10. Lesson anchors no longer trigger a course remount and erase in-page calculations. Historical classification and IPv4/IPv6 reference material remain available without preceding the beginner sequence as a dense reference dump.

Primary references are linked in the course: RFC 4632, RFC 1878 (informational), RFC 3021, and the preserved IPv4/IPv6 architecture references. These are original explanations and computed demonstrations, not copied lessons.

## QA Evidence

- `test/ip-teaching.test.js`: seven test groups passed, including exhaustive conversion of 256 octets in both directions, all 33 IPv4 prefix lengths, conservation at every binary decision, sizing boundaries, bounded large subdivisions, alignment, VLSM overlap/exhaustion, aggregation gaps, and individual practice-answer errors.
- `test/ip-beginner-browser.cjs`: final end-to-end run passed. Includes keyboard bit building, conversion reasoning, backward inspection, prediction entry without rewinding, invalid-input recovery, CIDR masks/ranges, navigation continuity, sizing, division, VLSM failure, unsafe summaries, practice retry/new examples, /12 and /20 worked-example selection, /31 and /32, visible icons, reduced motion, imagery, and mobile overflow checks.
- `test/ip-routing-browser.cjs`: existing IP/routing regression passed, including the original masks/ranges, routing choices, static failure, dynamic fallback, TTL, default route, and playback.
- `ip-upgrade-tests.xml`: all 78 regression cases passed, including the original account, storage, assessment, networking/security models, and release-gate tests. The existing release gate remains closed. The full run took about 11 minutes on this host; the QA runner now permits a bounded 15-minute unit run and five-minute browser runs instead of terminating this valid run at three minutes.
- Desktop and mobile calculation screenshots were inspected. Initial visual inspection identified missing icon rendering on the fundamentals page; the existing Lucide library is now loaded and browser assertions verify the icons. A subsequent mobile review prompted per-octet AND tables so eight-bit values do not wrap into misleading fragments. The final rerun and visual inspection passed; screenshots are in `artifacts/ip-beginner-*.png`.

## Mandatory Standard Checklist

| Deliverable | Status | Evidence / Remaining Work |
| --- | --- | --- |
| Course audit | Implemented and tested | Original gaps and the bounded revision are recorded here; the programme-wide baseline remains preserved. |
| Revised content | Partially implemented | Beginner IPv4/CIDR sequence expanded; independent human technical/instructional review is outstanding. |
| Enhanced laboratory environment | Partially implemented | Configurable arithmetic/allocation models and existing topology workshop; not a shared multi-device engine for every activity. |
| Animated demonstrations | Implemented and tested | Model-driven arithmetic with existing shared replay controls; controls/current-step guidance precede the changing work. |
| Guided experiments | Partially implemented | Objectives, scenarios, interpretation, troubleshooting, and verification included; not all programme-wide A-J/device requirements are complete. |
| Mandatory independent practical | Partially implemented | Varied local calculation practice exists; it is not a protected issuer-owned configuration/repair assessment. |
| Grading and certification | Not implemented for this revision | No practical grades, completion awards, or new certificates are issued by these practice checks. Existing credentials are unchanged. |
| QA | Partially implemented | Automated model/UI, full regression, and visual checks passed; human technical, instructional, beginner, and screen-reader review remains outstanding. |
| Course release approval | Not implemented | Full mandatory release gate remains closed. |

Local practice attempts currently last for the open page; they are not synchronized to accounts or retained as assessment records. Browser-visible practice logic is inspectable and is not an examination security boundary. No real learner observations have been conducted, and no production-readiness or learning-outcome claim is made.
