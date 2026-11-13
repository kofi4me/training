import { courseForLocation } from './course-catalog.js';
const header = document.querySelector('.topbar');
if (header) {
  const link = document.createElement('a'); link.href = 'account.html'; link.className = 'guide-link'; link.textContent = 'My learning'; header.append(link);
}
export async function recordActivity() {
try {
  const r = await fetch('/api/account', { signal: AbortSignal.timeout(5000) });
  if (r.ok && (await r.json()).account) {
    const course = courseForLocation(location.pathname, location.search, location.hash);
    if (course) await fetch('/api/activity', { method: 'POST', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'course_started', course }) });
  }
} catch { /* Local practice remains usable during an account-service outage. */ }
}
void recordActivity();
window.addEventListener('hashchange', () => { void recordActivity(); });
