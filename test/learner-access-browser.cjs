const { chromium } = require(process.argv[2]);
const assert = require('node:assert/strict');
const { mkdtemp } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

(async () => {
  Object.assign(process.env, {
    NETWORK_LAB_DATA_DIR: await mkdtemp(path.join(tmpdir(), 'kn-learner-ui-')),
    NETWORK_LAB_PUBLIC_ORIGIN: '', NETWORK_LAB_HTTPS: '',
    OIDC_ISSUER: '', OIDC_CLIENT_ID: '', OIDC_CLIENT_SECRET: '',
    TRAINING_SMTP_HOST: 'mail.example.test', TRAINING_SMTP_USER: 'trainer@example.test',
    TRAINING_SMTP_PASSWORD: 'test-only', TRAINING_SMTP_CONFIG: '',
    TRAINING_CODE_SECRET: 'ca'.repeat(32),
  });
  const { createLabServer } = await import('../server.js');
  const { courseLabels } = await import('../course-catalog.js');
  let email;
  const server = createLabServer({ production: false, basePath: '/training' }, {
    deliverCode: async message => { email = message; },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(10000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}/training`;
    await page.goto(base + '/assessment.html?course=ddos');
    const entry = page.getByRole('link', { name: 'Create account or sign in' });
    assert.match(await entry.evaluate(link => getComputedStyle(link).backgroundImage), /linear-gradient/);
    await entry.click();
    await page.waitForURL(base + '/sign-in.html?returnTo=assessment&course=ddos');
    const registration = page.locator('#request-code');
    const address = 'new.learner@example.test';
    await registration.getByLabel('Full name').fill('New Learner');
    await registration.getByLabel('Organization').fill('KryptNet');
    await registration.getByLabel('Email address').fill(address);
    await registration.getByRole('button', { name: 'Send verification code' }).click();
    const verify = page.locator('#verify-code');
    await verify.getByLabel('Verification code').waitFor();
    assert.equal(email.email, address);
    const password = 'A strong passphrase for this training account';
    await verify.getByLabel('Verification code').fill(email.code);
    await verify.getByLabel('Choose a password').fill(password);
    await verify.getByRole('button', { name: 'Verify and create account' }).click();
    await page.getByRole('status').filter({ hasText: 'Account created' }).waitFor();
    const login = page.locator('#learner-login');
    assert.equal(await login.getByLabel('Email address').inputValue(), address);
    await login.getByLabel('Password').fill(password);
    await login.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(base + '/assessment.html?course=ddos');
    const takeTest = page.getByRole('button', { name: 'Take Test' });
    const instructions = page.getByRole('region', { name: 'Before you take the test' });
    await instructions.waitFor();
    assert.match(await instructions.innerText(), /75%/);
    assert.equal(await page.getByLabel('Organization').inputValue(), 'KryptNet');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole('checkbox').check();
    await takeTest.click();
    await page.getByRole('heading', { name: 'Required Guided Exercise' }).waitFor();
    for (const [id, title] of Object.entries(courseLabels)) {
      if (id === 'ddos') continue;
      await page.goto(base + '/assessment.html?course=' + id);
      await instructions.waitFor();
      await takeTest.waitFor();
      if (id !== 'network') assert.ok((await page.title()).includes(title), id);
    }
    assert.deepEqual(pageErrors, []);
    console.log('Verified the colorful entry link, signup, separate sign-in, DDoS test start, and instructions for every course.');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
