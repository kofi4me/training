# Optional PostgreSQL and learner tracking milestone

## Implemented

- Optional PostgreSQL document storage wired into the existing accounts and assessment services, including sessions and certificate metadata. Protected PDF bytes retain their file volume. Existing JSON shapes, identity keys, and certificate IDs are preserved.
- Separate training schema and parameterized SQL, verified remote TLS by default, bounded connection pool, transactional account updates, readiness checks, and failure without fallback to potentially stale files.
- Explicit offline import into an empty training table, with pre-validation, transaction rollback, and unchanged source files. No automatic migration or live database access.
- Distinct authenticated opening records for all 13 courses, including fundamentals pages that previously did not load account tracking. Homepage/account/verification visits no longer count as course starts. Legacy network assessment records retain their original key.
- Serialized assessment requests prevent concurrent double submission in the supported single process. Pending completion delivery survives a temporary reporting failure without creating a second certificate. Client requests still cannot award completion or certificate IDs.
- Deployment environment examples, schema, migration command, backup distinctions, and website/identity integration boundaries in POSTGRESQL.md.

## Automated evidence

- `storage-tests.xml`: complete 71-case regression run passed. Covers the original network/security/operations models, accounts, release gate, file compatibility, PostgreSQL query contract, TLS configuration rejection, rollback, migration refusal/preservation, and database outage without file fallback.
- `test/server-api.test.js`: real local PDF issuance and fingerprint checks passed, including two simultaneous submissions producing one success and one conflict.
- `test/assessment-browser.cjs`: signed-in fixture registration, locked profile, 70% failure, 80% pass, retained identity, PDF download, fingerprint match/mismatch, and desktop/mobile flow passed.
- `test/account-browser.cjs`: issuer visibility, identity escaping, certificate links, anonymous denial, desktop/mobile account layout, all 13 distinct course openings, and in-page security-course switching passed with synthetic fixture accounts. Mobile course pages have no document-level horizontal overflow; `artifacts/tracked-course-mobile.png` was visually inspected.
- PostgreSQL transaction tests use an injected mock query client. The outage test contacts an intentionally unavailable loopback endpoint. Neither is a successful real-database test.

Initial sandbox-only HTTP tests failed because loopback fetches were restricted, then passed with approved loopback access. A new test initially supplied numeric answers in the wrong API format and was corrected. Browser checks exposed missing fundamentals tracking and a preview-only origin comparison defect; both were fixed before the successful rerun. These failures are not presented as successful checks.

## Not completed or approved

The owner's PostgreSQL identification is tentative. No actual database/server version, backend framework, website identity provider, public training hostname, live migration, or website deployment has been verified. No company website tables or learner records were altered. PostgreSQL schema execution, grants, TLS, transaction behavior, migration/restore, and provider sign-in require staging evidence.

This milestone does not implement all outstanding course practical assessments, a shared configurable topology across every model, new course certificates, distributed operation, revocation, or human instructional/accessibility/beginner validation. The mandatory course release gate remains closed. Existing knowledge-only certificates are not relabeled as practical qualifications.
