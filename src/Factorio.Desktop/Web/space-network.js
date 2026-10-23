import {node} from './charts.js';
import {networkScene} from './space-network-layout.js';
import {SpaceNetworkPainter} from './space-network-painter.js';
const $=id=>document.getElementById(id);
export class SpaceNetwork{
 constructor(i18n,configure,clock,resource){
  this.i18n=i18n;this.t=(k,v)=>i18n.text(k,v);this.configure=configure;this.clock=clock||{request:(_,fn)=>fn(),cancel(){}};this.animate=!!clock;this.resource=resource;this.active=false;this.draws=0;this.buttons=new Map();
  this.host=$('space-network-canvas');this.chart=$('space-network-links');this.layer=$('space-network-nodes');this.world=$('space-network-world');this.worldSize={width:3200,height:2200};this.camera={x:1600,y:1150,scale:.75};this.painter=new SpaceNetworkPainter(this);this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
  this.host.addEventListener('wheel',event=>{event.preventDefault();this.zoom(Math.exp(-Math.max(-300,Math.min(300,event.deltaY))*.0025),this.local(event));},{passive:false});
  this.host.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('button,select'))return;this.drag={...this.local(event),camera:{...this.camera}};this.host.setPointerCapture(event.pointerId);this.host.classList.add('dragging');event.preventDefault();});
  this.host.addEventListener('pointermove',event=>{if(!this.drag)return;const p=this.local(event);this.camera.x=this.drag.camera.x-(p.x-this.drag.x)/this.camera.scale;this.camera.y=this.drag.camera.y-(p.y-this.drag.y)/this.camera.scale;this.requestCamera();});
  const end=()=>{this.drag=null;this.host.classList.remove('dragging');};for(const type of ['pointerup','pointercancel','lostpointercapture'])this.host.addEventListener(type,end);
  this.host.addEventListener('keydown',event=>{if(event.target!==this.host)return;const step=60/this.camera.scale;if(event.key==='+'||event.key==='=')this.zoom(1.2);else if(event.key==='-')this.zoom(1/1.2);else if(event.key==='Home')this.fit();else if(event.key.startsWith('Arrow')){if(event.key==='ArrowLeft')this.camera.x-=step;if(event.key==='ArrowRight')this.camera.x+=step;if(event.key==='ArrowUp')this.camera.y-=step;if(event.key==='ArrowDown')this.camera.y+=step;this.requestCamera();}else return;event.preventDefault();});
  $('space-network-in').addEventListener('click',()=>this.zoom(1.2));$('space-network-out').addEventListener('click',()=>this.zoom(1/1.2));$('space-network-fit').addEventListener('click',()=>this.fit());
  this.observer=new ResizeObserver(()=>this.request());this.observer.observe(this.host);
  $('space-network-resource').addEventListener('change',()=>{this.pinned=null;configure({spaceResource:$('space-network-resource').value});});
  $('space-network-quality').addEventListener('change',()=>{this.pinned=null;configure({spaceQuality:$('space-network-quality').value});});
  $('space-network-selection').addEventListener('change',()=>this.choose($('space-network-selection').value));
 }
 setActive(value){if(this.active===value)return;this.active=value;if(value)this.request();else{this.drag=null;this.host.classList.remove('dragging');for(const key of ['logistics.space-network','logistics.space-camera','logistics.space-motion'])this.clock.cancel?.(key);this.painter.stop();}}
 local(event){const r=this.host.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}
 zoom(factor,anchor={x:this.host.clientWidth/2,y:this.host.clientHeight/2}){const c=this.camera,w=this.host.clientWidth,h=this.host.clientHeight,x=c.x+(anchor.x-w/2)/c.scale,y=c.y+(anchor.y-h/2)/c.scale;c.scale=Math.max(.12,Math.min(2.5,c.scale*factor));c.x=x-(anchor.x-w/2)/c.scale;c.y=y-(anchor.y-h/2)/c.scale;this.requestCamera();}
 fit(){const {width,height}=this.worldSize;this.camera={x:width/2,y:height/2,scale:Math.min(this.host.clientWidth/width,this.host.clientHeight/height)};this.requestCamera();}
 focus(location){const p=this.scene?.points.get(location);if(p){this.camera={x:p[0],y:p[1]+140,scale:.9};this.requestCamera();}}
 requestCamera(){if(this.active)this.clock.request('logistics.space-camera',()=>{if(this.active)this.applyCamera();});}
 applyCamera(){const c=this.camera;this.world.style.transform=`translate(${this.host.clientWidth/2}px,${this.host.clientHeight/2}px) scale(${c.scale}) translate(${-c.x}px,${-c.y}px)`;this.world.style.setProperty('--network-counter-scale',String(1/Math.min(1,c.scale)));this.world.dataset.detail=String(c.scale>=.5);this.painter.scaleArrows();}
 setModel(model){
  if(this.model?.force!==model.force||this.model?.options.resource!==model.options.resource||this.model?.options.quality!==model.options.quality)this.pinned=null;
  if(this.pinned){const observed=model.visibleEntities.find(e=>e.id===this.pinned.id);if(observed)this.pinned=observed;model={...model,selected:observed||{...this.pinned,stale:true,etaSeconds:null}};}
  this.model=model;this.request();
 }
 request(){if(this.active)this.clock.request('logistics.space-network',()=>{if(this.active)this.draw();});}
 choose(id){const entity=this.model?.visibleEntities.find(e=>e.id===id);if(!entity)return;this.pinned=entity;this.model={...this.model,selected:entity};this.request();this.configure({spaceSelected:id,...(entity.kind==='platform'?{platform:entity.sourceId}:{})});}
 name(value){return this.model?.endpointNames[value]||this.i18n.prototype(value,'planet');}
 quality(value){return this.i18n.has('quality.'+value)?this.t('quality.'+value):value;}
 number(value){return this.i18n.number(value);}
 compact(value){return value>=1e9?this.t('resources.billion',{value:this.i18n.number(value/1e9,true)}):value>=1e6?this.t('overview.million',{value:this.i18n.number(value/1e6,true)}):value>=1e4?this.t('overview.thousand',{value:this.i18n.number(value/1e3,true)}):this.number(value);}
 duration(value){return Number.isFinite(value)?this.t(value>=60?'analysis.minutes':'analysis.seconds',{value:this.i18n.number(value>=60?value/60:value,value>=60)}):this.t('space.etaUnknown');}
 entityName(e){return e.name||this.t(e.kind==='shipment'?'space.network.pod':'space.network.silo',{id:this.number(e.sourceId)});}
 optionList(id,rows,value){const el=$(id),signature=JSON.stringify(rows);if(el.dataset.signature!==signature){el.replaceChildren(...rows.map(([v,text])=>{const option=node('option',text);option.value=v;return option;}));el.dataset.signature=signature;}el.value=value;}
 button(id,className,choose){let button=this.buttons.get(id);if(!button){button=node('button',undefined,className);button.type='button';button.dataset.hoverKey=id;button.addEventListener('click',choose);this.buttons.set(id,button);this.layer.append(button);}return button;}
 draw(){
  const model=this.model;if(!model||this.host.clientWidth<1||this.host.clientHeight<1)return;this.draws++;this.scene=networkScene(model);this.groups=new Map(this.scene.groups.map(g=>[g.id,g]));this.applyCamera();
  this.optionList('space-network-resource',[['all',this.t('production.map.allResources')],...model.resources.map(r=>[r,this.i18n.prototype(r,'item')])],model.options.resource);
  this.optionList('space-network-quality',[['all',this.t('space.network.allQualities')],...model.qualities.map(q=>[q,this.quality(q)])],model.options.quality);
  const rows=model.visibleEntities.map(e=>[e.id,this.entityName(e)]);if(model.selected&&!rows.some(r=>r[0]===model.selected.id))rows.push([model.selected.id,this.entityName(model.selected)+' · '+this.t('space.stale')]);
  this.optionList('space-network-selection',rows,model.selected?.id);$('space-network-selection').disabled=!model.selected;
  $('space-network-state').textContent=this.t(!model.available?'space.collectorRequired':!model.fresh?'space.stale':model.partial?'space.partial':'space.network.cargoNow');$('space-network-state').className=!model.fresh||model.partial?'warn':'muted';
  this.painter.draw(model,this.scene);$('space-network-empty').textContent=this.scene.groups.length?'':this.t(!model.available?'space.noData':model.entities.length?'space.network.noMatches':'space.noPlatforms');this.detail();
 }
 detail(){const model=this.model,e=model.selected,host=$('space-network-detail'),stages=$('space-network-stages');host.replaceChildren();stages.replaceChildren();if(!e){host.append(node('div',this.t('space.network.choose'),'chart-wait'));return;}
  host.append(node('div',this.entityName(e),'space-network-name'),node('div',[this.name(e.from),this.name(e.to)].join(e.directionKnown===false?' ↔ ':' → '),'space-network-route'));
  const state=node('div',this.t(e.stale?'space.stale':'space.network.stage.'+e.stage),'space-network-stage');if(!e.complete)state.append(node('span',this.t('space.network.partialCargo'),'warn'));host.append(state);
  host.append(node('strong',e.etaSeconds===null?this.t('space.etaUnknown'):this.t('space.network.approx',{value:this.duration(e.etaSeconds)}),'space-network-eta'));host.append(node('div',this.t(e.kind==='platform'?'space.network.legEta':e.kind==='loading'?'space.loadingEta':'space.network.deliveryEta'),'muted'));
  if(e.kind==='platform'&&e.stage==='flight')host.append(node('div',this.t(e.stopAtDestination?'space.network.unloadUnknown':'space.network.passThrough'),'space-network-unload'));
  const table=node('table'),head=node('thead'),heading=node('tr');heading.append(node('th',this.t('overview.resource')),node('th',this.t('production.countColumn')));head.append(heading);const body=node('tbody');
  for(const item of e.filteredItems){const row=node('tr'),name=node('td'),count=node('td',this.t('space.network.units',{value:this.compact(item.count)}));count.title=this.number(item.count);name.append(this.resource(item));row.append(name,count);body.append(row);}
  if(!e.filteredItems.length){const row=body.insertRow(),td=row.insertCell();td.colSpan=2;td.textContent=this.t('logistics.emptyCargo');}table.append(head,body);host.append(table);
  const spoil=e.stale?[]:e.filteredItems.map(i=>i.remainingSeconds).filter(Number.isFinite);if(spoil.length)host.append(node('div',this.t('space.spoilIn',{eta:this.duration(Math.min(...spoil))}),'space-network-spoil'));
  if(e.kind==='platform'){const plan=node('div',undefined,'space-network-plan');plan.append(node('small',this.t(e.interrupt?'space.network.interrupt':'space.network.schedule')),node('div',e.plan.map(r=>this.name(r.station)).join(' → ')||this.t('space.network.noPlan')),node('span',this.t('space.network.waitUnknown'),'muted'));host.append(plan);}
  const keys=e.kind==='platform'?['loading','flight','orbit','unloading']:['loading','transit','unloading'];for(const key of keys)stages.append(node('span',this.t('space.network.stage.'+key),(key===e.stage||e.stage==='paused'&&key==='flight')?'good':'muted'));
 }
 describe(){return {active:this.active,draws:this.draws,motionFrames:this.painter.frames,moving:this.painter.motion.moving(performance.now()),buttons:this.buttons.size,groups:this.scene?.groups.length||0,entities:this.model?.entities.length||0,selected:this.model?.selected?.id,camera:{...this.camera}};}
}
