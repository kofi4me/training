const { chromium } = require(process.argv[2]);
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const repairs = require('./systems-repairs.cjs');

(async () => {
  process.env.NETWORK_LAB_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'kn-systems-test-'));
  const { createLabServer } = await import('../server.js');
  const server = createLabServer({ production:false, origin:'', proxy:'', basePath:'/training' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/training`;
  let browser;
  try {
    browser = await chromium.launch({ channel:'chrome', headless:true });
    const page = await browser.newPage({ viewport:{ width:390, height:844 }, reducedMotion:'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(25000);
    const catalogue = page.locator('#systems-administration');
    await page.goto(`${base}/courses.html`);
    await page.getByRole('link', { name:'Explore Linux Courses', exact:true }).click();
    assert.equal(await catalogue.locator('.course-launch').count(), 3);
    await fs.mkdir('artifacts', { recursive:true });
    for (const [course, labs] of Object.entries(repairs)) {
      await catalogue.locator(`[href="systems.html?course=${course}"]`).click();
      await page.locator(`.training-nav [data-course="${course}"][aria-current="page"]`).waitFor();
      assert.equal(await page.locator('[data-course-assessment]').getAttribute('href'), `assessment.html?course=${course}`);
      assert.equal(await page.locator('.systems-lesson').count(), course === 'linux' ? 5 : 3);
      assert.equal(await page.locator('[data-shared-replay]').count(), Object.keys(labs).length);
      assert.equal(await page.locator('.workbench-icon-path svg').count(), course === 'linux' ? 25 : 9, course);
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
        if (id === 'linux-server-handover') {
          assert.match(await evidence.innerText(), /100%/);
          assert.match(await lab.locator('[data-workbench-output]').innerText(), /exit 0/);
          await lab.locator('[name="fault"]').selectOption('permissions');
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
      if (course === 'linux') {
        const module = page.locator('#linux-identities');
        const lesson = module.locator('.linux-lesson').first();
        await lesson.locator('summary').first().click();
        const terminal = lesson.locator('.linux-terminal');
        await lesson.getByRole('button', { name:'Next step', exact:true }).click();
        assert.match(await terminal.innerText(), /no such user/);
        await lesson.getByRole('button', { name:'Next step', exact:true }).click();
        assert.match(await terminal.innerText(), /sudo useradd -m -s \/bin\/bash trainee1/);
        await lesson.getByRole('button', { name:'Previous step', exact:true }).click();
        assert.match(await terminal.innerText(), /no such user/);
        await lesson.getByLabel('Playback speed').selectOption('2');
        await lesson.getByRole('button', { name:'Play walkthrough', exact:true }).click();
        await lesson.getByRole('button', { name:'Pause', exact:true }).click();
        await lesson.getByRole('button', { name:'Restart', exact:true }).click();
        assert.match(await terminal.innerText(), /Select Play or Next step/);
        await module.getByLabel('Troubleshooting notes').fill('Verified the isolated guest denial.');
        const install = page.locator('#linux-installation');
        for (const [field, value] of Object.entries(labs['linux-installation'])) {
          await install.locator(`[name="${field}"]`).selectOption(value);
        }
        if (await install.locator('.replay-events').getAttribute('open') === null) await install.locator('.replay-events summary').click();
        await install.locator('.replay-timeline button').last().click();
        assert.match(await page.locator('.linux-progress').innerText(), /1 of 5/);
        await page.reload();
        assert.equal(await install.locator('[name="disk"]').inputValue(), 'system');
        assert.equal(await module.getByLabel('Troubleshooting notes').inputValue(), 'Verified the isolated guest denial.');
        assert.match(await page.locator('.linux-progress').innerText(), /1 of 5/);
        const download = page.waitForEvent('download');
        await page.getByRole('button', { name:'Download practice report' }).click();
        const report = await download;
        assert.equal(report.suggestedFilename(), 'kryptnet-linux-practice-report.txt');
        const body = await fs.readFile(await report.path(), 'utf8');
        assert.match(body, /findmnt -n -o SOURCE,FSTYPE/);
        assert.match(body, /Verified the isolated guest denial/);
        await install.locator('[name="disk"]').selectOption('data');
        assert.match(await page.locator('.linux-progress').innerText(), /0 of 5/);
      }
      for (const width of [390, 1360]) {
        await page.setViewportSize({ width, height:844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${course} ${width}`);
      }
      await page.setViewportSize({ width:390, height:844 });
      await page.getByRole('link', { name:'Homepage', exact:true }).click();
      await page.getByRole('link', { name:'Explore Linux Courses', exact:true }).click();
    }
    assert.deepEqual(errors, []);
    console.log('Systems Administration: all 3 courses and 14 failure/repair flows passed, with terminal playback, saved Linux progress, downloadable evidence, and responsive checks.');
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
