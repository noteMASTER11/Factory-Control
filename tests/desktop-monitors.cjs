const { chromium } = require('D:/ChatGPT/Tools/playwright-runner/node_modules/playwright');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const pid = process.argv[2];
assert.ok(/^\d+$/.test(pid || ''), 'Pass the PID of our desktop process');
function probe(action='Read', index=0) {
  return JSON.parse(execFileSync('D:/ChatGPT/Tools/PowerShell/pwsh.exe', ['-NoProfile','-File','D:/ChatGPT/Projects/FactorioMonitor/tests/window-probe.ps1','-ProcessId',pid,'-Action',action,'-MonitorIndex',String(index)], { encoding:'utf8', windowsHide:true }));
}
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:18742');
  try {
    const page = browser.contexts()[0].pages().find(p=>p.url().startsWith('https://factory.local'));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    const results = [];
    const monitors = probe().monitors;
    for (let index=0; index<monitors.length; index++) {
      probe('Place', index);
      await page.waitForFunction(() => document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'false');
      const original = probe();
      await page.locator('#fullscreen').click();
      await page.waitForFunction(() => document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'true');
      const full = probe();
      assert.deepEqual(full.rect, monitors[index].Monitor, 'Fullscreen covers this monitor including its taskbar');
      assert.equal(full.monitor.Device, monitors[index].Device, 'Fullscreen must never jump to primary');
      await page.locator('#fullscreen').click();
      await page.waitForFunction(() => document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'false');
      assert.deepEqual(probe().rect, original.rect, 'Window bounds restore exactly after a DPI change');
      probe('Maximize');
      const maximized = probe();
      assert.equal(maximized.maximized, true);
      await page.locator('#fullscreen').click();
      await page.waitForFunction(() => document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'true');
      assert.deepEqual(probe().rect, monitors[index].Monitor);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'false');
      const restored = probe();
      assert.equal(restored.maximized, true, 'A previously maximized window remains maximized');
      assert.deepEqual(restored.normal, maximized.normal, 'Normal placement survives maximizing/fullscreen');
      probe('Restore');
      probe('F11'); // WPF native key route, separate from the DOM/CDP route.
      await page.waitForFunction(() => document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'true');
      assert.deepEqual(probe().rect, monitors[index].Monitor);
      probe('Escape');
      await page.waitForFunction(() => document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'false');
      results.push({ device:full.monitor.Device, dpi:full.dpi, bounds:full.rect, restored:true, maximizedRestored:true, nativeKeys:true });
    }
    const secondary = monitors.findIndex(m=>(m.Flags & 1)===0);
    probe('Place', secondary>=0?secondary:0);
    await page.locator('#fullscreen').click();
    await page.waitForFunction(() => document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'true');
    await page.waitForFunction(() => document.querySelectorAll('#sessions-body tr[data-pid]').length>0);
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:'D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/desktop-secondary-fullscreen.png'});
    fs.writeFileSync('D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/desktop-monitors.json',JSON.stringify({passed:true,monitors:results,captured_at:new Date().toISOString()},null,2));
    console.log('Native fullscreen: every attached monitor passed');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
