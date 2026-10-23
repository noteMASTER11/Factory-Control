const {chromium}=require('D:/ChatGPT/Tools/playwright-runner/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:18742'),directory=path.resolve('Data/logs');let page,originalGain,originalDebug;
 try{
  page=browser.contexts()[0].pages().find(p=>p.url().startsWith('https://factory.local'));assert(page);
  await page.waitForFunction(()=>!document.querySelector('#nav-production').disabled,null,{timeout:20000});await page.locator('#app-intro').waitFor({state:'hidden'});
  originalGain=await page.evaluate(async()=>{const app=await import('./app.js');const gain=app.sound.output.gain.value;app.sound.output.gain.value=0;return gain;});
  await page.locator('#nav-production').click();await page.waitForFunction(()=>!document.querySelector('#production-screen').hidden);await page.locator('.tab-boot').waitFor({state:'hidden'});
  await page.locator('#production-tab-table').click();assert(await page.locator('#production-table-view').isVisible());assert((await page.locator('#production-rows tr').count())>0);
  await page.locator('#production-tab-map').click();await page.locator('#production-filter').selectOption('all');
  assert.equal(await page.locator('#production-map-resource option').first().getAttribute('value'),'all');assert.equal(await page.locator('#production-map-resource option').first().textContent(),'Все ресурсы');await page.locator('#production-map-resource').selectOption('all');assert.equal(await page.locator('#production-map-resource').inputValue(),'all');
  const scope=JSON.parse(await page.locator('#production-scope').inputValue()),machines=await(await fetch('http://127.0.0.1:18741/api/v1/machines')).json(),flows=await(await fetch('http://127.0.0.1:18741/api/v1/production')).json();
  const group=machines.payload.data.groups.find(g=>g.surface===scope[0]&&g.force===scope[1]&&g.examples?.length&&g.products?.some(p=>flows.payload.data.rows.some(r=>r.surface===scope[0]&&r.force===scope[1]&&r.name===p.name)));
  assert(group,'live scope has a production group with measured coordinates');const product=group.products.find(p=>flows.payload.data.rows.some(r=>r.surface===scope[0]&&r.force===scope[1]&&r.name===p.name)),resource=(product.type||'item')+'|'+product.name+'|normal';
  await page.waitForFunction(id=>[...document.querySelector('#production-map-resource').options].some(o=>o.value===id),resource);await page.locator('#production-map-resource').selectOption(resource);
  await page.waitForFunction(async()=>{const s=(await import('./app.js')).telemetryState.describe().productionView;return s.map.visiblePages>0&&s.map.visiblePages===s.map.targetPages&&document.querySelectorAll('#production-map-locations button').length>0;},null,{timeout:20000});
  const active=await page.evaluate(async()=>(await import('./app.js')).telemetryState.describe());await page.screenshot({path:'docs/evidence/production-live-map.png'});
  await page.locator('#production-tab-table').click();await page.waitForTimeout(100);const hidden=await page.evaluate(async()=>(await import('./app.js')).telemetryState.describe().productionView);await page.waitForTimeout(1100);const afterHidden=await page.evaluate(async()=>(await import('./app.js')).telemetryState.describe().productionView);assert.equal(afterHidden.map.draws,hidden.map.draws);assert.equal(afterHidden.map.fetches,hidden.map.fetches);
  await page.locator('#settings-toggle').click();originalDebug=await page.locator('#settings-debug-logs').isChecked();if(originalDebug)await page.locator('#settings-debug-logs').uncheck();
  const oldFiles=new Set(fs.existsSync(directory)?fs.readdirSync(directory):[]),marker='fc-log-check-'+Date.now();await page.locator('#settings-debug-logs').check();
  await page.evaluate(marker=>{console.debug(marker+'-debug');console.info(marker+'-info');console.warn(marker+'-warning');console.error(marker+'-error');},marker);
  await(await fetch('http://127.0.0.1:18741/api/v1/status')).text();
  let file,text='';const deadline=Date.now()+10000;
  do{file=fs.existsSync(directory)&&fs.readdirSync(directory).find(name=>name.endsWith('.log')&&!oldFiles.has(name));if(file)text=fs.readFileSync(path.join(directory,file),'utf8');if(text.includes(marker+'-error')&&text.includes('[Debug] Microsoft.AspNetCore'))break;await new Promise(r=>setTimeout(r,100));}while(Date.now()<deadline);
  for(const level of ['debug','info','warning','error'])assert(text.includes(marker+'-'+level),'missing browser '+level+' in native .log');assert(text.includes('[Debug] Microsoft.AspNetCore'),'embedded host Debug messages must reach the file');
  await page.locator('#settings-debug-logs').uncheck();await page.evaluate(marker=>console.warn(marker+'-disabled'),marker);await page.waitForTimeout(250);assert(!fs.readFileSync(path.join(directory,file),'utf8').includes(marker+'-disabled'));
  await page.locator('#settings-close').click();await page.locator('#production-tab-map').click();
  await page.locator('#production-map-resource').selectOption('all');await page.waitForFunction(()=>document.querySelector('#production-map-resource').value==='all');
  fs.writeFileSync('docs/evidence/production-map-native.json',JSON.stringify({passed:true,source:'current player session',resource,active,hidden,afterHidden,logFile:path.join(directory,file),debugRestored:originalDebug,checks:['all resources first option and selectable','existing table retained','native production atlas and observed machine markers','inactive map stays idle','browser debug/info/warn/error in native log','embedded ASP.NET Debug in same file','disable stops subsequent browser logs']},null,2));console.log('Native production map and opt-in log file pass; original settings restored after verification');
 }finally{
  if(page&&originalGain!==undefined)await page.evaluate(async({gain,debug})=>{const app=await import('./app.js');app.sound.output.gain.value=gain;if(debug!==undefined&&app.settings.value.debugLogs!==debug){app.settings.value.debugLogs=debug;app.settings.update();}if(!app.settings.root.hidden)app.settings.close();},{gain:originalGain,debug:originalDebug});
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
