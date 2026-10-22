const fresh=(t,now)=>!!t&&!t.stale&&now-Date.parse(t.written_at)<=15000;
export function combatStatus(topics,session,now=Date.now()){
 const topic=topics.combat,episodes=(topic?.payload.data.episodes||[]).map(e=>({id:e.id,active:e.active,force:e.force,surface:e.surface,destroyed:e.destroyed,rebuilt:e.rebuilt,started_tick:e.started_tick,details_available:e.details_available}));
 return {session,available:!!topic,fresh:fresh(topic,now),active:episodes.some(e=>e.active),episodes};
}
export function damageModel(topics,options={},now=Date.now()){
 const topic=topics.combat,episodes=topic?.payload.data.episodes||[],details=episodes.filter(e=>e.details_available!==false),selected=details.find(e=>e.id===options.episode)||details.filter(e=>e.active).at(-1)||details.at(-1)||null;
 const machines=topics.machines,data=machines?.payload.data||{},complete=machines?.payload.coverage?.discovery_complete===true&&(data.collection_mode!=='rolling'||data.inventory_complete===true),usableInventory=complete&&fresh(machines,now);
 const stocks=new Map();for(const s of data.stocks||[])if(selected&&s.force===selected.force&&s.surface===selected.surface&&s.kind==='item'){const k=JSON.stringify([s.name,s.quality||'normal']);stocks.set(k,(stocks.get(k)||0)+s.count);}
 const requirements=new Map(),losses=(selected?.losses||[]).map(g=>({...g,pending:Math.max(0,g.count-g.rebuilt)}));let unknown=selected?.unclassified||0;
 for(const g of losses){const place=g.placement?.[0];if(!place){unknown+=g.pending;continue;}const quality=place.quality||g.quality||'normal',id=JSON.stringify([place.name,quality]);let r=requirements.get(id);if(!r)requirements.set(id,r={id,name:place.name,quality,needed:0});r.needed+=g.pending*(place.count||1);}
 const rows=[...requirements.values()].filter(r=>r.needed>0).map(r=>({...r,available:usableInventory?(stocks.get(r.id)||0):null,missing:usableInventory?Math.max(0,r.needed-(stocks.get(r.id)||0)):null})).sort((a,b)=>(b.missing||0)-(a.missing||0)||a.name.localeCompare(b.name));
 return {available:!!topic,fresh:fresh(topic,now),tick:topic?.tick||0,episodes:details.map(e=>({id:e.id,force:e.force,surface:e.surface,active:e.active,started_tick:e.started_tick})),selected,options:{episode:selected?.id??null},losses,requirements:rows,usableInventory,inventoryComplete:complete,unknown,canRestore:!selected||!fresh(topic,now)||!usableInventory||!selected.tracking_complete||unknown>0?null:rows.every(r=>r.missing===0)};
}
