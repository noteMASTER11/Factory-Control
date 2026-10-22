export const materialOrder=['iron-ore','copper-ore','stone','coal','crude-oil','iron-plate','copper-plate','steel-plate','plastic-bar','sulfuric-acid','electronic-circuit','advanced-circuit','processing-unit','battery','engine-unit','electric-engine-unit','low-density-structure','rocket-fuel','uranium-235','uranium-238'];
export const scienceOrder=['automation-science-pack','logistic-science-pack','military-science-pack','chemical-science-pack','production-science-pack','utility-science-pack','space-science-pack'];
const sum=(rows,key)=>rows.reduce((total,row)=>total+(Number(row[key])||0),0);
const key=row=>[row.kind,row.name,row.quality||'normal'].join('|');
export function summarize(topics,scope,now=Date.now()) {
 const data=topic=>topics[topic]?.payload.data||{};
 const scoped=rows=>(rows||[]).filter(r=>r.surface===scope.surface&&r.force===scope.force);
 const machines=data('machines'),stocks=new Map();
 for(const row of scoped(machines.stocks))stocks.set(key(row),(stocks.get(key(row))||0)+row.count);
 const machineTopic=topics.machines;
 const machineAge=machineTopic?Math.max(0,(now-Date.parse(machineTopic.written_at))/1000):Infinity;
 const inventoryComplete=!!machineTopic?.payload.coverage?.discovery_complete&&(machines.collection_mode!=='rolling'||machines.inventory_complete===true);
 const usableInventory=inventoryComplete&&machineAge<=15;
 const productionFresh=!!topics.production&&(now-Date.parse(topics.production.written_at))/1000<=15;
 const rows=scoped(data('production').rows).filter(r=>(r.quality||'normal')==='normal').map(row=>{
  const produced=row.produced_per_minute,consumed=row.consumed_per_minute,balance=produced-consumed;
  const stock=usableInventory?(stocks.get(key(row))||0):null;
  return {...row,produced,consumed,balance,stock,emptyMinutes:stock!==null&&balance<0?stock/-balance:null,
   change:row.produced_per_minute_10m>0?row.produced_per_minute_5s/row.produced_per_minute_10m-1:null};
 });
 const ranks=new Map(materialOrder.map((name,index)=>[name,index]));
 const materials=rows.filter(r=>r.produced||r.consumed||ranks.has(r.name)).sort((a,b)=>(ranks.get(a.name)??100)-(ranks.get(b.name)??100)||b.consumed-a.consumed);
 const grouped=new Map();
 for(const row of scoped(machines.groups)){
  if(!['assembling-machine','furnace','mining-drill','lab','rocket-silo'].includes(row.type))continue;
  const group=grouped.get(row.name)||{name:row.name,type:row.type,total:0,working:0,statuses:new Map()};
  group.total+=row.count;if(row.status==='working')group.working+=row.count;
  if(row.status!=='working')group.statuses.set(row.status,(group.statuses.get(row.status)||0)+row.count);
  grouped.set(row.name,group);
 }
 const groups=[...grouped.values()].map(g=>({...g,stopped:g.total-g.working,reason:[...g.statuses].sort((a,b)=>b[1]-a[1])[0]?.[0]})).sort((a,b)=>b.total-a.total);
 const networks=scoped(data('power').networks),accumulators=scoped(data('power').accumulators);
 const charge=sum(accumulators,'joules'),capacity=sum(accumulators,'capacity_joules');
 const logistics=scoped(data('logistics').networks);
 return {materials,rows,groups,inventoryComplete,usableInventory,machineAge,productionFresh,
  sampleWindowSeconds:machines.sample_window_ticks/60,
  sampled:machines.sampled_entities??sum(scoped(machines.groups),'count'),expected:machines.expected_entities??machineTopic?.payload.coverage?.indexed_entities,
  power:{available:!!topics.power,production:sum(networks,'production_watts'),consumption:sum(networks,'consumption_watts'),networks:networks.length,charge,capacity,percent:capacity?charge/capacity:null},
  logistics:{available:!!topics.logistics,logisticTotal:sum(logistics,'logistic_total'),logisticAvailable:sum(logistics,'logistic_available'),constructionTotal:sum(logistics,'construction_total'),constructionAvailable:sum(logistics,'construction_available'),trains:scoped(data('logistics').trains).length},
  research:(data('research').forces||[]).find(f=>f.force===scope.force),
  deficits:productionFresh?rows.filter(r=>r.balance<-.01).sort((a,b)=>(a.emptyMinutes??Infinity)-(b.emptyMinutes??Infinity)||a.balance-b.balance):[]};
}

export function scopesFrom(topics){
 const scopes=new Map();
 for(const topic of ['power','production','machines'])for(const row of topics[topic]?.payload.data[topic==='power'?'networks':topic==='production'?'rows':'groups']||[]){
  const id=JSON.stringify([row.surface,row.force]);if(!scopes.has(id))scopes.set(id,{id,surface:row.surface,force:row.force});
 }
 for(const field of ['networks','trains','requests'])for(const row of topics.logistics?.payload.data[field]||[]){const id=JSON.stringify([row.surface,row.force]);if(!scopes.has(id))scopes.set(id,{id,surface:row.surface,force:row.force});}
 return [...scopes.values()];
}
