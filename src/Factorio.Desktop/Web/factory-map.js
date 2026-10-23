import {chartPages,visibleChartPages,chartLevel} from './chart-model.js';
const svg=(tag,attrs={})=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);return node;};
const attr=(node,key,value)=>{const text=String(value);if(node.getAttribute(key)!==text)node.setAttribute(key,text);};

export class FactoryMap{
 constructor(canvas,i18n,clock,onSelect){
  this.canvas=canvas;this.t=(key,values)=>i18n.text(key,values);this.clock=clock;this.onSelect=onSelect;this.apiRoot=location.hostname==='factory.local'?'https://maps.factory.local':'';this.cache=new Map();this.pending=new Set();this.failures=new Map();this.camera={x:0,y:0,scale:3};this.active=false;this.controller=new AbortController();this.draws=0;this.fetches=0;this.revision=0;
  this.pageSets=new Map();this.seenPages=new Set();this.cacheBytes=0;this.refreshMs=30000;this.nextPrefetch=0;
  this.statusElement=document.getElementById(canvas.id+'-status');
  this.worldLayer=svg('g');this.tilesLayer=svg('g');this.markersLayer=svg('g');this.worldLayer.append(this.tilesLayer,this.markersLayer);this.tileNodes=new Map();
  this.coordinates=svg('text',{x:12,class:'map-coordinate'});this.message=svg('text',{'text-anchor':'middle',class:'map-message'});this.selectedLabel=svg('text',{class:'map-selected-label'});canvas.replaceChildren(this.worldLayer,this.coordinates,this.message,this.selectedLabel);
  this.observer=new ResizeObserver(()=>this.requestDraw());this.observer.observe(canvas.parentElement);
  canvas.addEventListener('wheel',event=>{event.preventDefault();this.zoom(event.deltaY<0?1.25:.8,this.local(event));},{passive:false});
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;this.drag={...this.local(event),camera:{...this.camera},moved:false};canvas.setPointerCapture?.(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{if(!this.drag)return;const p=this.local(event),dx=p.x-this.drag.x,dy=p.y-this.drag.y;this.drag.moved||=Math.abs(dx)+Math.abs(dy)>4;this.camera.x=this.drag.camera.x-dx/this.camera.scale;this.camera.y=this.drag.camera.y-dy/this.camera.scale;this.requestDraw();});
  canvas.addEventListener('pointerup',event=>{const drag=this.drag;this.drag=null;if(!drag||drag.moved)return;const p=this.world(this.local(event));const issue=this.issues?.find(r=>r.bounds&&this.inScope(r)&&p.x>=r.bounds.left&&p.x<=r.bounds.right&&p.y>=r.bounds.top&&p.y<=r.bounds.bottom);if(issue)this.onSelect(issue.id);});
  canvas.addEventListener('pointercancel',()=>{this.drag=null;});
  canvas.addEventListener('keydown',event=>{const delta=48/this.camera.scale;if(event.key==='+'||event.key==='=')this.zoom(1.25);else if(event.key==='-')this.zoom(.8);else if(event.key.startsWith('Arrow')){if(event.key==='ArrowLeft')this.camera.x-=delta;if(event.key==='ArrowRight')this.camera.x+=delta;if(event.key==='ArrowUp')this.camera.y-=delta;if(event.key==='ArrowDown')this.camera.y+=delta;this.requestDraw();}else return;event.preventDefault();});
 }
 local(event){const r=this.canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}
 world(p){return {x:this.camera.x+(p.x-this.width/2)/this.camera.scale,y:this.camera.y+(p.y-this.height/2)/this.camera.scale};}
 inScope(issue){return !!this.scope&&(issue.mapScope?issue.mapScope===this.scope.id:issue.surface===this.scope.surface&&issue.force===this.scope.force);}
 zoom(factor,anchor={x:this.width/2,y:this.height/2}){const before=this.world(anchor);this.camera.scale=Math.max(.25,Math.min(12,this.camera.scale*factor));const after=this.world(anchor);this.camera.x+=before.x-after.x;this.camera.y+=before.y-after.y;this.requestDraw();}
 fit(){const b=this.issue?.bounds;if(b){this.camera.x=(b.left+b.right)/2;this.camera.y=(b.top+b.bottom)/2;this.camera.scale=Math.max(.25,Math.min(6,Math.min((this.width||600)/(b.right-b.left+96),(this.height||400)/(b.bottom-b.top+96))));}else if(this.scope?.tiles?.length){const rows=this.scope.tiles;this.camera.x=rows[0][0]*32+16;this.camera.y=rows[0][1]*32+16;this.camera.scale=2;}this.requestDraw();}
 setActive(active){if(active===this.active)return;this.active=active;if(active){this.poll();this.requestDraw();}else{clearTimeout(this.timer);clearTimeout(this.fillTimer);this.controller.abort();this.controller=new AbortController();this.pending.clear();this.revision++;this.drag=null;}}
 setModel(model,session){
  if(this.session!==session){this.session=session;this.manifest=null;this.scope=null;this.issue=null;this.clearCache();this.controller.abort();this.controller=new AbortController();this.pending.clear();this.revision++;clearTimeout(this.timer);if(this.active)this.poll();}
  const changed=this.issue?.id!==model.selected?.id;this.issue=model.selected;this.issues=model.issues;this.model=model;this.resolveScope();if(changed)this.fit();this.requestDraw();
 }
 resolveScope(){
  const scopes=this.manifest?.scopes||[],issue=this.issue;
  const next=issue?(scopes.find(s=>s.id===issue.mapScope)||scopes.find(s=>s.surface===issue.surface&&s.force===issue.force)):(this.model?.options.scope&&this.model.options.scope!=='all'?scopes.find(s=>JSON.stringify([s.surface,s.force])===this.model.options.scope):scopes[0]);
  const changed=this.scope?.id!==next?.id;this.scope=next;if(changed)this.fit();
 }
 async poll(){
  if(!this.active)return;
  const revision=this.revision;
  try{const response=await fetch(this.apiRoot+'/api/v1/map/manifest',{cache:'no-store',signal:this.controller.signal});if(response.ok){const next=await response.json();if(this.active&&revision===this.revision){if(this.manifest?.generation!==next.generation)this.clearCache();this.manifest=next;this.resolveScope();this.requestDraw();}}}catch{}
  if(this.active&&revision===this.revision)this.timer=setTimeout(()=>this.poll(),5000);
 }
 clearCache(){this.cache.clear();this.cacheBytes=0;this.seenPages.clear();this.pageSets.clear();this.pageScope=null;this.failures.clear();this.tilesLayer.replaceChildren();this.tileNodes.clear();this.markerSignature=null;}
 pages(level){if(this.pageScope!==this.scope){this.pageScope=this.scope;this.pageSets.clear();}if(!this.pageSets.has(level))this.pageSets.set(level,chartPages(this.scope?.tiles||[],level));return this.pageSets.get(level);}
 key(page){return `${this.manifest.generation}/${this.scope.id}/${page.level}/${page.x}/${page.y}`;}
 trimCache(){for(const [key,image]of this.cache){if(this.cache.size<=384&&this.cacheBytes<=16*1024*1024)break;if(this.pinned?.has(key))continue;this.cacheBytes-=image.bytes;this.cache.delete(key);}}
 fillLater(){clearTimeout(this.fillTimer);this.fillTimer=setTimeout(()=>this.requestDraw(),1000);}
 requestDraw(){if(this.active)this.clock.request('overview.map',()=>{if(this.active)this.draw();});}
 async load(row,key){
  const revision=this.revision,generation=this.manifest.generation,scope=this.scope.id;this.pending.add(key);this.fetches++;
  try{
   const response=await fetch(this.apiRoot+`/api/v1/map/pages/${generation}/${scope}/${row.level}/${row.x}/${row.y}?v=${row.version}&s=${encodeURIComponent(this.session||'')}`,{signal:this.controller.signal});if(!response.ok)throw new Error('chart_unavailable');
   const buffer=await response.arrayBuffer();if(buffer.byteLength!==256*256*4)throw new Error('chart_size');
   const raster=document.createElement('canvas');raster.width=raster.height=256;raster.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buffer),256,256),0,0);
   const href=raster.toDataURL('image/png'),bitmap={...row,href,bytes:href.length*2,generation,scope,refreshed:Date.now()};raster.width=raster.height=1;
   if(!this.active||revision!==this.revision||this.manifest?.generation!==generation)return;
   this.cacheBytes-=this.cache.get(key)?.bytes||0;this.cache.set(key,bitmap);this.cacheBytes+=bitmap.bytes;this.seenPages.add(key);this.trimCache();
  }catch(error){if(error.name!=='AbortError'){this.failures.set(key,Date.now());while(this.failures.size>384)this.failures.delete(this.failures.keys().next().value);}}
  finally{if(revision===this.revision){this.pending.delete(key);this.requestDraw();}}
 }
 draw(){
  const box=this.canvas.parentElement.getBoundingClientRect(),width=Math.max(1,Math.round(box.width)),height=Math.max(1,Math.round(box.height));if(width<=1||height<=1)return;
  this.width=width;this.height=height;attr(this.canvas,'viewBox',`0 0 ${width} ${height}`);this.draws++;
  attr(this.worldLayer,'transform',`translate(${width/2} ${height/2}) scale(${this.camera.scale}) translate(${-this.camera.x} ${-this.camera.y})`);
  const x=value=>(value-this.camera.x)*this.camera.scale+width/2,y=value=>(value-this.camera.y)*this.camera.scale+height/2;
  const level=chartLevel(this.camera.scale),rows=visibleChartPages(this.pages(level),this.camera,width,height),now=Date.now();let shown=0;
  const ready=rows.every(row=>this.cache.has(this.key(row))),visible=new Set();
  const intersect=image=>Math.abs((image.x+.5)*image.size-this.camera.x)<(width/this.camera.scale+image.size)/2&&Math.abs((image.y+.5)*image.size-this.camera.y)<(height/this.camera.scale+image.size)/2;
  const images=[...this.cache].filter(([,image])=>image.generation===this.manifest?.generation&&image.scope===this.scope?.id&&(image.level===level||!ready)&&intersect(image)).sort((a,b)=>b[1].level-a[1].level);
  this.pinned=new Set([...rows.map(row=>this.key(row)),...images.map(([key])=>key)]);
  let previousNode=null;
  for(const [key,image]of images){visible.add(key);let node=this.tileNodes.get(key);if(!node){node=svg('image',{x:image.x*image.size,y:image.y*image.size,width:image.size,height:image.size,class:'native-chart-tile'});this.tileNodes.set(key,node);}attr(node,'href',image.href);if(node.parentNode!==this.tilesLayer||node.previousSibling!==previousNode)this.tilesLayer.insertBefore(node,previousNode?previousNode.nextSibling:this.tilesLayer.firstChild);previousNode=node;this.cache.delete(key);this.cache.set(key,image);}
  for(const row of rows){const key=this.key(row),image=this.cache.get(key);if(image)shown+=Math.min(row.count,image.count);
   // Keep the previous pixels until their replacement is ready. Missing pages
   // take priority over refreshes; the viewport is never cut to nearest N tiles.
   if(this.pending.size<2&&!this.pending.has(key)&&now-(this.failures.get(key)||0)>5000&&(!image||(ready&&image.version!==row.version&&now-image.refreshed>=this.refreshMs)))this.load(row,key);
  }
  for(const [key,node]of this.tileNodes)if(!visible.has(key)){node.remove();this.tileNodes.delete(key);}
  this.visiblePages=rows.filter(row=>this.cache.has(this.key(row))).length;this.targetPages=rows.length;this.trimCache();
  // Fill the rest of the known base gradually, once per page. No offscreen DOM
  // rendering, no refresh loop for evicted entries and no calls to the engine.
  if(this.scope&&ready&&this.pending.size===0){
   const unseen=[...this.pages(0).values()].filter(row=>!this.seenPages.has(this.key(row))&&now-(this.failures.get(this.key(row))||0)>5000).sort((a,b)=>Math.hypot((a.x+.5)*a.size-this.camera.x,(a.y+.5)*a.size-this.camera.y)-Math.hypot((b.x+.5)*b.size-this.camera.x,(b.y+.5)*b.size-this.camera.y));
   if(unseen.length&&now>=this.nextPrefetch){this.nextPrefetch=now+1000;this.load(unseen[0],this.key(unseen[0]));}
   if(unseen.length||rows.some(row=>this.cache.get(this.key(row))?.version!==row.version))this.fillLater();
  }
  this.drawMarkers();
  attr(this.coordinates,'y',height-13);const coordinateText=this.t('analysis.mapCoordinates',{x:Math.round(this.camera.x),y:Math.round(this.camera.y)});if(this.coordinates.textContent!==coordinateText)this.coordinates.textContent=coordinateText;
  const selected=this.issue?.located&&this.inScope(this.issue)?this.issue:null;
  const labelText=selected?this.t('analysis.mapCount',{count:selected.count}):'';if(this.selectedLabel.textContent!==labelText)this.selectedLabel.textContent=labelText;
  if(selected){attr(this.selectedLabel,'x',Math.max(8,Math.min(width-130,x(selected.bounds.left)+5)));attr(this.selectedLabel,'y',Math.max(18,Math.min(height-30,y(selected.bounds.top)-9)));}
  const message=!this.manifest?'analysis.mapWaiting':!this.scope?'analysis.mapScopeWaiting':!rows.length?'analysis.mapAreaWaiting':!shown?'analysis.mapLoading':null;
  attr(this.message,'x',width/2);attr(this.message,'y',height/2+4);const messageText=message?this.t(message):'';if(this.message.textContent!==messageText)this.message.textContent=messageText;
  const label=this.statusElement;if(label){const text=this.scope?this.t('analysis.mapCoverage',{loaded:shown,total:rows.reduce((n,row)=>n+row.count,0)}):this.t('analysis.mapWaiting');if(label.textContent!==text)label.textContent=text;}
 }
 drawMarkers(){
  const issues=(this.issues||[]).filter(issue=>issue.located&&this.inScope(issue)),signature=JSON.stringify([this.scope?.id,this.issue?.id,issues.map(r=>[r.id,r.count,r.cells,r.points,r.color])]);
  if(signature===this.markerSignature)return;this.markerSignature=signature;this.markersLayer.replaceChildren();
  for(const issue of issues){const selected=issue.id===this.issue?.id,b=issue.bounds,color=issue.color||(issue.severity==='critical'?'#ff665e':'#ffd16b');
   const group=svg('g',{fill:color,stroke:color,'stroke-width':selected?2:1,'pointer-events':'none'});
   for(const cell of issue.cells)group.append(svg('rect',{x:cell.x*32,y:cell.y*32,width:32,height:32,'fill-opacity':.12,stroke:selected?color:'none','vector-effect':'non-scaling-stroke'}));
   group.append(svg('rect',{x:b.left,y:b.top,width:b.right-b.left,height:b.bottom-b.top,fill:'none','vector-effect':'non-scaling-stroke'}));
   if(selected)for(const point of issue.points)group.append(svg('rect',{x:point.x-.9,y:point.y-.9,width:1.8,height:1.8,stroke:'none'}));
   this.markersLayer.append(group);
  }
 }
 describe(){return {draws:this.draws,fetches:this.fetches,cached:this.cache.size,encodedBytes:this.cacheBytes,pending:this.pending.size,active:this.active,scope:this.scope?.id,visiblePages:this.visiblePages,targetPages:this.targetPages};}
}
