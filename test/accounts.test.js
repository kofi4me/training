import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createAccounts } from '../accounts.js';
import { createAssessmentService } from '../assessment-service.js';
import { bank } from '../assessment-core.js';

test('account sessions persist, role checks hold, and only server grading records completion', async () => {
  const data = await mkdtemp(path.join(tmpdir(), 'kn-accounts-'));
  const issuer = 'https://identity.example'; const sub = 'test-learner';
  const id = createHash('sha256').update(JSON.stringify([issuer, sub])).digest('hex');
  let params, claims = { iss: issuer, sub, name: 'Test Learner', email: 'learner@example.test', email_verified: true };
  const provider = { start: values => { params = values; return new URL('https://identity.example/authorize'); }, exchange: async (url, checks) => { assert.equal(url.searchParams.get('state'), checks.expectedState); assert.equal(checks.expectedNonce, params.nonce); assert.ok(checks.pkceCodeVerifier); return claims; } };
  const env = { OIDC_ISSUER: issuer, OIDC_CLIENT_ID: 'test', OIDC_CLIENT_SECRET: 'test', KRYPTNET_ADMIN_IDS: id };
  let accounts;
  const assessment = createAssessmentService(path.resolve('.'), data, (req, type, detail) => accounts.record(req.account, type, detail));
  const server = http.createServer(async (req, res) => { try { const pathname = new URL(req.url, env.NETWORK_LAB_PUBLIC_ORIGIN).pathname; if (await accounts.route(req, res, pathname)) return; req.account = await accounts.current(req); if (!req.account) { res.writeHead(401); res.end(); return; } await assessment(req, res, pathname); } catch { res.writeHead(400); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); env.NETWORK_LAB_PUBLIC_ORIGIN = `http://127.0.0.1:${server.address().port}`;
  accounts = createAccounts(data, env, provider);
  let cookie = '';
  async function request(route, body) { const response = await fetch(env.NETWORK_LAB_PUBLIC_ORIGIN + route, { redirect: 'manual', method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, Origin: env.NETWORK_LAB_PUBLIC_ORIGIN, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); if (response.headers.getSetCookie().length) cookie = response.headers.getSetCookie().map(v => v.split(';')[0]).join('; '); return response; }
  try {
    assert.equal((await request('/api/admin/learners')).status, 403);
    assert.equal((await request('/auth/login?returnTo=assessment')).status, 302);
    const callback = '/auth/callback?code=test&state=' + params.state;
    const signedInResponse = await request(callback); assert.equal(signedInResponse.status, 302); assert.equal(signedInResponse.headers.get('location'), '/assessment.html'); const loginCookie = cookie;
    assert.equal((await request(callback)).status, 400); cookie = loginCookie;
    let state = await (await request('/api/account')).json(); assert.equal(state.account.id, id); assert.equal(state.account.admin, true);
    accounts = createAccounts(data, env, provider); assert.equal((await (await request('/api/account')).json()).account.id, id);
    assert.equal((await request('/api/activity', { type: 'course_completed', course: 'network' })).status, 400);
    assert.equal((await request('/api/activity', { type: 'course_started', course: 'network' })).status, 200);
    for (const course of ['devices', 'communications', 'addressing', 'vlans', 'routing', 'switching', 'dhcp', 'dns', 'firewall', 'nat', 'monitoring', 'mitm', 'ddos']) assert.equal((await request('/api/activity', { type: 'course_started', course })).status, 200);
    assert.equal((await request('/api/activity', { type: 'course_started', course: 'not-a-course' })).status, 400);
    state = await (await request('/api/account')).json(); assert.equal(Object.keys(state.account.courses).length, 14);
    await request('/api/assessment');
    assert.equal((await request('/api/register', { name: 'Test Learner', email: 'other@example.test', confirmed: true })).status, 400);
    state = await (await request('/api/register', { name: 'Test Learner', email: claims.email, confirmed: true })).json();
    const answers = Object.fromEntries(state.attempt.questions.map(q => { const answer = bank.find(item => item.id === q.id).answer; return [q.id, q.type === 'number' ? String(answer) : answer]; }));
    assert.equal((await request('/api/submit', { attemptId: state.attempt.id, answers })).status, 200);
    state = await (await request('/api/account')).json(); assert.match(state.account.courses.network.certificateId, /^KN-/); assert.ok(state.account.courses.network.completed); assert.equal(state.account.certificates[0].id, state.account.courses.network.certificateId);
    assert.equal((await request('/api/admin/learners')).status, 200);
    const learnerOnly = createAccounts(data, { ...env, KRYPTNET_ADMIN_IDS: '' }, provider); accounts = learnerOnly;
    assert.equal((await request('/api/admin/learners')).status, 403);
    assert.equal((await request('/api/logout', {})).status, 200); cookie = loginCookie;
    assert.equal((await (await request('/api/account')).json()).account, null);
    await request('/auth/login'); claims = { ...claims, email_verified: false };
    assert.equal((await request('/auth/callback?code=test&state=' + params.state)).status, 403);
    await request('/auth/login?returnTo=https://untrusted.example'); claims = { ...claims, sub: 'another-learner', email: 'another@example.test', email_verified: true };
    const anotherLogin = await request('/auth/callback?code=test&state=' + params.state); assert.equal(anotherLogin.status, 302); assert.equal(anotherLogin.headers.get('location'), '/account.html');
    assert.equal((await (await request('/api/assessment')).json()).profile, null);
    assert.equal((await request('/api/certificate')).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
