import test from 'node:test';
import assert from 'node:assert/strict';
import { courseForLocation, courseLabels } from '../course-catalog.js';
import { systemsLabs } from '../systems-labs.js';
import repairs from './systems-repairs.cjs';

const cases = Object.entries(systemsLabs).flatMap(([course, labs]) => labs.map(lab => {
  const start = Object.fromEntries(lab.fields.map(field => [field.key, field.value]));
  return [lab, start, { ...start, ...repairs[course][lab.id] }];
}));
const run = (id, override) => {
  const [lab,, repaired] = cases.find(([lab]) => lab.id === id);
  return lab.run({ ...repaired, ...override });
};

for (const [lab, start, repair] of cases) test(`${lab.id}: starting fault and verified repair`, () => {
  assert.ok(lab.run(start).checks.some(check => !check.ok));
  const result = lab.run(repair);
  assert.deepEqual(result, lab.run(repair));
  assert.ok(result.checks.every(check => check.ok), JSON.stringify(result.checks));
  assert.ok(result.events.every(frame => frame.node >= 0 && frame.node < lab.nodes.length && frame.message));
});

test('account creation rejects collisions and verifies membership, search and set-group-ID independently', () => {
  for (const override of [{ operator:'root' }, { analyst:'ana' }, { group:'guest' }, { mode:'2780' }, { group:'a;id' }]) {
    const result = run('account-provisioning', override);
    assert.equal(result.checks[0].ok, false);
    assert.equal(result.events.length, 1);
  }
  assert.deepEqual(run('account-provisioning', { fresh:false }).checks.map(c => c.ok), [true,false,true,false]);
  assert.deepEqual(run('account-provisioning', { mode:'0770' }).checks.map(c => c.ok), [true,true,true,false]);
  assert.equal(run('account-provisioning', { addGuest:true }).checks[2].ok, false);
  assert.equal(run('account-provisioning', { ownerGroup:'root' }).checks[1].ok, false);
});

test('read-only file does not protect its name in a writable parent, and service start differs from enable', () => {
  assert.deepEqual(run('linux-permissions', { directory:'0770' }).checks.map(c => c.ok), [true,false,true]);
  assert.equal(run('linux-permissions', { directory:'0740' }).checks[0].ok, false);
  assert.deepEqual(run('linux-service', { enabled:false }).checks.map(c => c.ok), [true,false,true]);
  assert.deepEqual(run('linux-service', { start:false }).checks.map(c => c.ok), [false,true,true]);
  assert.equal(run('linux-service', { clientPort:'8080' }).checks[0].ok, false);
});

test('automation checks input errors, dry run, and concurrency as separate conditions', () => {
  assert.deepEqual(run('automation-log-audit', { skip:false }).facts.at(-1), ['Exit code', 2]);
  assert.deepEqual(run('automation-log-audit', { threshold:'3' }).facts.at(-1), ['Exit code', 0]);
  assert.equal(run('automation-inventory', { apply:false }).facts[0][1], 0);
  assert.equal(run('automation-inventory', { validInput:false }).facts[0][1], 0);
  assert.equal(run('automation-inventory', { validInput:false, requirePreflight:false }).facts[0][1], 1);
  assert.equal(run('automation-inventory', { strategy:'append' }).facts[1][1], 1);
  assert.deepEqual(run('automation-scheduled-job', { duration:'5' }).checks.map(c => c.ok), [false,true,true]);
  assert.equal(run('automation-scheduled-job', { atomic:false }).checks[1].ok, false);
});

test('recovery rejects corrupt chains, unsafe writes, and premature cutover', () => {
  assert.deepEqual(run('recovery-budget', { interval:'30' }).checks.map(c => c.ok), [false,true,true]);
  assert.deepEqual(run('recovery-chain', { cleanCopy:false }).checks.map(c => c.ok), [false,false,true]);
  assert.deepEqual(run('recovery-chain', { target:'live' }).checks.map(c => c.ok), [true,true,false]);
  assert.deepEqual(run('recovery-chain', { point:'full' }).checks.map(c => c.ok), [false,true,true]);
  for (const override of [{ source:'online' }, { isolate:false }, { serviceAccess:false }, { serviceEnabled:false }, { automation:'append' }, { probe:false }]) {
    assert.deepEqual(run('recovery-capstone', override).facts.at(-1), ['Cutover', 'Not promoted']);
  }
});

test('Systems Administration activity identifiers are stable and isolated from the networking routes', () => {
  for (const id of Object.keys(systemsLabs)) {
    assert.ok(courseLabels[id]);
    assert.equal(courseForLocation('/systems.html', `?course=${id}`), id);
    assert.equal(courseForLocation('/fundamentals.html', `?course=${id}`), null);
  }
  assert.equal(courseForLocation('/systems.html', ''), 'linux');
  assert.equal(courseForLocation('/systems.html', '?course=ddos'), null);
});
