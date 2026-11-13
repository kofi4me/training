import { readFile, writeFile, rename, unlink, readdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';

export const validRecordKey = key => typeof key === 'string' && /^(?:(?:account-|login-)?[a-f0-9]{64}|KN-[A-F0-9-]{36})\.json$/.test(key);
function keyCheck(key) { if (!validRecordKey(key)) throw Error('Invalid training record key.'); }
function encode(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Training records must be objects.');
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > 1024 * 1024) throw Error('Training record is too large.');
  return json;
}
const clone = value => value == null ? null : structuredClone(value);

export function createFileRecordStore(directory) {
  const pending = new Map();
  const read = async key => {
    keyCheck(key);
    try { return JSON.parse(await readFile(path.join(directory, key), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  const write = async (key, value) => {
    keyCheck(key);
    const bytes = encode(value), target = path.join(directory, key), temporary = target + '.' + randomUUID() + '.tmp';
    try { await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' }); await rename(temporary, target); }
    finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  };
  // File mode remains single-process; serialize updates so account events cannot overwrite one another.
  const update = (key, change) => {
    keyCheck(key);
    const next = (pending.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
      const value = await change(await read(key));
      if (value !== null) await write(key, value);
      return clone(value);
    });
    pending.set(key, next);
    void next.finally(() => { if (pending.get(key) === next) pending.delete(key); }).catch(() => {});
    return next;
  };
  return {
    kind: 'files', read, write, update,
    async remove(key) { keyCheck(key); try { await unlink(path.join(directory, key)); } catch (error) { if (error.code !== 'ENOENT') throw error; } },
    async listAccounts() { const names = (await readdir(directory)).filter(name => /^account-[a-f0-9]{64}\.json$/.test(name)); return (await Promise.all(names.map(read))).filter(Boolean); },
    ready: () => access(directory, constants.R_OK | constants.W_OK),
    close: async () => {}
  };
}

export function postgresOptions(env) {
  let url;
  try { url = new URL(env.KRYPTNET_DATABASE_URL); } catch { throw Error('Set a valid server-only KRYPTNET_DATABASE_URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw Error('The training database must use PostgreSQL.');
  if ([...url.searchParams.keys()].some(key => /^ssl/i.test(key))) throw Error('Configure TLS with KRYPTNET_DATABASE_TLS, not URL SSL parameters.');
  const mode = env.KRYPTNET_DATABASE_TLS || 'verify-full';
  if (!['verify-full', 'local'].includes(mode)) throw Error('Database TLS mode must be verify-full or local.');
  if (mode === 'local' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('Unencrypted database connections are restricted to loopback.');
  return { connectionString: url.toString(), ssl: mode === 'local' ? false : { rejectUnauthorized: true }, max: 5, connectionTimeoutMillis: 3000, query_timeout: 5000, statement_timeout: 5000, application_name: 'kryptnet-training' };
}

export function createPostgresRecordStore(pool) {
  const readFrom = async (client, key) => {
    keyCheck(key);
    const result = await client.query('SELECT document FROM kryptnet_training.records WHERE record_key = $1', [key]);
    return clone(result.rows[0]?.document);
  };
  const writeTo = async (client, key, value) => {
    keyCheck(key);
    await client.query('INSERT INTO kryptnet_training.records (record_key, document) VALUES ($1, $2::jsonb) ON CONFLICT (record_key) DO UPDATE SET document = EXCLUDED.document, updated_at = CURRENT_TIMESTAMP', [key, encode(value)]);
  };
  return {
    kind: 'postgres',
    read: key => readFrom(pool, key), write: (key, value) => writeTo(pool, key, value),
    async remove(key) { keyCheck(key); await pool.query('DELETE FROM kryptnet_training.records WHERE record_key = $1', [key]); },
    async update(key, change) {
      keyCheck(key);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Transaction-scoped lock also protects creation of a previously absent record.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['kryptnet-training:' + key]);
        const value = await change(await readFrom(client, key));
        if (value !== null) await writeTo(client, key, value);
        await client.query('COMMIT');
        return clone(value);
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
      finally { client.release(); }
    },
    async listAccounts() { return (await pool.query("SELECT document FROM kryptnet_training.records WHERE record_key ~ '^account-[a-f0-9]{64}\\.json$' ORDER BY record_key")).rows.map(row => clone(row.document)); },
    async ready() { await pool.query('SELECT record_key FROM kryptnet_training.records LIMIT 1'); },
    close: () => pool.end()
  };
}

export function createRecordStore(directory, env = process.env) {
  const mode = env.KRYPTNET_STORAGE || 'files';
  if (mode === 'files') {
    if (env.KRYPTNET_DATABASE_URL) throw Error('Select KRYPTNET_STORAGE=postgres explicitly before supplying a database URL.');
    return createFileRecordStore(directory);
  }
  if (mode !== 'postgres') throw Error('Unsupported training storage backend.');
  const pool = new pg.Pool(postgresOptions(env));
  pool.on('error', () => console.error(JSON.stringify({ event: 'training_database_pool_error' })));
  return createPostgresRecordStore(pool);
}
