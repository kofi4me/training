import { bank, course, selectQuestions, grade, validName, validRecord } from './assessment-core.js';
import { drawCertificate, certificatePDF } from './certificate.js';
const root = document.querySelector('#assessment-root'), earned = document.querySelector('#earned-certificate'), status = document.querySelector('#assessment-status');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const storageKey = `network-workshop-assessment-${course.id}-v1`;
let attempt = null, credential = null;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved?.attempt && validName(saved.attempt.name)) {
    grade(saved.attempt.ids, saved.attempt.answers);
    attempt = { name: saved.attempt.name.trim(), ids: saved.attempt.ids, answers: saved.attempt.answers || {}, submitted: saved.attempt.submitted === true };
  }
  if (validRecord(saved?.credential)) credential = saved.credential;
} catch { /* Invalid or unavailable storage starts a fresh assessment. */ }
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify({ attempt, credential })); }
  catch { status.textContent = 'Browser storage is unavailable. Download an earned certificate before leaving this page.'; }
}
function certificateSection() {
  earned.hidden = !credential;
  if (!credential) return;
  earned.innerHTML = `<div class="section-bar"><h2>${escape(course.certificateTitle)}</h2><span class="subtle">SELF-ASSESSED</span></div><div class="certificate-content"><p>A passing completion record is available for <strong>${escape(credential.name)}</strong>, issued by ${escape(course.issuer)}. The certificate remains available after retakes.</p><canvas id="certificate-preview" role="img" aria-label="Certificate of completion for ${escape(credential.name)}"></canvas><button id="download-certificate" class="primary">Download certificate (PDF)</button><p class="certificate-note">Certificate ID: <code>${escape(credential.id)}</code>. This identifier labels a local record; it is not a verification code.</p></div>`;
  drawCertificate(document.querySelector('#certificate-preview'), credential).catch(() => { status.textContent = 'Certificate artwork could not load. Reload the page and try again.'; });
  document.querySelector('#download-certificate').onclick = async event => {
    const button = event.currentTarget; button.disabled = true;
    try {
      const bytes = await certificatePDF(credential);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = `network-fundamentals-${credential.id}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000); status.textContent = 'Your certificate PDF has been prepared for download.';
    } catch (error) { status.textContent = `Certificate download failed: ${error.message}`; }
    finally { button.disabled = false; }
  };
}
function render() {
  if (!attempt) {
    root.innerHTML = '<section class="assessment-start"><h2>Before You Begin</h2><p>Complete the laboratory activities and review the learning guide. The quiz draws four subnetting questions and six questions on configuration, forwarding, investigation, or course scope. Retakes are permitted; question selections may vary.</p><form id="begin-form"><label class="field">Learner name<input id="learner-name" name="learner" autocomplete="name" required minlength="2" maxlength="160" placeholder="Name to appear on the certificate"></label><p class="field-note">Enter 2-80 characters. Use the name you wish to display; no identity verification is performed.</p><button class="primary" type="submit">Begin assessment</button></form></section>';
    document.querySelector('#begin-form').onsubmit = event => {
      event.preventDefault(); const name = document.querySelector('#learner-name').value.trim();
      if (!validName(name)) { status.textContent = 'Enter a learner name of 2-80 characters without control characters.'; return; }
      attempt = { name, ids: selectQuestions(), answers: {}, submitted: false }; status.textContent = ''; save(); render();
    };
  } else {
    const result = grade(attempt.ids, attempt.answers);
    const heading = attempt.submitted ? `<div class="assessment-result ${result.passed ? 'passed' : 'not-passed'}" tabindex="-1"><h2>${result.passed ? 'Assessment Passed' : 'Further Study Recommended'}</h2><p><strong>${result.score}%</strong> / ${result.correct} of ${result.total} correct. ${result.passed ? 'You have met the 75% pass requirement.' : 'A score of 75% is required. Review the feedback and return to the relevant tutorial before attempting a new question set.'}</p><button id="retake" type="button">Start a new attempt</button></div>` : `<div class="assessment-progress"><strong>${escape(attempt.name)}</strong><span id="answer-progress">${result.results.filter(r => r.answered).length} of 10 answered</span></div>`;
    root.innerHTML = heading + '<form id="quiz-form" novalidate>' + attempt.ids.map((id, i) => {
      const q = bank.find(q => q.id === id), r = result.results[i], value = attempt.answers[id];
      const input = q.type === 'number' ? `<label class="field">Numerical response<input name="${id}" data-answer="${id}" inputmode="numeric" value="${escape(value ?? '')}" ${attempt.submitted ? 'disabled' : ''}></label>` : q.options.map((option, optionIndex) => `<label class="quiz-option"><input type="radio" name="${id}" data-answer="${id}" value="${optionIndex}" ${value === optionIndex ? 'checked' : ''} ${attempt.submitted ? 'disabled' : ''}><span>${escape(option)}</span></label>`).join('');
      const feedback = attempt.submitted ? `<div class="answer-feedback ${r.correct ? 'correct' : 'incorrect'}"><strong>${r.correct ? 'Correct' : 'Incorrect'}.</strong> ${escape(q.explanation)} <a href="guide.html#${q.topic}">Review the tutorial</a></div>` : '';
      return `<fieldset class="quiz-question" id="question-${id}"><legend><span class="question-number">${i + 1}.</span> ${escape(q.prompt)}</legend>${input}${feedback}</fieldset>`;
    }).join('') + (attempt.submitted ? '' : '<div class="quiz-submit"><button class="primary" type="submit">Submit assessment</button><button id="restart" type="button">Discard attempt</button><p>All ten questions must be answered. Submission fixes the answers for this attempt.</p></div>') + '</form>';
    if (!attempt.submitted) {
      const form = document.querySelector('#quiz-form');
      form.oninput = event => {
        const id = event.target.dataset.answer; if (!id) return;
        const q = bank.find(q => q.id === id);
        attempt.answers[id] = q.type === 'choice' ? Number(event.target.value) : event.target.value;
        save(); document.querySelector('#answer-progress').textContent = `${grade(attempt.ids, attempt.answers).results.filter(r => r.answered).length} of 10 answered`;
      };
      form.onsubmit = event => {
        event.preventDefault(); const result = grade(attempt.ids, attempt.answers);
        if (!result.complete) {
          status.textContent = 'Answer every question. Numerical responses must contain whole numbers only.';
          document.querySelector(`#question-${result.results.find(r => !r.answered).id} input`).focus(); return;
        }
        attempt.submitted = true;
        if (result.passed) credential = { revision: course.revision, name: attempt.name, ids: [...attempt.ids], answers: { ...attempt.answers }, date: new Date().toISOString(), id: 'NW-' + crypto.randomUUID().toUpperCase() };
        save(); status.textContent = ''; render(); document.querySelector('.assessment-result').focus();
      };
      document.querySelector('#restart').onclick = () => { if (confirm('Discard your current quiz answers? Any earned certificate will remain available.')) { attempt = null; save(); render(); } };
    } else document.querySelector('#retake').onclick = () => { attempt = { name: attempt.name, ids: selectQuestions(), answers: {}, submitted: false }; save(); render(); root.scrollIntoView({ behavior: 'smooth' }); };
  }
  certificateSection();
}
render();
