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
import { courseLabels } from '../course-catalog.js';
import { createLabServer } from '../server.js';

test('account sessions persist, role checks hold, and only server grading records completion', async () => {
  const data = await mkdtemp(path.join(tmpdir(), 'kn-accounts-'));
  const issuer = 'https://identity.example'; const sub = 'test-learner';
  const id = createHash('sha256').update(JSON.stringify([issuer, sub])).digest('hex');
  let params, claims = { iss: issuer, sub, name: 'Test Learner', email: 'learner@example.test', email_verified: true };
  const provider = { start: values => { params = values; return new URL('https://identity.example/authorize'); }, exchange: async (url, checks) => { assert.equal(url.origin + url.pathname, params.redirect_uri); assert.equal(url.searchParams.get('state'), checks.expectedState); assert.equal(checks.expectedNonce, params.nonce); assert.ok(checks.pkceCodeVerifier); return claims; } };
  const env = { OIDC_ISSUER: issuer, OIDC_CLIENT_ID: 'test', OIDC_CLIENT_SECRET: 'test', KRYPTNET_ADMIN_IDS: id };
  let accounts;
  const assessment = createAssessmentService(path.resolve('.'), data, (req, type, detail) => accounts.record(req.account, type, detail));
  const server = http.createServer(async (req, res) => { try { const pathname = new URL(req.url, env.NETWORK_LAB_PUBLIC_ORIGIN).pathname.replace(/^\/training\//, '/'); if (await accounts.route(req, res, pathname)) return; req.account = await accounts.current(req); if (!req.account) { res.writeHead(401); res.end(); return; } await assessment(req, res, pathname); } catch { res.writeHead(400); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); env.NETWORK_LAB_PUBLIC_ORIGIN = `http://127.0.0.1:${server.address().port}`;
  accounts = createAccounts(data, env, provider);
  let cookie = '';
  async function request(route, body) { const response = await fetch(env.NETWORK_LAB_PUBLIC_ORIGIN + route, { redirect: 'manual', method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, Origin: env.NETWORK_LAB_PUBLIC_ORIGIN, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); if (response.headers.getSetCookie().length) cookie = response.headers.getSetCookie().map(v => v.split(';')[0]).join('; '); return response; }
  try {
    assert.equal((await request('/api/admin/learners')).status, 403);
    const accountPage = await request('/auth/login?returnTo=assessment&course=ddos');
    assert.equal(accountPage.headers.get('location'), '/sign-in.html?returnTo=assessment&course=ddos');
    assert.equal((await request('/auth/provider?returnTo=assessment')).status, 302);
    const callback = '/auth/callback?code=test&state=' + params.state;
    const signedInResponse = await request(callback); assert.equal(signedInResponse.status, 302); assert.equal(signedInResponse.headers.get('location'), '/assessment.html'); const loginCookie = cookie;
    assert.equal((await request(callback)).status, 400); cookie = loginCookie;
    let state = await (await request('/api/account')).json(); assert.equal(state.account.id, id); assert.equal(state.account.admin, true);
    accounts = createAccounts(data, env, provider); assert.equal((await (await request('/api/account')).json()).account.id, id);
    assert.equal((await request('/api/activity', { type: 'course_completed', course: 'network' })).status, 400);
    assert.equal((await request('/api/activity', { type: 'course_started', course: 'network' })).status, 200);
    for (const course of Object.keys(courseLabels).filter(course => course !== 'network')) {
      assert.equal((await request('/api/activity', { type: 'course_started', course })).status, 200);
    }
    assert.equal((await request('/api/activity', { type: 'course_started', course: 'not-a-course' })).status, 400);
    state = await (await request('/api/account')).json(); assert.deepEqual(Object.keys(state.account.courses).sort(), Object.keys(courseLabels).sort());
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
    await request('/auth/provider'); claims = { ...claims, email_verified: false };
    assert.equal((await request('/auth/callback?code=test&state=' + params.state)).status, 403);
    await request('/auth/provider?returnTo=https://untrusted.example'); claims = { ...claims, sub: 'another-learner', email: 'another@example.test', email_verified: true };
    const anotherLogin = await request('/auth/callback?code=test&state=' + params.state); assert.equal(anotherLogin.status, 302); assert.equal(anotherLogin.headers.get('location'), '/account.html');
    assert.equal((await request('/auth/provider?returnTo=assessment&course=dns')).status, 302);
    const courseLogin = await request('/auth/callback?code=test&state=' + params.state);
    assert.equal(courseLogin.status, 302);
    assert.equal(courseLogin.headers.get('location'), '/assessment.html?course=dns');
    assert.equal((await (await request('/api/assessment')).json()).profile, null);
    assert.equal((await request('/api/certificate')).status, 403);

    accounts = createAccounts(data, { ...env, NETWORK_LAB_BASE_PATH: '/training', NETWORK_LAB_HTTPS: '1' }, provider);
    const websiteLogin = await request('/training/auth/provider?returnTo=assessment&course=dns');
    assert.equal(websiteLogin.status, 302);
    assert.equal(params.redirect_uri, env.NETWORK_LAB_PUBLIC_ORIGIN + '/training/auth/callback');
    assert.match(websiteLogin.headers.get('set-cookie'), /Path=\/training\/auth;.*; Secure/);
    const websiteCallback = await request('/training/auth/callback?code=test&state=' + params.state);
    assert.equal(websiteCallback.status, 302);
    assert.equal(websiteCallback.headers.get('location'), '/training/assessment.html?course=dns');
    assert.match(websiteCallback.headers.getSetCookie()[0], /Path=\/training\/;.*; Secure/);
    assert.equal((await (await request('/training/api/account')).json()).account.email, claims.email);
    const logout = await request('/training/api/logout', {});
    assert.match(logout.headers.get('set-cookie'), /Path=\/training\/; Max-Age=0; Secure/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('email verification, course sign-in and password reset work under the deployed prefix', async () => {
  const email = 'new.learner@example.test';
  const id = createHash('sha256').update(JSON.stringify(['training-email', email])).digest('hex');
  const env = {
    NETWORK_LAB_DATA_DIR: await mkdtemp(path.join(tmpdir(), 'kn-learner-email-')),
    NETWORK_LAB_PUBLIC_ORIGIN: '',
    NETWORK_LAB_HTTPS: '',
    OIDC_ISSUER: '', OIDC_CLIENT_ID: '', OIDC_CLIENT_SECRET: '',
    TRAINING_SMTP_HOST: 'mail.example.test', TRAINING_SMTP_USER: 'trainer@example.test',
    TRAINING_SMTP_PASSWORD: 'test-only', TRAINING_SMTP_CONFIG: '',
    TRAINING_CODE_SECRET: 'cd'.repeat(32), KRYPTNET_ADMIN_IDS: id,
  };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const emails = [];
  const server = createLabServer({ production: false, basePath: '/training' }, { deliverCode: async message => { emails.push(message); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  function request(url, body, headers = {}) {
    return fetch(origin + '/training' + url, { redirect: 'manual', method: body ? 'POST' : 'GET',
      headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  const password = 'A steady passphrase for the training labs';
  const login = { email, password, returnTo: 'assessment', course: 'ddos' };
  try {
    assert.equal((await request('/auth/login?returnTo=assessment&course=ddos')).headers.get('location'), '/training/sign-in.html?returnTo=assessment&course=ddos');
    assert.equal((await request('/sign-in.html')).status, 200);
    assert.equal((await request('/learner-credentials.js')).status, 404);
    assert.equal((await request('/api/learner/login', login)).status, 401);
    const registration = { email: email.toUpperCase(), purpose: 'register' };
    assert.equal((await request('/api/learner/code', registration, { Origin: 'https://other.example' })).status, 403);
    const { challenge } = await (await request('/api/learner/code', registration)).json();
    assert.equal(emails.length, 1);
    assert.equal(emails[0].email, email);
    assert.equal((await request('/api/learner/code', registration)).status, 429);
    const verification = { ...registration, challenge, password, name: 'New Learner', organization: 'KryptNet' };
    const incorrect = emails[0].code === '000000' ? '111111' : '000000';
    assert.equal((await request('/api/learner/verify', { ...verification, code: incorrect })).status, 400);
    const verified = await request('/api/learner/verify', { ...verification, code: emails[0].code });
    assert.equal(verified.status, 200);
    assert.equal(verified.headers.get('set-cookie'), null);
    assert.equal((await request('/api/learner/verify', { ...verification, code: emails[0].code })).status, 400);
    const signedIn = await request('/api/learner/login', login);
    assert.equal(signedIn.status, 200);
    assert.equal((await signedIn.json()).redirect, '/training/assessment.html?course=ddos');
    const session = signedIn.headers.get('set-cookie');
    assert.match(session, /HttpOnly; SameSite=Lax; Path=\/training\//);
    const cookie = { Cookie: session.split(';')[0] };
    const account = await (await request('/api/account', undefined, cookie)).json();
    assert.equal(account.account.organization, 'KryptNet');
    assert.equal(account.account.localAuth, undefined);
    const admin = await (await request('/api/admin/learners', undefined, cookie)).json();
    assert.equal(admin.learners[0].localAuth, undefined);
    const reset = { email, purpose: 'reset' };
    const resetRequest = await (await request('/api/learner/code', reset)).json();
    const newPassword = 'Another strong passphrase for the labs';
    assert.equal((await request('/api/learner/verify', { ...reset, ...resetRequest, code: emails[1].code, password: newPassword })).status, 200);
    assert.equal((await (await request('/api/account', undefined, cookie)).json()).account, null);
    assert.equal((await request('/api/learner/login', login)).status, 401);
    assert.equal((await request('/api/learner/login', { ...login, password: newPassword })).status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
