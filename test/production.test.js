import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deploymentConfig, clientAddress, createRateLimiter } from '../server-security.js';
import { createLabServer } from '../server.js';
import { backup, restore } from '../backup.js';

test('production fails closed and proxy headers cannot bypass per-client throttles', () => {
  assert.throws(() => deploymentConfig({ NODE_ENV: 'production' }), /Production requires/);
  assert.throws(() => deploymentConfig({ NODE_ENV: 'production', NETWORK_LAB_PUBLIC_ORIGIN: 'https://lab.example', NETWORK_LAB_HTTPS: '1', NETWORK_LAB_DATA_DIR: '/data' }), /identity provider/);
  assert.equal(clientAddress({ socket: { remoteAddress: '1.2.3.4' }, headers: { 'x-real-ip': '8.8.8.8' } }, '127.0.0.1'), '1.2.3.4');
  assert.equal(clientAddress({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-real-ip': '8.8.8.8' } }, '127.0.0.1'), '8.8.8.8');
  let time = 0; const allow = createRateLimiter({ now: () => time, maxKeys: 2 });
  assert.equal(allow('a', 2), true); assert.equal(allow('a', 2), true); assert.equal(allow('a', 2), false);
  assert.equal(allow('b', 1), true); assert.equal(allow('c', 1), false); time = 60001; assert.equal(allow('c', 1), true);
});

test('the website training route can serve practice while learner sign-in is unconfigured', () => {
  const env = {
    NODE_ENV: 'production', NETWORK_LAB_PUBLIC_ORIGIN: 'https://www.example.test',
    NETWORK_LAB_HTTPS: '1', NETWORK_LAB_DATA_DIR: '/data',
    NETWORK_LAB_BASE_PATH: '/training', NETWORK_LAB_ALLOW_ANONYMOUS_PRACTICE: '1',
  };
  assert.equal(deploymentConfig(env).basePath, '/training');
  assert.throws(() => deploymentConfig({ ...env, NETWORK_LAB_BASE_PATH: '/training/' }), /trailing slash/);
  assert.throws(() => deploymentConfig({ ...env, OIDC_CLIENT_ID: 'partial' }), /identity provider/);
});

test('server restricts files and methods, emits security headers, and rate limits requests', async () => {
  process.env.NETWORK_LAB_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'kn-http-'));
  const server = createLabServer({ production: false, origin: '', proxy: '' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(base); assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy'), /script-src 'self'/); assert.equal(page.headers.get('x-frame-options'), 'DENY');
    assert.equal((await fetch(base + '/health/ready')).status, 200);
    for (const file of ['server.js', 'accounts.js', 'record-store.js', 'migrate-records.js', 'deploy/training-schema.sql', '.assessment-data/test.json', 'package-lock.json', 'deploy/.env']) assert.equal((await fetch(base + '/' + file)).status, 404);
    assert.equal((await fetch(base, { method: 'DELETE' })).status, 405);
    const head = await fetch(base, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
    assert.equal((await fetch(base + '/api/admin/learners')).status, 403);
    assert.equal((await fetch(base + '/api/assessment')).status, 401);
    assert.equal((await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ name: 'Guest Learner', email: 'guest@example.test', confirmed: true }) })).status, 401);
    let response; for (let i = 0; i < 181; i++) response = await fetch(base + '/api/account');
    assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '60');
  } finally { await new Promise(resolve => server.close(resolve)); delete process.env.NETWORK_LAB_DATA_DIR; }
});

test('offline backups restore exact bytes, refuse overwrite, and detect corruption', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kn-backup-')); const data = path.join(root, 'source');
  const { mkdir } = await import('node:fs/promises'); await mkdir(data);
  const filename = 'account-' + 'a'.repeat(64) + '.json'; await writeFile(path.join(data, filename), '{"name":"Test only"}');
  await backup(data, path.join(root, 'snapshot')); await restore(path.join(root, 'snapshot'), path.join(root, 'restored'));
  assert.equal(await readFile(path.join(root, 'restored', filename), 'utf8'), '{"name":"Test only"}');
  await assert.rejects(restore(path.join(root, 'snapshot'), path.join(root, 'restored')), /EEXIST/);
  await writeFile(path.join(root, 'snapshot', filename), 'corrupted');
  await assert.rejects(restore(path.join(root, 'snapshot'), path.join(root, 'bad')), /checksum/);
});

test('database outages fail readiness and authenticated reads without falling back to learner files', async () => {
  const names = ['NETWORK_LAB_DATA_DIR', 'KRYPTNET_STORAGE', 'KRYPTNET_DATABASE_URL', 'KRYPTNET_DATABASE_TLS'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const dir = await mkdtemp(path.join(tmpdir(), 'kn-db-outage-'));
  const raw = 'c'.repeat(64);
  const { createHash } = await import('node:crypto');
  const digest = createHash('sha256').update(raw).digest('hex');
  await writeFile(path.join(dir, 'login-' + digest + '.json'), JSON.stringify({ accountId: 'a'.repeat(64), expires: Date.now() + 60000 }));
  await writeFile(path.join(dir, 'account-' + 'a'.repeat(64) + '.json'), JSON.stringify({ name: 'Must not be loaded as fallback' }));
  Object.assign(process.env, { NETWORK_LAB_DATA_DIR: dir, KRYPTNET_STORAGE: 'postgres', KRYPTNET_DATABASE_URL: 'postgresql://127.0.0.1:1/unavailable_test_only', KRYPTNET_DATABASE_TLS: 'local' });
  const server = createLabServer({ production: false, origin: '', proxy: '' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/health/live')).status, 200);
    assert.equal((await fetch(base + '/health/ready')).status, 503);
    const response = await fetch(base + '/api/account', { headers: { Cookie: 'kn_login=' + raw } });
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /Must not be loaded|postgresql|unavailable_test_only/);
    assert.equal((await fetch(base)).status, 200, 'Anonymous static practice must remain available');
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
  }
});
