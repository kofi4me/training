# Linux Server Administration course review

The previous course contained three browser labs covering accounts, file permissions, and service recovery. The course master adds installation and system inspection, file and log operations, package and process administration, storage and restore verification, and an integrated handover. The course remains at `systems.html?course=linux`.

| Deliverable | Status and evidence |
| --- | --- |
| Course audit | Implemented and tested. This review and `course-audit.json` record the earlier coverage and release gaps. |
| Revised course content | Partially implemented. Five modules, 19 lessons, knowledge checks, worked commands, and references are available. Qualified administrator and beginner review is pending. |
| Laboratory environment | Partially implemented. The browser models an Ubuntu guest, identities, processes, listeners, mounted storage, and archive checks. Provisioned learner VMs are outside the current browser implementation. |
| Animated demonstrations | Implemented and tested in the browser. Local Chrome checks cover simulated command typing, output, stepping, pause, speed, restart, and reduced motion. Live transcripts are pending. |
| Guided experiments | Implemented and tested in the browser. Exercises include failure cases, state checks, baseline comparison, saved settings and notes, and a transcript download. |
| Independent challenge | Partially implemented. Two handover incidents use a 100-point rubric with critical gates in the browser. Verification against live learner VM state is pending. |
| Assessment and grading | Partially implemented. Regression tests pass for the existing simulated service-recovery assessment, enrollment, and certificate issuance. The broader handover is browser practice. |
| Quality assurance | Partially implemented. `npm test`, `npm run test:issuer`, and the Chrome Systems Administration regression passed. Local Chrome also confirmed 19 lesson panels, six projects, and no horizontal overflow at 320 and 390 pixels. Live Ubuntu command validation and human review are pending. |
| Release checklist | Blocked for live VM release. Pinned Ubuntu 24.04 command validation, per-learner VM provisioning and cleanup, and independent human technical, beginner, and assistive-technology review are pending. |
