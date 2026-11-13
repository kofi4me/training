import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFileRecordStore, createPostgresRecordStore, createRecordStore, postgresOptions } from '../record-store.js';
import { importRecords } from '../migrate-records.js';
import { courseForLocation, courseLabels } from '../course-catalog.js';
import { createAssessmentService } from '../assessment-service.js';
import { bank } from '../assessment-core.js';
import { Readable } from 'node:stream';

const accountKey = 'account-' + 'a'.repeat(64) + '.json';
const loginKey = 'login-' + 'b'.repeat(64) + '.json';
const temp = () => mkdtemp(path.join(tmpdir(), 'kn-store-'));

test('file backend preserves legacy filenames and values across restart, without retaining references', async () => {
  const dir = await temp();
  await writeFile(path.join(dir, accountKey), JSON.stringify({ id: 'a'.repeat(64), courses: { network: { certificateId: 'unchanged' } } }));
  const store = createFileRecordStore(dir);
  assert.equal((await store.read(accountKey)).courses.network.certificateId, 'unchanged');
  await store.write(loginKey, { accountId: 'a'.repeat(64), expires: 123 });
  assert.deepEqual(await createFileRecordStore(dir).read(loginKey), { accountId: 'a'.repeat(64), expires: 123 });
  const first = await store.read(loginKey); first.expires = 999;
  assert.equal((await store.read(loginKey)).expires, 123);
  assert.equal((await store.listAccounts()).length, 1);
  await store.remove(loginKey); await store.remove(loginKey);
  assert.equal(await store.read(loginKey), null);
  assert.equal((await readdir(dir)).some(name => name.endsWith('.tmp')), false);
});

test('file updates serialize and recover after a rejected update', async () => {
  const store = createFileRecordStore(await temp());
  await Promise.all(Array.from({ length: 20 }, () => store.update(accountKey, async current => {
    await new Promise(resolve => setTimeout(resolve, 1));
    return { count: (current?.count || 0) + 1 };
  })));
  assert.equal((await store.read(accountKey)).count, 20);
  await assert.rejects(store.update(accountKey, () => { throw Error('test interruption'); }), /interruption/);
  await store.update(accountKey, current => ({ count: current.count + 1 }));
  assert.equal((await store.read(accountKey)).count, 21);
});

test('invalid keys and oversized or nonobject records cannot be written', async () => {
  const store = createFileRecordStore(await temp());
  for (const key of ['../private.json', 'account-test.json', 'KN-example.pdf', '', undefined]) {
    await assert.rejects(store.read(key), /Invalid/);
    await assert.rejects(store.write(key, {}), /Invalid/);
  }
  for (const value of [null, [], 'unsafe']) await assert.rejects(store.write(accountKey, value), /objects/);
  await assert.rejects(store.write(accountKey, { text: 'a'.repeat(1024 * 1024) }), /large/);
});

test('PostgreSQL selection is explicit and TLS verification cannot be disabled by URL options', async () => {
  assert.equal(createRecordStore(await temp(), {}).kind, 'files');
  const url = 'postgresql://training:example@db.example/training';
  assert.throws(() => createRecordStore('.', { KRYPTNET_DATABASE_URL: url }), /explicitly/);
  assert.throws(() => createRecordStore('.', { KRYPTNET_STORAGE: 'typo' }), /Unsupported/);
  assert.throws(() => postgresOptions({ KRYPTNET_DATABASE_URL: 'invalid' }), /valid/);
  assert.throws(() => postgresOptions({ KRYPTNET_DATABASE_URL: url + '?sslmode=no-verify' }), /URL SSL/);
  assert.throws(() => postgresOptions({ KRYPTNET_DATABASE_URL: url, KRYPTNET_DATABASE_TLS: 'local' }), /loopback/);
  assert.throws(() => postgresOptions({ KRYPTNET_DATABASE_URL: url, KRYPTNET_DATABASE_TLS: 'disable' }), /mode/);
  assert.equal(postgresOptions({ KRYPTNET_DATABASE_URL: url }).ssl.rejectUnauthorized, true);
  assert.equal(postgresOptions({ KRYPTNET_DATABASE_URL: 'postgres://localhost/training', KRYPTNET_DATABASE_TLS: 'local' }).ssl, false);
});

// This verifies the adapter's SQL contract, not PostgreSQL's own transaction implementation.
function fakePool(initial = [], failInsert = false) {
  const rows = new Map(initial), calls = [];
  let snapshot, releases = 0;
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === 'BEGIN') snapshot = structuredClone(rows);
      if (sql === 'ROLLBACK') { rows.clear(); for (const entry of snapshot) rows.set(...entry); }
      if (sql.startsWith('SELECT count')) return { rows: [{ count: rows.size }] };
      if (sql.startsWith('SELECT document') && sql.includes('record_key = $1')) return { rows: rows.has(params[0]) ? [{ document: rows.get(params[0]) }] : [] };
      if (sql.startsWith('SELECT document')) return { rows: [...rows.entries()].filter(([key]) => key.startsWith('account-')).map(([, document]) => ({ document })) };
      if (sql.startsWith('INSERT')) { if (failInsert) throw Error('synthetic database outage'); rows.set(params[0], JSON.parse(params[1])); }
      if (sql.startsWith('DELETE')) rows.delete(params[0]);
      return { rows: [] };
    },
    release() { releases++; }
  };
  return { ...client, connect: async () => client, end: async () => {}, rows, calls, get releases() { return releases; } };
}

