const list=value=>Array.isArray(value)?value:[];
const itemKey=item=>JSON.stringify([item.name,item.quality||'normal']);
const cleanName=value=>value?.replace(/\[[^\]]*\]/g,'').trim()||value;
export function spaceNetwork(topic,scope,options={},now=Date.now()){
 const data=topic?.payload?.data?.space,available=data?.schema_version===1,tick=topic?.tick||0;
 const fresh=!!topic&&!topic.stale&&now-Date.parse(topic.written_at)<=15000;
 const scale=topic?.observed_ups===undefined?1:Number.isFinite(topic.observed_ups)&&topic.observed_ups>0?60/topic.observed_ups:null;
 const duration=value=>fresh&&scale!==null&&Number.isFinite(value)?Math.max(0,value*scale):null;
 const platforms=list(data?.platforms).filter(p=>p.force===scope.force).slice(0,128),bySurface=new Map(platforms.map(p=>[p.surface,p])),byId=new Map(platforms.map(p=>[p.id,p]));
 const entities=[],locations=new Map(),endpointNames={};
 const addLocation=(id,planned=false)=>{if(!id||bySurface.has(id))return;const old=locations.get(id);if(!old)locations.set(id,{id,planned});else if(!planned)old.planned=false;};
 const place=surface=>bySurface.has(surface)?bySurface.get(surface).location||null:surface;
 const items=rows=>list(rows).filter(i=>i.name&&Number.isFinite(i.count)&&i.count>0).map(i=>{const value={...i,quality:i.quality||'normal'};if(Number.isFinite(i.spoil_tick_min))value.remainingSeconds=duration((i.spoil_tick_min-tick)/60);return value;});
 for(const p of platforms){
  endpointNames[p.surface]=cleanName(p.name)||p.surface;
  const current=p.active_route?.observed?p.active_route:list(p.schedule?.records)[(p.schedule?.current||1)-1];
  const connection=p.connection,backward=connection&&(p.next_location===connection.from||p.previous_location===connection.to),directionKnown=!!connection&&(backward||p.next_location===connection.to||p.previous_location===connection.from);
  const from=p.location|| (backward?connection?.to:connection?.from)||null,to=p.location||(backward?connection?.from:connection?.to)||null;
  const stale=!fresh||!Number.isFinite(p.sample_end_tick)||tick-p.sample_end_tick>900;
  const records=list(p.schedule?.records),start=Math.max(0,(p.schedule?.current||1)-1);
  const plan=p.active_route?.temporary?[{station:p.active_route.station,temporary:true}]:Array.from({length:Math.min(records.length,5)},(_,i)=>records[(start+i)%records.length]).filter(r=>r?.station).map(r=>({station:r.station,allowsUnloading:r.allows_unloading!==false}));
  const row={id:'platform:'+p.id,sourceId:p.id,kind:'platform',name:cleanName(p.name)||p.surface,surface:p.surface,from,to,fromLocation:from,toLocation:to,directionKnown,
   stage:p.paused?'paused':p.location?'orbit':connection?'flight':'unknown',progress:Number.isFinite(p.distance)?Math.max(0,Math.min(1,backward?1-p.distance:p.distance)):null,
   etaSeconds:stale||p.paused||!directionKnown?null:duration(p.flight_eta_seconds),complete:p.complete===true,stale,items:items(p.items),plan,
   interrupt:!!p.active_route?.temporary,stopAtDestination:current?.station===to&&current?.allows_unloading!==false};
  entities.push(row);addLocation(from);addLocation(to);
 }
 for(const pod of list(data?.shipments).filter(p=>p.force===scope.force).slice(0,512)){
  const fromLocation=place(pod.origin),toLocation=place(pod.destination);
  entities.push({id:'shipment:'+pod.id,sourceId:pod.id,kind:'shipment',from:pod.origin||null,to:pod.destination||null,fromLocation,toLocation,
   fromPlatform:bySurface.get(pod.origin)?.id,toPlatform:bySurface.get(pod.destination)?.id,stage:['launching','transit','unloading'].includes(pod.stage)?pod.stage:'unknown',etaSeconds:duration(pod.eta_seconds),confirmed:pod.complete===true,complete:pod.complete===true,stale:!fresh,items:items(pod.items),plan:[]});
  addLocation(fromLocation);addLocation(toLocation);
 }
 for(const port of list(data?.ports).filter(p=>p.force===scope.force&&p.type==='rocket-silo').slice(0,512)){
  const cargo=items(port.items);if(!cargo.length)continue;const target=byId.get(port.target_platform),stale=!fresh||!Number.isFinite(port.sample_end_tick)||tick-port.sample_end_tick>900;
  entities.push({id:'loading:'+port.id,sourceId:port.id,kind:'loading',from:port.surface,to:target?.surface||null,fromLocation:port.surface,toLocation:port.surface,
   toPlatform:target?.id,stage:'loading',etaSeconds:stale?null:duration(port.loading_eta_seconds),confirmed:false,complete:port.complete===true,stale,items:cargo,plan:[]});addLocation(port.surface);
 }
 const rank={platform:0,shipment:1,loading:2};entities.sort((a,b)=>rank[a.kind]-rank[b.kind]||a.id.localeCompare(b.id,'en',{numeric:true}));
 const resource=options.spaceResource||'all',quality=options.spaceQuality||'all';
 const resources=new Set(),qualities=new Set();for(const entity of entities){entity.filteredItems=entity.items.filter(i=>(resource==='all'||i.name===resource)&&(quality==='all'||i.quality===quality));for(const i of entity.items){resources.add(i.name);qualities.add(i.quality);}}
 if(resource!=='all')resources.add(resource);if(quality!=='all')qualities.add(quality);
 const visibleEntities=entities.filter(e=>resource==='all'&&quality==='all'||e.filteredItems.length>0),groups=new Map();
 for(const entity of visibleEntities){
  const kind=entity.kind==='platform'?(entity.stage==='flight'||entity.stage==='paused'&&entity.from!==entity.to?'flight':entity.from?'orbit':'unknown'):entity.kind==='loading'?'loading':'transfer';
  const id=JSON.stringify([kind,kind==='transfer'?entity.from:entity.fromLocation,kind==='transfer'?entity.to:entity.toLocation,kind==='flight'?entity.directionKnown:null]);
  let group=groups.get(id);if(!group){group={id,kind,from:entity.fromLocation,to:entity.toLocation,source:entity.from,target:entity.to,directionKnown:entity.directionKnown!==false,members:[],items:[],types:0};groups.set(id,group);}
  group.members.push(entity.id);
 }
 const entityById=new Map(entities.map(e=>[e.id,e]));
 for(const group of groups.values()){const cargo=new Map();for(const id of group.members)for(const item of entityById.get(id).filteredItems){const key=itemKey(item),old=cargo.get(key);if(old)old.count+=item.count;else cargo.set(key,{name:item.name,quality:item.quality,count:item.count});}group.items=[...cargo.values()];group.types=cargo.size;}
 const requested=options.spaceSelected||(options.platform?'platform:'+options.platform:null),selected=visibleEntities.find(e=>e.id===requested)||visibleEntities.find(e=>e.kind==='platform'&&e.stage==='flight')||visibleEntities[0]||null;
 if(selected)for(const row of selected.plan)addLocation(row.station,true);
 return {available,fresh,partial:!!data?.overflow,force:scope.force,tick,entities,visibleEntities,groups:[...groups.values()].sort((a,b)=>a.id.localeCompare(b.id)),locations:[...locations.values()].sort((a,b)=>a.id.localeCompare(b.id)),endpointNames,
  resources:[...resources].sort(),qualities:[...qualities].sort(),selected,options:{resource,quality,selected:selected?.id||requested}};
}
