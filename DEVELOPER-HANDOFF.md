# KryptNet Training Labs: Developer Handoff

This package contains the full lab source, assets, server, deployment templates and automated tests. Share it with the website developer privately. Do not place this ZIP or the extracted source tree in a public document root: it includes private server code and grading material. Run the Node application, which serves only allowlisted public files. No learner records, credentials, installed dependencies or generated test artifacts are included.

## Local Preview

Use Node.js 22, matching the Dockerfile. From the extracted `network-lab` directory:

```sh
npm ci --ignore-scripts
npm test
npm start
```

Open `http://127.0.0.1:4317/courses.html`. Anonymous practice works without an identity provider. Sign-in, quiz registration and official certificates need a configured OpenID Connect provider with verified email. PDF generation requires Python 3 with ReportLab; the Dockerfile includes it.

## Main Website Integration

The Training page on the KryptNet website links to `https://www.kryptnet.org/training/`.
Use [the website deployment guide](deploy/KRYPTNET-STAGING.md) and preserve the
installed `deploy/.env` and Docker learner-data volume when updating the container.

The Systems Administration catalog section includes Linux Server Administration,
Automation and Scripting, and Backup, Restore & Recovery. All three have guided
labs and separate assessments that use the existing pass mark, checkout, retake
and certificate rules. Course reviews and sandbox checkout verification are
tracked in [the course release standard](review/development-standard.txt) and
[the website deployment guide](deploy/KRYPTNET-STAGING.md).
