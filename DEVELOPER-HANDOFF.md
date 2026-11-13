# KryptNet Training Labs: Developer Handoff

This package contains the full lab source, assets, server, deployment templates and automated tests. Share it with the website developer privately. Do not place this ZIP or the extracted source tree in a public document root: it includes private server code and grading material. Run the Node application, which serves only allowlisted public files. No learner records, credentials, installed dependencies or generated test artifacts are included.

## Systems Administration Update

This full source snapshot supersedes the earlier handoff. It adds three courses with nine guided labs:

- `systems.html?course=linux`: Linux Server Administration, including user and group account creation, shared permissions, and service recovery.
- `systems.html?course=automation`: Automation and Scripting, including Bash and Python examples, log auditing, safe retries, and scheduled jobs.
- `systems.html?course=recovery`: Backup, Restore & Recovery, including recovery objectives, incremental restores, and a service recovery capstone.

Use the complete source tree, not just the new pages; the catalogue, replay workbench, course identifiers and server allowlist are shared. Deploy to a new staging release directory and use the existing protected configuration and persistent data mount. Do not replace or delete the learner store. This update requires no learner-record migration. The new courses are browser simulations and do not issue grades or certificates.

## Local Preview

Use Node.js 22, matching the Dockerfile. From the extracted `network-lab` directory:

```sh
npm ci --ignore-scripts
npm test
npm start
```

Open `http://127.0.0.1:4317/courses.html#systems-administration` and check that all three course buttons open their labs. Anonymous practice works without an identity provider. Sign-in, quiz registration and official certificates need a configured OpenID Connect provider with verified email. PDF generation requires Python 3 with ReportLab; the Dockerfile includes it.

## Main Website Integration

The proposed public entry is `https://kryptnet.org/labs/`, reached through an **Open Training Labs** link on the existing website. This is a proposed URL, not an active deployment. The current app assumes a hostname root. Before connecting the public link:

1. Confirm that the website's web server can forward `/labs/` requests to a separate Node service. Keep the service and learner storage private.
2. Add and test base-path support for course and asset links, API calls, redirects, OIDC callback registration, cookie paths, and certificate download and verification. A proxy rewrite alone is not sufficient. Leave existing company website routes unchanged.
3. Validate anonymous practice, sign-in at the quiz, learner and issuer access, grading, and certificate verification on staging. Back up and restore protected records before launch. Add the public link only after the agreed release checks pass.

Start with [PRODUCTION.md](PRODUCTION.md) and `deploy/.env.example` for the existing root-hosted staging setup. `deploy/compose.yaml` is a reference deployment, not a ready-made `/labs/` route. Keep real configuration values in the server's secret manager. The optional PostgreSQL setup is in [POSTGRESQL.md](POSTGRESQL.md); confirm the website's database and sign-in provider before integrating either.

The package is a development and staging handoff, not release approval. See [the applied lab overview](review/applied-lab-upgrade.md) and [the course release standard](review/development-standard.txt) for the scope and outstanding sign-offs.
