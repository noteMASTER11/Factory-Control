import {node} from './charts.js';
import {PositionTween,routeControl,routePoint} from './space-network-layout.js';
const svg=(tag,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
export class SpaceNetworkPainter{
 constructor(owner){this.owner=owner;this.motion=new PositionTween();this.frames=0;}
 stop(){this.motion.finish();}
 draw(model,scene){
  const o=this.owner,now=performance.now(),selected=model.selected,byId=new Map(model.entities.map(e=>[e.id,e])),bySurface=new Map(model.entities.filter(e=>e.kind==='platform').map(e=>[e.surface,e])),used=new Set(),targets=new Map();this.bound=new Map();
  o.chart.setAttribute('viewBox',`0 0 ${scene.width} ${scene.height}`);o.chart.replaceChildren();
  const point=id=>scene.points.get(id)||[scene.width*.5,scene.height*.95];
  const show=(id,button,p)=>{used.add(id);targets.set(id,p);this.bound.set(id,button);};
  const link=(a,b,{active=false,plan=false,arrow=true,bend=150,kind='transport',id=''}={})=>{
   const c=routeControl(a,b,bend),path=svg('path',{d:`M ${a[0]} ${a[1]} Q ${c[0]} ${c[1]} ${b[0]} ${b[1]}`,class:'space-network-link'+(active?' selected':selected?' dim':'')+(plan?' planned':''),'data-route':id,'data-link-kind':kind});o.chart.append(path);
   if(arrow)for(const t of [.35,.7]){const p=routePoint(a,b,t,bend),dx=(1-t)*(c[0]-a[0])+t*(b[0]-c[0]),dy=(1-t)*(c[1]-a[1])+t*(b[1]-c[1]);o.chart.append(svg('path',{d:'M -10 -7 L 0 0 L -10 7',transform:`translate(${p[0]} ${p[1]}) rotate(${Math.atan2(dy,dx)*180/Math.PI})`,class:'space-network-arrow'+(active?' selected':selected?' dim':'')+(plan?' planned':''),'data-direction':id}));}
   return path;
  };
  for(const location of model.locations){const p=point(location.id),rows=scene.groups.filter(g=>g.hub===location.id&&g.kind!=='flight'),height=Math.max(160,Math.ceil(rows.length/2)*84+145);o.chart.append(svg('rect',{x:p[0]-282,y:p[1]-36,width:564,height,rx:16,class:'space-network-hub'}));
   const id='location:'+location.id,button=o.button(id,'space-network-location',()=>o.focus(location.id));button.replaceChildren(node('b',o.name(location.id)));
   const orbit=model.entities.filter(e=>e.kind==='platform'&&e.from===location.id&&e.from===e.to).length;button.append(node('small',o.t(location.planned?'space.network.planNode':'space.network.orbitCount',{count:o.number(orbit)})));button.dataset.planned=String(location.planned);button.dataset.endpoint=selected?.from===location.id?'source':selected?.to===location.id?'destination':'';button.setAttribute('aria-pressed',String(!!button.dataset.endpoint));show(id,button,p);
  }
  const endpoint=surface=>{const platform=bySurface.get(surface);if(!platform)return point(surface);const a=point(platform.fromLocation),b=point(platform.toLocation);if(platform.fromLocation!==platform.toLocation&&Number.isFinite(platform.progress))return routePoint(a,b,platform.progress);const angle=platform.sourceId*2.399963;return [a[0]+Math.cos(angle)*215,a[1]-90+Math.sin(angle)*70];};
  for(const group of scene.groups){const e=byId.get(group.members.includes(selected?.id)?selected.id:group.members[0]);if(!e)continue;const active=group.members.includes(selected?.id),id='group:'+group.id,p=scene.groupPoints.get(group.id),button=o.button(id,'space-network-entity',()=>{const current=o.groups.get(group.id);if(current){const selected=o.model.selected?.id;o.choose(current.members.includes(selected)?selected:current.members[0]);}});button.dataset.group=group.id;button.dataset.hub=group.hub||'';button.dataset.role=group.role;button.dataset.stage=e.stage;button.dataset.stale=String(e.stale);button.setAttribute('aria-pressed',String(active));
   const category=group.kind==='loading'?o.i18n.prototype('rocket-silo','entity'):group.kind==='transfer'?o.i18n.prototype('cargo-pod','entity'):o.t('space.platform'),direction=group.role==='ascent'?'↑ ':group.role==='descent'?'↓ ':group.role==='interplatform'?'⇄ ':'';
   const title=group.members.length>1?category+' ×'+o.number(group.members.length):e.kind==='platform'?o.entityName(e):category,summary=model.options.resource!=='all'?o.i18n.prototype(model.options.resource,'item')+' · '+o.t('space.network.units',{value:o.compact(group.items.reduce((n,i)=>n+i.count,0))}):o.t('space.network.varieties',{count:o.number(group.types)});
   button.replaceChildren(node('span',direction+title),node('small',summary),node('b','×'+o.number(group.members.length),'space-network-count'));button.title=title+' · '+[o.name(e.from),o.name(e.to)].join(e.directionKnown===false?' ↔ ':' → ');show(id,button,p);
   if(group.kind==='flight'){
    const a=point(group.from),b=point(group.to);link(a,b,{active,arrow:group.directionKnown,id:group.id});const middle=routePoint(a,b,.5);link(p,middle,{active,arrow:false,bend:0,kind:'leader'});
    const all=group.members.map(id=>byId.get(id)).filter(e=>Number.isFinite(e.progress)).sort((a,b)=>a.progress-b.progress),samples=all.length<=5?all:[0,.25,.5,.75,1].map(t=>all[Math.round((all.length-1)*t)]);if(active&&selected.kind==='platform'&&Number.isFinite(selected.progress)&&!samples.some(e=>e.id===selected.id))samples[Math.min(2,samples.length)]=byId.get(selected.id);
    for(const platform of samples){const key='mover:'+platform.id,mover=o.button(key,'space-network-mover',()=>o.choose(platform.id));mover.textContent='◆';mover.title=o.entityName(platform);mover.setAttribute('aria-label',o.entityName(platform));mover.setAttribute('aria-pressed',String(platform.id===selected?.id));mover.dataset.entity=platform.id;
     const motionKey=key+'|'+group.id;used.add(key);targets.set(motionKey,routePoint(a,b,platform.progress));this.bound.set(motionKey,mover);if(platform.stale||platform.stage==='paused')mover.dataset.snap='true';else delete mover.dataset.snap;
    }
   }else if(group.kind==='transfer'&&active){const a=endpoint(e.from),b=endpoint(e.to);link(a,b,{active:true,id:group.id,bend:60});for(const[p,surface]of [[a,e.from],[b,e.to]]){o.chart.append(svg('circle',{cx:p[0],cy:p[1],r:5,class:'space-network-position','data-endpoint':surface===e.from?'source':'destination'}));const platform=bySurface.get(surface);if(platform){const id='endpoint:'+platform.id,button=o.button(id,'space-network-endpoint-button',()=>o.choose(platform.id));button.textContent=o.entityName(platform);button.title=o.entityName(platform);button.dataset.endpoint=surface===e.from?'source':'destination';show(id,button,[p[0],p[1]-26]);}}
   }else if(group.kind==='loading'){link(point(group.hub),p,{active,plan:true,bend:0,arrow:false,kind:'leader'});}
  }
  if(selected?.kind==='platform'){let previous=selected.to;for(const record of selected.plan.slice(0,4)){if(record.station&&previous&&record.station!==previous)link(point(previous),point(record.station),{plan:true,arrow:true,bend:280,id:'plan:'+previous+'>'+record.station});previous=record.station||previous;}}
  for(const[id,button]of o.buttons)if(!used.has(id)){button.remove();o.buttons.delete(id);}
  const duration=o.animate&&!o.reduced.matches&&model.fresh?Math.min(2800,Math.max(900,now-(this.lastSample||now-1400))):0;
  this.motion.set(targets,now,duration);for(const[key,button]of this.bound)if(button.dataset.snap){const row=this.motion.rows.get(key);row.from=row.to;row.duration=0;}
  if(!duration)this.motion.finish();if(this.tick!==model.tick){this.lastSample=now;this.tick=model.tick;}this.scaleArrows();this.paint(now);this.queue();
 }
 scaleArrows(){const size=12/Math.min(1,this.owner.camera.scale);for(const arrow of this.owner.chart.querySelectorAll('.space-network-arrow'))arrow.setAttribute('d',`M ${-size} ${-size*.65} L 0 0 L ${-size} ${size*.65}`);}
 paint(now){for(const[key,button]of this.bound){const p=this.motion.point(key,now);if(!p)continue;button.style.left=p[0]+'px';button.style.top=p[1]+'px';}this.frames++;}
 queue(){const o=this.owner;if(o.active&&o.animate&&!document.hidden&&this.motion.moving(performance.now()))o.clock.request('logistics.space-motion',()=>{if(!o.active||document.hidden)return;this.paint(performance.now());this.queue();});}
}
