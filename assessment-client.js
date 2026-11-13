import './account-nav.js';
const root = document.querySelector('#assessment-root'), earned = document.querySelector('#earned-certificate'), status = document.querySelector('#assessment-status');
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state, timer, signedIn, saving = Promise.resolve();
async function api(url, data) {
  const response = await fetch(url, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const result = await response.json(); if (!response.ok) throw Error(result.error || 'Request failed.'); return result;
}
function render() {
  const { profile, attempt, credential } = state;
  earned.hidden = !credential;
  if (credential) earned.innerHTML = `<div class="section-bar"><h2>KryptNet Professional Certificate</h2></div><div class="certificate-content"><p>Issued to <strong>${esc(credential.name)}</strong> by KryptNet LLC. Score: ${credential.score}%. Details are taken from the locked registration record.</p><a class="guide-link" id="download-certificate" href="/api/certificate">Download certificate (PDF)</a><a class="guide-link" href="verify.html?id=${credential.id}">Verify record and PDF</a><p class="certificate-note">Certificate ID: ${credential.id}. The PDF has no editable form fields. Compare it with the issuer-held record to detect external changes.</p></div>`;
  if (!profile) {
    root.innerHTML = `<section class="assessment-start"><h2>Learner Registration</h2><p>Confirm your certificate details before starting. They are locked for this session and every retake. The issuer stores your registration and assessment record. Email, organization, and learner ID are retained in the protected registration record and are not printed on the certificate. Identity and email ownership are not independently verified.</p><form id="begin-form"><label class="field">Full name<input id="learner-name" name="name" autocomplete="name" required minlength="2" maxlength="80"></label><label class="field">Email address<input id="learner-email" name="email" type="email" required maxlength="120" autocomplete="email"></label><label class="field">Organization (optional)<input name="organization" maxlength="80"></label><label class="field">Learner ID (optional)<input name="learnerId" maxlength="80"></label><label class="toggle-row"><input type="checkbox" name="confirmed" required>I confirm these details are correct and understand that they will be locked when I begin.</label><button class="primary">Confirm details and begin assessment</button></form></section>`;
    root.querySelector('h2').textContent = 'Confirm Certificate Details';
    root.querySelector('p').textContent = 'Your quiz and certificate will be linked to your signed-in account. Confirm the name to print on your certificate before starting. These details remain locked for retakes; corrections require issuer assistance. Your email is supplied by your verified sign-in account. This does not independently verify your legal identity.';
    const disclosure = document.createElement('p'); disclosure.textContent = 'Public verification reveals the certificate holder name, course, score, date, and PDF fingerprint to anyone with its certificate ID. Read the learner data notice before confirming.';
    const privacy = document.createElement('a'); privacy.href = 'privacy.html'; privacy.textContent = ' Learner data notice'; disclosure.append(privacy); document.querySelector('#begin-form').before(disclosure);
    if (signedIn) { document.querySelector('#learner-name').value = signedIn.name; document.querySelector('#learner-email').value = signedIn.email; document.querySelector('#learner-email').readOnly = true; }
    document.querySelector('#begin-form').onsubmit = async event => {
      event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button'); button.disabled = true;
      const values = Object.fromEntries(new FormData(form)); values.confirmed = values.confirmed === 'on';
      try { state = await api('/api/register', values); status.textContent = ''; render(); } catch (e) { status.textContent = e.message; button.disabled = false; }
    }; return;
  }
  const result = attempt.result;
  root.innerHTML = `<div class="locked-profile"><strong>Registered learner: ${esc(profile.name)}</strong><p>${esc(profile.email)} / ${esc(profile.organization)} / ${esc(profile.learnerId)}</p><span class="subtle">DETAILS LOCKED / CORRECTIONS REQUIRE ISSUER ASSISTANCE</span></div>` + (attempt.submitted ? `<div class="assessment-result ${result.passed ? 'passed' : 'not-passed'}" tabindex="-1"><h2>${result.passed ? 'Assessment Passed' : 'Further Study Recommended'}</h2><p><strong>${result.score}%</strong> / ${result.correct} of ${result.total} correct. Required pass mark: 80%.</p><button id="retake" type="button">Start a new attempt</button></div>` : `<div class="assessment-progress"><strong>Network Fundamentals</strong><span id="answer-progress">${Object.keys(attempt.answers).length} of 10 responses entered</span></div>`) + '<form id="quiz-form" novalidate>' + attempt.questions.map((q, i) => {
    const value = attempt.answers[q.id], r = result?.results[i];
    const input = q.type === 'number' ? `<label class="field">Numerical response<input data-answer="${q.id}" inputmode="numeric" value="${esc(value ?? '')}" ${attempt.submitted ? 'disabled' : ''}></label>` : q.options.map((option, j) => `<label class="quiz-option"><input type="radio" name="${q.id}" data-answer="${q.id}" value="${j}" ${value === j ? 'checked' : ''} ${attempt.submitted ? 'disabled' : ''}><span>${esc(option)}</span></label>`).join('');
    return `<fieldset class="quiz-question"><legend>${i + 1}. ${esc(q.prompt)}</legend>${input}${attempt.submitted ? `<div class="answer-feedback ${r.correct ? 'correct' : 'incorrect'}"><strong>${r.correct ? 'Correct' : 'Incorrect'}.</strong> ${esc(q.explanation)} <a href="guide.html#${q.topic}">Review tutorial</a></div>` : ''}</fieldset>`;
  }).join('') + (attempt.submitted ? '' : '<div class="quiz-submit"><button class="primary">Submit assessment</button><p>All questions must be answered. Grading and certificate issuance take place on the server.</p></div>') + '</form>';
  if (attempt.submitted) document.querySelector('#retake').onclick = async event => {
    const button = event.currentTarget; button.disabled = true;
    try { state = await api('/api/retake', {}); status.textContent = ''; render(); } catch (e) { status.textContent = e.message; button.disabled = false; }
  };
  else {
    const form = document.querySelector('#quiz-form');
    form.oninput = event => {
      const id = event.target.dataset.answer; if (!id) return;
      const q = attempt.questions.find(q => q.id === id); attempt.answers[id] = q.type === 'choice' ? Number(event.target.value) : event.target.value;
      document.querySelector('#answer-progress').textContent = `${Object.values(attempt.answers).filter(v => v !== '').length} of 10 responses entered`;
      clearTimeout(timer); timer = setTimeout(() => {
        const payload = { attemptId: attempt.id, answers: { ...attempt.answers } };
        saving = saving.then(() => api('/api/answers', payload)).catch(e => { status.textContent = 'Progress could not be saved: ' + e.message; });
      }, 250);
    };
    form.onsubmit = async event => {
      event.preventDefault(); clearTimeout(timer); const button = form.querySelector('button'); button.disabled = true;
      try { await saving; state = await api('/api/submit', { attemptId: attempt.id, answers: attempt.answers }); status.textContent = ''; render(); document.querySelector('.assessment-result').focus(); }
      catch (e) { status.textContent = e.message; button.disabled = false; }
    };
  }
}
async function initialise() {
  const identity = await api('/api/account');
  signedIn = identity.account;
  if (!signedIn) {
    earned.hidden = true;
    root.innerHTML = `<section class="assessment-start"><h2>Register for the Quiz</h2><p>The laboratories are available without an account. When you are ready for assessment, create a persistent learner account or sign in to an existing one.</p><ol><li>Create an account or sign in.</li><li>Confirm your certificate name and register for the quiz.</li><li>Complete the quiz and achieve at least 80%.</li><li>Download your KryptNet Professional Certificate. Your result and certificate ID remain in your account.</li></ol>${identity.enabled ? '<a class="guide-link" id="quiz-sign-in" href="/auth/login?returnTo=assessment">Create account or sign in</a>' : '<button id="quiz-sign-in" disabled>Account registration not yet available</button><p>KryptNet must connect its sign-in provider before persistent quiz registration can open. You may continue using the laboratories.</p>'}<p><a href="privacy.html">Learner data and privacy</a> · <a href="courses.html">Return to laboratories</a></p></section>`;
    return;
  }
  state = await api('/api/assessment'); render();
}
initialise().catch(error => {
  status.textContent = error.message + ' ';
  const link = document.createElement('a'); link.href = 'account.html'; link.textContent = 'Open learner account'; status.append(link);
});
