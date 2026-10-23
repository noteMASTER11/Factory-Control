// Geometry and interpolation only. No telemetry requests, timers or DOM access.
const anchors={nauvis:[.5,.44],gleba:[.15,.12],fulgora:[.85,.12],vulcanus:[.15,.68],aquilo:[.85,.68],'solar-system-edge':[.5,.87],'shattered-planet':[.85,.42]};
export function routeControl(a,b,bend=150){const length=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return [(a[0]+b[0])/2-(b[1]-a[1])/length*bend,(a[1]+b[1])/2+(b[0]-a[0])/length*bend];}
export function routePoint(a,b,t,bend=150){const c=routeControl(a,b,bend);return [(1-t)**2*a[0]+2*(1-t)*t*c[0]+t*t*b[0],(1-t)**2*a[1]+2*(1-t)*t*c[1]+t*t*b[1]];}
export function networkScene(model){
 const width=3200,height=2200,points=new Map(),entities=new Map(model.entities.map(e=>[e.id,e])),platforms=new Map(model.entities.filter(e=>e.kind==='platform').map(e=>[e.surface,e])),groups=new Map();
 let extra=0;for(const location of [...model.locations].sort((a,b)=>a.id.localeCompare(b.id))){const fixed=anchors[location.id],angle=extra*2.399963;if(!fixed)extra++;const p=fixed||[.5+Math.cos(angle)*.35,.45+Math.sin(angle)*.3];points.set(location.id,[p[0]*width,p[1]*height]);}
 for(const group of model.groups){const first=entities.get(group.members[0]);let role=group.kind,hub=group.from||group.to,id=group.id;
  if(group.kind==='transfer'&&(!group.from||!group.to||group.from===group.to)){
   hub=group.from||group.to||platforms.get(first?.from)?.fromLocation||platforms.get(first?.to)?.toLocation;
   role=first?.fromPlatform&&first?.toPlatform?'interplatform':first?.toPlatform?'ascent':first?.fromPlatform?'descent':'transfer';
   id=JSON.stringify(['orbital',hub,role]);
  }
  let row=groups.get(id);if(!row){row={...group,id,hub,role,members:[],items:[],types:0};groups.set(id,row);}row.members.push(...group.members);
 }
 const ordered=[...groups.values()].sort((a,b)=>a.id.localeCompare(b.id)),cargoKey=i=>JSON.stringify([i.name,i.quality]);
 for(const group of ordered){group.members.sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));const items=new Map();for(const id of group.members)for(const i of entities.get(id)?.filteredItems||[]){const key=cargoKey(i),old=items.get(key);if(old)old.count+=i.count;else items.set(key,{name:i.name,quality:i.quality,count:i.count});}group.items=[...items.values()];group.types=items.size;}
 const groupPoints=new Map(),hubGroups=new Map(),occupied=[];
 for(const group of ordered){if(group.kind==='flight'||group.kind==='transfer'&&group.from&&group.to&&group.from!==group.to)continue;const key=group.hub||'';if(!hubGroups.has(key))hubGroups.set(key,[]);hubGroups.get(key).push(group);}
 for(const[hub,rows]of hubGroups){const a=points.get(hub)||[width*.5,height*.95];rows.sort((a,b)=>['orbit','loading','ascent','descent','interplatform','transfer','unknown'].indexOf(a.role)-['orbit','loading','ascent','descent','interplatform','transfer','unknown'].indexOf(b.role));rows.forEach((g,i)=>groupPoints.set(g.id,[a[0]+(i%2?136:-136),a[1]+92+Math.floor(i/2)*84]));occupied.push({x:a[0],y:a[1]+100,width:590,height:360});}
 for(const p of points.values())occupied.push({x:p[0],y:p[1],width:230,height:60});
 for(const group of ordered){if(groupPoints.has(group.id))continue;const a=points.get(group.from)||[width*.5,height*.95],b=points.get(group.to)||[width*.5,height*.95],preferred=routePoint(a,b,.5,350);let p=preferred;
  const free=p=>!occupied.some(r=>Math.abs(r.x-p[0])<(r.width+220)/2+30&&Math.abs(r.y-p[1])<(r.height+58)/2+30);
  if(!free(p)){outer:for(let r=80;r<=700;r+=70)for(let step=0;step<16;step++){const angle=step*Math.PI/8,c=[Math.max(140,Math.min(width-140,preferred[0]+Math.cos(angle)*r)),Math.max(70,Math.min(height-70,preferred[1]+Math.sin(angle)*r))];if(free(c)){p=c;break outer;}}}
  groupPoints.set(group.id,p);occupied.push({x:p[0],y:p[1],width:220,height:58});
 }
 return {width,height,points,groups:ordered,groupPoints};
}

export class PositionTween{
 constructor(){this.rows=new Map();}
 set(targets,now,duration=1400){const next=new Map();for(const[id,to]of targets){const old=this.rows.get(id);if(old&&old.to[0]===to[0]&&old.to[1]===to[1]){next.set(id,old);continue;}const from=old?this.point(id,now):to;next.set(id,{from:[...from],to:[...to],at:now,duration:Math.hypot(to[0]-from[0],to[1]-from[1])<.1?0:duration});}this.rows=next;}
 point(id,now){const row=this.rows.get(id);if(!row)return null;const t=row.duration?Math.max(0,Math.min(1,(now-row.at)/row.duration)):1,ease=t*t*(3-2*t);return [row.from[0]+(row.to[0]-row.from[0])*ease,row.from[1]+(row.to[1]-row.from[1])*ease];}
 moving(now){return [...this.rows.values()].some(r=>now<r.at+r.duration);}
 finish(){for(const row of this.rows.values()){row.from=row.to;row.duration=0;}}
}
