-- Run as a database migration owner, never as part of an HTTP request.
-- This schema does not reference or alter the website's tables.
BEGIN;
CREATE SCHEMA kryptnet_training;
CREATE TABLE kryptnet_training.records (
    record_key text PRIMARY KEY,
    document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (record_key ~ '^((account-|login-)?[a-f0-9]{64}|KN-[A-F0-9-]{36})\.json$')
);
REVOKE ALL ON SCHEMA kryptnet_training FROM PUBLIC;
REVOKE ALL ON TABLE kryptnet_training.records FROM PUBLIC;
COMMIT;
