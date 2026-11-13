# Connect Training Labs to the KryptNet website

The Training page opens `https://www.kryptnet.org/training/`. The existing
website's HTTPS server forwards that path to a separate training container
on `127.0.0.1:5317`. Keep the archive and extracted project outside the
public document root.

## Update an existing training container

Copy the learner accounts release ZIP to your Ubuntu home directory and
run the following on the Ubuntu server.

```sh
cd /opt/kryptnet-services/kryptnet-training-labs &&
python3 -m zipfile -e "$HOME/KryptNet-Training-Labs-Learner-Accounts.zip" . &&
cd network-lab/deploy &&
sudo python3 use-website-mail.py &&
sudo docker compose -f compose.kryptnet.yaml up -d --build --wait app &&
curl -fsS -H 'Host: www.kryptnet.org' http://127.0.0.1:5317/training/health/ready
```

The archive contains application files and an example configuration.
Compose reuses the installed `.env` and learner-data volume. After the health
check, open the course catalog at `https://www.kryptnet.org/training/`
and open a course assessment. Create a learner account, verify the
email code, sign in, and check the instructions above **Take Test**.

The setup command reuses SMTP settings from the running website app and
creates a code-signing secret in the training `.env`. It leaves existing
training mail settings in place. To configure a separate mailbox, use the
`TRAINING_SMTP_*` fields in `.env.example` and generate a 32-byte hexadecimal
`TRAINING_CODE_SECRET`. Keep the server configuration private.

## Start Training Labs

Run these commands from the extracted `network-lab/deploy` directory.
Set `KRYPTNET_DOMAIN=www.kryptnet.org` in `.env` if it was created for a
previous hostname. Keep credentials in that file with mode 600.
Clear all three `OIDC_*` values if the file still contains example
credentials and you want to publish the practice labs first.

```sh
sudo ss -ltn '( sport = :5317 )'
if [ ! -e .env ]; then install -m 600 .env.example .env; fi
sudo docker compose -f compose.kryptnet.yaml config --quiet
sudo docker compose -f compose.kryptnet.yaml up -d --build --wait
curl -fsS -H 'Host: www.kryptnet.org' http://127.0.0.1:5317/training/health/ready
```

Learners can sign in with email and password once the verification mail
settings are configured. For optional provider sign-in, configure the OIDC
issuer, client ID and client secret together. Register
`https://www.kryptnet.org/training/auth/callback` as the authorized
redirect URI and use a provider that supplies a verified email claim.
Recreate the training container after editing `.env`.

## Publish the Training button

Install the Nginx route snippet, then add the include inside the existing
HTTPS `server` block for `www.kryptnet.org`. Use the current website
certificate and keep the rest of that server block in place.

```sh
sudo install -m 0644 nginx.kryptnet.example.conf /etc/nginx/snippets/kryptnet-training.conf
sudo nano /etc/nginx/sites-available/www.kryptnet.org
```

In the editor, paste this line before the closing brace of the
`server` block with `listen 443 ssl`. Save the file before returning
to the terminal.

```nginx
include /etc/nginx/snippets/kryptnet-training.conf;
```

```sh
sudo nginx -t && sudo systemctl reload nginx
curl -fsS --resolve www.kryptnet.org:443:127.0.0.1 https://www.kryptnet.org/training/health/ready
```

From the training `deploy` directory, use the packaged script to update the
website's Training page and its cached script version. It saves copies of
the two website files with a `.before-training` suffix.

```sh
website=/opt/kryptnet-services/kryptnet-website
python3 connect-website.py "$website" &&
cd "$website" &&
sudo docker compose up -d --no-deps --build gateway
```

Open `https://www.kryptnet.org/#/services/training` and select **Launch
Training Platform**. Verify the catalog, one course page and its assessment
link. Once sign-in is configured, verify learner and issuer permissions,
grading and PDF certificate verification. The training service uses a
single app instance and a private learner-data volume.

See `../PRODUCTION.md` for the backup, recovery and course release checks.

## Sandbox checkout

All 16 listed courses have their own assessment and paid enrollment. Switching
and Routing have separate assessments. Learners can practice first, then sign
in, pay for their selected course, and confirm the name for their certificate.
The initial fee is $25 USD per course and includes one retake. After the
included retake, each further attempt costs $20 USD and becomes available
28 days after the last unsuccessful submission. Learners see the next
eligible date on their results page. Existing verified payments and issued
certificates are recognized.

Each course starts with a required, server-verified guided repair. The
independent assessment grades course knowledge (30%), a different simulated
repair (60%), and the explanation (10%). A score of at least 75% and a pass on
every practical check unlock a course-specific downloadable certificate. The
legacy Network Fundamentals quiz uses the same 75% pass mark and pricing
rules, and retains its certificate records.

1. Set `AUTHORIZE_NET_MODE=sandbox` and the three Authorize.Net credential
   variables in the server's private `.env`. Use a USD merchant account.
   The sandbox account needs live processing mode to create retrievable
   test transactions.
2. Register the sandbox webhook at
   `https://www.kryptnet.org/training/api/payments/authorize-net/webhook`.
   Subscribe to `net.authorize.payment.authcapture.created` and
   `net.authorize.payment.fraud.approved`.
3. Use an authorized sandbox learner to test successful and declined payments.
   Check that the return page waits for confirmation, an unpaid learner
   cannot start an assessment, a receipt cannot unlock a different learner
   or course, and a passing paid learner can download and verify the
   course-specific certificate. Verify the included retake, 28-day wait,
   and separate $20 checkout with an eligible test learner. If the
   webhook is delayed, enter the transaction ID from the sandbox receipt.

Complete the technical, instructional, accessibility, and beginner reviews
in the handoff's release standard before offering these courses to paying
learners. Keep the staging payment and identity credentials separate from production.
Course assessment and enrollment wiring is implemented. Automated coverage is
in `test/course-assessments.test.js` and `test/payments.test.js`. Course release
review remains partial pending human review and staging checkout verification.
Production credentials and the `production` mode are only for the live
hostname after sandbox verification and launch approval. Merchant refunds,
voids and chargebacks must be reconciled by the operator before opening paid
enrollment. The application does not process refunds or revoke previously
issued certificates.

Authorize.Net references:

- [Accept Hosted](https://developer.authorize.net/api/reference/features/accept-hosted.html)
- [Webhooks](https://developer.authorize.net/api/reference/features/webhooks.html)
- [Sandbox testing guide](https://developer.authorize.net/hello_world/testing_guide.html)
