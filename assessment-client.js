import './account-nav.js';
import { assessmentPolicy, courseLabels } from './course-catalog.js';
const root = document.querySelector('#assessment-root'), earned = document.querySelector('#earned-certificate'), status = document.querySelector('#assessment-status');
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const requestedCourse = new URLSearchParams(location.search).get('course') ?? 'network';
const courseQuery = requestedCourse === 'network' ? '' : '?course=' + encodeURIComponent(requestedCourse);
const courseTitle = Object.hasOwn(courseLabels, requestedCourse) ? courseLabels[requestedCourse] : 'Course Assessment';
const modern = requestedCourse !== 'network';
const { passMark, initialPriceCents, additionalPriceCents, currency } = assessmentPolicy;
const formatPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
const initialPrice = formatPrice.format(initialPriceCents / 100);
const retryPrice = formatPrice.format(additionalPriceCents / 100);
const withoutPaymentQuery = () => history.replaceState(null, '', 'assessment.html' + courseQuery);
let state, timer, signedIn, saving = Promise.resolve();
async function api(url, data) {
  const response = await fetch(url === 'api/account' ? url : url + courseQuery, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const result = await response.json(); if (!response.ok) throw Error(result.error || 'Request failed.'); return result;
}
function renderPayment(payment, retry = false) {
  const returning = new URLSearchParams(location.search).get('payment') === 'returned';
  root.innerHTML = `<section class="assessment-start">
    <h2>${retry ? 'Pay for another attempt' : 'Pay for the ' + esc(state.course?.title || courseTitle) + ' assessment'}</h2>
    ${retry ? `<p>Your last assessment score was <strong>${esc(state.attempt.result.score)}%</strong>.</p>` : ''}
    <p>${payment.enabled
      ? `${retry ? 'Fee for one additional attempt' : 'Fee for the first attempt and one included retake'}: <strong>${esc(payment.amount)} ${esc(payment.currency)}</strong>. Continue to Authorize.Net to pay by card.`
      : 'KryptNet is setting up assessment checkout. You can continue using the practice labs.'}</p>
    ${payment.sandbox && payment.enabled ? '<p>Test checkout. Use Authorize.Net sandbox card details.</p>' : ''}
    ${payment.enabled && !returning ? '<button class="primary" type="button" id="pay-assessment">Continue to Authorize.Net</button>' : ''}
    ${payment.enabled ? `<button type="button" id="check-payment">Check payment status</button>
    <details><summary>Already paid? Verify your receipt</summary>
      <form id="confirm-payment">
        <label class="field">Authorize.Net transaction ID<input name="transactionId" inputmode="numeric" pattern="[0-9]{1,20}" maxlength="20" required></label>
        <button type="submit">Verify payment</button>
      </form>
    </details>` : ''}
    <p><a href="courses.html">Return to laboratories</a></p>
  </section>`;
  if (!payment.enabled) return;

  async function check() {
    const refreshed = await api('api/assessment');
    if (retry ? !refreshed.retry?.payment?.paid && refreshed.retry?.kind === 'paid-retake' : !refreshed.payment?.paid) return false;
    withoutPaymentQuery();
    state = refreshed;
    status.textContent = 'Payment confirmed. You can start your attempt.';
    render();
    return true;
  }
  const pay = root.querySelector('#pay-assessment');
  if (pay) pay.onclick = async () => {
    pay.disabled = true;
    try {
      const checkout = await api('api/payments/checkout', {});
      if (checkout.paid) { await check(); return; }
      const form = document.createElement('form');
      form.method = 'post';
      form.action = checkout.action;
      const token = document.createElement('input');
      token.type = 'hidden';
      token.name = 'token';
      token.value = checkout.token;
      form.append(token);
      document.body.append(form);
      form.submit();
    } catch (error) { status.textContent = error.message; pay.disabled = false; }
  };
  root.querySelector('#check-payment').onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      if (!await check()) status.textContent = 'Payment is awaiting confirmation. If you have a receipt, verify its transaction ID.';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  };
  root.querySelector('#confirm-payment').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const result = await api('api/payments/confirm', { transactionId: form.elements.transactionId.value.trim() });
      if (!result.paid || !await check()) status.textContent = 'That receipt could not confirm this assessment payment. Check the transaction ID or contact KryptNet.';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  };
  if (returning) {
    status.textContent = 'Checking payment with Authorize.Net…';
    check().then(paid => {
      if (!paid) status.textContent = 'Payment is awaiting confirmation. Check again shortly or verify your receipt.';
    }).catch(error => { status.textContent = error.message; });
  }
}

