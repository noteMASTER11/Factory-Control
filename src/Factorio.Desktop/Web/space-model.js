import {spaceNetwork} from './space-network-model.js';
const list=v=>Array.isArray(v)?v:[];
const key=r=>['item',r.name,r.quality||'normal'].join('|');
const same=(a,b)=>a.surface===b.surface&&a.force===b.force;
const fresh=(topic,now)=>!!topic&&!topic.stale&&now-Date.parse(topic.written_at)<=15000;
const clockScale=topic=>topic?.observed_ups===undefined?1:Number.isFinite(topic.observed_ups)&&topic.observed_ups>0?60/topic.observed_ups:null;
export function transferRates(topic,scope,window='1m',now=Date.now()){
 const data=topic?.payload.data.space,available=data?.schema_version===1,span=window==='10m'?36000:3600,tick=topic?.tick||0,start=tick-span;
 if(available&&Array.isArray(data.flow_rates)){
  const ending=data.rate_window_end_tick,matching=data.flow_rates.filter(r=>same(r,scope)),start=ending-span;
  const ready=fresh(topic,now)&&!data.rate_overflow&&data.started_tick<=start&&data.rate_gap_tick<=start&&matching.every(r=>tick-r.window_end_tick<=900&&data.started_tick<=r.window_end_tick-span&&data.rate_gap_tick<=r.window_end_tick-span);
  const rows=new Map(matching.map(r=>{const id=key(r);return [id,{id,name:r.name,kind:'item',quality:r.quality||'normal',imported:window==='10m'?r.imported_10m:r.imported,exported:window==='10m'?r.exported_10m:r.exported}];}));
  return {available,ready,rows,includeInBalance:ready&&data.production_statistics_include_transfers===false,minutes:span/3600,observedMinutes:Math.max(0,(ending-data.started_tick)/3600)};
 }
 const events=list(data?.events).filter(e=>same(e,scope)&&e.tick>start&&e.tick<=tick),ready=available&&!data.overflow&&fresh(topic,now)&&data.started_tick<=start&&(data.event_floor_tick??tick)<=start&&!events.some(e=>e.complete!==true);
 const rows=new Map();for(const event of events)for(const item of list(event.items)){
  const id=key(item);let row=rows.get(id);if(!row){row={id,name:item.name,kind:'item',quality:item.quality||'normal',imported:0,exported:0};rows.set(id,row);}
  if(event.kind==='import')row.imported+=item.count*3600/span;else if(event.kind==='export')row.exported+=item.count*3600/span;
 }
 return {available,ready,rows,includeInBalance:ready&&data.production_statistics_include_transfers===false,minutes:span/3600,observedMinutes:available?Math.max(0,(tick-Math.max(data.started_tick,data.event_floor_tick))/3600):0};
}
export function spaceModel(topic,scope,options={},now=Date.now()){
 const data=topic?.payload.data.space,tick=topic?.tick||0,available=data?.schema_version===1;
 const scale=clockScale(topic),duration=value=>Number.isFinite(value)&&scale!==null?value*scale:null;
 const cargo=(row)=>({...row,flight_eta_seconds:duration(row.flight_eta_seconds),loading_eta_seconds:duration(row.loading_eta_seconds),stale:!fresh(topic,now)||tick-row.sample_end_tick>900,items:list(row.items).map(item=>({...item,remainingSeconds:Number.isFinite(item.spoil_tick_min)?duration(Math.max(0,(item.spoil_tick_min-tick)/60)):null}))});
 const platforms=list(data?.platforms).filter(p=>p.force===scope.force).map(cargo),ports=list(data?.ports).filter(p=>same(p,scope)).map(cargo);
 const selected=platforms.find(p=>p.id===options.platform)||platforms[0]||null;
 const events=list(data?.events).filter(e=>same(e,scope)).slice(-100).reverse();
 return {network:spaceNetwork(topic,scope,options,now),available,fresh:fresh(topic,now),tick,platforms,ports,selected,events,startedTick:data?.started_tick,overflow:!!data?.overflow,droppedEvents:data?.dropped_events||0,partialEvents:data?.partial_events||0,rates:transferRates(topic,scope,'1m',now)};
}
// Only pods have a committed destination. Platform cargo needs an unmet landing-pad request.
export function incomingSupply(topic,scope,ingredients,now=Date.now()){
 if(!fresh(topic,now)||topic?.payload.data.space?.schema_version!==1)return [];
 const data=topic.payload.data.space,tick=topic.tick,scale=clockScale(topic),duration=value=>Number.isFinite(value)&&scale!==null?value*scale:null,wanted=new Set(list(ingredients).filter(r=>(r.type||r.kind||'item')==='item').map(r=>key(r))),result=[];
 const add=(items,source,stage,eta,basis,confirmed,orbitEta=null)=>{for(const item of list(items))if(wanted.has(key(item))&&item.count>0)result.push({...item,source,stage,etaSeconds:duration(eta),orbitEtaSeconds:duration(orbitEta),basis,confirmed,remainingSeconds:Number.isFinite(item.spoil_tick_min)?duration(Math.max(0,(item.spoil_tick_min-tick)/60)):null});};
 for(const shipment of list(data.shipments))if(shipment.force===scope.force&&shipment.destination===scope.surface&&shipment.complete)add(shipment.items,shipment.origin,shipment.stage,shipment.eta_seconds,shipment.eta_basis,true);
 const requests=new Set();for(const pad of list(data.ports))if(same(pad,scope)&&pad.type==='cargo-landing-pad'&&tick-pad.sample_end_tick<=900)for(const r of list(pad.requests)){
  const present=list(pad.items).filter(i=>key(i)===key(r)).reduce((n,i)=>n+i.count,0);if(r.min>present)requests.add(key(r));
 }
 for(const p of list(data.platforms))if(p.force===scope.force&&p.complete&&tick-p.sample_end_tick<=900){
  const at=p.location===scope.surface,to=p.next_location===scope.surface;
  const record=p.active_route?.observed?p.active_route:list(p.schedule?.records)[(p.schedule?.current||1)-1];if(record?.station!==scope.surface||record.allows_unloading===false||!at&&!to)continue;
  const descent=list(data.durations).find(d=>d.route===p.surface+'|'+scope.surface&&d.samples>=3),flight=at?0:p.flight_eta_seconds;
  const eta=Number.isFinite(flight)&&descent?flight+descent.seconds:null;
  add(list(p.items).filter(i=>requests.has(key(i))),p.name,at?'orbit':'platform',eta,eta===null?null:'motion_history',false,flight);
 }
 for(const port of list(data.ports))if(port.force===scope.force&&port.type==='rocket-silo'&&tick-port.sample_end_tick<=900){
  const p=list(data.platforms).find(p=>p.id===port.target_platform&&p.force===scope.force),records=list(p?.schedule?.records),current=p?.active_route?.observed?p.active_route:records[(p?.schedule?.current||1)-1];
  if(!p||!current)continue;
  // Future stops can be replaced by interrupts or open-ended wait conditions.
  const next=current.station===p.location?null:current;
  if(next?.station===scope.surface&&next.allows_unloading!==false)add(list(port.items).filter(i=>requests.has(key(i))),port.surface,'loading',port.loading_eta_seconds,'loading',false);
 }
 return result.sort((a,b)=>Number(b.confirmed)-Number(a.confirmed)||(a.etaSeconds??Infinity)-(b.etaSeconds??Infinity)).slice(0,8);
}
