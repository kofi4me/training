import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextAssessment } from '../assessment-access.js';
import { assessedCourses, startCourseAttempt, courseAttemptView, checkGuidedExercise, gradeCourseAttempt } from '../course-assessments.js';

const repairs = {
  linux: { port: '8081', clientPort: '8081', portOccupied: true, configReadable: true, start: true, enabled: true },
  automation: { duration: '8', lock: true, atomic: true, propagate: true },
  recovery: { point: 'latest', cleanCopy: true, verify: true, target: 'staging' },
  devices: { access: true, uplink: true, routing: true },
  communications: { prefix: '26', gateway: '192.168.10.1' },
  addressing: [{ cidr: '192.0.2.64/26' }, { cidr: '198.51.100.0/27' }],
  vlans: { accessVlan: '20', engineering: true, management: false },
  routing: { specific: '198.51.100.64/26', discard: true },
  switching: { accessVlan: '10', trunk: true, routing: true },
  dhcp: { relay: true, server: true, gateway: '192.168.10.1' },
  dns: { wait: '1', authority: true },
  firewall: { profile: 'web', reverse: false },
  nat: { wait: '60', reply: '203.0.113.21' },
  monitoring: { dns: true, path: 'healthy' },
  mitm: { protocol: 'https', forwarding: true, binding: true },
  ddos: { link: '300', limiting: true, limit: '5' },
};

test('the included retake opens immediately and later attempts open after exactly 28 days', () => {
  const submittedAt = '2026-11-01T15:30:00.000Z';
  const state = { attempt: { submitted: true, submittedAt, result: { passed: false } } };
  assert.deepEqual(nextAssessment(state), { kind: 'included', number: 2 });
  state.priorAttemptCount = 1;
  const eligible = Date.parse('2026-11-29T15:30:00.000Z');
  assert.equal(nextAssessment(state, eligible - 1).kind, 'cooldown');
  assert.deepEqual(nextAssessment(state, eligible), { kind: 'paid-retake', number: 3, availableAt: new Date(eligible).toISOString() });
  state.priorAttemptCount = 2;
  state.attempt.submittedAt = new Date(eligible).toISOString();
  assert.deepEqual(nextAssessment(state, eligible), { kind: 'cooldown', number: 4, availableAt: '2026-12-27T15:30:00.000Z' });
  assert.deepEqual(nextAssessment({ ...state, credential: { id: 'existing' } }, eligible), { kind: 'complete' });
});

test('a complete practical repair with 70 percent fails and 75 percent passes', () => {
  const attempt = startCourseAttempt('dns');
  attempt.guidedComplete = true;
  const view = courseAttemptView('dns', attempt);
  const response = {
    configuration: repairs.dns,
    answers: ['TTL', 'A', 'An Ethernet trunk timeout'],
    cause: view.causes.find(item => item.startsWith('The simulation ended')),
    evidence: view.evidence.find(item => item.startsWith('The setting was saved')),
  };
  const fail = gradeCourseAttempt('dns', attempt, response);
  assert.equal(fail.score, 70);
  assert.equal(fail.passed, false);
  const pass = gradeCourseAttempt('dns', attempt, { ...response, evidence: view.evidence.find(item => item.startsWith('The A query')) });
  assert.equal(pass.score, 75);
  assert.equal(pass.passed, true);
});

test('every catalog course links to a distinct practical assessment', () => {
  const categoryPages = ['cybersecurity-courses.html', 'networking-courses.html', 'linux-courses.html'];
  const homepage = readFileSync(new URL('../courses.html', import.meta.url), 'utf8');
  assert.doesNotMatch(homepage, /href="assessment\.html/);
  const linked = categoryPages.flatMap(page => {
    assert.ok(homepage.includes(`href="${page}"`));
    const category = readFileSync(new URL('../' + page, import.meta.url), 'utf8');
    return Array.from(category.matchAll(/href="assessment\.html\?course=([a-z]+)"/g), match => match[1]);
  });
  assert.deepEqual(linked.sort(), [...assessedCourses].sort());
  assert.deepEqual(Object.keys(repairs).sort(), linked);
});

for (const id of assessedCourses) {
  test(id + ' requires a guided repair and passes both independent variants only after practical repair', () => {
    const repair = variant => Array.isArray(repairs[id]) ? repairs[id][variant] : repairs[id];
    const original = startCourseAttempt(id);
    const next = startCourseAttempt(id, original);
    assert.notEqual(next.id, original.id);
    assert.notEqual(next.variant, original.variant);
    for (const attempt of [original, next]) {
      const guided = courseAttemptView(id, attempt);
      assert.equal(guided.questions, undefined);
      assert.equal(guided.variant, undefined);
      assert.throws(() => gradeCourseAttempt(id, attempt, {}), /guided exercise/);
      const startingConfig = view => Object.fromEntries(view.scenario.fields.map(field => [field.key, field.value]));
      assert.equal(checkGuidedExercise(id, attempt, startingConfig(guided)).passed, false);
      assert.equal(checkGuidedExercise(id, attempt, repair(1 - attempt.variant)).passed, true);
      attempt.guidedComplete = true;
      const independent = courseAttemptView(id, attempt);
      assert.equal(independent.questions.length, 3);
      assert.notDeepEqual(startingConfig(independent), startingConfig(guided));
      const submitted = {
        answers: independent.questions.map(question => question.options[0]),
        cause: independent.causes[0],
        evidence: independent.evidence[0],
      };
      assert.equal(gradeCourseAttempt(id, attempt, { ...submitted, configuration: startingConfig(independent) }).passed, false);
      assert.throws(() => gradeCourseAttempt(id, attempt, { ...submitted, configuration: {} }), /configuration field/);
      const restored = gradeCourseAttempt(id, attempt, { ...submitted, configuration: repair(attempt.variant) });
      assert.equal(restored.practical, 100);
      assert.equal(restored.passed, restored.score >= 75);
    }
  });
}