function renderChecks(checks) {
  return '<ul>' + checks.map(check => `<li>${check.ok ? 'Passed' : 'Needs repair'}: ${esc(check.label)}</li>`).join('') + '</ul>';
}

function retakeAction() {
  switch (state.retry?.kind) {
    case 'included':
      return '<p>Your first retake is included and available now.</p><button id="start-retake" type="button">Start included retake</button>';
    case 'cooldown': {
      const date = new Date(state.retry.availableAt);
      return `<p>Your next attempt costs ${retryPrice} USD and opens <time datetime="${esc(state.retry.availableAt)}">${esc(date.toLocaleString())}</time>. The four-week wait starts when you submit an unsuccessful retake.</p><button id="refresh-eligibility" type="button">Check eligibility</button>`;
    }
    case 'paid-retake':
      return '<button id="start-retake" type="button">Start another attempt</button>';
    case 'unavailable':
      return '<p>Contact KryptNet to confirm when your last attempt ended.</p>';
    default:
      return '';
  }
}

function wireRetake() {
  const start = root.querySelector('#start-retake');
  const refresh = root.querySelector('#refresh-eligibility');
  const button = start || refresh;
  if (!button) return;
  button.onclick = async () => {
    button.disabled = true;
    try {
      state = start ? await api('api/retake', {}) : await api('api/assessment');
      status.textContent = '';
      render();
    } catch (error) { status.textContent = error.message; button.disabled = false; }
  };
}

function renderCourseAttempt(attempt) {
  if (attempt.submitted) {
    const result = attempt.result;
    root.innerHTML = `<section class="assessment-result ${result.passed ? 'passed' : 'not-passed'}" tabindex="-1">
      <h2>${result.passed ? 'Assessment Passed' : 'Review and Retry'}</h2>
      <p><strong>${result.score}% overall</strong>. Knowledge ${result.knowledge}% · Practical ${result.practical}% · Explanation ${result.explanation}%.</p>
      ${renderChecks(result.checks)}
      ${result.passed ? '<p>Your certificate is ready below.</p>' : `<p>Pass every practical check and score at least ${passMark}% overall.</p>` + retakeAction()}
    </section>`;
    wireRetake();
    return;
  }
  const { scenario } = attempt;
  const guided = !attempt.guidedComplete;
  const choices = (name, label, options) => `<fieldset class="quiz-question"><legend>${esc(label)}</legend>
    ${options.map(option => `<label class="quiz-option"><input type="radio" name="${name}" value="${esc(option)}" required><span>${esc(option)}</span></label>`).join('')}</fieldset>`;
  const fields = scenario.fields.map(field => {
    const value = attempt.guidedConfiguration?.[field.key] ?? field.value;
    return typeof field.value === 'boolean'
      ? `<label class="field">${esc(field.label)}<select name="cfg-${field.key}"><option value="true" ${value ? 'selected' : ''}>Yes</option><option value="false" ${!value ? 'selected' : ''}>No</option></select></label>`
      : `<label class="field">${esc(field.label)}<input name="cfg-${field.key}" value="${esc(value)}" maxlength="64" required></label>`;
  }).join('');
  root.innerHTML = `<section class="assessment-start">
    <h2>${guided ? 'Required Guided Exercise' : 'Course Assessment'}</h2>
    <p>${esc(scenario.goal)}</p>
    <details open><summary>Observed starting conditions</summary>${renderChecks(scenario.baseline)}</details>
    ${guided && attempt.guidedResult ? '<h3>Your latest verification</h3>' + renderChecks(attempt.guidedResult.checks) : ''}
    <form id="course-attempt">
      <fieldset class="quiz-question"><legend>Repair the simulated configuration</legend>${fields}</fieldset>
      ${guided ? '' : `<h3>Knowledge assessment</h3>
        ${attempt.questions.map((question, index) => choices('q' + index, question.prompt, question.options)).join('')}
        <h3>Explain the outcome</h3>
        ${choices('cause', 'What caused the original fault?', attempt.causes)}
        ${choices('evidence', 'Which result verifies the repair?', attempt.evidence)}`}
      <button class="primary">${guided ? 'Verify guided repair' : 'Submit course assessment'}</button>
    </form>
  </section>`;
  root.querySelector('#course-attempt').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const button = form.querySelector('button');
    button.disabled = true;
    const configuration = Object.fromEntries(scenario.fields.map(field => {
      const value = values.get('cfg-' + field.key);
      return [field.key, typeof field.value === 'boolean' ? value === 'true' : value];
    }));
    const payload = { attemptId: attempt.id, configuration };
    if (!guided) {
      payload.answers = attempt.questions.map((_, index) => values.get('q' + index));
      payload.cause = values.get('cause');
      payload.evidence = values.get('evidence');
    }
    try {
      state = await api(guided ? 'api/guided' : 'api/submit', payload);
      status.textContent = guided
        ? (state.attempt.guidedComplete ? 'Guided exercise verified. The assessment is now open.' : 'Review the verification results and try again.')
        : '';
      render();
      if (!guided) root.querySelector('.assessment-result').focus();
    } catch (error) { status.textContent = error.message; button.disabled = false; }
  };
}

