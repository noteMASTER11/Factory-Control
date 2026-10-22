// Run against our WebView2 instance launched with --automation-port=18742.
const { chromium } = require('D:/ChatGPT/Tools/playwright-runner/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:18742');
  try {
    const page = browser.contexts()[0].pages().find(p => p.url().startsWith('https://factory.local'));
    assert.ok(page, 'Our desktop page must load');
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.evaluate(()=>localStorage.removeItem('factory-control.process'));
    await page.reload();
    await page.waitForFunction(()=>['ready','live'].includes(document.querySelector('#link-state')?.dataset.state));
    if(await page.locator('#fullscreen').getAttribute('aria-pressed')==='true'){
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>document.querySelector('#fullscreen').getAttribute('aria-pressed')==='false');
    }
    const fullscreen = page.getByRole('button', { name: 'На весь экран (F11)', exact: true });
    await fullscreen.waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.fonts.check('16px "Iosevka Term Slab"', 'ПРОИЗВОДСТВО 0123456789')), true);
    assert.equal(await page.locator('#language option').count(), 1);
    assert.equal(await page.locator('#language').inputValue(), 'ru-RU');
    assert.equal(await page.locator('html').getAttribute('lang'), 'ru-RU');
    await page.waitForFunction(() => document.querySelectorAll('#sessions-body tr[data-pid]').length > 0);
    const initial = await page.evaluate(() => ({ width: outerWidth, height: outerHeight }));
    await fullscreen.hover();
    const hover = await fullscreen.evaluate(el => getComputedStyle(el).backgroundColor);
    await page.mouse.move(1, 100);
    const normal = await fullscreen.evaluate(el => getComputedStyle(el).backgroundColor);
    assert.notEqual(hover, normal, 'Fullscreen button has a visible hover');
    await fullscreen.click();
    await page.waitForFunction(() => document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'true');
    await page.getByRole('button', { name: 'Выйти из полного экрана (Esc)', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'false');
    await page.keyboard.press('F11');
    await page.waitForFunction(() => document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'true');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'false');
    assert.deepEqual(await page.evaluate(() => ({ width: outerWidth, height: outerHeight })), initial);
    // Unrelated original game cannot be silently attached to the test-copy feed.
    const unavailable = page.locator('#sessions-body tr[data-associated="false"]').first();
    if (await unavailable.count()) {
      await unavailable.click();
      assert.equal(await page.locator('#connect').isDisabled(), true);
      assert.match(await page.locator('#selection-note').innerText(), /коллектор|телеметр/i);
    }
    await page.locator('#sessions-body tr[data-associated="true"]').first().click();
    await page.locator('#connect').click();
    await page.waitForFunction(() => document.querySelector('#link-state').dataset.state === 'live');
    assert.match(await page.locator('#source-label').textContent(), /ИГРОВОЙ ПРОФИЛЬ/);
    await page.keyboard.press('F9');
    const crtBefore = await page.locator('#vfx-toggle').getAttribute('aria-pressed');
    await page.locator('#vfx-toggle').click();
    assert.equal(await page.locator('#vfx-toggle').getAttribute('aria-pressed'), String(crtBefore !== 'true'));
    await page.locator('#vfx-toggle').click();
    for (const [width, height] of [[1152,864],[1024,768]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal page overflow');
      const button = await page.locator('#fullscreen').boundingBox();
      assert.ok(button.x >= 0 && button.x + button.width <= width);
      assert.equal(await page.locator('.properties').evaluate(el => el.scrollHeight <= el.clientHeight), true, 'All process properties fit without scrolling');
      await page.screenshot({ path: `D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/desktop-${width}x${height}.png` });
    }
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    // An obsolete/unknown saved locale must fall back to the shipped default.
    await page.evaluate(() => localStorage.setItem('factory-control.locale','xx-YY'));
    await page.reload();
    await page.locator('#language option').waitFor({state:'attached'});
    assert.equal(await page.locator('html').getAttribute('lang'), 'ru-RU');
    await page.evaluate(() => localStorage.setItem('factory-control.locale','ru-RU'));
    assert.deepEqual(failures, []);
    fs.writeFileSync('D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/desktop-ui.json', JSON.stringify({ passed: true, resolutions: ['1152x864','1024x768'], checked: ['native button toggle', 'F11/Esc', 'restore size', 'hover', 'process association', 'live API', 'overlay toggle', 'adaptive layout', 'bundled Cyrillic slab font', 'JSON localization and locale fallback'], captured_at: new Date().toISOString() }, null, 2));
    console.log('Desktop UI: all checks passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
