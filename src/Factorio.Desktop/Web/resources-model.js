const cellKey=r=>JSON.stringify([r.surface,r.name,r.chunk_x,r.chunk_y]);
const valid=r=>typeof r.surface==='string'&&typeof r.name==='string'&&Number.isInteger(r.chunk_x)&&Number.isInteger(r.chunk_y)&&Number.isFinite(r.amount)&&r.amount>=0;
// Remember empty chunks, so mining an area does not split its identity or erase past reserves.
export class ResourceTracker {
 constructor({maxCells=50000,maxSamples=240}={}){this.maxCells=maxCells;this.maxSamples=maxSamples;this.clear();}
 clear(){this.cells=new Map();this.groups=[];this.tick=null;this.nextId=1;this.limited=false;}
 accept(topic){if(!topic||(this.tick!==null&&topic.tick<=this.tick))return;this.tick=topic.tick;const present=new Set();let topology=false;
  for(const r of topic.payload.data.chunks||[]){if(!valid(r))continue;const key=cellKey(r);present.add(key);let cell=this.cells.get(key);if(!cell){if(this.cells.size>=this.maxCells){this.limited=true;continue;}cell={uid:this.nextId++};this.cells.set(key,cell);topology=true;}Object.assign(cell,r);}
  for(const [key,c]of this.cells)if(!present.has(key)){c.amount=0;c.tiles=0;c.sampled_at_tick=topic.tick;}
  if(topology)this.regroup();
  const limit=Math.max(3,Math.min(this.maxSamples,Math.floor(36000/Math.max(1,this.groups.length))));
  for(const g of this.groups){const cells=g.cells,amount=cells.reduce((n,c)=>n+c.amount,0),times=cells.map(c=>c.sampled_at_tick),validTimes=times.every(t=>Number.isFinite(t)&&t>=0&&t<=topic.tick),sampleMin=validTimes?Math.min(...times):null,sampleMax=validTimes?Math.max(...times):null,tick=validTimes?Math.round(times.reduce((n,t)=>n+t,0)/cells.length):null,last=g.history.at(-1);
   g.amount=amount;g.sampleMin=sampleMin;g.sampleMax=sampleMax;
   // Only fully renewed measurements count as independent history points.
   if(Number.isFinite(sampleMin)&&Number.isFinite(sampleMax)&&sampleMin>=0&&sampleMax<=topic.tick&&(!last||sampleMin>last.sampleMax)){
    if(last&&amount>last.value+.001)g.history=[];
    g.history.push({tick,value:amount,sampleMax});
   }
   while(g.history.length>limit||g.history[0]?.tick<topic.tick-108000)g.history.shift();
  }
 }
 regroup(){const remaining=new Set(this.cells.keys()),previous=new Map(this.groups.map(g=>[g.id,g])),groups=[];
  for(const [key,seed]of this.cells){if(!remaining.delete(key))continue;const cells=[],queue=[seed];let uid=seed.uid;
   for(let i=0;i<queue.length;i++){const c=queue[i];cells.push(c);uid=Math.min(uid,c.uid);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const next=cellKey({...c,chunk_x:c.chunk_x+dx,chunk_y:c.chunk_y+dy});if(remaining.has(next)){const neighbor=this.cells.get(next);if(!!neighbor.infinite!==!!seed.infinite)continue;remaining.delete(next);queue.push(neighbor);}}}
   const id=JSON.stringify([seed.surface,seed.name,uid]),old=previous.get(id);groups.push({id,surface:seed.surface,name:seed.name,infinite:!!seed.infinite,cells,history:old?.cells.length===cells.length?old.history:[]});
  }this.groups=groups;
 }
}
export function resourcesModel(topics,options={},tracker,now=Date.now()){
 const byId=new Map(tracker.groups.map(g=>[g.id,g]));
 const topic=topics.resources,tick=topic?.tick||0,available=!!topic,fresh=available&&!topic.stale&&now-Date.parse(topic.written_at)<=30000,complete=topic?.payload.coverage?.discovery_complete===true&&!tracker.limited;
 const surfaces=[...new Set(tracker.groups.map(g=>g.surface))].sort(),surface=surfaces.includes(options.surface)?options.surface:surfaces[0]||null;
 const source=tracker.groups.filter(g=>g.surface===surface),names=[...new Set(source.map(g=>g.name))].sort(),resource=names.includes(options.resource)?options.resource:'all',search=(options.search||'').toLocaleLowerCase(),searchNames=new Set(options.searchNames||[]);
 const cycleTicks=Math.max(600,((topic?.payload.coverage?.resource_chunks||tracker.cells.size)+1)*10);
 const all=source.map((g,index)=>{const xs=g.cells.map(c=>c.chunk_x),ys=g.cells.map(c=>c.chunk_y),tiles=g.cells.reduce((n,c)=>n+(c.tiles||0),0),history=g.history,start=history[0],end=history.at(-1),span=end&&start?end.tick-start.tick:0;
  const measured=fresh&&complete&&Number.isFinite(g.sampleMin)&&tick-g.sampleMin<=cycleTicks*2+600,rate=!g.infinite&&measured&&history.length>=3&&span>=600&&g.amount<=end.value+.001?Math.max(0,(start.value-end.value)*3600/span):null,emptyMinutes=rate>0?g.amount/rate:null;
  const status=!measured?'unconfirmed':g.infinite?'infinite':g.amount===0?'depleted':rate===null?'observing':rate===0?'stable':emptyMinutes<=30?'critical':emptyMinutes<=120?'low':'extracting';
  return {id:g.id,name:g.name,surface:g.surface,number:index+1,infinite:g.infinite,amount:g.amount,tiles,chunks:g.cells.length,bounds:{minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)},rate,emptyMinutes,status,measured,sampleAgeTicks:Number.isFinite(g.sampleMin)?Math.max(0,tick-g.sampleMin):null,historyCount:history.length,observedMinutes:span/3600};
 });
 const sort=['reserve','eta','name'].includes(options.sort)?options.sort:'reserve';
 const filtered=all.filter(p=>(resource==='all'||p.name===resource)&&(!search||p.name.toLocaleLowerCase().includes(search)||searchNames.has(p.name)||String(p.number)===search));
 filtered.sort((a,b)=>sort==='eta'?(a.emptyMinutes??Infinity)-(b.emptyMinutes??Infinity)||b.amount-a.amount:sort==='name'?a.name.localeCompare(b.name)||a.number-b.number:b.amount-a.amount);
 const selected=filtered.find(p=>p.id===options.selected)||filtered[0]||null,patches=filtered.slice(0,300),group=selected?byId.get(selected.id):null,minutes=[5,15,30].includes(options.minutes)?options.minutes:30;
 const history=(group?.history||[]).filter(p=>p.tick>=tick-minutes*3600).map(p=>({tick:p.tick,value:p.value}));
 const projection=selected?.rate>0?[{tick,value:selected.amount},{tick:tick+Math.min(minutes,selected.emptyMinutes)*3600,value:Math.max(0,selected.amount-selected.rate*minutes)}]:[];
 if(selected&&!patches.some(p=>p.id===selected.id))patches[patches.length-1]=selected;
 const mapped=filtered.slice(0,600);if(selected&&!mapped.some(p=>p.id===selected.id))mapped[mapped.length-1]=selected;
 const mapPatches=mapped.map(p=>({id:p.id,name:p.name,number:p.number,status:p.status,infinite:p.infinite,cells:byId.get(p.id).cells.map(c=>[c.chunk_x,c.chunk_y,c.amount>0?1:0])}));
 return {available,fresh,complete,surfaces,surface,names,tick,options:{...options,searchNames:undefined,surface,resource,sort,minutes,selected:selected?.id||null},patches,total:filtered.length,mapPatches,selected,history,projection,summary:{patches:filtered.length,chunks:filtered.reduce((n,p)=>n+p.chunks,0),amount:filtered.filter(p=>!p.infinite).reduce((n,p)=>n+p.amount,0),active:filtered.filter(p=>p.rate>0).length,risks:filtered.filter(p=>['critical','low','depleted'].includes(p.status)).length},issues:fresh?filtered.filter(p=>['critical','low','depleted'].includes(p.status)).sort((a,b)=>(a.emptyMinutes??0)-(b.emptyMinutes??0)).slice(0,8):[],limited:tracker.limited};
}
