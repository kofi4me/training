import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { validName } from './assessment-core.js';
import { createRateLimiter } from './server-security.js';
import { learnerMailConfigured, sendLearnerCode } from './learner-mail.js';

const derive = promisify(scrypt);
const passwordOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const codeLifetime = 10 * 60 * 1000;
const hash = value => createHash('sha256').update(value).digest('hex');
const error = (status, message) => Object.assign(new Error(message), { status });
const emailPattern = /^[^\s@<>(),;:"\\\u0000-\u001f\u007f]+@[^\s@<>(),;:"\\\u0000-\u001f\u007f]+\.[^\s@<>(),;:"\\\u0000-\u001f\u007f]+$/;
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validPassword = value => typeof value === 'string' && value.length <= 256 && [...value].length <= 128;
const accountId = email => hash(JSON.stringify(['training-email', email]));
const digest = (secret, nonce, code) => createHmac('sha256', secret).update(nonce + ':' + code).digest('hex');

async function readJSON(req) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw error(415, 'Use application/json.');
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 4096) throw error(413, 'The account request is too large.');
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw error(400, 'Invalid account request.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'Invalid account request.');
  return body;
}

export function createLearnerCredentials(records, env, deliver = message => sendLearnerCode(env, message), now = Date.now) {
  const enabled = /^[a-f0-9]{64}$/i.test(env.TRAINING_CODE_SECRET || '') && learnerMailConfigured(env);
  const secret = enabled ? Buffer.from(env.TRAINING_CODE_SECRET, 'hex') : null;
  const allow = createRateLimiter({ now });
  let hashing = 0;
  let sending = 0;

  async function passwordHash(password, salt) {
    if (hashing >= 4) throw error(429, 'Sign-in is busy. Try again shortly.');
    hashing++;
    try { return await derive(password, Buffer.from(salt, 'hex'), 32, passwordOptions); }
    finally { hashing--; }
  }

  async function requestCode(email, purpose, ip) {
    if (!allow('mail:ip:' + ip, 40, 600000) || !allow('mail:email:' + email, 4, 1800000) || sending >= 4) {
      throw error(429, 'Too many code requests. Please wait before trying again.');
    }
    sending++;
    try {
      const id = accountId(email);
      const account = await records.read('account-' + id + '.json');
      const nonce = randomBytes(24).toString('hex');
      const code = String(randomInt(1000000)).padStart(6, '0');
      const key = hash('training-code:' + purpose + ':' + id) + '.json';
      const sentAt = now();
      const eligible = purpose === 'register' ? !account : Boolean(account?.localAuth);
      await records.update(key, previous => {
        if (previous?.sentAt > sentAt - 60000) throw error(429, 'Wait one minute before requesting another code.');
        return { nonce, sentAt, expires: sentAt + codeLifetime, attempts: 5, digest: digest(secret, nonce, code),
          eligible, previousVersion: account?.localAuth?.version };
      });
      if (eligible) {
        try { await deliver({ email, purpose, code }); }
        catch {
          console.error('{"event":"training_verification_email_failed"}');
          throw error(503, 'The verification email could not be sent. Please try again in a minute.');
        }
      }
      return { challenge: nonce };
    } finally { sending--; }
  }

  async function verify(email, purpose, input) {
    const { challenge, code, password, name, organization = '' } = input;
    if (typeof challenge !== 'string' || !/^[a-f0-9]{48}$/.test(challenge) ||
        typeof code !== 'string' || !/^\d{6}$/.test(code)) throw error(400, 'Enter the six-digit email code.');
    if (!validPassword(password) || [...password].length < 15 || !password.trim()) {
      throw error(400, 'Choose a password of 15 to 128 characters.');
    }
    if (purpose === 'register' && (!validName(name) || typeof organization !== 'string' ||
        [...organization].length > 80 || /[\u0000-\u001f\u007f]/.test(organization))) {
      throw error(400, 'Enter your name and a valid organization, if applicable.');
    }
    const id = accountId(email);
    const key = hash('training-code:' + purpose + ':' + id) + '.json';
    const verified = await records.update(key, current => {
      if (current?.nonce !== challenge || current.expires <= now() || current.attempts < 1) return null;
      const matches = timingSafeEqual(Buffer.from(current.digest, 'hex'), Buffer.from(digest(secret, challenge, code), 'hex'));
      if (!matches || !current.eligible) return { ...current, attempts: current.attempts - 1, verified: false };
      return { ...current, verified: true };
    });
    if (!verified?.verified) throw error(400, 'The code is incorrect or expired. Request a new code if needed.');
    const salt = randomBytes(16).toString('hex');
    const passwordDigest = (await passwordHash(password, salt)).toString('hex');
    const localAuth = { salt, hash: passwordDigest, version: challenge };
    const saved = await records.update('account-' + id + '.json', existing => {
      if (existing?.localAuth?.version === challenge) return existing;
      if (purpose === 'reset') {
        if (!existing?.localAuth || existing.localAuth.version !== verified.previousVersion) return null;
        return { ...existing, localAuth };
      }
      if (existing) return null;
      return { id, name: name.trim(), email, organization: organization.trim(), localAuth,
        created: new Date(now()).toISOString(), courses: {}, activity: [] };
    });
    if (!saved) throw error(409, 'The account has changed. Start again or sign in.');
    await records.update(key, current => current?.nonce === challenge ? { sentAt: current.sentAt } : null);
    return { verified: true };
  }

  async function signIn(email, password, ip) {
    if (!allow('login:ip:' + ip, 60) || !allow('login:email:' + email, 10, 900000)) {
      throw error(429, 'Too many sign-in attempts. Try again later.');
    }
    if (!validPassword(password)) throw error(401, 'Incorrect email or password.');
    const account = await records.read('account-' + accountId(email) + '.json');
    const credential = account?.localAuth;
    const actual = await passwordHash(password, credential?.salt || '0'.repeat(32));
    if (!credential || !timingSafeEqual(actual, Buffer.from(credential.hash, 'hex'))) {
      throw error(401, 'Incorrect email or password.');
    }
    return account;
  }

  async function route(req, res, pathname, ip, { sameOrigin, newSession, returnTo }) {
    if (!['/api/learner/code', '/api/learner/verify', '/api/learner/login'].includes(pathname)) return false;
    const json = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    try {
      if (req.method !== 'POST') throw error(405, 'Use POST for learner account actions.');
      if (!sameOrigin(req)) throw error(403, 'A same-origin request is required.');
      if (!enabled) throw error(503, 'Learner accounts are awaiting email setup.');
      const input = await readJSON(req);
      const email = normalizeEmail(input.email);
      if (email.length > 120 || !emailPattern.test(email)) throw error(400, 'Enter a valid email address.');
      if (pathname === '/api/learner/login') {
        const account = await signIn(email, input.password, ip);
        res.setHeader('Set-Cookie', await newSession(account));
        json(200, { redirect: returnTo(input) });
      } else {
        if (!['register', 'reset'].includes(input.purpose)) throw error(400, 'Choose an account action.');
        const result = pathname === '/api/learner/code'
          ? await requestCode(email, input.purpose, ip)
          : await verify(email, input.purpose, input);
        json(200, result);
      }
    } catch (failure) {
      if (!failure.status) throw failure;
      json(failure.status, { error: failure.message });
    }
    return true;
  }

  return { enabled, route };
}
