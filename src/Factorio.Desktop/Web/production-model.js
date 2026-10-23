import {materialOrder} from './overview-model.js';
import {seriesPoints} from './energy-model.js';
import {productionMapModel} from './production-map-model.js';
import {transferRates} from './space-model.js';
export const resourceKey=r=>[r.kind||r.type||'item',r.name,r.quality||'normal'].join('|');
const match=(r,s)=>r.surface===s.surface&&r.force===s.force;
const fresh=(topic,now)=>!!topic&&now-Date.parse(topic.written_at)<=15000;
const rates=(r,window)=>({produced:r?.[window==='10m'?'produced_per_minute_10m':'produced_per_minute']??null,consumed:r?.[window==='10m'?'consumed_per_minute_10m':'consumed_per_minute']??null});
export function flowSample(topic){return {tick:topic.tick,rows:topic.payload.data.rows||[]};}
export function stockSample(topic){return {tick:topic.tick,complete:topic.payload.coverage?.discovery_complete===true&&(topic.payload.data.collection_mode!=='rolling'||topic.payload.data.inventory_complete===true),stocks:topic.payload.data.stocks||[]};}
export function productionModel(topics,scope,options,flowHistory=[],stockHistory=[],now=Date.now()){
 const production=topics.production,machines=topics.machines,data=machines?.payload.data||{};
 const flowsFresh=fresh(production,now),machinesFresh=fresh(machines,now);
 const inventoryComplete=stockSample(machines||{tick:0,payload:{data:{}}}).complete;
 const usableInventory=inventoryComplete&&machinesFresh;
 const transport=transferRates(topics.logistics,scope,options.rateWindow,now);
 const stocks=new Map();for(const s of data.stocks||[])if(match(s,scope))stocks.set(resourceKey(s),(stocks.get(resourceKey(s))||0)+s.count);
 const rank=new Map(materialOrder.map((name,i)=>[name,i]));
 const sourceRows=(production?.payload.data.rows||[]).filter(r=>match(r,scope));
 if(transport.ready)for(const row of transport.rows.values())if(!sourceRows.some(r=>resourceKey(r)===row.id))sourceRows.push({...row,...scope,produced_per_minute:row.quality==="normal"?0:null,consumed_per_minute:row.quality==="normal"?0:null,produced_per_minute_10m:row.quality==="normal"?0:null,consumed_per_minute_10m:row.quality==="normal"?0:null});
 const allRows=sourceRows.map(r=>{
  const {produced,consumed}=rates(r,options.rateWindow),flow=transport.rows.get(resourceKey(r)),imported=transport.ready?(flow?.imported||0):null,exported=transport.ready?(flow?.exported||0):null;
  const localBalance=produced===null||consumed===null?null:produced-consumed,balance=localBalance===null?null:localBalance+(transport.includeInBalance?imported-exported:0);
  const stock=usableInventory?(stocks.get(resourceKey(r))||0):null;
  return {id:resourceKey(r),name:r.name,kind:r.kind,quality:r.quality||'normal',produced,consumed,imported,exported,localBalance,balance,stock,coverage:consumed>0&&produced!==null?(produced+(transport.includeInBalance?imported:0))/(consumed+(transport.includeInBalance?exported:0))*100:null,emptyMinutes:flowsFresh&&stock!==null&&balance<-.01?stock/-balance:null};
 });
 const search=(options.search||'').toLocaleLowerCase(),searchNames=new Set(options.searchNames||[]);
 const rows=allRows.filter(r=>(!search||r.name.toLocaleLowerCase().includes(search)||searchNames.has(r.name))&&(options.filter!=='deficit'||r.balance<-.01)&&(options.filter!=='item'||r.kind==='item')&&(options.filter!=='fluid'||r.kind==='fluid')&&(options.filter!=='active'||r.produced>0||r.consumed>0||r.imported>0||r.exported>0));
 rows.sort((a,b)=>(rank.get(a.name)??999)-(rank.get(b.name)??999)||a.name.localeCompare(b.name)||a.quality.localeCompare(b.quality));
 const selected=rows.find(r=>r.id===options.selected)||rows.find(r=>r.balance<-.01)||rows[0]||null;
 const groups=(data.groups||[]).filter(r=>match(r,scope));
 const belongs=(entry,r)=>entry.name===r.name&&(entry.type||'item')===r.kind;
 const selectedGroups=selected?groups.filter(g=>(g.products||[]).some(e=>belongs(e,selected))):[];
 const consumers=selected?groups.filter(g=>(g.ingredients||[]).some(e=>belongs(e,selected))):[];
 const nodes=list=>{
  const result=new Map();for(const g of list)for(const r of g.entries){const id=resourceKey(r);if(!result.has(id)){const flow=allRows.find(f=>f.name===r.name&&f.kind===(r.type||'item')&&f.quality==='normal');result.set(id,{id,name:r.name,kind:r.type||'item',balance:flow?.balance??null,produced:flow?.produced??null});}}
  return [...result.values()];
 };
 const inputs=nodes(selectedGroups.map(g=>({entries:g.ingredients||[]}))),outputs=nodes(consumers.map(g=>({entries:g.products||[]})));
 const tick=production?.tick||0,since=tick-(options.minutes||15)*3600;
 const history=selected?seriesPoints(flowHistory.filter(p=>p.tick>=since&&p.tick<=tick).map(p=>{const r=p.rows.find(r=>match(r,scope)&&resourceKey(r)===selected.id);return {tick:p.tick,...rates(r,options.rateWindow)};})):[];
 const stockTick=machines?.tick||tick;
 const stockPoints=selected?seriesPoints(stockHistory.filter(p=>p.complete&&p.tick>=since&&p.tick<=Math.max(tick,stockTick)).map(p=>({tick:p.tick,value:p.stocks.filter(r=>match(r,scope)&&resourceKey(r)===selected.id).reduce((sum,r)=>sum+r.count,0)}))):[];
 const relevant=selected?[...new Set([...selectedGroups,...consumers])]:groups;
 const blockers=relevant.filter(g=>g.status!=='working'&&g.count>0).sort((a,b)=>b.count-a.count);
 const mapResource=rows.find(r=>r.id===options.mapResource)||null;
 return {scope,options:{...options,searchNames:undefined,selected:selected?.id||null,mapResource:mapResource?.id||'all'},map:productionMapModel(data.groups,scope,mapResource,options),rows,selected,selectedGroups,blockers:blockers.slice(0,30),blockerCount:blockers.length,chain:{inputs,outputs},history,stockHistory:stockPoints,tick,stockTick,historyCount:history.length,fresh:flowsFresh,machinesFresh,inventoryComplete,usableInventory,sampleWindowSeconds:(data.sample_window_ticks||0)/60,total:allRows.length,deficits:allRows.filter(r=>r.balance<-.01).length};
}
