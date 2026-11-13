const { chromium } = require(process.argv[2]);
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const repairs = [
  ['devices', 'equipment-path-lab', {access:true, uplink:true}],
  ['communications', 'header-evidence-lab', {gateway:'192.168.10.1'}],
  ['addressing', 'ipv6-site', {lifetime:'1800'}],
  ['vlans', 'vlan-policy-lab', {accessVlan:'20', engineering:true}],
  ['switching', 'switch-route-lab', {accessVlan:'10', trunk:true}],
  ['routing', 'switch-route-lab', {accessVlan:'10', trunk:true}],
  ['routing', 'route-summary-lab', {discard:true}],
  ['dhcp', 'lease-failure-lab', {relay:true}],
  ['dns', 'dns-cutover-lab', {wait:'1'}],
  ['firewall', 'acl-regression-lab', {reverse:false}],
  ['nat', 'nat-reuse-lab', {wait:'60'}],
  ['monitoring', 'monitoring-evidence-lab', {dns:true, path:'healthy'}],
  ['mitm', 'mitm-defense-lab', {protocol:'https', binding:true}],
  ['ddos', 'ddos-budget-lab', {link:'300'}]
];

(async () => {
  process.env.NETWORK_LAB_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'kn-applied-labs-'));
  const { createLabServer } = await import('../server.js');
  const server = createLabServer({ production:false, origin:'', proxy:'' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  try {
    const page = await browser.newPage({ viewport:{width:390,height:844}, reducedMotion:'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(15000);
    await page.goto(base);
    assert.equal(await page.locator('[aria-labelledby="training-courses"] .course-launch').count(), 13);
    const track = page.locator('.course-list article').filter({ has:page.getByRole('heading', { name:'Switching & Routing', exact:true }) });
    assert.equal(await track.locator('.course-launch').count(), 2);
    assert.equal(await track.getByRole('link', { name:'Start Switching' }).getAttribute('href'), 'fundamentals.html?course=switching');
    assert.equal(await track.getByRole('link', { name:'Start Routing' }).getAttribute('href'), 'fundamentals.html?course=routing');
    async function finish(lab) {
      const details = lab.locator('.replay-events');
      if (await details.getAttribute('open') === null) await details.locator('summary').click();
      await details.locator('.replay-timeline button').last().click();
      return lab.locator('[data-workbench-results]');
    }
    for (const [course, id, repair] of repairs) {
      await page.goto(base + (['mitm','ddos'].includes(course) ? '/security.html?lab=' : '/fundamentals.html?course=') + course);
      const lab = page.locator('#' + id);
      await lab.waitFor();
      assert.ok(await lab.locator('[data-baseline]').isDisabled());
      await lab.locator('[data-next]').focus();
      await page.keyboard.press('Enter');
      assert.equal(await lab.locator('[data-workbench-node].active').count(), 1, course);
      await lab.locator('[data-replay-previous]').click();
      assert.equal(await lab.locator('[data-workbench-node].active').count(), 0, course);
      const evidence = await finish(lab);
      assert.match(await evidence.innerText(), /Verification incomplete/, course);
      await lab.locator('[data-baseline]').click();
      for (const [key,value] of Object.entries(repair)) {
        const field = lab.locator('[name="' + key + '"]');
        if (typeof value === 'boolean') await field.setChecked(value);
        else if (await field.evaluate(el => el.tagName) === 'SELECT') await field.selectOption(value);
        else await field.fill(value);
      }
      assert.equal(await evidence.innerText(), '', 'Changing settings invalidates the result: ' + course);
      await finish(lab);
      assert.match(await evidence.innerText(), /Verification passed/, course);
      assert.match(await evidence.innerText(), /Baseline: needs attention/, course);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, course);
      assert.ok(await lab.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), course);
      if (course === 'addressing') {
        await fs.mkdir('artifacts', { recursive:true });
        await lab.screenshot({ path:'artifacts/applied-ipv6-mobile.png' });
      }
      if (id === 'route-summary-lab') {
        await page.setViewportSize({width:1360,height:900});
        await lab.screenshot({ path:'artifacts/applied-routing-desktop.png' });
        await page.setViewportSize({width:390,height:844});
      }
      await lab.locator('[data-restore]').click();
      assert.equal(await evidence.innerText(), '');
    }
    await page.goto(base + '/fundamentals.html?course=addressing');
    const mask = page.locator('#reverse-mask');
    await mask.locator('[name="mask"]').fill('255.255.250.0');
    assert.match(await mask.locator('.module-result').innerText(), /Not a CIDR mask/);
    assert.ok(await mask.locator('[data-next]').isDisabled());
    await mask.locator('[name="mask"]').fill('255.255.255.224');
    assert.match(await (await finish(mask)).innerText(), /CIDR prefix \/27/);
    assert.deepEqual(errors, []);
    console.log('Applied lab browser checks passed: all 13 module pages, 15 lab placements, 14 fault/repair flows, mask validation, keyboard replay, baseline comparison, responsive layouts and track links.');
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
