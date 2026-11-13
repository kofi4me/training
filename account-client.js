import { courseLabels as labels } from './course-catalog.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const status = document.querySelector('#account-status'), content = document.querySelector('#account-content');
try {
  const response = await fetch('api/account'); if (!response.ok) throw Error('The account service is unavailable.');
  const { account } = await response.json();
  if (!account) content.innerHTML = '<p>Sign in to access your course records and certificates.</p><a class="learner-cta" href="auth/login">Create account or sign in</a><p><a href="privacy.html">Learner data and privacy</a></p>';
  else {
    content.innerHTML = `<h2>${esc(account.name)}</h2><p>${esc(account.email)}</p><p>Account ID: <code>${esc(account.id)}</code></p><button id="sign-out">Sign out</button><h2>Course Records</h2><div class="table-wrap"><table><thead><tr><th>Course</th><th>Started</th><th>Assessed completion</th><th>Certificate ID</th></tr></thead><tbody>${Object.entries(account.courses).map(([id, record]) => `<tr><td>${esc(labels[id])}</td><td>${esc(record.started || '')}</td><td>${esc(record.completed || 'Not recorded')}</td><td>${record.certificateId ? `<a href="verify.html?id=${encodeURIComponent(record.certificateId)}">${esc(record.certificateId)}</a>` : 'Not issued'}</td></tr>`).join('')}</tbody></table></div>`;
    document.querySelector('#sign-out').onclick = async () => { const r = await fetch('api/logout', { method: 'POST' }); if (r.ok) location.reload(); else status.textContent = 'Sign-out failed. Please retry.'; };
    if (account.certificates?.length) {
      const history = document.createElement('section'); history.innerHTML = '<h2>Certificate History</h2><ul>' + account.certificates.map(item => `<li><a href="verify.html?id=${encodeURIComponent(item.id)}">${esc(item.id)}</a> / ${esc(labels[item.course])} / ${esc(item.at)}</li>`).join('') + '</ul>'; content.append(history);
    }
    if (account.admin) {
      const r = await fetch('api/admin/learners'); if (!r.ok) throw Error('Issuer records could not be loaded.');
      const { learners } = await r.json(); document.querySelector('#issuer-panel').hidden = false;
      const summary = document.createElement('p'); summary.textContent = `${learners.length} registered accounts; ${learners.reduce((sum, person) => sum + (person.certificates?.length || 0), 0)} certificate records.`; document.querySelector('#issuer-panel h2').after(summary);
      document.querySelector('#learner-records').innerHTML = learners.map(person => `<tr><td>${esc(person.name)}<br>${esc(person.email)}</td><td>${esc(person.lastSeen || '')}</td><td>${Object.entries(person.courses).map(([id, record]) => `${esc(labels[id])}: ${record.completed ? 'Assessed pass' : 'Started'}<br>${esc(record.certificateId || '')}`).join('<br>')}</td><td>${person.activity.slice(-10).reverse().map(item => `${esc(item.at)}: ${esc(item.type)}`).join('<br>')}</td></tr>`).join('');
    }
  }
} catch (error) { status.textContent = error.message; }
