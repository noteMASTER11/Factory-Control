// Read-only check against the running player's real collector and desktop.
const {chromium}=require('D:/ChatGPT/Tools/playwright-runner/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 let status;const deadline=Date.now()+20000;
 do{status=await(await fetch('http://127.0.0.1:18741/api/v1/status')).json();if(Object.keys(status.topics||{}).length===8&&Object.values(status.topics).every(Boolean))break;await new Promise(r=>setTimeout(r,250));}while(Date.now()<deadline);
 assert.equal(status.telemetry_ready,true);assert.equal(status.source_kind,'game');
 assert.deepEqual(status.topics.status.payload.data.errors,{});
 const topics=Object.fromEntries(Object.entries(status.topics).map(([key,value])=>{
  assert(value&&!value.stale,'missing or stale live channel '+key);
  return [key,{tick:value.tick,ageSeconds:value.age_seconds}];
 }));
 assert.equal(Object.keys(topics).length,8);
 const browser=await chromium.connectOverCDP('http://127.0.0.1:18742');
 try{
  const page=browser.contexts()[0].pages().find(p=>p.url().startsWith('https://factory.local'));assert(page);
  await page.waitForFunction(async()=>{const s=(await import('./app.js')).telemetryState.describe();return s.map.targetPages>0&&s.map.visiblePages===s.map.targetPages;},null,{timeout:20000});
  const result=await page.evaluate(async()=>{
   const manifestResponse=await fetch('https://maps.factory.local/api/v1/map/manifest',{cache:'no-store'});
   if(!manifestResponse.ok)throw new Error('Live map HTTP '+manifestResponse.status);
   const manifest=await manifestResponse.json(),app=await import('./app.js'),state=app.telemetryState.describe();
   const scope=manifest.scopes.find(s=>s.id===state.map.scope&&s.tiles.length);if(!scope)throw new Error('Displayed scope has no native tiles');
   const tile=scope.tiles[0],response=await fetch(`https://maps.factory.local/api/v1/map/tiles/${manifest.generation}/${scope.id}/${tile[0]}/${tile[1]}`);
   const bytes=await response.arrayBuffer(),selected=document.querySelector('.analysis-issue[aria-pressed=true]')?.dataset.issue;
   const pageResponse=await fetch(`https://maps.factory.local/api/v1/map/pages/${manifest.generation}/${scope.id}/0/${Math.floor(tile[0]/8)}/${Math.floor(tile[1]/8)}`),pageBytes=await pageResponse.arrayBuffer();
   return {manifestStatus:manifestResponse.status,binaryStatus:response.status,binaryBytes:bytes.byteLength,
    pageStatus:pageResponse.status,pageBytes:pageBytes.byteLength,rawSession:manifest.session_id,scopes:manifest.scopes.map(s=>({surface:s.surface,force:s.force,tiles:s.tiles.length})),
    state,selected,selectedScope:{surface:scope.surface,force:scope.force},
    tileImages:document.querySelectorAll('#analysis-map image').length,
    mapTitle:document.querySelector('#analysis-map-title').textContent,
    header:document.querySelector('#link-text').textContent};
  });
  assert.equal(result.rawSession,status.topics.status.payload.session_id);
  assert.equal(result.binaryStatus,200);assert.equal(result.binaryBytes,2048);
  assert.equal(result.pageStatus,200);assert.equal(result.pageBytes,256*256*4);
  assert.equal(result.state.session,status.session_id);assert.equal(result.state.visible,'overview');
  assert.equal(result.state.map.active,true);assert(result.state.map.cached>0&&result.state.map.cached<=384);
  assert(result.tileImages>0&&result.tileImages<=256);
  assert.equal(result.state.map.visiblePages,result.state.map.targetPages);
  assert.equal(result.mapTitle,result.selectedScope.surface+' / '+result.selectedScope.force);
  if(result.selected?.startsWith('machine:'))assert(result.selected.startsWith('machine:'+result.selectedScope.surface+'|'+result.selectedScope.force+'|'));
  for(const planet of ['nauvis','vulcanus','fulgora','gleba','aquilo'])assert(result.scopes.some(s=>s.surface===planet&&s.tiles>0));
  await page.screenshot({path:'docs/evidence/spatial-overview-live.png'});
  const report={passed:true,source:'current player process; no validation copy',checkedAt:new Date().toISOString(),pid:status.source_process_id,
   game:status.topics.status.payload.data.game_version,collector:status.topics.status.payload.data.mod_version,topics,...result};
  fs.writeFileSync('docs/evidence/spatial-overview-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
