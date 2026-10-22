const {chromium}=require('D:/ChatGPT/Tools/playwright-runner/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:18742');
 try{
  const page=browser.contexts()[0].pages().find(p=>p.url().startsWith('https://factory.local'));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.clearDeviceMetricsOverride');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.reload();
  await page.waitForFunction(()=>window.pixiProbe?.enabled);
  const bootDone=async()=>{await page.waitForTimeout(80);await page.locator('.tab-boot').waitFor({state:'hidden'});};
  await bootDone();
  await page.locator('#combat-normal').evaluate(el=>el.click());await page.evaluate(async()=>{const {sound}=await import('./app.js');await sound.ready;sound.output.gain.value=0;});
  for(const id of ['frame-rate','monitor-size'])assert(await page.locator('#'+id).isHidden(),'Implementation metadata must not occupy the game UI');
  assert.deepEqual(await page.locator('.screen-nav button>span').allTextContents(),['ОБЗ','ЭНРГ','ПРЗВ','ЛОГ','НАУК','РЕС','ПРГ','ПОДКЛ']);
  // Real mouse hit testing through the native HTML-in-Canvas subtree.
  await page.locator('#nav-production').click();await page.locator('.tab-boot').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelectorAll('.tab-boot-log>div').length>=3);
  await page.screenshot({path:'D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/tab-boot.png'});await bootDone();
  await page.locator('#production-screen').waitFor();await page.waitForFunction(()=>document.querySelectorAll('#production-rows tr[data-resource]').length>5);
  await page.waitForFunction(()=>/UPS ≈ \d/.test(document.querySelector('#production-ups').textContent));
  await page.locator('#production-filter').selectOption('all');
  await page.locator('#production-search').fill('желез');
  await page.waitForFunction(()=>[...document.querySelectorAll('#production-rows tr[data-resource]')].every(r=>r.textContent.toLowerCase().includes('желез'))&&document.querySelectorAll('#production-rows tr[data-resource]').length>0);
  await page.locator('#production-search').fill('ZZZ__NO_RESOURCE__');await page.waitForFunction(()=>document.querySelectorAll('#production-rows tr[data-resource]').length===0);
  await page.locator('#production-search').fill('');await page.waitForFunction(()=>document.querySelectorAll('#production-rows tr[data-resource]').length>5);
  await page.locator('[data-resource="item|iron-plate|normal"]').click();await page.waitForFunction(()=>document.querySelector('#production-selected').textContent.startsWith('Железные плиты'));
  await page.locator('#production-units').selectOption('second');await page.waitForFunction(()=>document.querySelector('#production-rate-unit').textContent==='/с');
  await page.locator('#production-rate-window').selectOption('10m');await page.waitForFunction(()=>document.querySelector('#production-history-note').textContent.includes('10 мин'));
  await page.locator('#production-filter').selectOption('fluid');await page.waitForFunction(()=>[...document.querySelectorAll('#production-rows tr[data-resource]')].every(r=>r.dataset.resource.startsWith('fluid|')));
  await page.locator('#production-filter').selectOption('all');await page.locator('#production-units').selectOption('minute');await page.locator('#production-rate-window').selectOption('1m');
  await page.locator('[data-resource="item|iron-plate|normal"]').click();
  const read=()=>page.evaluate(async()=>({...(await import('./app.js')).telemetryState.describe(),mutations:window.paneMutations,pixi:window.pixiProbe.describe()}));
  await page.evaluate(()=>{window.paneMutations={sessions:0,overview:0,energy:0,production:0};for(const key of Object.keys(window.paneMutations))new MutationObserver(records=>window.paneMutations[key]+=records.length).observe(document.getElementById(key==='sessions'?'session-screen':key+'-screen'),{subtree:true,childList:true,characterData:true,attributes:true});});
  const before=await read();await page.waitForTimeout(7000);const after=await read();assert(after.packets>before.packets);for(const k of ['sessions','overview','energy'])assert.equal(after.mutations[k],0,`Hidden ${k} has DOM mutations`);
  assert(after.productionHistorySamples>=before.productionHistorySamples);assert(after.models.production>=before.models.production);
  const elapsed=(after.pixi.elapsedMs-before.pixi.elapsedMs)/1000,frames=after.pixi.frames-before.pixi.frames;assert(frames<=Math.ceil(elapsed*30)+1,'Pixi must respect the 30 FPS clock');
  // Scroll through the real HTML table and select a row with the mouse.
  await page.locator('#production-balance-scroll').hover();await page.mouse.wheel(0,400);assert(await page.locator('#production-balance-scroll').evaluate(e=>e.scrollTop)>0);
  await page.locator('#production-balance-scroll').evaluate(e=>e.scrollTop=0);
  for(const [width,height]of [[1152,864],[1024,768]]){
   await page.setViewportSize({width,height});await page.waitForFunction(()=>window.pixiProbe.source.width===innerWidth&&window.pixiProbe.source.height===innerHeight&&window.pixiProbe.sourceTexture.height===innerHeight);
   await page.waitForTimeout(150);
   const geometry=await page.evaluate(()=>{const e=window.pixiProbe,r=document.querySelector('#nav-energy').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {source:[e.source.width,e.source.height],output:[e.app.canvas.clientWidth,e.app.canvas.clientHeight],sprite:[e.screen.width,e.screen.height],hit:hit?.closest('button')?.id,scrollW:document.documentElement.scrollWidth,w:innerWidth};});
   assert.deepEqual(geometry.source,[width,height]);assert.deepEqual(geometry.output,[width,height]);assert.deepEqual(geometry.sprite,[width,height]);assert.equal(geometry.hit,'nav-energy');assert(geometry.scrollW<=geometry.w);
   assert(await page.locator('#production-ups').evaluate(e=>{const r=e.getBoundingClientRect(),h=document.querySelector('.production-controls h1').getBoundingClientRect(),s=document.querySelector('#production-scope').getBoundingClientRect();return Math.abs(r.x+r.width/2-innerWidth/2)<1&&r.left>h.right&&r.right<s.left;}),'UPS must be centered without overlapping the title or scope');
   await page.screenshot({path:`D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/production-pixi-${width}x${height}.png`});
   await page.locator('#nav-energy').click();await bootDone();await page.locator('#energy-screen').waitFor();
   const baseline=(await read()).renders.production;await page.waitForTimeout(3500);assert.equal((await read()).renders.production,baseline,'Hidden production must stop rendering');
   await page.locator('#nav-production').click();await bootDone();await page.locator('#production-screen').waitFor();
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  for(let i=0;i<2;i++){
   await page.locator('#fullscreen').click();await page.waitForTimeout(250);
   assert(await page.evaluate(()=>{const e=window.pixiProbe;return e.source.width===innerWidth&&e.source.height===innerHeight&&e.screen.width===innerWidth&&e.screen.height===innerHeight;}));
   await page.locator('#nav-energy').click();await bootDone();await page.locator('#energy-screen').waitFor();await page.locator('#nav-production').click();await bootDone();
  }
  await page.evaluate(()=>{window.pixiProbe.nextGlitch=performance.now()+60000;window.pixiProbe.pulse();});
  await page.waitForFunction(()=>window.pixiProbe.mapDirection!==0);
  const glitch=await page.evaluate(()=>({offset:window.pixiProbe.bandGlitch.offset,blocks:window.pixiProbe.blocks.length,contrast:window.pixiProbe.crt.lineContrast,lineWidth:window.pixiProbe.crt.lineWidth}));assert(glitch.blocks>0);assert.equal(glitch.contrast,0);assert.equal(glitch.lineWidth,0);assert.equal(glitch.offset,0);
  assert(await page.evaluate(()=>window.pixiProbe.blocks.every(b=>b.points.length===4)));
  await page.waitForFunction(()=>window.pixiProbe.mapDirection===0);
  const nativeBox=await page.locator('#nav-production').boundingBox();await page.locator('#vfx-toggle').click();assert.equal(await page.locator('#vfx-toggle').getAttribute('aria-pressed'),'false');assert.deepEqual(await page.locator('#nav-production').boundingBox(),nativeBox);await page.locator('#vfx-toggle').click();await page.waitForFunction(()=>window.pixiProbe.enabled);
  assert.deepEqual(errors,[]);
  fs.writeFileSync('D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/desktop-production-pixi.json',JSON.stringify({passed:true,before,after,glitch,checked:['native mouse clicks','Russian text input','select menus','real scrolling','production filters and selection','one rendering tab','history bootstrap','both resolutions','native fullscreen cycles','resize hit regions','30 FPS','BIOS and phosphor transition','block glitches without interlacing','HTML fallback']},null,2));
  console.log('Production and Pixi: all checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
