const {chromium}=require('D:/ChatGPT/Tools/playwright-runner/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
(async()=>{
 const web=path.resolve('src/Factorio.Desktop/Web');
 const server=http.createServer((req,res)=>{const file=path.resolve(web,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(web+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',path.extname(file)==='.js'?'text/javascript':path.extname(file)==='.json'?'application/json':'text/html');const contents=fs.readFileSync(file);res.end(path.extname(file)==='.html'?contents.toString().replace(/<script[^>]+src="(?:startup|app)\.js"[^>]*><\/script>/g,''):contents);}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'D:/ChatGPT/Tools/playwright/chromium-1243/chrome-win64/chrome.exe',args:['--enable-blink-features=CanvasDrawElement']});
 try{
  const page=await browser.newPage({viewport:{width:1152,height:864}});
  await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
  const result=await page.evaluate(async()=>{
   const {PixiCrtOverlay}=await import('./vfx/pixi-overlay.js'),{TexturePool}=await import('./vfx/vendor/pixi-vendor.js'),{AsciiReveal}=await import('./vfx/ascii-reveal.js');
   const surface=document.createElement('div');surface.textContent='FACTORY CONTROL 0123456789';document.body.append(surface);
   const profile=await(await fetch('./vfx/crt-profile.json')).json();
   // No native host or application lifecycle is involved; exercise the real renderer in isolation.
   const effect=await PixiCrtOverlay.create(surface,profile,{request(){},cancel(){}});effect.setEnabled(true);
   const counts=[];
   for(const [w,h] of [[800,600],[1152,864],[1920,1080],[1024,768]]){
    Object.defineProperty(window,'innerWidth',{value:w,configurable:true});Object.defineProperty(window,'innerHeight',{value:h,configurable:true});
    effect.geometryDirty=true;effect.geometry();effect.dirty=false;effect.ctx.fillStyle='#071923';effect.ctx.fillRect(0,0,w,h);effect.sourceTexture.source.update();effect.draw();
    counts.push([...TexturePool._buckets.values()].reduce((n,a)=>n+a.length,0));
   }
   effect.setEnabled(false);
   const disabled={pooled:[...TexturePool._buckets.values()].reduce((n,a)=>n+a.length,0),output:effect.app.canvas.width*effect.app.canvas.height,source:effect.source.width*effect.source.height};
   effect.setEnabled(true);effect.geometry();effect.dirty=false;effect.draw();const restored=effect.app.canvas.width>1;
   const reveal=new AsciiReveal(profile.tabAscii);reveal.capture(surface,null);const allocated=reveal.canvas.width*reveal.canvas.height;reveal.release?.();const released=reveal.canvas.width*reveal.canvas.height;
   const context=effect.app.renderer.gl.getContextAttributes();effect.destroy();return {counts,disabled,restored,allocated,released,antialias:context.antialias,preserve:context.preserveDrawingBuffer};
  });
  assert(result.counts.every(n=>n<=2),'Old viewport textures accumulate: '+result.counts);
  assert.equal(result.disabled.pooled,0);assert.equal(result.disabled.output,1);assert.equal(result.disabled.source,1);assert(result.restored);
  assert(result.allocated>1);assert.equal(result.released,1);assert.equal(result.antialias,false);assert.equal(result.preserve,false);
  fs.writeFileSync('D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/browser-vfx-memory.json',JSON.stringify({passed:true,...result},null,2));console.log('CRT buffer lifetime, resize, re-enable and ASCII release: all checks passed');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
