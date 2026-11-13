import { createHash } from 'node:crypto';
import { assessmentPolicy } from './course-catalog.js';

export function assessmentAccountKey(accountId, courseId) {
  const scope = 'account:' + accountId + (courseId === 'network' ? '' : ':course:' + courseId);
  return createHash('sha256').update(scope).digest('hex');
}

export function nextAssessment(state, now = Date.now()) {
  if (state?.credential || state?.attempt?.result?.passed) return { kind: 'complete' };
  if (!state?.attempt) return { kind: 'initial', number: 1 };
  if (!state.attempt.submitted) return { kind: 'in-progress' };
  const number = 2 + (state.priorAttemptCount || 0);
  if (number === 2) return { kind: 'included', number };
  const submittedAt = Date.parse(state.attempt.submittedAt);
  if (!Number.isFinite(submittedAt)) return { kind: 'unavailable' };
  const eligibleTime = submittedAt + assessmentPolicy.waitDays * 86400000;
  return {
    kind: now < eligibleTime ? 'cooldown' : 'paid-retake',
    number,
    availableAt: new Date(eligibleTime).toISOString(),
  };
}
