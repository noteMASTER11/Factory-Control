const {chromium}=require('D:/ChatGPT/Tools/playwright-runner/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
 const capture=process.env.FC_MAP_CAPTURE||'D:/ChatGPT/Temp/FactorioMonitor/native-map-probe-cdb25788a6d4484b9c42c7f4a0073af3/script-output/factory-telemetry';
 const web=path.resolve('src/Factorio.Desktop/Web'),topics={};
 const arrayFields=new Set(['rows','groups','stocks','cells','examples','scopes','tiles','networks','forces','chunks','trains','queue','products','ingredients','accumulators','nameplate_generators','consumers','producers']);
 function normalize(value){if(!value||typeof value!=='object')return value;for(const [key,item]of Object.entries(value)){if(arrayFields.has(key)&&item&&!Array.isArray(item)&&Object.keys(item).length===0)value[key]=[];else normalize(item);}return value;}
 for(const key of ['status','machines','production','power','logistics','research','resources','combat']){const raw=normalize(JSON.parse(fs.readFileSync(path.join(capture,key+'.json'))));topics[key]={tick:raw.tick,written_at:new Date(fs.statSync(path.join(capture,key+'.json')).mtimeMs).toISOString(),payload:raw};}
 const manifest=normalize(JSON.parse(fs.readFileSync(path.join(capture,'map.json'))));
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/fixture.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({topics,manifest}));return;}
  if(url.pathname==='/api/v1/map/manifest'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(manifest));return;}
  if(url.pathname.startsWith('/api/v1/map/pages/')){const p=url.pathname.split('/'),scope=manifest.scopes.find(s=>s.id===p[6]);const bytes=scope&&require('./chart-fixture.cjs').atlas(scope.tiles,+p[7],+p[8],+p[9],(x,y)=>fs.readFileSync(path.join(capture,'map',p[5],p[6],x+'_'+y+'.bin')));if(bytes)res.end(bytes);else res.writeHead(404).end();return;}
  if(url.pathname.startsWith('/api/v1/map/tiles/')){const parts=url.pathname.split('/');const file=path.join(capture,'map',parts[5],parts[6],parts[7]+'_'+parts[8]+'.bin');try{res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}return;}
  const file=path.resolve(web,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(web+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');let bytes=fs.readFileSync(file);if(file.endsWith('index.html'))bytes=bytes.toString().replace(/<script[^>]+src="(?:startup|app)\.js"[^>]*><\/script>/g,'');res.end(bytes);}catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'D:/ChatGPT/Tools/playwright/chromium-1243/chrome-win64/chrome.exe',args:['--enable-blink-features=CanvasDrawElement']});
 try{
  const page=await browser.newPage({viewport:{width:1152,height:864}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
  await page.evaluate(async()=>{
   const {Localization}=await import('./i18n.js'),{Overview}=await import('./spatial-overview.js'),{FrameClock}=await import('./frame-clock.js'),{analyzeFactory}=await import('./analysis-model.js');
   const fixture=await(await fetch('/fixture.json')).json(),i18n=await Localization.load();i18n.apply();document.querySelector('#app-intro').hidden=true;for(const screen of document.querySelectorAll('main'))screen.hidden=true;document.querySelector('#overview-screen').hidden=false;document.querySelector('#link-text').textContent=i18n.text('connection.liveCopy');
   const options={},clock=new FrameClock(30),render=()=>{const model=analyzeFactory(fixture.topics,options,[],[],Date.parse(fixture.topics.machines.written_at));window.fixtureModel=model;overview.render(model,{status:{session_id:'isolated-capture'}});};
   const overview=new Overview(i18n,next=>{Object.assign(options,next);render();},clock);window.fixtureOverview=overview;window.fixtureClock=clock;window.fixtureI18n=i18n;overview.setActive(true);render();
  });
  await page.waitForFunction(()=>document.querySelectorAll('.analysis-issue').length>0);
  await page.waitForFunction(()=>window.fixtureOverview.map.describe().cached>0,{timeout:15000});
  const before=await page.evaluate(()=>({selected:window.fixtureModel.selected.id,map:window.fixtureOverview.map.describe()}));
  await page.locator('.analysis-issue').nth(1).click();await page.waitForFunction(id=>window.fixtureModel.selected.id!==id,before.selected);
  const canvas=page.locator('#analysis-map');await canvas.focus();const x=await page.evaluate(()=>window.fixtureOverview.map.camera.x);await page.keyboard.press('ArrowRight');await page.waitForFunction(old=>window.fixtureOverview.map.camera.x!==old,x);
  const scale=await page.evaluate(()=>window.fixtureOverview.map.camera.scale);await page.locator('#analysis-zoom-in').click();assert((await page.evaluate(()=>window.fixtureOverview.map.camera.scale))>scale);
  await page.locator('#analysis-locate').click();
  for(const [width,height]of [[1152,864],[1024,768]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);
   const layout=await page.evaluate(()=>{const root=document.querySelector('#overview-screen'),map=document.querySelector('#analysis-map').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,mapWidth:map.width,mapHeight:map.height,rootHeight:root.clientHeight};});
   assert.equal(layout.overflow,false,JSON.stringify(layout));assert(layout.mapWidth>400&&layout.mapHeight>200);await page.waitForFunction(()=>window.fixtureOverview.map.describe().pending===0);await page.screenshot({path:`D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/spatial-overview-${width}x${height}.png`});
  }
  await page.locator('[data-analysis-filter=critical]').click();assert((await page.evaluate(()=>window.fixtureModel.issues)).every(r=>r.severity==='critical'));
  await page.locator('[data-analysis-filter=all]').click();
  await page.evaluate(()=>window.fixtureOverview.setActive(false));await page.waitForTimeout(100);const hidden=await page.evaluate(()=>window.fixtureOverview.map.describe());await page.waitForTimeout(500);const after=await page.evaluate(()=>window.fixtureOverview.map.describe());assert.equal(after.draws,hidden.draws);assert.equal(after.fetches,hidden.fetches);assert(after.cached<=384);assert.equal(after.pending,0);
  await page.evaluate(()=>window.fixtureOverview.setActive(true));await page.waitForTimeout(100);assert((await page.evaluate(()=>window.fixtureOverview.map.describe().draws))>after.draws);
  await page.evaluate(async()=>{const {PixiCrtOverlay}=await import('./vfx/pixi-overlay.js');const profile=await(await fetch('./vfx/crt-profile.json')).json();window.fixtureEffect=await PixiCrtOverlay.create(document.querySelector('.console'),profile,window.fixtureClock);window.fixtureEffect.setEnabled(true);});
  await page.waitForFunction(()=>window.fixtureEffect.describe().uploads>0);
  const crtBefore=await page.evaluate(()=>({uploads:window.fixtureEffect.uploads,x:window.fixtureOverview.map.camera.x}));
  await canvas.focus();await page.keyboard.press('ArrowLeft');await page.waitForFunction(before=>window.fixtureOverview.map.camera.x!==before.x&&window.fixtureEffect.uploads>before.uploads,crtBefore);
  await page.locator('[data-analysis-filter=critical]').click();assert.equal(await page.locator('[data-analysis-filter=critical]').getAttribute('aria-pressed'),'true');await page.locator('[data-analysis-filter=all]').click();
  await page.waitForTimeout(300);
  const alignment=await page.evaluate(()=>{const m=window.fixtureOverview.map,p=m.issue.points[0],r=m.canvas.getBoundingClientRect(),x=r.x+(p.x-m.camera.x)*m.camera.scale+m.width/2,y=r.y+(p.y-m.camera.y)*m.camera.scale+m.height/2;const expected=m.issue.severity==='critical'?[255,102,94]:[255,209,107];let error=Infinity;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const color=window.fixtureEffect.ctx.getImageData(Math.round(x+dx),Math.round(y+dy),1,1).data;error=Math.min(error,Math.max(...expected.map((v,i)=>Math.abs(v-color[i]))));}return {x,y,error};});assert(alignment.error<20,'CRT marker is displaced from its DOM/map position: '+JSON.stringify(alignment));
  const geometry=await page.evaluate(()=>{const map=window.fixtureOverview.map,c=map.canvas,r=c.getBoundingClientRect(),point=map.markersLayer.querySelector('g[stroke-width="2"] rect[stroke="none"]'),p=point.getBoundingClientRect(),matrix=map.worldLayer.getScreenCTM();return {camera:map.camera,width:map.width,height:map.height,pointRect:{x:p.x,y:p.y,width:p.width,height:p.height},pointColor:getComputedStyle(point).fill,pointPixel:[...window.fixtureEffect.ctx.getImageData(Math.round(p.x+p.width/2),Math.round(p.y+p.height/2),1,1).data],matrix:{a:matrix.a,d:matrix.d,e:matrix.e,f:matrix.f},rect:{x:r.x,y:r.y,width:r.width,height:r.height},source:window.fixtureEffect.source.toDataURL()};});
  fs.writeFileSync('docs/evidence/spatial-overview-crt-source.png',Buffer.from(geometry.source.split(',')[1],'base64'));delete geometry.source;console.log('CRT map geometry',geometry);
  await page.screenshot({path:'D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/spatial-overview-crt.png'});await page.evaluate(()=>window.fixtureEffect.destroy());
  assert.deepEqual(errors,[]);const result={passed:true,source:'explicit isolated capture of saboteur.zip',capture,issues:await page.locator('.analysis-issue').count(),before,after,checks:['native chart binaries decode and render','select issue','map pan and zoom','return to issue','critical filter','1152x864 and 1024x768 fit','inactive map stops rendering and fetching','bounded bitmap cache','no page errors']};fs.writeFileSync('docs/evidence/spatial-overview-browser.json',JSON.stringify(result,null,2));console.log(result);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
