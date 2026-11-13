const { chromium } = require(process.argv[2]);
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'kn-account-ui-'));
  const id = 'a'.repeat(64), raw = 'b'.repeat(64), session = crypto.createHash('sha256').update(raw).digest('hex');
  const cert = 'KN-11111111-1111-4111-8111-111111111111';
  await fs.writeFile(path.join(data, `account-${id}.json`), JSON.stringify({ id, name: 'Test <Learner>', email: 'test@example.test', created: new Date().toISOString(), courses: { network: { started: new Date().toISOString(), completed: new Date().toISOString(), certificateId: cert } }, activity: [{ type: 'signed_in', at: new Date().toISOString() }] }));
  await fs.writeFile(path.join(data, `login-${session}.json`), JSON.stringify({ accountId: id, expires: Date.now() + 3600000 }));
  process.env.NETWORK_LAB_DATA_DIR = data; process.env.KRYPTNET_ADMIN_IDS = id;
  const { createLabServer } = await import('../server.js');
  const server = createLabServer({ production: false, origin: '', proxy: '' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext(); await context.addCookies([{ name: 'kn_login', value: raw, url: base, httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + '/account.html'); await page.locator('#issuer-panel:not([hidden])').waitFor();
    assert.equal(await page.locator('#account-content h2').first().textContent(), 'Test <Learner>');
    assert.match(await page.locator('#learner-records').innerText(), /Assessed pass/);
    assert.equal(await page.locator('#account-content a').first().textContent(), cert);
    await fs.mkdir('artifacts', { recursive: true }); await page.screenshot({ path: 'artifacts/account-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Account page overflows mobile viewport');
    await page.screenshot({ path: 'artifacts/account-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    const catalogue = await import('../course-catalog.js');
    for (const course of Object.keys(catalogue.courseLabels).filter(id => id !== 'network')) {
      const query = ['mitm', 'ddos'].includes(course) ? '/security.html?lab=' : '/fundamentals.html?course=';
      const event = page.waitForResponse(response => response.url().endsWith('/api/activity') && response.request().method() === 'POST');
      await page.goto(base + query + course);
      assert.equal((await event).status(), 200, 'Course opening not recorded: ' + course);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile course header overflows: ' + course);
    }
    const selectedCourse = page.waitForResponse(response => response.url().endsWith('/api/activity') && response.request().postDataJSON()?.course === 'mitm');
    await page.locator('#security-lab').selectOption('mitm'); assert.equal((await selectedCourse).status(), 200);
    await page.screenshot({ path: 'artifacts/tracked-course-mobile.png', fullPage: true });
    const records = await (await page.request.get(base + '/api/account')).json();
    assert.equal(Object.keys(records.account.courses).length, 14);
    assert.deepEqual(errors, []);
    const anonymous = await browser.newPage(); await anonymous.goto(base + '/account.html');
    await anonymous.getByText('Account sign-in awaits connection', { exact: false }).waitFor();
    assert.equal((await anonymous.request.get(base + '/api/admin/learners')).status(), 403);
    console.log('Account UI passed: isolated seeded fixture, issuer visibility, escaped identity, certificate IDs, all 13 distinct course openings, anonymous denial, desktop/mobile layout. No live provider was tested.');
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
