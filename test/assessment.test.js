import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bank, course, selectQuestions, grade, validRecord, validName } from '../assessment-core.js';
test('question selections contain ten unique questions with balanced coverage', () => {
  for (let i = 0; i < 20; i++) {
    const ids = selectQuestions(); assert.equal(new Set(ids).size, 10);
    assert.equal(ids.filter(id => bank.find(q => q.id === id).topic === 'subnetting').length, 4);
  }
});
test('80 percent passes, 70 fails, incomplete answers cannot pass', () => {
  const ids = bank.slice(0, 10).map(q => q.id);
  const answers = Object.fromEntries(ids.map(id => { const q = bank.find(q => q.id === id); return [id, q.type === 'number' ? String(q.answer) : q.answer]; }));
  const wrong = id => { const q = bank.find(q => q.id === id); return q.type === 'number' ? '-1' : (q.answer + 1) % q.options.length; };
  answers[ids[9]] = wrong(ids[9]); answers[ids[8]] = wrong(ids[8]);
  assert.equal(grade(ids, answers).score, 80); assert.equal(grade(ids, answers).passed, true);
  answers[ids[7]] = wrong(ids[7]); assert.equal(grade(ids, answers).passed, false);
  delete answers[ids[0]]; assert.equal(grade(ids, answers).complete, false);
});
test('bad sets, non-numeric inputs, and invalid certificate records are rejected', () => {
  assert.throws(() => grade(['missing'], {}));
  const ids = bank.slice(0, 10).map(q => q.id);
  assert.equal(grade(ids, { capacity26: '62 addresses' }).results[0].answered, false);
  assert.equal(validRecord({ score: 100 }), false);
  assert.equal(validName('A'), false); assert.equal(validName('Learner Example'), true);
  assert.equal(validName('A'.repeat(81)), false);
  const answers = Object.fromEntries(bank.slice(0, 10).map(q => [q.id, q.type === 'number' ? String(q.answer) : q.answer]));
  const record = { revision: course.revision, id: 'NW-12345678-1234-1234-1234-123456789ABC', date: '2026-10-31T18:00:00Z', name: 'Learner Example', ids, answers };
  assert.equal(validRecord(record), true); record.date = 'not a date'; assert.equal(validRecord(record), false);
});
