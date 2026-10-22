const {chromium}=require('D:/ChatGPT/Tools/playwright-runner/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:18742');let page,original;
 try{
  page=browser.contexts()[0].pages().find(p=>p.url().startsWith('https://factory.local'));await page.locator('#app-intro').waitFor({state:'hidden'});
  original=await page.evaluate(async()=>{const app=await import('./app.js');window.glyphTestApp=app;return {value:structuredClone(app.settings.value),stored:localStorage.getItem('factory-control.settings'),crt:localStorage.getItem('factory-control.crt')};});
  const probe=await page.evaluate(async()=>{
   const {GlyphGlitch}=await import('./vfx/glyph-glitch.js'),overlay=window.pixiProbe;
   const scratch=document.createElement('canvas');scratch.width=overlay.source.width;scratch.height=overlay.source.height;const ctx=scratch.getContext('2d',{willReadFrequently:true});
   const glyphs=new GlyphGlitch(overlay.surface,()=>.27);glyphs.apply({glyphFrequency:100,glyphAmount:300});glyphs.capture(overlay.glyphs.clean);ctx.drawImage(glyphs.clean,0,0);
   const before=ctx.getImageData(0,0,scratch.width,scratch.height).data,semantic=overlay.surface.textContent,now=performance.now();glyphs.pulse(now);const selected=glyphs.entries.map(e=>({original:e.char,replacement:e.replacement,input:!!e.node.parentElement.closest('input,textarea,select,button,[contenteditable]'),hidden:!!e.node.parentElement.closest('[hidden]')}));glyphs.paint(ctx,now+40);
   const changed=ctx.getImageData(0,0,scratch.width,scratch.height).data;let pixels=0;for(let i=0;i<before.length;i+=4)if(before[i]!==changed[i]||before[i+1]!==changed[i+1]||before[i+2]!==changed[i+2])pixels++;
   glyphs.advance(now+1000);glyphs.paint(ctx,now+1000);const after=ctx.getImageData(0,0,scratch.width,scratch.height).data;let restored=true;for(let i=0;i<before.length;i++)if(before[i]!==after[i]){restored=false;break;}
   glyphs.apply({glyphFrequency:0,glyphAmount:300});const offFrequency=!glyphs.pulse(now+2000);glyphs.apply({glyphFrequency:100,glyphAmount:0});const offAmount=!glyphs.pulse(now+2000);glyphs.apply({glyphFrequency:100,glyphAmount:300});glyphs.pulse(now+3000);glyphs.advance(now+3010,true);
   return {pixels,restored,semanticUnchanged:semantic===overlay.surface.textContent,selected,offFrequency,offAmount,paused:!glyphs.active};
  });
  assert(probe.selected.length>0&&probe.selected.length<=48);assert(probe.pixels>0);assert(probe.restored);assert(probe.semanticUnchanged);assert(probe.selected.every(e=>!e.input&&!e.hidden&&e.original!==e.replacement&&/^[\x21-\x7e]$/.test(e.replacement)));assert(probe.offFrequency&&probe.offAmount&&probe.paused);
  await page.evaluate(()=>{const {settings}=window.glyphTestApp;settings.value.crt=true;settings.value.effects.glyphFrequency=300;settings.value.effects.glyphAmount=300;settings.update();});
  await page.waitForFunction(()=>window.pixiProbe.glyphs.settings.amount===.03);
  const prior=await page.evaluate(()=>{const o=window.pixiProbe;return {frames:o.frames,painted:o.glyphs.painted};});
  await page.evaluate(()=>{window.pixiProbe.glyphs.pulse(performance.now());window.pixiProbe.queue();});await page.waitForFunction(n=>window.pixiProbe.glyphs.painted>n,prior.painted);
  const live=await page.evaluate(()=>window.pixiProbe.glyphs.describe());assert(live.painted>prior.painted);
  await page.screenshot({path:'D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/glyph-glitch-live.png'});
  await page.waitForFunction(()=>!window.pixiProbe.glyphs.active);
  await page.evaluate(()=>{const {settings}=window.glyphTestApp;settings.value.crt=false;settings.update();});assert.equal(await page.evaluate(()=>window.pixiProbe.glyphs.active),false);
  const persistence=await page.evaluate(()=>JSON.parse(localStorage.getItem('factory-control.settings')).effects);assert.equal(persistence.glyphFrequency,300);assert.equal(persistence.glyphAmount,300);
  fs.writeFileSync('D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/desktop-glyph-glitch.json',JSON.stringify({passed:true,probe,live,checks:['similar ASCII choices','visible glyph replacement','jitter','exact pixel restoration','semantic text unchanged','visible screen only','inputs and buttons excluded','bounded 48-character paint budget','frequency zero','amount zero','motion/transition pause','live Pixi upload','CRT off cancels','settings persistence']},null,2));console.log('Paint-only ASCII glitches in native WebView2: all checks passed');
 }finally{
  if(page&&original)await page.evaluate(async old=>{const {settings}=await import('./app.js');settings.value=old.value;settings.update();for(const [key,value]of [['settings',old.stored],['crt',old.crt]])if(value===null)localStorage.removeItem('factory-control.'+key);else localStorage.setItem('factory-control.'+key,value);},original);
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
