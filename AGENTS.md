# KryptNet course development rules

The user's mandatory development standard is preserved in review/development-standard.txt. Read it before designing or upgrading a course. review/course-audit.json and review/course-review.html contain the baseline gaps and prioritized plan; review/implementation-log.html records verified milestone changes, not blanket release approval.

- Preserve existing URLs, learner identity keys, progress keys, certificates and protected assessment data. Never publish or overwrite .assessment-data.
- Treat every course as original instructional content plus a configurable domain model, guided experiments, fault diagnosis and verified repair. Generic headings or a prerecorded trace do not satisfy the standard.
- Reuse tested playback/device/event contracts where appropriate; keep protocol-specific semantics explicit.
- Independently assessed work requires controlled attempt variations, server-side outcome verification, stored retries, and a practical pass gate. Browser completion flags and prose length are not assessment.
- Preserve legacy credentials when designing a versioned eligibility migration. Do not silently rename a quiz-only record as a practical qualification.
- Each course requires the nine deliverables and all acceptance criteria in the supplied standard. Record Implemented and tested, Partially implemented, Not implemented, or Blocked with evidence.
- No production-ready label until content, device configuration, topology, guided and independent practical work, grading, accessibility and QA all pass documented review.
- Run relevant successful/failing/boundary/interruption/repeated-attempt tests. Include human technical and beginner review separately; automated scripts do not establish human learning.
- Keep cybersecurity labs synthetic and isolated. Do not execute user configuration as shell commands.
