import { assessmentPolicy, courseLabels } from './course-catalog.js';

const params = new URLSearchParams(location.search);
const course = Object.hasOwn(courseLabels, params.get('course')) ? params.get('course') : null;
const destination = { returnTo: params.get('returnTo') === 'assessment' ? 'assessment' : 'account', course };
const heading = document.querySelector('#access-heading');
const status = document.querySelector('#access-status');
const requestForm = document.querySelector('#request-code');
const verifyForm = document.querySelector('#verify-code');
const loginForm = document.querySelector('#learner-login');
const registration = document.querySelector('#registration-fields');
const buttons = [...document.querySelectorAll('[data-mode]')];
let mode = 'register';
let pending;

async function api(path, data) {
  const response = await fetch(path, data ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  } : {});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The account request failed.');
  return result;
}

function show(next, message = '') {
  mode = next;
  const verifying = next === 'verify';
  const action = verifying ? pending.purpose : next;
  requestForm.hidden = next === 'login' || verifying;
  verifyForm.hidden = !verifying;
  loginForm.hidden = next !== 'login';
  registration.hidden = next === 'reset';
  registration.disabled = next === 'reset';
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.mode === action));
  heading.textContent = { register: 'Create your account', login: 'Sign in', reset: 'Reset your password', verify: 'Verify your email' }[next];
  status.textContent = message;
  if (!verifying) pending = undefined;
  heading.focus();
}

function onSubmit(form, action) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    const values = Object.fromEntries(new FormData(form));
    const navigation = [...buttons, document.querySelector('#forgot-password'), document.querySelector('#change-email')];
    button.disabled = true;
    for (const item of navigation) item.disabled = true;
    status.textContent = '';
    try { await action(values); }
    catch (error) { status.textContent = error.message; }
    finally {
      button.disabled = false;
      for (const item of navigation) item.disabled = false;
    }
  });
}

for (const button of buttons) button.onclick = () => { verifyForm.reset(); loginForm.elements.password.value = ''; show(button.dataset.mode); };
document.querySelector('#forgot-password').onclick = () => {
  requestForm.elements.email.value = loginForm.elements.email.value;
  show('reset');
};
document.querySelector('#change-email').onclick = () => { verifyForm.reset(); show(pending.purpose); };

onSubmit(requestForm, async values => {
  const purpose = mode;
  const result = await api('api/learner/code', { email: values.email, purpose });
  pending = { ...values, purpose, challenge: result.challenge };
  document.querySelector('#confirm-code').textContent = purpose === 'reset' ? 'Verify and reset password' : 'Verify and create account';
  show('verify', 'If this address is eligible, check your inbox for a six-digit code. It expires in 10 minutes.');
  verifyForm.elements.code.focus();
});

onSubmit(verifyForm, async values => {
  await api('api/learner/verify', { ...pending, ...values });
  const purpose = pending.purpose;
  loginForm.elements.email.value = pending.email;
  verifyForm.reset();
  show('login', purpose === 'reset' ? 'Password updated. Sign in to continue.' : 'Account created. Sign in to continue.');
});

onSubmit(loginForm, async values => {
  const result = await api('api/learner/login', { ...values, ...destination });
  location.assign(result.redirect);
});

try {
  if (destination.returnTo === 'assessment') {
    const title = document.querySelector('#selected-course');
    title.textContent = courseLabels[course || 'network'];
    title.hidden = false;
    const fee = document.querySelector('#selected-fee');
    fee.textContent = `$${assessmentPolicy.initialPriceCents / 100} USD includes the first test and one retake.`;
    fee.hidden = false;
  }
  const identity = await api('api/account');
  if (identity.account) {
    location.replace(destination.returnTo === 'assessment' ? 'assessment.html' + (course ? '?course=' + encodeURIComponent(course) : '') : 'account.html');
  } else {
    document.querySelector('#request-fields').disabled = !identity.methods?.email;
    document.querySelector('#login-fields').disabled = !identity.methods?.email;
    document.querySelector('#provider-option').hidden = !identity.methods?.provider;
    const provider = new URL('auth/provider', location.href);
    if (destination.returnTo === 'assessment') provider.searchParams.set('returnTo', 'assessment');
    if (course) provider.searchParams.set('course', course);
    document.querySelector('#provider-link').href = provider.href;
    if (!identity.methods?.email) status.textContent = 'Email registration and password sign-in are awaiting setup.';
  }
} catch (error) {
  status.textContent = error.message;
}
