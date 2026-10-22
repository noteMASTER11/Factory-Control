import {scienceOrder} from './overview-model.js';
import {seriesPoints} from './energy-model.js';
const extraScience=['metallurgic-science-pack','agricultural-science-pack','electromagnetic-science-pack','cryogenic-science-pack','promethium-science-pack'];
const key=r=>[r.name,r.quality||'normal'].join('|');
const fresh=(t,now)=>!!t&&!t.stale&&now-Date.parse(t.written_at)<=15000;
const sum=(rows,k)=>rows.reduce((s,r)=>s+(Number(r[k])||0),0);
export function researchSample(topic){return {tick:topic.tick,forces:(topic.payload.data.forces||[]).map(f=>({force:f.force,current:f.current,level:f.level,progress:f.progress}))};}
function segment(history,force,current,tick,window=18000){
 if(!current)return [];
 const points=[];
 for(let i=history.length-1;i>=0;i--){const p=history[i];if(p.tick>tick)continue;if(p.tick<tick-window)break;const f=p.forces.find(f=>f.force===force);
  if(!f||f.current!==current.name||(f.level??1)!==current.level||!Number.isFinite(f.progress))break;
  const next=points[0];if(next&&(next.tick-p.tick>3600||f.progress>next.progress+1e-9))break;
  points.unshift({tick:p.tick,progress:Math.max(0,Math.min(1,f.progress))});
 }
 return points;
}
export function researchModel(topics,options={},researchHistory=[],flowHistory=[],now=Date.now()){
 const research=topics.research,production=topics.production,machines=topics.machines,source=research?.payload.data.forces||[];
 const forces=[...new Set([...source.map(f=>f.force),...(production?.payload.data.rows||[]).map(r=>r.force),...(machines?.payload.data.groups||[]).map(r=>r.force)])].filter(Boolean);
 const force=forces.includes(options.force)?options.force:forces[0]||null;
 const r=source.find(r=>r.force===force),tick=research?.tick??production?.tick??0;
 const allFlows=(production?.payload.data.rows||[]).filter(r=>r.force===force),md=machines?.payload.data||{},allGroups=(md.groups||[]).filter(g=>g.force===force),allStocks=(md.stocks||[]).filter(r=>r.force===force);
 const surfaces=[...new Set([...allFlows,...allGroups,...allStocks].map(r=>r.surface))].filter(Boolean).sort();
 const surface=surfaces.includes(options.surface)?options.surface:'all',scoped=rows=>rows.filter(r=>surface==='all'||r.surface===surface);
 const isFresh=fresh(research,now),flowsFresh=fresh(production,now),machinesFresh=fresh(machines,now);
 const inventoryComplete=machines?.payload.coverage?.discovery_complete===true&&(md.collection_mode!=='rolling'||md.inventory_complete===true),usableInventory=inventoryComplete&&machinesFresh;
 const rawQueue=r?.queue||[],first=r?.current?rawQueue.find(q=>q.name===r.current&&(q.level??1)===(r.level??1)):null;
 const current=r?.current?{...first,name:r.current,level:r.level??1,progress:Math.max(0,Math.min(1,r.progress||0)),ingredients:r.ingredients||first?.ingredients||[]}:null;
 const waiting=[...rawQueue];if(current&&waiting[0]?.name===current.name&&(waiting[0].level??1)===current.level)waiting.shift();
 const queue=[...(current?[current]:[]),...waiting].map((q,i)=>({...q,id:JSON.stringify([i,q.name,q.level??1]),active:!!current&&i===0,nominal:(q.ingredients||[]).map(p=>({name:p.name,amount:p.amount,count:Number.isFinite(q.unit_count)?q.unit_count*p.amount:null}))}));
 const selected=queue.find(q=>q.id===options.selected)||queue[0]||null;
 const required=new Set((current?.ingredients||[]).map(p=>p.name)),selectedRequired=new Set((selected?.ingredients||[]).map(p=>p.name));
 const names=new Set(scienceOrder),identities=new Map(scienceOrder.map(name=>[name+'|normal',{name,quality:'normal'}]));
 for(const name of [...required,...selectedRequired]){names.add(name);identities.set(name+'|normal',{name,quality:'normal'});}
 for(const p of [...allFlows,...allStocks])if(names.has(p.name)||p.name.endsWith('-science-pack')){names.add(p.name);identities.set(key(p),{name:p.name,quality:p.quality||'normal'});}
 const flows=scoped(allFlows).filter(r=>r.kind==='item'),stocks=scoped(allStocks).filter(r=>r.kind==='item'),groups=scoped(allGroups);
 const rank=new Map([...scienceOrder,...extraScience].map((name,i)=>[name,i]));
 const packs=[...identities.values()].map(p=>{const rows=flows.filter(r=>key(r)===key(p)),known=!!production&&(p.quality==='normal'||rows.length>0),produced=known?sum(rows,'produced_per_minute'):null,consumed=known?sum(rows,'consumed_per_minute'):null,balance=known?produced-consumed:null,stock=usableInventory?sum(stocks.filter(s=>key(s)===key(p)),'count'):null;
  return {...p,id:key(p),produced,consumed,balance,stock,required:required.has(p.name),selectedRequired:selectedRequired.has(p.name),coverage:consumed>0?produced/consumed:null,emptyMinutes:flowsFresh&&stock!==null&&balance<-.01?stock/-balance:null};
 }).sort((a,b)=>(rank.get(a.name)??999)-(rank.get(b.name)??999)||a.name.localeCompare(b.name)||a.quality.localeCompare(b.quality));
 const filter=options.filter||'all',visiblePacks=packs.filter(p=>filter!=='required'||p.selectedRequired),pack=visiblePacks.find(p=>p.id===options.pack)||visiblePacks.find(p=>p.required&&p.balance<-.01)||visiblePacks.find(p=>p.required)||visiblePacks[0]||null;
 const points=segment(researchHistory,force,current,tick),start=points[0],end=points.at(-1),span=start&&end?end.tick-start.tick:0;
 const progressPerMinute=isFresh&&points.length>=3&&span>=600?(end.progress-start.progress)*3600/span:null;
 const etaSeconds=progressPerMinute>1e-9&&current?(1-current.progress)/progressPerMinute*60:null;
 const minutes=options.minutes||15,flowTick=production?.tick??tick;
 const history=pack?seriesPoints(flowHistory.filter(p=>p.tick>=flowTick-minutes*3600&&p.tick<=flowTick).map(p=>{const rows=p.rows.filter(r=>r.force===force&&(surface==='all'||r.surface===surface)&&r.kind==='item'&&key(r)===pack.id);return {tick:p.tick,produced:pack.quality==='normal'||rows.length?sum(rows,'produced_per_minute'):null,consumed:pack.quality==='normal'||rows.length?sum(rows,'consumed_per_minute'):null};})):[];
 const labGroups=groups.filter(g=>g.type==='lab').sort((a,b)=>b.count-a.count),total=sum(labGroups,'count'),working=sum(labGroups.filter(g=>g.status==='working'),'count');
 const producers=pack?groups.filter(g=>(g.products||[]).some(p=>p.name===pack.name&&(p.type||'item')==='item')).sort((a,b)=>b.count-a.count):[];
 const issues=[];
 if(flowsFresh)for(const p of packs)if(p.required&&p.balance<-.01)issues.push({kind:'pack',name:p.name,quality:p.quality,balance:p.balance,emptyMinutes:p.emptyMinutes});
 if(machinesFresh)for(const g of labGroups)if(g.status!=='working'&&g.status!=='no_research_in_progress')issues.push({kind:'lab',name:g.name,status:g.status,count:g.count,surface:g.surface});
 return {forces,force,surfaces,surface,tick,flowTick,options:{...options,force,surface,filter,minutes,selected:selected?.id??null,pack:pack?.id??null},current,queue,selected,packs:visiblePacks,pack,history,progressHistory:seriesPoints(segment(researchHistory,force,current,tick,minutes*3600)),progressPerMinute,etaSeconds,labs:{total,working,idle:total-working,groups:labGroups},producers,issues:issues.slice(0,40),fresh:isFresh,flowsFresh,machinesFresh,inventoryComplete,usableInventory,available:!!research,packConsumption:production?sum(packs.filter(p=>p.quality==='normal'),'consumed'):null};
}
