const { chromium } = require(process.argv[2]);
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const repairs = require('./systems-repairs.cjs');

(async () => {
  process.env.NETWORK_LAB_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'kn-systems-test-'));
  const { createLabServer } = await import('../server.js');
  const server = createLabServer({ production:false, origin:'', proxy:'' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ channel:'chrome', headless:true });
    const page = await browser.newPage({ viewport:{ width:390, height:844 }, reducedMotion:'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(15000);
    const catalogue = page.locator('#systems-administration');
    await page.goto(`${base}/courses.html`);
    assert.equal(await catalogue.locator('.course-launch').count(), 3);
    await fs.mkdir('artifacts', { recursive:true });
    for (const [course, labs] of Object.entries(repairs)) {
      await catalogue.locator(`[href="systems.html?course=${course}"]`).click();
      await page.locator(`.training-nav [data-course="${course}"][aria-current="page"]`).waitFor();
      assert.equal(await page.locator('.systems-lesson').count(), 3);
      assert.equal(await page.locator('[data-shared-replay]').count(), 3);
      assert.equal(await page.locator('.workbench-icon-path svg').count(), 9, course);
      for (const [id, repair] of Object.entries(labs)) {
        const lab = page.locator(`#${id}`);
        const evidence = lab.locator('[data-workbench-results]');
        await lab.locator('[data-next]').focus();
        await page.keyboard.press('Enter');
        assert.equal(await lab.locator('.device-line .active').count(), 1, id);
        assert.doesNotMatch(await lab.locator('.module-result').innerText(), /undefined/);
        const timeline = lab.locator('.replay-timeline');
        await lab.locator('.replay-events summary').click();
        await timeline.getByRole('button').last().click();
        assert.match(await evidence.innerText(), /Verification incomplete/, id);
        await lab.locator('[data-baseline]').click();
        for (const [key, value] of Object.entries(repair)) {
          const input = lab.locator(`[name="${key}"]`);
          if (typeof value === 'boolean') await input.setChecked(value);
          else if (await input.evaluate(el => el.tagName) === 'SELECT') await input.selectOption(value);
          else await input.fill(value);
        }
        assert.equal(await evidence.innerText(), '', id);
        await timeline.getByRole('button').last().click();
        assert.match(await evidence.innerText(), /Verification passed/, id);
        assert.match(await evidence.innerText(), /Baseline: needs attention/, id);
        if (id === 'account-provisioning') {
          assert.match(await evidence.innerText(), /ana and devon have distinct UIDs/);
          await lab.screenshot({ path:'artifacts/systems-linux-mobile.png' });
          await lab.locator('[name="addGuest"]').check();
          await timeline.getByRole('button').last().click();
          assert.match(await evidence.innerText(), /Verification incomplete/);
        }
        if (id === 'recovery-capstone') {
          await page.setViewportSize({ width:1360, height:900 });
          await lab.screenshot({ path:'artifacts/systems-recovery-desktop.png' });
          await page.setViewportSize({ width:390, height:844 });
        }
        await lab.locator('[data-restore]').click();
        assert.equal(await evidence.innerText(), '', id);
      }
      for (const width of [390, 1360]) {
        await page.setViewportSize({ width, height:844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${course} ${width}`);
      }
      await page.setViewportSize({ width:390, height:844 });
      await page.getByRole('link', { name:'Homepage', exact:true }).click();
    }
    assert.deepEqual(errors, []);
    console.log('Systems Administration: all 3 courses and 9 failure/repair flows passed, with keyboard replay, baseline, reset and responsive checks.');
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