function render() {
  const { profile, attempt, credential } = state;
  earned.hidden = !credential;
  if (credential) earned.innerHTML = `<div class="section-bar"><h2>KryptNet Professional Certificate</h2></div><div class="certificate-content"><p>Issued to <strong>${esc(credential.name)}</strong> by KryptNet LLC. Score: ${credential.score}%. Details are taken from the locked registration record.</p><a class="guide-link" id="download-certificate" href="api/certificate${esc(courseQuery)}">Download certificate (PDF)</a><a class="guide-link" href="verify.html?id=${credential.id}">Verify record and PDF</a><p class="certificate-note">Certificate ID: ${credential.id}. The PDF has no editable form fields. Compare it with the issuer-held record to detect external changes.</p></div>`;
  if (!credential && state.payment?.required && !state.payment.paid) {
    renderPayment(state.payment);
    return;
  }
  const retryPayment = state.retry?.payment;
  if (retryPayment?.required && !retryPayment.paid) {
    renderPayment(retryPayment, true);
    return;
  }
  if (new URLSearchParams(location.search).has('payment')) withoutPaymentQuery();
  if (!profile) {
    root.innerHTML = `<section class="assessment-start"><h2>Learner Registration</h2><p>Confirm your certificate details before starting. They are locked for this session and every retake. The issuer stores your registration and assessment record. Email, organization, and learner ID are retained in the protected registration record and are not printed on the certificate. Identity and email ownership are not independently verified.</p><form id="begin-form"><label class="field">Full name<input id="learner-name" name="name" autocomplete="name" required minlength="2" maxlength="80"></label><label class="field">Email address<input id="learner-email" name="email" type="email" required maxlength="120" autocomplete="email"></label><label class="field">Organization (optional)<input name="organization" maxlength="80"></label><label class="field">Learner ID (optional)<input name="learnerId" maxlength="80"></label><label class="toggle-row"><input type="checkbox" name="confirmed" required>I confirm these details are correct and understand that they will be locked when I begin.</label><button class="learner-cta">Take Test</button></form></section>`;
    root.querySelector('h2').textContent = 'Confirm Certificate Details';
    root.querySelector('p').textContent = 'Your test and certificate will be linked to your signed-in account. Confirm the name to print on your certificate. These details remain locked for retakes.';
    const disclosure = document.createElement('p'); disclosure.textContent = 'Public verification reveals the certificate holder name, course, score, date, and PDF fingerprint to anyone with its certificate ID. Read the learner data notice before confirming.';
    const privacy = document.createElement('a'); privacy.href = 'privacy.html'; privacy.textContent = ' Learner data notice'; disclosure.append(privacy); document.querySelector('#begin-form').before(disclosure);
    if (signedIn) { document.querySelector('#learner-name').value = signedIn.name; document.querySelector('#learner-email').value = signedIn.email; document.querySelector('#learner-email').readOnly = true; root.querySelector('[name=organization]').value = signedIn.organization || ''; }
    document.querySelector('#begin-form').onsubmit = async event => {
      event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button'); button.disabled = true;
      const values = Object.fromEntries(new FormData(form)); values.confirmed = values.confirmed === 'on';
      try { state = await api('api/register', values); status.textContent = ''; render(); } catch (e) { status.textContent = e.message; button.disabled = false; }
    }; return;
  }
  if (modern) { renderCourseAttempt(attempt); return; }
  const result = attempt.result;
  root.innerHTML = `<div class="locked-profile"><strong>Registered learner: ${esc(profile.name)}</strong><p>${esc(profile.email)} / ${esc(profile.organization)} / ${esc(profile.learnerId)}</p><span class="subtle">DETAILS LOCKED / CORRECTIONS REQUIRE ISSUER ASSISTANCE</span></div>` + (attempt.submitted ? `<div class="assessment-result ${result.passed ? 'passed' : 'not-passed'}" tabindex="-1"><h2>${result.passed ? 'Assessment Passed' : 'Further Study Recommended'}</h2><p><strong>${result.score}%</strong> / ${result.correct} of ${result.total} correct. Required pass mark: ${passMark}%.</p>${retakeAction()}</div>` : `<div class="assessment-progress"><strong>Network Fundamentals</strong><span id="answer-progress">${Object.keys(attempt.answers).length} of 10 responses entered</span></div>`) + '<form id="quiz-form" novalidate>' + attempt.questions.map((q, i) => {
    const value = attempt.answers[q.id], r = result?.results[i];
    const input = q.type === 'number' ? `<label class="field">Numerical response<input data-answer="${q.id}" inputmode="numeric" value="${esc(value ?? '')}" ${attempt.submitted ? 'disabled' : ''}></label>` : q.options.map((option, j) => `<label class="quiz-option"><input type="radio" name="${q.id}" data-answer="${q.id}" value="${j}" ${value === j ? 'checked' : ''} ${attempt.submitted ? 'disabled' : ''}><span>${esc(option)}</span></label>`).join('');
    return `<fieldset class="quiz-question"><legend>${i + 1}. ${esc(q.prompt)}</legend>${input}${attempt.submitted ? `<div class="answer-feedback ${r.correct ? 'correct' : 'incorrect'}"><strong>${r.correct ? 'Correct' : 'Incorrect'}.</strong> ${esc(q.explanation)} <a href="guide.html#${q.topic}">Review tutorial</a></div>` : ''}</fieldset>`;
  }).join('') + (attempt.submitted ? '' : '<div class="quiz-submit"><button class="primary">Submit assessment</button><p>All questions must be answered. Grading and certificate issuance take place on the server.</p></div>') + '</form>';
  if (attempt.submitted) wireRetake();
  else {
    const form = document.querySelector('#quiz-form');
    form.oninput = event => {
      const id = event.target.dataset.answer; if (!id) return;
      const q = attempt.questions.find(q => q.id === id); attempt.answers[id] = q.type === 'choice' ? Number(event.target.value) : event.target.value;
      document.querySelector('#answer-progress').textContent = `${Object.values(attempt.answers).filter(v => v !== '').length} of 10 responses entered`;
      clearTimeout(timer); timer = setTimeout(() => {
        const payload = { attemptId: attempt.id, answers: { ...attempt.answers } };
        saving = saving.then(() => api('api/answers', payload)).catch(e => { status.textContent = 'Progress could not be saved: ' + e.message; });
      }, 250);
    };
    form.onsubmit = async event => {
      event.preventDefault(); clearTimeout(timer); const button = form.querySelector('button'); button.disabled = true;
      try { await saving; state = await api('api/submit', { attemptId: attempt.id, answers: attempt.answers }); status.textContent = ''; render(); document.querySelector('.assessment-result').focus(); }
      catch (e) { status.textContent = e.message; button.disabled = false; }
    };
  }
}

