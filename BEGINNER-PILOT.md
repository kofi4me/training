# Beginner pilot protocol and release gate

Status: instrumentation prepared; no actual beginner sessions have been observed by the coding agent. Automated browser tests are synthetic checks, not human usability results.

Use `pilot.html` with at least three consenting beginners for an initial formative pilot. Use participant codes only. Ask each person to start from the provided course instructions, without coaching, and complete network local/routed communication, messaging, MiTM diagnosis/recovery, DoS/DDoS diagnosis/recovery, and the assessment workflow. Record time, assistance, failed tasks, misconceptions, and accessibility barriers. Explain that the application is being tested, not the participant. Do not record personal contact details in notes.

The participant must explain why a result occurred, not merely obtain a green status. In particular, ask why local switching can work without routing, why TLS does not guarantee availability, and why upstream loss cannot be repaired by an application-side limiter.

For IP Addressing, ask the participant to calculate a fresh IPv4 subnet and explain why /0 describes a default route rather than a LAN. In the wrong-prefix exercise, have them predict both paths, record the original probes, repair the workstation, and explain why two successful pings are insufficient when the prefix still disagrees with the plan. Also ask them to correct a malformed IPv6 address and compare a /48 with a /64. During screen-reader review, check that the input labels, invalid-address feedback, and repair verdict are announced in a useful order.

Use the facilitator form to capture real outcomes and export the observation log. Keep consent and record-retention practices appropriate to the institution. The local form does not authenticate an observer or certify an educational outcome.

Resolve all incorrect causal explanations, blocking navigation problems, and critical accessibility findings before a release decision. Retest changed activities with additional beginners; do not overwrite or reinterpret assisted results as unaided results. Require unaided completion of essential workflows and a reviewed explanation of the observed outcomes. Three people are a starting point for formative feedback, not a statistically representative efficacy study.

The corrected educational models and practical checks are local simulation features. Public production release also requires a separate hosting/security/privacy review, authenticated learner accounts if persistent real identities are required, operational monitoring and backups, and a defined issuer administration process. These deployment concerns are not established by passing this pilot.
