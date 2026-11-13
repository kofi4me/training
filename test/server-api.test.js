import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { bank } from '../assessment-core.js';
import { createAssessmentService } from '../assessment-service.js';
test('issuer API locks registration, grades on server, protects issuance, and fingerprints PDFs', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dir = await mkdtemp(path.join(tmpdir(), 'network-assessment-test-'));
  const handler = createAssessmentService(root, dir);
  const server = http.createServer((req, res) => handler(req, res, new URL(req.url, 'http://localhost').pathname));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`; let cookie;
  async function request(route, data, extra = {}) {
    const res = await fetch(base + route, { method: data === undefined ? 'GET' : 'POST', headers: { Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extra }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
    return res;
  }
  try {
    assert.equal((await request('/api/certificate')).status, 401);
    await request('/api/assessment');
    assert.equal((await request('/api/certificate')).status, 403);
    assert.equal((await request('/api/register', { name: 'Sample Learner' })).status, 400);
    const profile = { name: 'Sample Learner', email: 'sample@example.test', organization: 'Training Department', learnerId: 'LEARNER-001', confirmed: true };
    assert.equal((await request('/api/register', profile, { Origin: 'https://foreign.example' })).status, 403);
    const response = await request('/api/register', profile); assert.equal(response.status, 201);
    let state = await response.json();
    assert.equal(state.attempt.questions[0].correctAnswer, undefined);
    assert.equal((await request('/api/register', { ...profile, name: 'Other Learner' })).status, 409);
    const answers = Object.fromEntries(state.attempt.questions.map(q => { const actual = bank.find(b => b.id === q.id); return [q.id, q.type === 'number' ? String(actual.answer) : actual.answer]; }));
    assert.equal((await request('/api/submit', { attemptId: state.attempt.id, answers, score: 100, name: 'Other Learner' })).status, 409);
    const submissions = await Promise.all([request('/api/submit', { attemptId: state.attempt.id, answers }), request('/api/submit', { attemptId: state.attempt.id, answers })]);
    assert.deepEqual(submissions.map(response => response.status).sort(), [200, 409]);
    state = await submissions.find(response => response.status === 200).json();
    assert.equal(state.attempt.result.score, 100); assert.equal(state.credential.name, profile.name);
    assert.equal((await request('/api/answers', { attemptId: state.attempt.id, answers: {} })).status, 409);
    const cert = await request('/api/certificate'); assert.equal(cert.status, 200, await cert.clone().text());
    const bytes = Buffer.from(await cert.arrayBuffer()); assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
    const artifact = path.join(root, 'artifacts'); await mkdir(artifact, { recursive: true }); await writeFile(path.join(artifact, 'certificate-server-example.pdf'), bytes);
    const publicRecord = await (await request('/api/verify/' + state.credential.id)).json();
    assert.equal(publicRecord.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(publicRecord.email, undefined);
    assert.equal((await request('/api/retake', { name: 'Other Learner' })).status, 400);
    state = await (await request('/api/retake', {})).json(); assert.equal(state.profile.name, profile.name);
    assert.ok(state.credential);
    const reloaded = createAssessmentService(root, dir);
    server.removeAllListeners('request'); server.on('request', (req, res) => reloaded(req, res, new URL(req.url, base).pathname));
    assert.equal((await (await request('/api/assessment')).json()).profile.name, profile.name);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
