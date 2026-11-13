import * as oidc from 'openid-client';
import { randomBytes, createHash } from 'node:crypto';
import { createFileRecordStore } from './record-store.js';
import { courseLabels } from './course-catalog.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const courses = new Set(Object.keys(courseLabels));

export function createAccounts(dataDir, env = process.env, providerOverride, records = createFileRecordStore(dataDir)) {
  const origin = env.NETWORK_LAB_PUBLIC_ORIGIN;
  const sameOrigin = req => req.headers.origin === (origin || (env.NODE_ENV !== 'production' ? `${env.NETWORK_LAB_HTTPS === '1' ? 'https' : 'http'}://${req.headers.host}` : null));
  const enabled = Boolean(origin && env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET);
  const admins = new Set((env.KRYPTNET_ADMIN_IDS || '').split(',').filter(Boolean));
  const pending = new Map();
  const secure = env.NETWORK_LAB_HTTPS === '1' ? '; Secure' : '';
  const read = records.read, write = records.write;
  let discovered;
  async function provider() {
    if (providerOverride) return providerOverride;
    if (!discovered) discovered = oidc.discovery(new URL(env.OIDC_ISSUER), env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET).catch(error => { discovered = undefined; throw error; });
    const config = await discovered;
    return {
      start: params => oidc.buildAuthorizationUrl(config, params),
      exchange: async (url, checks) => (await oidc.authorizationCodeGrant(config, url, { ...checks, idTokenExpected: true })).claims()
    };
  }
  async function current(req) {
    const raw = /(?:^|;\s*)kn_login=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (!raw) return null;
    const session = await read('login-' + hash(raw) + '.json');
    if (!session || session.expires < Date.now()) return null;
    return read('account-' + session.accountId + '.json');
  }
  async function record(account, type, detail = {}) {
    if (!account) return;
    return records.update('account-' + account.id + '.json', latest => {
    if (!latest) return null;
    if (type === 'course_started' && latest.courses[detail.course]) return latest;
    if (type === 'course_completed' && latest.certificates?.some(item => item.id === detail.certificateId)) return latest;
    latest.activity.push({ type, at: new Date().toISOString(), ...detail });
    latest.activity = latest.activity.slice(-100);
    if (type === 'course_started') latest.courses[detail.course] ||= { started: new Date().toISOString() };
    if (type === 'course_completed') {
      latest.courses[detail.course] = { ...latest.courses[detail.course], completed: new Date().toISOString(), certificateId: detail.certificateId };
      latest.certificates ||= [];
      if (!latest.certificates.some(item => item.id === detail.certificateId)) latest.certificates.push({ id: detail.certificateId, course: detail.course, at: new Date().toISOString() });
    }
    return latest;
    });
  }
  async function route(req, res, pathname) {
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    if (pathname === '/api/account' && req.method === 'GET') {
      let account = await current(req);
      if (account && account.lastSeen?.slice(0, 10) !== new Date().toISOString().slice(0, 10)) {
        account = await records.update('account-' + account.id + '.json', latest => {
          if (!latest) return null;
          if (latest.lastSeen?.slice(0, 10) !== new Date().toISOString().slice(0, 10)) {
            latest.lastSeen = new Date().toISOString();
            latest.activity.push({ type: 'site_visited', at: latest.lastSeen }); latest.activity = latest.activity.slice(-100);
          }
          return latest;
        });
      }
      json(200, { enabled, account: account ? { id: account.id, name: account.name, email: account.email, courses: account.courses, certificates: account.certificates || [], admin: admins.has(account.id) } : null }); return true;
    }
    if (pathname === '/auth/login' && req.method === 'GET') {
      if (!enabled) { json(503, { error: 'Sign-in is not configured. The operator must connect an identity provider.' }); return true; }
      for (const [id, value] of pending) if (value.expires < Date.now()) pending.delete(id);
      if (pending.size >= 1000) { json(503, { error: 'Sign-in is busy. Please retry.' }); return true; }
      const binding = randomBytes(32).toString('hex'), state = oidc.randomState(), nonce = oidc.randomNonce(), verifier = oidc.randomPKCECodeVerifier();
      const p = await provider();
      const url = await p.start({ redirect_uri: origin + '/auth/callback', scope: 'openid email profile', response_type: 'code', state, nonce, code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256' });
      const returnTo = new URL(req.url, origin).searchParams.get('returnTo') === 'assessment' ? '/assessment.html' : '/account.html';
      pending.set(hash(binding), { state, nonce, verifier, returnTo, expires: Date.now() + 300000 });
      res.writeHead(302, { Location: url.toString(), 'Cache-Control': 'no-store', 'Set-Cookie': `kn_oauth=${binding}; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=300${secure}` }); res.end(); return true;
    }
    if (pathname === '/auth/callback' && req.method === 'GET') {
      const binding = /(?:^|;\s*)kn_oauth=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const check = binding && pending.get(hash(binding));
      if (binding) pending.delete(hash(binding));
      if (!enabled || !check || check.expires < Date.now()) { json(400, { error: 'Sign-in expired or could not be verified. Start sign-in again.' }); return true; }
      const claims = await (await provider()).exchange(new URL(req.url, origin), { pkceCodeVerifier: check.verifier, expectedState: check.state, expectedNonce: check.nonce });
      if (!claims || claims.iss !== env.OIDC_ISSUER || typeof claims.sub !== 'string' || !claims.sub || claims.email_verified !== true || typeof claims.email !== 'string' || claims.email.length > 120) { json(403, { error: 'A verified email address is required.' }); return true; }
      const id = hash(JSON.stringify([claims.iss, claims.sub]));
      const account = await records.update('account-' + id + '.json', existing => {
      const account = existing || { id, created: new Date().toISOString(), courses: {}, activity: [] };
      account.name = String(claims.name || claims.email).slice(0, 80); account.email = claims.email;
      return account;
      });
      await record(account, 'signed_in');
      const raw = randomBytes(32).toString('hex');
      await write('login-' + hash(raw) + '.json', { accountId: id, expires: Date.now() + 8 * 3600000 });
      res.writeHead(302, { Location: check.returnTo, 'Cache-Control': 'no-store', 'Set-Cookie': [`kn_login=${raw}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`, `kn_oauth=; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=0${secure}`] }); res.end(); return true;
    }
    if (pathname === '/api/logout' && req.method === 'POST') {
      if (!sameOrigin(req)) { json(403, { error: 'A same-origin request is required.' }); return true; }
      const raw = /(?:^|;\s*)kn_login=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      if (raw) await records.remove('login-' + hash(raw) + '.json');
      res.setHeader('Set-Cookie', `kn_login=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`); json(200, { signedOut: true }); return true;
    }
    if (pathname === '/api/activity' && req.method === 'POST') {
      const account = await current(req);
      if (!account) { json(401, { error: 'Sign in to save course activity.' }); return true; }
      if (!sameOrigin(req) || !(req.headers['content-type'] || '').startsWith('application/json')) { json(403, { error: 'A same-origin JSON request is required.' }); return true; }
      let size = 0, chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 1024) { json(413, { error: 'Request too large.' }); return true; } chunks.push(chunk); }
      let input; try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { json(400, { error: 'Invalid activity.' }); return true; }
      if (!input || !courses.has(input.course) || input.type !== 'course_started' || Object.keys(input).some(key => !['type', 'course'].includes(key))) { json(400, { error: 'Invalid activity. Clients cannot award completion or certificates.' }); return true; }
      if (!account.courses[input.course]) await record(account, 'course_started', { course: input.course });
      json(200, { saved: true }); return true;
    }
    if (pathname === '/api/admin/learners' && req.method === 'GET') {
      const account = await current(req);
      if (!account || !admins.has(account.id)) { json(403, { error: 'Issuer administrator access is required.' }); return true; }
      // Server-controlled records only; no learner-supplied roles are trusted.
      const learners = await records.listAccounts();
      json(200, { learners }); return true;
    }
    return false;
  }
  return { current, route, record, enabled };
}
