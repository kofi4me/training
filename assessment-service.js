import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { bank, course, selectQuestions, grade, validName } from './assessment-core.js';
import { createFileRecordStore } from './record-store.js';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function createAssessmentService(root, dataDir = path.join(root, '.assessment-data'), onEvent = () => {}, records = createFileRecordStore(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
  const issuing = new Map();
  const pending = new Map();
  async function lock(key) {
    if (!key) return () => {};
    const previous = pending.get(key);
    let release;
    const next = new Promise(resolve => { release = resolve; });
    pending.set(key, next);
    if (previous) await previous;
    return () => { release(); if (pending.get(key) === next) pending.delete(key); };
  }
  const store = records.write, load = records.read;
  function publicState(s) {
    const a = s.attempt;
    return { profile: s.profile, credential: s.credential, attempt: a ? {
      id: a.id, submitted: a.submitted, answers: a.answers,
      questions: a.ids.map(id => { const q = bank.find(q => q.id === id); return { id, prompt: q.prompt, type: q.type, options: q.options, topic: q.topic, ...(a.submitted ? { explanation: q.explanation, correctAnswer: q.answer } : {}) }; }),
      result: a.submitted ? grade(a.ids, a.answers) : null
    } : null };
  }
  const fail = (status, message) => Object.assign(new Error(message), { status });
  async function body(req) {
    if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw fail(415, 'Use application/json.');
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 16000) throw fail(413, 'Request is too large.'); chunks.push(chunk); }
    try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value; } catch { throw fail(400, 'Invalid JSON object.'); }
  }
  async function makePDF(record) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.env.NETWORK_LAB_PYTHON || 'python', [path.join(root, 'server-certificate.py')], { windowsHide: true });
      const buffers = []; let errors = '';
      const timeout = setTimeout(() => { child.kill(); reject(fail(503, 'Certificate generation timed out.')); }, 30000);
      child.stdout.on('data', data => buffers.push(data)); child.stderr.on('data', data => { errors += data; });
      child.on('error', () => { clearTimeout(timeout); reject(fail(503, 'Certificate generation requires Python and ReportLab on the server.')); });
      child.on('close', code => { clearTimeout(timeout); if (code === 0) resolve(Buffer.concat(buffers)); else { console.error('Certificate generation failed:', errors); reject(fail(503, 'Certificate generation is unavailable.')); } });
      child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify(record));
    });
  }
  return async function handle(req, res, pathname) {
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
    const token = /(?:^|;\s*)nw_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    const release = await lock(req.account ? 'account:' + req.account.id : token);
    try {
      if (req.method === 'POST' && req.headers.origin !== (process.env.NETWORK_LAB_PUBLIC_ORIGIN || `${process.env.NETWORK_LAB_HTTPS === '1' ? 'https' : 'http'}://${req.headers.host}`)) throw fail(403, 'A same-origin request is required.');
      if (req.method === 'GET' && pathname.startsWith('/api/verify/')) {
        const id = pathname.slice('/api/verify/'.length);
        if (!/^KN-[A-F0-9-]{36}$/.test(id)) throw fail(404, 'Certificate not found.');
        const record = await load(id + '.json'); if (!record) throw fail(404, 'Certificate not found.');
        return json(200, { id: record.id, name: record.name, course: course.title, issuer: course.issuer, score: record.score, date: record.date, sha256: record.sha256 });
      }
      let key = req.account ? hash('account:' + req.account.id) : token ? hash(token) : null;
      let s = key ? await load(key + '.json') : null;
      if (!s || (!req.account && Date.now() > s.expires)) {
        if (req.method !== 'GET' || pathname !== '/api/assessment') throw fail(401, 'Session expired. Reload the assessment page.');
        const raw = randomBytes(32).toString('hex'); if (!req.account) key = hash(raw);
        s = { expires: Date.now() + 7 * 86400000, profile: null, attempt: null, credential: null };
        if (!req.account) res.setHeader('Set-Cookie', `nw_session=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.NETWORK_LAB_HTTPS === '1' ? '; Secure' : ''}`);
      }
      const persist = () => store(key + '.json', s);
      const publishCompletion = async () => {
        if (!s.pendingCompletion) return;
        await onEvent(req, 'course_completed', s.pendingCompletion);
        delete s.pendingCompletion;
        await persist();
      };
      await publishCompletion();
      if (req.method === 'GET' && pathname === '/api/assessment') { await persist(); return json(200, publicState(s)); }
      if (req.method === 'GET' && pathname === '/api/certificate') {
        if (!s.credential) throw fail(403, 'A server-graded passing attempt is required.');
        const credential = s.credential;
        const file = path.join(dataDir, credential.id + '.pdf');
        if (!existsSync(file)) {
          if (!issuing.has(credential.id) && issuing.size >= 2) throw fail(503, 'Certificate service is busy. Please retry shortly.');
          if (!issuing.has(credential.id)) issuing.set(credential.id, (async () => {
            const bytes = await makePDF(credential);
            writeFileSync(file + '.tmp', bytes, { mode: 0o600 }); renameSync(file + '.tmp', file);
            credential.sha256 = hash(bytes); await store(credential.id + '.json', credential);
            await records.update(key + '.json', current => {
              if (current?.credential?.id === credential.id) current.credential.sha256 = credential.sha256;
              return current;
            });
            await onEvent(req, 'certificate_generated', { course: 'network', certificateId: credential.id });
          })().finally(() => issuing.delete(credential.id)));
          await issuing.get(credential.id);
        }
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${credential.id}.pdf"`, 'Cache-Control': 'no-store' }); res.end(readFileSync(file)); return;
      }
      if (req.method !== 'POST') throw fail(404, 'Unknown endpoint.');
      const input = await body(req);
      if (pathname === '/api/register') {
        if (s.profile) throw fail(409, 'Learner details are locked for this session.');
        if (Object.keys(input).some(k => !['name', 'email', 'organization', 'learnerId', 'confirmed'].includes(k))) throw fail(400, 'Unexpected registration fields.');
        const { name, email, organization = '', learnerId = '', confirmed } = input;
        if (req.account && email !== req.account.email) throw fail(400, 'Use the verified email address of your signed-in account.');
        if (!validName(name) || typeof email !== 'string' || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || [organization, learnerId].some(v => typeof v !== 'string' || [...v].length > 80 || /[\u0000-\u001f\u007f]/.test(v)) || confirmed !== true) throw fail(400, 'Enter a valid name and email, and confirm the registration details.');
        s.profile = { name: name.trim(), email: email.trim(), organization: organization.trim(), learnerId: learnerId.trim() };
        s.attempt = { id: randomUUID(), ids: selectQuestions(), answers: {}, submitted: false }; await persist(); return json(201, publicState(s));
      }
      if (!s.profile || !s.attempt) throw fail(403, 'Registration is required.');
      if (pathname === '/api/retake') {
        if (Object.keys(input).length) throw fail(400, 'Retakes cannot change learner details.');
        if (!s.attempt.submitted) throw fail(409, 'Complete the current attempt first.');
        s.attempt = { id: randomUUID(), ids: selectQuestions(), answers: {}, submitted: false }; await persist(); return json(200, publicState(s));
      }
      if (!['/api/answers', '/api/submit'].includes(pathname)) throw fail(404, 'Unknown endpoint.');
      if (Object.keys(input).some(k => !['attemptId', 'answers'].includes(k)) || input.attemptId !== s.attempt.id || s.attempt.submitted) throw fail(409, 'The attempt is locked or has changed. Reload the assessment.');
      if (!input.answers || typeof input.answers !== 'object' || Array.isArray(input.answers) || Object.keys(input.answers).some(id => !s.attempt.ids.includes(id)) || Object.values(input.answers).some(v => !(typeof v === 'string' && v.length < 32) && !Number.isInteger(v))) throw fail(400, 'Invalid answers.');
      const result = grade(s.attempt.ids, input.answers);
      if (pathname === '/api/submit' && !result.complete) throw fail(400, 'Answer every question with a valid response.');
      s.attempt.answers = { ...input.answers };
      if (pathname === '/api/submit') {
        s.attempt.submitted = true;
        if (result.passed) { s.credential = { id: 'KN-' + randomUUID().toUpperCase(), name: s.profile.name, profile: { ...s.profile }, score: result.score, date: new Date().toISOString(), course: course.id }; await store(s.credential.id + '.json', s.credential); s.pendingCompletion = { course: 'network', certificateId: s.credential.id }; }
      }
      await persist(); await publishCompletion(); json(200, publicState(s));
    } catch (error) { json(error.status || 500, { error: error.status ? error.message : 'The assessment service encountered an error.' }); }
    finally { release(); }
  };
}
