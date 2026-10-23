// Conservative observations; a global imbalance is never assigned an invented location.
import {incomingSupply,transferRates} from './space-model.js';
const categories={no_power:'power',low_power:'power',no_fuel:'fuel',item_ingredient_shortage:'ingredients',fluid_ingredient_shortage:'ingredients',no_input_fluid:'ingredients',missing_science_packs:'science'};
const scopeId=row=>JSON.stringify([row.surface,row.force]);
const fresh=(topic,now)=>!!topic&&!topic.stale&&now-Date.parse(topic.written_at)<=15000;
const rates=row=>({produced:Number(row?.produced_per_minute??row?.produced)||0,consumed:Number(row?.consumed_per_minute??row?.consumed)||0});
const matches=(row,issue)=>row.surface===issue.surface&&row.force===issue.force&&row.name===issue.product&&((row.kind||'item')===(issue.kind||'item'));
const missingKey=cell=>(cell.missing_ingredients||[]).map(r=>r.name+'|'+r.quality).sort().join(',');

export function analyzeFactory(topics,options={},flowHistory=[],stockHistory=[],now=Date.now()){
 const machineTopic=topics.machines,data=machineTopic?.payload.data||{},diagnostics=data.diagnostics;
 const tick=machineTopic?.tick||topics.production?.tick||0,scopes=new Map(),issues=[];
 for(const topic of ['machines','production'])for(const row of topics[topic]?.payload.data[topic==='machines'?'groups':'rows']||[])scopes.set(scopeId(row),{id:scopeId(row),surface:row.surface,force:row.force});
 const cells=(diagnostics?.cells||[]).filter(c=>categories[c.status]&&Number.isFinite(c.x)&&Number.isFinite(c.y)&&c.count>0&&c.last_seen_tick-c.first_seen_tick>=600);
 const indexed=new Map(cells.map(c=>[`${c.surface}|${c.force}|${c.name}|${c.recipe||''}|${categories[c.status]}|${c.x}|${c.y}|${missingKey(c)}`,c]));
 const visited=new Set();
 for(const cell of cells){
  if(visited.has(cell.id))continue;
  const category=categories[cell.status],group=[],queue=[cell];visited.add(cell.id);
  while(queue.length){
   const c=queue.pop();group.push(c);
   for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]]){
    const neighbour=indexed.get(`${c.surface}|${c.force}|${c.name}|${c.recipe||''}|${category}|${c.x+dx}|${c.y+dy}|${missingKey(c)}`);
    if(neighbour&&!visited.has(neighbour.id)){visited.add(neighbour.id);queue.push(neighbour);}
   }
  }
  const count=group.reduce((n,c)=>n+c.count,0),first=Math.min(...group.map(c=>c.first_seen_tick));
  if(category!=='power'&&category!=='fuel'&&count<2&&tick-first<1800)continue;
  const bounds={left:Math.min(...group.map(c=>c.x))*32,top:Math.min(...group.map(c=>c.y))*32,right:(Math.max(...group.map(c=>c.x))+1)*32,bottom:(Math.max(...group.map(c=>c.y))+1)*32};
  const recipeGroup=(data.groups||[]).find(g=>g.surface===cell.surface&&g.force===cell.force&&g.recipe===cell.recipe&&cell.recipe);
  const product=recipeGroup?.products?.[0];
  const issue={id:'machine:'+group.map(c=>c.id).sort()[0],type:'machine',category,severity:category==='power'?'critical':'warning',surface:cell.surface,force:cell.force,scope:scopeId(cell),mapScope:`${cell.surface_id}-${cell.force_id}`,name:cell.name,kind:'entity',recipe:cell.recipe,product:product?.name,productKind:product?.type||'item',count,firstTick:first,durationSeconds:(tick-first)/60,lastSeenTick:Math.min(...group.map(c=>c.last_seen_tick)),located:true,bounds,points:group.flatMap(c=>c.examples||[]).slice(0,24),cells:group.map(c=>({x:c.x,y:c.y,count:c.count})),status:cell.status};
  if(category==='ingredients'||category==='science')issue.supply=incomingSupply(topics.logistics,cell,cell.missing_ingredients??recipeGroup?.ingredients??[],now);
  scopes.set(issue.scope,{id:issue.scope,surface:issue.surface,force:issue.force});issues.push(issue);
 }
 const candidates=(topics.production?.payload.data.rows||[]).filter(row=>{const r=rates(row);return r.consumed>0&&r.produced<r.consumed*.9;}).sort((a,b)=>(rates(b).consumed-rates(b).produced)-(rates(a).consumed-rates(a).produced)).slice(0,48);
 const recent=flowHistory.filter(p=>p.tick>=(topics.production?.tick||0)-3600&&p.tick<=(topics.production?.tick||0));
 const recentStep=Math.max(1,Math.ceil(recent.length/12)),recentPoints=recent.filter((_,i)=>i%recentStep===0||i===recent.length-1);
 if(fresh(topics.production,now))for(const row of candidates){
  const value=rates(row);if(value.consumed<=0||value.produced>=value.consumed*.9||(row.quality||'normal')!=='normal')continue;
  const transport=transferRates(topics.logistics,row,'1m',now),flow=transport.rows.get(['item',row.name,row.quality||'normal'].join('|'));
  if(transport.available&&!transport.ready)continue;
  if(transport.includeInBalance&&value.produced+(flow?.imported||0)>=value.consumed+(flow?.exported||0))continue;
  const points=recentPoints.map(p=>({tick:p.tick,row:p.rows.find(r=>r.surface===row.surface&&r.force===row.force&&r.name===row.name&&(r.kind||'item')===(row.kind||'item'))})).filter(p=>p.row);
  if(points.length<3||points.at(-1).tick-points[0].tick<1800||points.some(p=>rates(p.row).produced>=rates(p.row).consumed*.95))continue;
  const complete=data.inventory_complete===true&&machineTopic?.payload.coverage?.discovery_complete===true&&fresh(machineTopic,now);
  const stock=complete?(data.stocks||[]).filter(r=>r.surface===row.surface&&r.force===row.force&&r.name===row.name&&(r.kind||'item')===(row.kind||'item')&&(r.quality||'normal')==='normal').reduce((n,r)=>n+r.count,0):null;
  const netDemand=value.consumed-value.produced-(transport.includeInBalance?(flow?.imported||0)-(flow?.exported||0):0),emptyMinutes=stock===null?null:stock/netDemand;
  issues.push({id:`balance:${scopeId(row)}:${row.kind}:${row.name}`,type:'balance',category:'balance',severity:emptyMinutes!==null&&emptyMinutes<5?'critical':'warning',surface:row.surface,force:row.force,scope:scopeId(row),name:row.name,kind:row.kind||'item',product:row.name,count:null,firstTick:points[0].tick,durationSeconds:(topics.production.tick-points[0].tick)/60,located:false,bounds:null,points:[],cells:[],...value,stock,emptyMinutes});
 }
 issues.sort((a,b)=>(a.severity==='critical'?0:1)-(b.severity==='critical'?0:1)||(b.count||0)-(a.count||0)||b.durationSeconds-a.durationSeconds||a.id.localeCompare(b.id));
 const all=issues.slice(0,160),scope=options.scope&&options.scope!=='all'?options.scope:'all',filter=['critical','located'].includes(options.filter)?options.filter:'all';
 const visible=all.filter(r=>(scope==='all'||r.scope===scope)&&(filter!=='critical'||r.severity==='critical')&&(filter!=='located'||r.located));
 const selected=visible.find(r=>r.id===options.selected)||visible[0]||null;
 let trend=[];
 if(selected?.product){
  const target={...selected,kind:selected.type==='machine'?selected.productKind:selected.kind};
  const since=(topics.production?.tick||tick)-54000;
  const samples=flowHistory.filter(p=>p.tick>=since),step=Math.max(1,Math.ceil(samples.length/180));
  trend=samples.filter((_,i)=>i%step===0||i===samples.length-1).map(p=>{const r=p.rows.find(row=>matches(row,target));return {tick:p.tick,...(r?rates(r):{produced:null,consumed:null})};}).filter(p=>p.produced!==null);
 }
 return {issues:visible,selected,trend,scopes:[...scopes.values()],options:{scope,filter,selected:selected?.id||null},total:issues.length,critical:issues.filter(r=>r.severity==='critical').length,warning:issues.filter(r=>r.severity!=='critical').length,supported:!!diagnostics,complete:!!diagnostics?.complete&&machineTopic?.payload.coverage?.discovery_complete===true,live:fresh(machineTopic,now),tick,sampled:data.sampled_entities||0,expected:data.expected_entities||0,spatialComplete:diagnostics?.complete!==false,scopeCount:scopes.size};
}
