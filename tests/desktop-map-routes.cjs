const {chromium}=require('D:/ChatGPT/Tools/playwright-runner/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:18742');
 try{
  const page=browser.contexts()[0].pages().find(p=>p.url().startsWith('https://factory.local'));assert(page);
  const result=await page.evaluate(async()=>{
   const response=await fetch('https://maps.factory.local/api/v1/map/manifest');if(!response.ok)throw new Error('Native manifest HTTP '+response.status);
   const manifest=await response.json(),scope=manifest.scopes.find(s=>s.tiles.length),tile=scope.tiles[0];
   const binary=await fetch(`https://maps.factory.local/api/v1/map/tiles/${manifest.generation}/${scope.id}/${tile[0]}/${tile[1]}?v=${tile[2]}`),bytes=await binary.arrayBuffer();
   const missing=await fetch(`https://maps.factory.local/api/v1/map/tiles/${manifest.generation}/invalid/0/0`);
   const app=await import('./app.js');return {manifestStatus:response.status,binaryStatus:binary.status,bytes:bytes.byteLength,format:manifest.format,scopes:manifest.scopes.map(s=>s.surface),missingStatus:missing.status,worker:app.telemetryState.describe(),source:'explicit isolated captured files; no gameplay queries'};
  });
  assert.equal(result.manifestStatus,200);assert.equal(result.binaryStatus,200);assert.equal(result.bytes,2048);assert.equal(result.format,'rgb565le');assert.equal(result.missingStatus,404);assert(result.scopes.includes('gleba')&&result.scopes.includes('vulcanus'));assert.equal(result.worker.map.active,false);assert.equal(result.worker.map.draws,0);
  fs.writeFileSync('docs/evidence/desktop-map-routes.json',JSON.stringify({passed:true,...result},null,2));console.log(result);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