test('PostgreSQL adapter parameterizes values, locks updates, commits, and releases connections', async () => {
  const pool = fakePool(), store = createPostgresRecordStore(pool);
  const value = { name: "O'Brien'); DROP TABLE example; --", count: 1 };
  await store.write(accountKey, value);
  assert.deepEqual(await store.read(accountKey), value);
  await store.update(accountKey, current => ({ ...current, count: 2 }));
  assert.equal((await store.read(accountKey)).count, 2);
  assert.equal((await store.listAccounts()).length, 1);
  assert.equal(pool.calls.some(call => call.sql.includes(value.name)), false);
  assert.ok(pool.calls.some(call => call.sql.includes('pg_advisory_xact_lock')));
  assert.ok(pool.calls.some(call => call.sql === 'COMMIT'));
  assert.equal(pool.releases, 1);
  await store.ready(); await store.remove(accountKey); assert.equal(await store.read(accountKey), null);
});

test('PostgreSQL adapter rolls back and releases on failed grading/storage changes', async () => {
  const pool = fakePool([[accountKey, { count: 3 }]]), store = createPostgresRecordStore(pool);
  await assert.rejects(store.update(accountKey, () => { throw Error('do not persist'); }), /persist/);
  assert.equal(pool.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(pool.releases, 1);
  assert.equal((await store.read(accountKey)).count, 3);
  const failing = fakePool([], true);
  await assert.rejects(createPostgresRecordStore(failing).update(accountKey, () => ({ count: 1 })), /outage/);
  assert.equal(failing.calls.at(-1).sql, 'ROLLBACK'); assert.equal(failing.releases, 1);
});

test('offline migration preserves IDs and source bytes and refuses a nonempty target', async () => {
  const dir = await temp(), bytes = JSON.stringify({ certificates: [{ id: 'legacy-id' }] });
  await writeFile(path.join(dir, accountKey), bytes);
  await writeFile(path.join(dir, 'KN-12345678-1234-1234-1234-123456789ABC.pdf'), '%PDF synthetic');
  const pool = fakePool();
  assert.equal(await importRecords(dir, pool), 1);
  assert.equal(pool.rows.get(accountKey).certificates[0].id, 'legacy-id');
  assert.equal(await readFile(path.join(dir, accountKey), 'utf8'), bytes);
  await assert.rejects(importRecords(dir, pool), /empty/);
  assert.equal(pool.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(pool.rows.size, 1);
});

test('migration aborts on malformed input and rolls back database write failures', async () => {
  const dir = await temp(); await writeFile(path.join(dir, accountKey), '{}');
  const pool = fakePool([], true);
  await assert.rejects(importRecords(dir, pool), /outage/);
  assert.equal(pool.calls.at(-1).sql, 'ROLLBACK'); assert.equal(pool.releases, 1);
  await writeFile(path.join(dir, 'unexpected.json'), '{}');
  await assert.rejects(importRecords(dir, fakePool()), /Unexpected/);
  const malformed = await temp(); await writeFile(path.join(malformed, accountKey), '[]');
  await assert.rejects(importRecords(malformed, fakePool()), /Invalid/);
});

test('all 16 courses have distinct opening records and noncourse pages never start a course', () => {
  const ids = Object.keys(courseLabels).filter(id => id !== 'network');
  assert.equal(ids.length, 16);
  for (const id of ids) {
    const page = ['mitm', 'ddos'].includes(id) ? '/security.html' : ['linux', 'automation', 'recovery'].includes(id) ? '/systems.html' : '/fundamentals.html';
    assert.equal(courseForLocation(page, '?' + new URLSearchParams({ course: id, lab: id })), id);
  }
  for (const page of ['/', '/courses.html', '/account.html', '/assessment.html', '/verify.html']) assert.equal(courseForLocation(page, ''), null);
  assert.equal(courseForLocation('/fundamentals.html', ''), 'devices');
  assert.equal(courseForLocation('/fundamentals.html', '', '#vlans'), 'vlans');
  assert.equal(courseForLocation('/fundamentals.html', '?course=unknown'), null);
  assert.equal(courseForLocation('/security.html', '?lab=unknown'), null);
  assert.equal(courseForLocation('/index.html', ''), 'network');
});

test('assessment uses the injected PostgreSQL contract and recovers completion delivery without a second certificate', async () => {
  const dir = await temp(), pool = fakePool(), store = createPostgresRecordStore(pool);
  let deliveries = 0;
  const handler = createAssessmentService(path.resolve('.'), dir, async () => { if (++deliveries === 1) throw Error('temporary event failure'); }, store);
  async function request(url, input) {
    const req = Readable.from(input === undefined ? [] : [Buffer.from(JSON.stringify(input))]);
    req.method = input === undefined ? 'GET' : 'POST'; req.headers = { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' };
    req.account = { id: 'a'.repeat(64), email: 'test@example.test' };
    let status, body;
    await handler(req, { writeHead: code => { status = code; }, end: value => { body = JSON.parse(value); } }, url);
    return { status, body };
  }
  assert.equal((await request('/api/assessment')).status, 200);
  let response = await request('/api/register', { name: 'Test Learner', email: 'test@example.test', confirmed: true });
  const attemptId = response.body.attempt.id;
  const answers = Object.fromEntries(response.body.attempt.questions.map(question => {
    const actual = bank.find(item => item.id === question.id);
    return [question.id, actual.type === 'number' ? String(actual.answer) : actual.answer];
  }));
  response = await request('/api/submit', { attemptId, answers });
  assert.equal(response.status, 500);
  response = await request('/api/assessment');
  assert.equal(response.status, 200); assert.equal(response.body.attempt.submitted, true);
  assert.equal(response.body.attempt.result.passed, true); assert.equal(deliveries, 2);
  assert.equal([...pool.rows.keys()].filter(key => key.startsWith('KN-')).length, 1);
  assert.equal((await request('/api/submit', { attemptId, answers })).status, 409);
  assert.deepEqual(await readdir(dir), [], 'Database documents must not leak into the PDF directory');
});
