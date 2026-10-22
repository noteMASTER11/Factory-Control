const sum=(rows,key)=>rows.reduce((n,r)=>n+(Number(r[key])||0),0);
export function powerPoint(topic,scope,network='all'){
 const data=topic?.payload.data||{};
 const match=r=>r.surface===scope.surface&&r.force===scope.force;
 const networks=(data.networks||[]).filter(r=>match(r)&&(network==='all'||String(r.id)===network));
 const sources=new Map(),consumers=new Map();
 for(const n of networks)for(const [list,target]of [[n.producers||[],sources],[n.consumers||[],consumers]])for(const row of list)target.set(row.name,(target.get(row.name)||0)+row.watts);
 const batteries=network==='all'?(data.accumulators||[]).filter(match):[];
 const generators=(data.nameplate_generators||[]).filter(r=>match(r)&&(network==='all'||String(r.network_id)===network));
 const capacity=batteries.length?sum(batteries,'capacity_joules'):null,charge=capacity===null?null:sum(batteries,'joules');
 return {tick:topic?.tick,production:sum(networks,'production_watts'),consumption:sum(networks,'consumption_watts'),nameplate:generators.length?sum(generators,'theoretical_max_watts'):null,
  charge,capacity,percent:capacity>0?charge/capacity*100:null,batteryFlow:(consumers.get('accumulator')||0)-(sources.get('accumulator')||0),sources:Object.fromEntries(sources),consumers:Object.fromEntries(consumers),networks,generators,batteryCount:batteries.length?sum(batteries,'count'):null};
}
export function seriesPoints(points,max=160){if(points.length<=max)return points;const step=(points.length-1)/(max-1);return Array.from({length:max},(_,i)=>points[Math.round(i*step)]);}
export function energyModel(topics,scope,options,history){
 const network=options.network||'all',minutes=options.minutes||15;
 const all=powerPoint(topics.power,scope),current=powerPoint(topics.power,scope,network);
 const since=(topics.power?.tick||0)-minutes*3600;
 const points=history.filter(p=>p.tick>=since).map(p=>powerPoint(p,scope,network));
 const sourceNames=new Set([...Object.keys(current.sources),...current.generators.map(g=>g.name)]);
 const sources=[...sourceNames].map(name=>{
  const installed=current.generators.filter(g=>g.name===name),samples=points.map(p=>({tick:p.tick,value:p.sources[name]||0}));
  const statuses=new Map();for(const g of installed)statuses.set(g.status,(statuses.get(g.status)||0)+g.count);
  return {name,watts:current.sources[name]||0,count:installed.length?sum(installed,'count'):name==='accumulator'?current.batteryCount:null,
   nameplate:installed.length?sum(installed,'theoretical_max_watts'):null,status:[...statuses].sort((a,b)=>b[1]-a[1])[0]?.[0]||'unmeasured',trend:seriesPoints(samples,32)};
 }).sort((a,b)=>b.watts-a.watts);
 const consumers=Object.entries(current.consumers).map(([name,watts])=>({name,watts,share:current.consumption>0?watts/current.consumption:0,
  peak:Math.max(watts,...points.map(p=>p.consumers[name]||0)),trend:seriesPoints(points.map(p=>({tick:p.tick,value:p.consumers[name]||0})),32)})).sort((a,b)=>b.watts-a.watts);
 const recent=points.filter(p=>p.tick>=(current.tick||0)-18000),meanX=recent.length?recent.reduce((n,p)=>n+p.tick/3600,0)/recent.length:0,meanY=recent.length?sum(recent,'consumption')/recent.length:0;
 let numerator=0,denominator=0;for(const p of recent){const x=p.tick/3600-meanX;numerator+=x*(p.consumption-meanY);denominator+=x*x;}
 const trend=recent.length>=6&&recent.at(-1).tick-recent[0].tick>=3600&&denominator>0?numerator/denominator:null;
 const fresh=!!topics.power&&Date.now()-Date.parse(topics.power.written_at)<15000;
 const batteryProjection=fresh&&current.capacity>0&&Math.abs(current.batteryFlow)>=100?[0,5,15,30].map(m=>({tick:current.tick+m*3600,percent:Math.max(0,Math.min(100,current.percent+current.batteryFlow*m*60/current.capacity*100))})):[];
 return {scope,network,minutes,networks:all.networks,current,sources,consumers,history:seriesPoints(points).map(p=>({tick:p.tick,production:p.production,consumption:p.consumption,nameplate:p.nameplate,percent:p.percent})),historyCount:points.length,
  observedMinutes:points.length>1?(points.at(-1).tick-points[0].tick)/3600:0,
  projections:trend===null||!fresh?[]:[5,15,30].map(m=>({minutes:m,change:trend*m,watts:Math.max(0,current.consumption+trend*m)})),trend,fresh,
  batteryProjection,batteryEta:batteryProjection.length?(current.batteryFlow<0?current.charge/-current.batteryFlow:(current.capacity-current.charge)/current.batteryFlow)/60:null};
}
