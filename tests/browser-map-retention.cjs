const {chromium}=require('D:/ChatGPT/Tools/playwright-runner/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
(async()=>{
 const web=path.resolve('src/Factorio.Desktop/Web'),rows=[];for(let y=-24;y<24;y++)for(let x=-32;x<32;x++)rows.push([x,y,1]);
 const manifest={generation:'fixture',session_id:'fixture',scopes:[{id:'1-1',surface:'nauvis',force:'player',tiles:rows}]};
 const tile=Buffer.alloc(2048);for(let i=0;i<tile.length;i+=2)tile.writeUInt16LE(0x07ff,i);
 let delay=0,requests=0,concurrent=0,peak=0;
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<style>body{margin:0;background:#000}svg{width:100%;height:100%}#viewport{width:800px;height:600px}</style><div id="viewport"><svg id="map"></svg></div><span id="analysis-map-status"></span>');return;}
  if(url.pathname==='/api/v1/map/manifest'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(manifest));return;}
  if(url.pathname.startsWith('/api/v1/map/pages/')){
   const p=url.pathname.split('/');requests++;peak=Math.max(peak,++concurrent);
   const bytes=require('./chart-fixture.cjs').atlas(rows,+p[7],+p[8],+p[9],()=>tile);
   setTimeout(()=>{concurrent--;if(bytes)res.end(bytes);else res.writeHead(404).end();},delay);return;
  }
  const file=path.resolve(web,'.'+url.pathname);if(!file.startsWith(web+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'D:/ChatGPT/Tools/playwright/chromium-1243/chrome-win64/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:800,height:620}});await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{const {FactoryMap}=await import('/factory-map.js'),{FrameClock}=await import('/frame-clock.js');window.map=new FactoryMap(document.querySelector('#map'),{text:(k,v)=>k+JSON.stringify(v||{})},new FrameClock(30),()=>{});map.nextPrefetch=Infinity;map.setModel({issues:[],selected:null,options:{scope:'["nauvis","player"]'}},'fixture');map.setActive(true);});
  await page.waitForFunction(()=>map.manifest);await page.evaluate(()=>{map.camera={x:0,y:0,scale:.5};map.requestDraw();});
  await page.waitForFunction(()=>map.describe().targetPages>0&&map.describe().visiblePages===map.describe().targetPages&&map.pending.size===0,null,{timeout:15000});
  const coverage=await page.evaluate(()=>({state:map.describe(),chunks:[...map.pages(1).values()].reduce((n,p)=>n+p.count,0),images:map.tileNodes.size}));
  assert(coverage.chunks>256);assert.equal(coverage.state.visiblePages,coverage.state.targetPages);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  // Sample actual rendered corners: a nearest-256 circle would leave them black.
  const screenshot=await page.screenshot();const corners=await page.evaluate(async base64=>{const image=await createImageBitmap(await(await fetch('data:image/png;base64,'+base64)).blob());const canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return [[2,2],[797,2],[2,597],[797,597]].map(([x,y])=>[...ctx.getImageData(x,y,1,1).data]);},screenshot.toString('base64'));
  for(const color of corners)assert(color[1]>200&&color[2]>200,'visible corner lost its known chart pixels: '+JSON.stringify(corners));
  const before=requests;await page.evaluate(()=>{map.camera.x+=32;map.requestDraw();});await page.waitForTimeout(200);await page.evaluate(()=>{map.camera.x-=32;map.requestDraw();});await page.waitForTimeout(200);assert.equal(requests,before,'panning inside loaded area must reuse its images');
  delay=750;for(const row of rows)row[2]++;
  await page.evaluate(()=>{map.refreshMs=0;return map.poll();});await page.waitForFunction(()=>map.pending.size>0);
  const during=await page.evaluate(()=>({images:map.tileNodes.size,state:map.describe()}));assert(during.images>=coverage.images,'refresh must retain previous pixels');assert.equal(during.state.visiblePages,during.state.targetPages);
  await page.waitForFunction(()=>map.pending.size===0&&[...map.pages(1).values()].filter(p=>Math.abs((p.x+.5)*p.size-map.camera.x)<(map.width/map.camera.scale+p.size)/2&&Math.abs((p.y+.5)*p.size-map.camera.y)<(map.height/map.camera.scale+p.size)/2).every(p=>map.cache.get(map.key(p))?.version===p.version),null,{timeout:15000});
  await page.evaluate(()=>map.setActive(false));const stopped=requests;await page.waitForTimeout(1200);assert.equal(requests,stopped);assert(peak<=2);
  await page.evaluate(async()=>{
   document.body.insertAdjacentHTML('beforeend','<button id="settings-toggle"></button><select id="language"></select><button id="vfx-toggle"></button>');
   const {Settings}=await import('/settings.js');window.scaleApplies=[];
   window.settingsFixture=new Settings({apply(){},number:v=>String(v),text:(k,v)=>v?.value??k},v=>scaleApplies.push(v.scale));
   settingsFixture.root.style.cssText='position:fixed;inset:0;background:#123;overflow:auto';settingsFixture.open();
  });
  const slider=page.locator('#settings-scale'),bounds=await slider.boundingBox();
  await page.mouse.move(bounds.x+bounds.width*.3,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.9,bounds.y+bounds.height/2,{steps:8});
  const held=await page.evaluate(()=>({applies:scaleApplies.length,committed:settingsFixture.value.scale,draft:Number(document.querySelector('#settings-scale').value),saved:localStorage.getItem('factory-control.settings')}));
  assert.equal(held.applies,0);assert.equal(held.committed,100);assert(held.draft>100);assert.equal(held.saved,null);
  await page.mouse.up();const released=await page.evaluate(()=>({applies:scaleApplies.length,value:settingsFixture.value.scale,saved:JSON.parse(localStorage.getItem('factory-control.settings')).scale}));
  assert.equal(released.applies,1);assert.equal(released.value,held.draft);assert.equal(released.saved,held.draft);
  await slider.focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>scaleApplies.length),2);
  fs.writeFileSync('docs/evidence/settings-scale-release.json',JSON.stringify({passed:true,held,released,keyboardCommit:true},null,2));
  const report={passed:true,fixtureChunks:rows.length,coverage,during,peakRequests:peak,requests,checks:['entire rectangular viewport','stable pixels during pan and refresh','no repeated pan requests','two concurrent file reads maximum','inactive map stops requests']};fs.writeFileSync('docs/evidence/map-retention.json',JSON.stringify(report,null,2));console.log(report);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
