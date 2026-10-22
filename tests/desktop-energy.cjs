const {chromium}=require('D:/ChatGPT/Tools/playwright-runner/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:18742');
 try{
  const page=browser.contexts()[0].pages().find(p=>p.url().startsWith('https://factory.local'));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1152,height:864});
  const status=await (await fetch('http://127.0.0.1:18741/api/v1/client/status')).json();
  await page.evaluate(pid=>localStorage.setItem('factory-control.process',String(pid)),status.source_process_id);
  await page.reload();await page.locator('#overview-screen').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('#overview-materials tr').length>10);
  await page.keyboard.press('F2');await page.locator('#energy-screen').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('#energy-consumers tr').length>3);
  assert((await page.locator('#energy-generation').innerText()).includes('МВт'));
  const power=await (await fetch('http://127.0.0.1:18741/api/v1/power')).json();
  const batteries=power.payload.data.accumulators.filter(b=>b.surface==='nauvis'&&b.force==='player');
  const charge=batteries.reduce((sum,b)=>sum+b.joules,0),capacity=batteries.reduce((sum,b)=>sum+b.capacity_joules,0);
  const nf=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1});
  const expectedCharge=`${nf.format(charge/1e9)} / ${nf.format(capacity/1e9)} ГДж`;
  await page.waitForFunction(expected=>document.querySelector('#energy-battery-energy').textContent===expected,expectedCharge);
  assert.equal(Number(await page.locator('#energy-charge-meter').getAttribute('value')).toFixed(1),(charge/capacity*100).toFixed(1));
  assert((await page.locator('#energy-sources tr').count())>=2);
  assert((await page.locator('#energy-power-chart svg path').count())>=2);
  const read=()=>page.evaluate(async()=>({...((await import('./app.js')).telemetryState.describe()),mutations:window.paneMutations}));
  await page.evaluate(()=>{
   window.paneMutations={sessions:0,overview:0,energy:0};
   for(const key of Object.keys(window.paneMutations))new MutationObserver(records=>window.paneMutations[key]+=records.length).observe(document.getElementById(key==='sessions'?'session-screen':key+'-screen'),{subtree:true,childList:true,characterData:true});
  });
  const first=await read();await page.waitForTimeout(10000);const after=await read();
  assert(after.packets>first.packets,'Single feed must keep processing');assert(after.historySamples>first.historySamples,'History must continue in background');
  assert(after.models.overview>first.models.overview,'Hidden overview model must advance');
  assert.equal(after.mutations.overview,0,'Hidden overview must have no DOM writes');assert.equal(after.mutations.sessions,0,'Hidden connection view must have no DOM writes');assert(after.mutations.energy>0);
  await page.keyboard.press('F1');await page.locator('#overview-screen').waitFor();
  const energyRenders=(await read()).renders.energy;
  await page.waitForTimeout(7000);
  const passiveEnergy=await read();assert.equal(passiveEnergy.renders.energy,energyRenders,'Hidden energy view must stop rendering');assert(passiveEnergy.models.energy>after.models.energy,'Energy data model must keep advancing');
  await page.keyboard.press('F2');await page.locator('#energy-screen').waitFor();
  await page.locator('#energy-network').selectOption({index:1});
  await page.waitForFunction(()=>document.querySelector('#energy-battery-note').textContent.includes('не привязан'));
  assert.equal(await page.locator('#energy-battery-energy').innerText(),'—');
  await page.locator('#energy-network').selectOption('all');await page.locator('[data-energy-minutes="30"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-energy-minutes="30"]').getAttribute('aria-pressed')==='true');
  for(const [width,height]of [[1152,864],[1024,768]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);
   await page.waitForFunction(()=>Number(document.querySelector('.crt-overlay').dataset.width)===innerWidth);
   const bounds=await page.evaluate(()=>({w:innerWidth,h:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight}));
   const chargeBounds=await page.locator('#energy-battery-energy').evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return {width:el.scrollWidth,client:el.clientWidth,right:r.right,parent:p.right,bottom:r.bottom,parentBottom:p.bottom};});
   assert(chargeBounds.width<=chargeBounds.client&&chargeBounds.right<=chargeBounds.parent&&chargeBounds.bottom<=chargeBounds.parentBottom,JSON.stringify(chargeBounds));
   assert.equal(bounds.scrollW<=bounds.w,true);assert.equal(bounds.scrollH<=bounds.h,true,JSON.stringify(bounds));
   await page.screenshot({path:`D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/energy-${width}x${height}.png`});
  }
  await page.keyboard.press('F9');await page.locator('#session-screen').waitFor();
  await page.keyboard.press('F2');await page.locator('#energy-screen').waitFor();
  assert.deepEqual(errors,[]);
  fs.writeFileSync('D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/desktop-energy.json',JSON.stringify({passed:true,before:first,after,passiveEnergy,checked:['live energy','worker history','no hidden DOM writes','cached tab switching','network filters','battery scope','stored energy and capacity from live telemetry','time windows','1152x864','1024x768']},null,2));
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.clearDeviceMetricsOverride');
  console.log('Energy screen and passive views: all checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
