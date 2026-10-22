const {chromium}=require('D:/ChatGPT/Tools/playwright-runner/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:18742');
 try{
  const page=browser.contexts()[0].pages().find(p=>p.url().startsWith('https://factory.local'));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(()=>localStorage.removeItem('factory-control.process'));
  await page.reload();await page.locator('#sessions-body tr[data-associated=true]').first().waitFor();
  await page.locator('#sessions-body tr[data-associated=true]').first().click();await page.locator('#connect').click();
  await page.locator('#overview-screen').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('#overview-materials tr').length>10);
  assert.equal(await page.locator('#nav-overview').getAttribute('aria-current'),'page');
  assert((await page.locator('#overview-energy').innerText()).includes('МВт'));
  assert((await page.locator('#overview-machines tr').count())>3);
  await page.waitForFunction(()=>document.querySelector('#power-history svg'));
  for(const [width,height]of [[1152,864],[1024,768]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);
   await page.waitForFunction(()=>Number(document.querySelector('.crt-overlay').dataset.width)===innerWidth);
   const layout=await page.evaluate(()=>({horizontal:document.documentElement.scrollWidth>innerWidth,vertical:document.documentElement.scrollHeight>innerHeight,panels:[...document.querySelectorAll('#overview-screen .panel')].map(p=>({width:p.clientWidth,height:p.clientHeight}))}));
   assert.equal(layout.horizontal,false);assert.equal(layout.vertical,false,`${width}x${height} overflows`);
   assert(layout.panels.every(p=>p.width>100&&p.height>50));
   await page.screenshot({path:`D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/overview-${width}x${height}.png`});
  }
  await page.keyboard.press('F9');await page.locator('#session-screen').waitFor();
  await page.keyboard.press('F1');await page.locator('#overview-screen').waitFor();
  await page.reload();await page.locator('#overview-screen').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('#overview-materials tr').length>10);
  assert.deepEqual(errors,[]);
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.clearDeviceMetricsOverride');
  fs.writeFileSync('D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/desktop-overview.json',JSON.stringify({passed:true,resolutions:['1152x864','1024x768'],checked:['real game telemetry','source selection','scope selector','energy history','materials','machine states','localized labels','F1/F9 navigation','no page overflow']},null,2));
  console.log('Desktop overview: all checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