function showTestInstructions() {
  const section = document.createElement('section');
  section.className = 'test-instructions';
  section.setAttribute('aria-labelledby', 'test-instructions-title');
  section.innerHTML = `<h2 id="test-instructions-title">Before you take the test</h2>
    <ol>
      <li>Confirm the name to print on your certificate.</li>
      <li>${modern ? 'Finish the guided exercise before opening the independent test. Then answer the knowledge questions, repair the simulation, and choose the evidence that verifies your repair.' : 'Answer all ten questions before submitting the quiz.'}</li>
      <li>${modern ? `Score at least ${passMark}% and pass every practical check.` : `Score at least ${passMark}% to pass.`}</li>
    </ol>`;
  root.before(section);
}
async function initialise() {
  if (!Object.hasOwn(courseLabels, requestedCourse)) throw new Error('Assessment course not found. Choose a course from the catalog.');
  if (modern) {
    document.title = courseTitle + ' | KryptNet Training Labs';
    document.querySelector('.assessment-page h1').textContent = courseTitle + ' Assessment';
    document.querySelector('.assessment-page .eyebrow').textContent = 'COURSE ASSESSMENT';
    document.querySelector('.assessment-intro').textContent = `Complete the guided exercise, then submit your knowledge answers, practical repair, and explanation. Earn a certificate by passing every practical check and scoring at least ${passMark}% overall.`;
    document.querySelector('.assessment-disclosure').textContent = 'Confirm your certificate name before starting. KryptNet grades your work on the server. The certificate documents completion of an unsupervised, simulated assessment.';
    document.querySelector('[aria-current="page"]').href = 'assessment.html' + courseQuery;
    document.querySelector('.assessment-page footer').textContent = 'KryptNet Training Labs';
    document.querySelector('aside.assessment-page').hidden = true;
  }
  const identity = await api('api/account');
  signedIn = identity.account;
  if (!signedIn) {
    earned.hidden = true;
    const signInUrl = 'auth/login?returnTo=assessment' + (modern ? '&amp;course=' + encodeURIComponent(requestedCourse) : '');
    root.innerHTML = `<section class="assessment-start"><h2>Register for the Assessment</h2><p>The practice labs are available without an account. The ${initialPrice} USD assessment fee includes one retake. After that, each additional attempt costs ${retryPrice} USD and becomes available four weeks after the last unsuccessful submission.</p><ol><li>Create an account or sign in.</li><li>Pay for this assessment and confirm your certificate name.</li><li>${modern ? 'Complete the guided exercise and pass the course assessment.' : 'Complete the quiz and achieve at least ' + passMark + '%.'}</li><li>Download your certificate. Your result and certificate ID remain in your account.</li></ol><a class="learner-cta" id="quiz-sign-in" href="${signInUrl}">Create account or sign in</a><p><a href="privacy.html">Learner data and privacy</a> · <a href="courses.html">Return to laboratories</a></p></section>`;
    return;
  }
  showTestInstructions();
  state = await api('api/assessment'); render();
}
initialise().catch(error => {
  status.textContent = error.message + ' ';
  const link = document.createElement('a'); link.href = 'account.html'; link.textContent = 'Open learner account'; status.append(link);
});
