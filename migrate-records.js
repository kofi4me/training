import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { validRecordKey, postgresOptions } from './record-store.js';

export async function importRecords(directory, pool) {
  const records = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) throw Error('Unexpected directory in source; inspect the offline snapshot.');
    if (/^KN-[A-F0-9-]{36}\.pdf$/.test(entry.name)) continue;
    if (!validRecordKey(entry.name)) throw Error('Unexpected source file; use the stopped application data directory, not a backup manifest directory.');
    const bytes = await readFile(path.join(directory, entry.name));
    if (bytes.length > 1024 * 1024) throw Error('Source record is too large.');
    const document = JSON.parse(bytes.toString('utf8'));
    if (!document || typeof document !== 'object' || Array.isArray(document)) throw Error('Invalid source record.');
    records.push([entry.name, JSON.stringify(document)]);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE kryptnet_training.records IN ACCESS EXCLUSIVE MODE');
    const { rows } = await client.query('SELECT count(*)::int AS count FROM kryptnet_training.records');
    if (rows[0].count !== 0) throw Error('Target training table must be empty. No records were replaced.');
    for (const record of records) await client.query('INSERT INTO kryptnet_training.records (record_key, document) VALUES ($1, $2::jsonb)', record);
    await client.query('COMMIT');
    return records.length;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, offline, confirm] = process.argv.slice(2);
  if (!directory || offline !== '--offline' || confirm !== '--confirm-empty-target') throw Error('Usage: node migrate-records.js DATA_DIRECTORY --offline --confirm-empty-target (stop the app and back up first).');
  const pool = new pg.Pool(postgresOptions(process.env));
  try { console.log(`Imported ${await importRecords(path.resolve(directory), pool)} training records. PDF files remain in the protected data volume.`); }
  catch { console.error('Training migration failed. No source files were modified. Inspect database access/schema and the offline source.'); process.exitCode = 1; }
  finally { await pool.end(); }
}
