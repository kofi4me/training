const { chromium } = require(process.argv[2]);
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4317/index.html', { waitUntil: 'domcontentloaded' });
    await page.locator('#lesson-select option').first().waitFor({state:'attached'});assert.equal(await page.locator('#lesson-select option').count(), 8);
    const original = await page.evaluate(() => localStorage.getItem('network-workshop-v1'));
    await page.locator('#lesson-complete').check();
    await page.locator('#lesson-next').click();
    assert.equal(await page.locator('#lesson-select').inputValue(), '1');
    await page.reload();await page.waitForFunction(()=>document.querySelector('#lesson-select')?.value==='1');assert.equal(await page.locator('#lesson-select').inputValue(), '1');
    assert.match(await page.locator('.lesson-note').textContent(), /1 of 8/);
    await page.locator('#lesson-tool').click();
    assert.equal(await page.evaluate(() => document.activeElement.textContent.includes('Subnet workbench')), true);
    for (let i = 0; i < 8; i++) {
      await page.locator('#lesson-select').selectOption(String(i));
      assert.match(await page.locator('.lesson-columns').textContent(), /Expected observation/);
      assert.match(await page.locator('.lesson-columns').textContent(), /Interpretation/);
      const href = await page.locator('.lesson-links a').first().getAttribute('href');
      const response = await page.request.get('http://127.0.0.1:4317/' + href.split('#')[0]);
      assert.ok((await response.text()).includes('id="' + href.split('#')[1] + '"'));
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('network-workshop-v1')), original);
    await page.locator('#lesson-select').selectOption('0');
    await page.locator('.lesson-path').screenshot({ path: path.join(__dirname, '../artifacts/class-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('.lesson-path').screenshot({ path: path.join(__dirname, '../artifacts/class-mobile.png') });
    await page.goto('http://127.0.0.1:4317/guide.html');
    assert.equal(await page.locator('#local-tests').count(), 1); assert.equal(await page.locator('#messaging').count(), 1);
    const order = await page.locator('article > section').evaluateAll(nodes => nodes.map(n => n.id));
    assert.ok(order.indexOf('investigation') < order.indexOf('assessment'));
    assert.ok(order.indexOf('assessment') < order.indexOf('builder'));
    assert.deepEqual(errors, []);
    console.log('Class checks passed: eight lessons, persistence, self-reported markers, tool navigation, tutorial anchors, unchanged network, course order, mobile layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
