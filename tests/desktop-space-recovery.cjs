const {chromium}=require('D:/ChatGPT/Tools/playwright-runner/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:18742');let page,gain;
 try{
  page=browser.contexts()[0].pages().find(p=>p.url().startsWith('https://factory.local'));assert(page);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('controlled_worker_')&&!m.location().url.endsWith('/favicon.ico'))errors.push({text:m.text(),location:m.location()});});
  await page.addInitScript(()=>{const Native=window.Worker;window.Worker=class extends Native{constructor(...args){super(...args);if(String(args[0]).includes('telemetry-worker.js'))window.telemetryWorkerProbe=this;}};});
  await page.reload();await page.locator('#app-intro').waitFor({state:'hidden'});
  await page.waitForFunction(()=>!document.querySelector('#nav-logistics').disabled||!document.querySelector('#connect').disabled);
  if(await page.locator('#nav-logistics').isDisabled())await page.locator('#connect').click();
  gain=await page.evaluate(async()=>{const {sound,telemetryState}=await import('./app.js'),gain=sound.output.gain.value;window.telemetryStateProbe=telemetryState;sound.output.gain.value=0;return gain;});
  await page.locator('#nav-logistics').click();await page.locator('.tab-boot').waitFor({state:'hidden'});await page.locator('[data-logistics-view="space"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#space-platforms tr').length>0&&document.querySelector('#link-state').dataset.state==='live');
  const platforms=await page.locator('#space-platforms tr').count(),samples=[];
  let packets=await page.evaluate(()=>telemetryStateProbe.describe().packets);
  for(let i=0;i<5;i++){
   await page.waitForFunction(previous=>telemetryStateProbe.describe().packets>previous,packets,{timeout:12000});
   packets=await page.evaluate(()=>telemetryStateProbe.describe().packets);
   assert.equal(await page.locator('#link-state').getAttribute('data-state'),'live');assert.equal(await page.locator('#space-platforms tr').count(),platforms);samples.push(packets);
  }
  for(const event of ['message','error']){
   await page.evaluate(event=>event==='message'?telemetryWorkerProbe.onmessage({data:{type:'error',message:'controlled_worker_message_regression'}}):telemetryWorkerProbe.onerror({message:'controlled_worker_onerror_regression'}),event);
   await page.waitForFunction(()=>document.querySelector('#link-state').dataset.state==='processing');
   assert.equal(await page.locator('#link-text').textContent(),'ОШИБКА ОБРАБОТКИ ДАННЫХ');assert.equal(await page.locator('#space-platforms tr').count(),platforms);assert(!(await page.locator('#nav-logistics').isDisabled()));
   await page.waitForFunction(()=>document.querySelector('#link-state').dataset.state==='live',null,{timeout:12000});
  }
  assert.deepEqual(errors,[]);await page.screenshot({path:'docs/evidence/space-live-current.png'});
  fs.writeFileSync('docs/evidence/space-recovery.json',JSON.stringify({passed:true,platforms,packetSamples:samples,checks:['live game data persists through five refreshes','worker errors retain last valid view','worker error is distinct from gateway outage','automatic recovery on next valid frame','no unexpected browser errors']},null,2));
  console.log(JSON.stringify({passed:true,platforms,packetSamples:samples,workerRecovery:true}));
 }finally{if(page&&gain!==undefined)await page.evaluate(async gain=>(await import('./app.js')).sound.output.gain.value=gain,gain);await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
