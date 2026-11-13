# PostgreSQL and KryptNet website integration

## Status and scope

The website owner tentatively identified PostgreSQL. The actual backend, database version, identity provider, and deployment hostname are not confirmed. No live website or database has been changed. This is an optional storage implementation with local contract/regression tests, not a successful staging deployment or public release approval.

`KRYPTNET_STORAGE=files` remains the default and reads the existing protected JSON records without renaming them. Explicit `postgres` mode stores accounts, hashed login sessions, assessment sessions, certificate metadata, and fingerprints in the separate `kryptnet_training.records` table. The JSON documents retain existing identity keys, course IDs, and certificate IDs. No website tables, passwords, or account schema are read or modified. Certificate PDF bytes remain in the protected `NETWORK_LAB_DATA_DIR` volume in both modes.

This is a compatibility document store, not a normalized course/reporting schema. Browser-local configurations, lesson markers, notes, and practice checkpoints are still local practice data; they are not silently promoted into server-verified practical grades. Anonymous visitors are not identified. Authenticated course openings are now recorded separately for all 13 courses; opening a page is not completion or attendance. Existing `network` assessment records remain separate from the `devices` course opening.

## Provisioning

1. Have the website operator confirm PostgreSQL, the supported database version, hosting topology, backup policy, and approved training hostname. Prefer a dedicated database or a restricted training role in the existing database.
2. Back up the database. A migration owner must review and apply `deploy/training-schema.sql` exactly once. It creates only the training schema/table and deliberately refuses an existing schema. HTTP startup never creates or migrates tables.
3. Grant the application role only `CONNECT` on the approved database, `USAGE` on `kryptnet_training`, and `SELECT, INSERT, UPDATE, DELETE` on `kryptnet_training.records`. Do not grant table/schema ownership or access to website tables. The migration owner must not be the runtime role. PostgreSQL's database-level `PUBLIC` grants and other inherited role privileges must also be reviewed; these cannot be inferred by this application.
4. Put the URL in the server secret manager as `KRYPTNET_DATABASE_URL`. Never put it in browser code, a public config file, Git, or a chat message. Select `KRYPTNET_STORAGE=postgres` explicitly.
5. Leave `KRYPTNET_DATABASE_TLS=verify-full` for a remote database. Certificate/hostname verification stays enabled. For an institutional private CA, configure Node's trusted CA bundle before startup, for example through `NODE_EXTRA_CA_CERTS`. SSL parameters in the URL are rejected so they cannot override the application policy. `local` disables TLS only for an explicitly loopback hostname; it is not suitable for a remote/container database hostname.

The application uses parameterized SQL and a five-connection pool with connection/query timeouts. Account-document updates acquire transaction-scoped advisory locks and roll back on failure. Unexpected database failures do not fall back to files. `/health/ready` checks the selected database table as well as the protected PDF directory; `/health/live` remains a process check.

## Preserve existing records

Do not simply switch an established installation to an empty database. It would appear to have no learner records. There is no implicit file fallback or automatic merging.

1. Stop the single application instance and take a protected offline backup using the existing `backup.js` procedure. Test that backup's restore before changing storage.
2. Provision an empty training table. With the approved server-only database environment loaded, run:

```sh
node migrate-records.js /protected/learner-data --offline --confirm-empty-target
```

3. The importer validates every source filename and JSON document, imports all JSON records in one transaction, refuses any nonempty target, and never modifies source files. It ignores certificate PDF files, which must remain on the protected volume. Use the stopped data directory, not the backup directory containing a manifest. The offline flag is an operator acknowledgement, not an automatic proof that every application instance has stopped.
4. Start the application in PostgreSQL mode with the same PDF volume. Compare known learner IDs, course records, attempts, certificate IDs, public verification fingerprints, and downloaded PDF bytes against the backup. Test a normal learner and issuer account, logout/re-login, failed and passing attempts, and cross-account isolation.
5. Before accepting new traffic, rollback can select the unchanged file snapshot. After PostgreSQL has accepted writes, those files are stale: stop the app and plan a reviewed reverse migration/restore rather than switching back and losing new records. A reverse migration is not provided.

## Backup and deployment limits

`backup.js` only backs up files. In PostgreSQL mode it does not back up database records. Stop the app, take a database backup with the operator's approved PostgreSQL tools, and snapshot the protected PDF volume as one recovery set. Encrypt backups, restrict access, and exercise database plus PDF restoration together. Do not publish a database dump or the data volume.

Keep one application process. Account locks do not make the assessment workflow, certificate renderer, in-memory OAuth callback bindings, or rate limiter a distributed system. Multiple replicas are not supported by this change. Staging must validate the schema, TLS, privileges, lock behavior, outages, migration counts, restore, and actual website sign-in. Contract tests with a mocked query client are not evidence that a real PostgreSQL server or production network was tested.

## Website navigation and sign-in

The website's Training button opens `https://www.kryptnet.org/training/`. The training app uses `NETWORK_LAB_BASE_PATH=/training` for this deployment. See [the website deployment instructions](deploy/KRYPTNET-STAGING.md) for the existing Nginx HTTPS server and callback URLs.

Sharing PostgreSQL is not shared sign-in. The current lab authenticates through OpenID Connect with verified email and keys identities by issuer plus subject. Confirm the website's authentication provider before reusing it or designing a server-side identity bridge. Do not copy password hashes, trust browser-supplied user IDs/roles, or merge accounts by email. Keep the existing identity configuration until a reviewed integration and explicit account-linking plan exist.
