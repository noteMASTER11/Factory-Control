import {seriesPoints} from './energy-model.js';
const match=(r,s)=>r.surface===s.surface&&r.force===s.force;
const fresh=(t,now)=>!!t&&!t.stale&&now-Date.parse(t.written_at)<=15000;
const key=r=>JSON.stringify([r.surface,r.force,r.name,r.quality||'normal']);
const sum=(rows,k)=>rows.reduce((s,r)=>s+(Number(r[k])||0),0);
export const trainProblems=new Set(['no_path','path_lost','no_schedule','destination_full','wait_signal','arrive_signal']);
export function logisticsSample(topic){return {tick:topic.tick,networks:(topic.payload.data.networks||[]).map(n=>({id:n.id,surface:n.surface,force:n.force,logistic_total:n.logistic_total,logistic_available:n.logistic_available,construction_total:n.construction_total,construction_available:n.construction_available}))};}
export class LogisticsObservations {
 constructor(){this.clear();}
 clear(){this.requests=new Map();this.trains=new Map();this.tick=null;}
 accept(topic,now=Date.now()){
  const data=topic.payload.data,tick=topic.tick;
  if(this.tick!==null&&(tick<this.tick||tick-this.tick>900))this.clear();
  if(!fresh(topic,now)){this.clear();return;}this.tick=tick;
  const next=new Map();
  if(data.requesters_available===true&&(tick-(data.sample_end_tick??tick)<=900))for(const r of data.requests||[])if(r.missing>0){const id=key(r);next.set(id,this.requests.get(id)??tick);}
  this.requests=next;
  const trains=new Map();for(const t of data.trains||[])if(trainProblems.has(t.state)&&!t.manual){const id=JSON.stringify([t.surface,t.force,t.id,t.state]);trains.set(id,this.trains.get(id)??tick);}this.trains=trains;
 }
}
export function logisticsModel(topics,scope,options={},history=[],observations=new LogisticsObservations(),now=Date.now()){
 const topic=topics.logistics,data=topic?.payload.data||{},tick=topic?.tick||0,isFresh=fresh(topic,now);
 const networks=(data.networks||[]).filter(n=>match(n,scope)).map(n=>({...n,busy:Math.max(0,n.logistic_total-n.logistic_available),constructionBusy:Math.max(0,n.construction_total-n.construction_available),load:n.logistic_total>0?(n.logistic_total-n.logistic_available)/n.logistic_total:null}));
 const network=networks.some(n=>String(n.id)===options.network)?options.network:'all',selectedNetworks=networks.filter(n=>network==='all'||String(n.id)===network);
 const requestsAvailable=data.requesters_available===true;
 const requestAgeTicks=Math.max(0,tick-(data.sample_end_tick??tick)),requestFresh=isFresh&&requestsAvailable&&topic?.payload.coverage?.discovery_complete===true&&requestAgeTicks<=900;
 const requests=(requestsAvailable?data.requests||[]:[]).filter(r=>match(r,scope)).map(r=>({...r,id:key(r),waitingTicks:requestFresh&&r.missing>0&&observations.requests.has(key(r))?Math.max(0,tick-observations.requests.get(key(r))):null})).sort((a,b)=>b.missing-a.missing||a.name.localeCompare(b.name)||a.quality.localeCompare(b.quality));
 const search=(options.search||'').toLocaleLowerCase(),names=new Set(options.searchNames||[]);
 const visibleRequests=requests.filter(r=>(options.filter!=='missing'||r.missing>0)&&(!search||r.name.toLocaleLowerCase().includes(search)||names.has(r.name)));
 const trains=(data.trains||[]).filter(t=>match(t,scope)).map(t=>{const waitingTicks=isFresh?Math.max(0,tick-(observations.trains.get(JSON.stringify([t.surface,t.force,t.id,t.state]))??tick)):null;return {...t,kmh:Math.abs(t.speed||0)*216,problem:!t.manual&&trainProblems.has(t.state)&&(!['wait_signal','arrive_signal','destination_full'].includes(t.state)||waitingTicks>=600),waitingTicks};});
 const selectedTrain=trains.find(t=>String(t.id)===String(options.train))||trains.find(t=>t.problem)||trains[0]||null;
 const summary={logisticTotal:sum(selectedNetworks,'logistic_total'),logisticAvailable:sum(selectedNetworks,'logistic_available'),logisticBusy:sum(selectedNetworks,'busy'),constructionTotal:sum(selectedNetworks,'construction_total'),constructionAvailable:sum(selectedNetworks,'construction_available'),constructionBusy:sum(selectedNetworks,'constructionBusy'),requests:requests.filter(r=>r.missing>0).length,trains:trains.length,moving:trains.filter(t=>Math.abs(t.speed||0)>.001).length,issues:0};
 const issues=[];
 if(requestFresh)for(const r of requests.filter(r=>r.missing>0))issues.push({kind:'request',name:r.name,quality:r.quality,missing:r.missing,waitingTicks:r.waitingTicks,id:r.id});
 if(isFresh){for(const n of selectedNetworks)if(n.logistic_total>0&&n.logistic_available/n.logistic_total<.1)issues.push({kind:'robots',network:n.id,available:n.logistic_available,total:n.logistic_total,waitingTicks:null});for(const t of trains)if(t.problem)issues.push({kind:'train',train:t.id,state:t.state,waitingTicks:t.waitingTicks});}
 summary.issues=issues.length;
 const minutes=options.minutes||15;
 const points=seriesPoints(history.filter(p=>p.tick>=tick-minutes*3600&&p.tick<=tick).map(p=>{const rows=p.networks.filter(n=>match(n,scope)&&(network==='all'||String(n.id)===network));return {tick:p.tick,busy:sum(rows,'logistic_total')-sum(rows,'logistic_available'),construction:sum(rows,'construction_total')-sum(rows,'construction_available')};}));
 return {scope,options:{...options,network,train:selectedTrain?.id??null,searchNames:undefined},tick,fresh:isFresh,available:!!topic,requestsAvailable,requestFresh,requestAgeTicks,requests:visibleRequests,requestsCount:requests.length,groupsTotal:data.request_groups_total??requests.length,unsupportedFilters:data.unsupported_filters||0,networks,selectedNetworks,trains,selectedTrain,summary,issues:issues.slice(0,60),history:points,minutes};
}
