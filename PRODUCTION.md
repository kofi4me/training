# KryptNet production deployment and release record

## Current status

Learners may use the laboratories without an account. At the assessment boundary, they must create an account or sign in, confirm their certificate details, then take the quiz. This requirement is enforced by both the page and assessment API, including in local preview. Sign-in initiated from the quiz returns to the assessment page. Without a configured identity provider, the quiz gate explains that registration is unavailable; it does not issue anonymous certificates.

Local implementation, not a public launch approval. Production HTTP hardening, OpenID Connect integration, protected learner records, issuer-only reporting, and offline backup/restore tooling are implemented. Automated identity tests use an injected test provider: they are not proof of successful authentication with KryptNet's actual provider. Docker is not available in this workspace, so the image and Compose deployment must still be built and exercised on staging. No live website, DNS, or identity-provider settings have been changed.

## Website integration

An optional PostgreSQL storage backend and explicit offline import are now available; see [POSTGRESQL.md](POSTGRESQL.md). PostgreSQL is provisional information from the owner, not a verified website configuration. File storage remains the default. No website/database connection or migration has been executed. In database mode, readiness also queries the training table, and recovery requires a database backup plus the protected PDF volume. The single-process deployment limit remains in force.

Deploy under a dedicated hostname owned by KryptNet and link to it from the company website. The exact hostname must be confirmed by the owner; `lab.your-domain.example` is only a placeholder. The app currently assumes the URL root, not a subdirectory. The existing company website need not be moved or replaced. This server requires Node and Python; uploading files to static hosting alone cannot provide accounts, grading, or authoritative certificates.

## Identity and issuer access

Register a confidential web application with a standards-compliant OpenID Connect provider. Require verified email addresses and enable the provider's account recovery and multifactor authentication options, especially for administrators. Configure the callback as `https://YOUR_LAB_HOST/auth/callback`, and allow the scopes `openid email profile`. The provider must supply a verified email claim. Credentials belong in the server environment or hosting secret manager, never in public files or Git. No passwords, access tokens, or refresh tokens are persisted by the lab.

Set `NETWORK_LAB_PUBLIC_ORIGIN` to the exact HTTPS origin without a trailing slash. Set `OIDC_ISSUER` to the issuer identifier, not a discovery document URL, along with `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`. Production refuses startup without these values, `NETWORK_LAB_HTTPS=1`, and `NETWORK_LAB_DATA_DIR` outside the application directory. All assessment endpoints require a signed-in account in production; public certificate verification remains accessible by unguessable certificate ID.

Sign in with the intended administrator account. Its Account ID appears on My Learning. Add that exact ID to the comma-separated `KRYPTNET_ADMIN_IDS` environment variable and restart. Access is denied by default. Do not use a learner-editable email address or a browser-supplied role as an administrator designation. The My Learning page then displays the issuer learner table. Confirm another account receives HTTP 403 from `/api/admin/learners`.

Application login expires after eight hours. Signing out invalidates the local session, but does not terminate a session at the identity provider. An account is keyed by issuer and subject, not by email, so changing providers does not automatically merge accounts. Existing anonymous preview assessments are not automatically linked to new accounts. Account-bound assessment records persist across sign-ins and devices; browser-local lab configurations and notes do not yet synchronise to accounts.

## Deployment

On an appropriately maintained server with Docker and Compose, create a private `deploy/.env` using the variable names in `deploy/.env.example`, populated with the real hostname and identity-provider configuration. Configure DNS to the server, expose only TCP 80 and 443 (and optionally UDP 443), and run from `deploy/`:

```sh
docker compose config --quiet
docker compose build --pull
docker compose up -d
docker compose ps
```

The example uses Caddy for HTTPS, a non-root read-only application container, and a persistent learner-data volume. The application port is not published. The proxy overwrites X-Real-IP; only the exact private proxy address is trusted for rate-limit identity. If the example subnet conflicts with an existing network, change both fixed container addresses, subnet, and trusted-proxy environment setting together. Do not place an unconfigured additional CDN or proxy in front: client-address trust must be reviewed first. Pin tested container image digests for an approved release and rebuild regularly for security updates.

The data service is deliberately single-instance. Do not scale replicas against this file store. Horizontal scaling and large cohorts require transactional shared storage and distributed rate limits. Current per-IP thresholds also need classroom/NAT load testing; a whole class may share one address. Throttling does not replace upstream DDoS protection.

## Observability and recovery

Monitor `/health/live` for HTTP service availability and `/health/ready` for data-directory access. These are not proof that the external sign-in provider or certificate renderer is functioning. Also run synthetic sign-in and certificate-generation checks in staging with designated test accounts. Responses carry request IDs. Server error logs omit raw URLs, cookies, names, and submitted bodies. Configure the hosting system's monitoring, alerts, disk-space alarms, and log retention; do not log OAuth callback codes or session cookies in an upstream access logger.

Stop the application before taking an offline snapshot. On a host with direct access to the mounted data directory, use:

```sh
node backup.js backup /protected/learner-data /protected/backups/NEW_SNAPSHOT --offline
node backup.js restore /protected/backups/NEW_SNAPSHOT /protected/NEW_RESTORE_DIRECTORY --offline
```

Both destinations must be new directories. Restore validates file hashes before writing; it never replaces an existing data directory. Supply the restored directory as the new data mount, preserve its restrictive ownership, and verify known records before reopening access. Encrypt off-host backups and restrict access: snapshots contain personal data and live-session records. Hashes detect accidental corruption; they are not signatures against a malicious backup replacement. Determine backup frequency, retention, recovery objectives, and a tested host-specific restore procedure before launch. The automated restore test covers fixture bytes, not recovery of a live deployment.

## Data interpretation and privacy

The issuer dashboard shows registered accounts, authenticated visits observed at most once per UTC day, successful sign-ins (the latest 100 activity entries per account), first course openings, server-graded network completions, and certificate IDs. Course starts mean page opening, not engagement. Security investigations currently have no server-graded completion or certificate. Clients cannot submit completion or issuance events. The implementation does not identify anonymous visitors or claim unique visitor analytics. Account records must not be presented as verified attendance or externally accredited achievement.

Before public enrolment, publish KryptNet's privacy/support contact and policy, retention periods, deletion and correction procedure, and any applicable terms. Review the identity provider and hosting as data processors. The shipped learner-data page describes technical behaviour but is not a completed institutional policy. Expired login/session files and personal records currently require an operator retention procedure; there is no automatic purge or self-service deletion tool. Account suspension, issuer correction/revocation workflows, and security-lab assessed completion are not implemented. These must be addressed or explicitly excluded from the agreed launch scope.

## Release acceptance

- Confirm hosting URL and operator access; test DNS and HTTPS renewal.
- Complete an actual provider sign-in, provider signup/recovery, logout, expiry, and cross-account isolation test.
- Test an administrator and an ordinary learner; verify issuer APIs are denied to learners.
- Complete a network assessment, download the PDF, and verify its identifier and fingerprint after an application restart.
- Load test the expected classroom size, especially shared-IP use; confirm resource limits and alert delivery.
- Restore a protected staging backup and verify learner outcomes and certificate files.
- Perform keyboard, screen-reader, contrast, and mobile review of critical flows.
- Observe real beginners using the protocol in `BEGINNER-PILOT.md`; distinguish assisted from unaided completion.
- Obtain operator sign-off on privacy, retention, learner support, incident handling, and the precise supported course/assessment scope.

Passing code tests does not automatically check these items off. Keep dated evidence and a named owner for each launch decision.
