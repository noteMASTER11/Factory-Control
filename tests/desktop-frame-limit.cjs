const {chromium}=require('D:/ChatGPT/Tools/playwright-runner/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:18742');
 try{
  const page=browser.contexts()[0].pages().find(p=>p.url().startsWith('https://factory.local'));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('#vfx-toggle').waitFor();
  if(await page.locator('#vfx-toggle').getAttribute('aria-pressed')!=='true')await page.locator('#vfx-toggle').click();
  const read=()=>page.evaluate(async()=>({...(await import('./app.js')).visualClock.describe(),hidden:document.hidden,states:document.querySelector('.crt-overlay').getAnimations({subtree:true}).map(a=>a.playState)}));
  const first=await read();await page.waitForTimeout(4000);const last=await read();
  const elapsed=(last.elapsed_ms-first.elapsed_ms)/1000,frames=last.frames-first.frames;
  assert.equal(last.hidden,false);assert.equal(last.limit,30);
  assert(frames>=elapsed*20,'CRT animation clock must keep moving');
  assert(frames<=Math.ceil(elapsed*30)+1,`${frames} commits in ${elapsed}s exceed 30 fps`);
  assert(last.states.length>0);assert(last.states.every(s=>s==='paused'),'CSS animation timelines must be driven by the limited clock');
  assert.deepEqual(errors,[]);
  const report={limit:30,elapsed_seconds:elapsed,visual_commits:frames,commits_per_second:frames/elapsed,css_animation_states:last.states};
  fs.writeFileSync('D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/frame-limit.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
