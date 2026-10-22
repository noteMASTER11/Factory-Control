import {summarize,scopesFrom} from './overview-model.js';
import {energyModel,powerPoint,seriesPoints} from './energy-model.js';
import {productionModel,flowSample,stockSample} from './production-model.js';
import {UpsEstimator} from './ups.js';
import {logisticsModel,logisticsSample,LogisticsObservations} from './logistics-model.js';
import {researchModel,researchSample} from './research-model.js';
import {damageModel,combatStatus} from './combat-model.js';
import {ResourceTracker,resourcesModel} from './resources-model.js';
import {forecastsModel} from './forecasts-model.js';

export class TelemetryEngine {
 constructor(){this.topics={};this.status={};this.sessions={processes:[]};this.history=[];this.productionHistory=[];this.stockHistory=[];this.logisticsHistory=[];this.researchHistory=[];this.resourceTracker=new ResourceTracker();this.logisticsObservations=new LogisticsObservations();this.ups=new UpsEstimator();this.view='sessions';this.options={overview:{},energy:{network:'all',minutes:15},production:{filter:'active',search:'',units:'minute',rateWindow:'1m',minutes:15},logistics:{network:'all',filter:'missing',search:'',minutes:15},resources:{resource:'all',sort:'reserve',minutes:30},forecasts:{window:5,horizon:30,reserveMinutes:5,filter:'risks',supplyPercent:0,demandPercent:0},research:{surface:'all',filter:'all',minutes:15},damage:{}};this.models={};this.signatures={};this.counts={overview:0,energy:0,production:0,logistics:0,research:0,resources:0,forecasts:0};this.packetCount=0;}
 accept(packet){
  const next=packet.status;
  if(next.reset||next.session_id!==this.status.session_id){this.topics={};this.history=[];this.productionHistory=[];this.stockHistory=[];this.logisticsHistory=[];this.researchHistory=[];this.resourceTracker.clear();this.logisticsObservations.clear();this.ups.clear();this.models={};this.signatures={};}
  this.status={...next};this.sessions=packet.sessions||this.sessions;
  Object.assign(this.topics,next.topics||{});delete this.status.topics;
  for(const row of packet.history||[])if(row.session_id===next.session_id)this.addHistory({topic:'power',tick:row.tick,session_id:row.session_id,written_at:row.written_at,payload:row.payload});
  if(next.topics?.power)this.addHistory(next.topics.power);
  for(const row of packet.productionHistory||[])if(row.session_id===next.session_id)this.addSample(this.productionHistory,flowSample(row),900);
  if(next.topics?.production)this.addSample(this.productionHistory,flowSample(next.topics.production),900);
  if(next.topics?.machines)this.addSample(this.stockHistory,stockSample(next.topics.machines),450);
  if(next.topics?.status)this.ups.add(next.topics.status);
  if(next.topics?.logistics){this.addSample(this.logisticsHistory,logisticsSample(next.topics.logistics),450);this.logisticsObservations.accept(next.topics.logistics);}
  for(const row of packet.researchHistory||[])if(row.session_id===next.session_id)this.addSample(this.researchHistory,researchSample(row),450);
  if(next.topics?.research)this.addSample(this.researchHistory,researchSample(next.topics.research),450);
  if(next.topics?.resources)this.resourceTracker.accept(next.topics.resources);
  this.packetCount++;this.rebuild();
 }
 addHistory(point){
  if(!point?.payload?.data||this.history.some(p=>p.tick===point.tick))return;
  this.history.push(point);this.history.sort((a,b)=>a.tick-b.tick);
  const minimum=this.history.at(-1).tick-108000;
  while(this.history.length>1800||this.history[0]?.tick<minimum)this.history.shift();
 }
 addSample(history,sample,limit){if(!Number.isFinite(sample.tick)||history.some(p=>p.tick===sample.tick))return;history.push(sample);history.sort((a,b)=>a.tick-b.tick);const minimum=history.at(-1).tick-108000;while(history.length>limit||history[0]?.tick<minimum)history.shift();}
 select(view){if(['sessions','overview','energy','production','logistics','research','resources','forecasts','damage'].includes(view))this.view=view;}
 configure(view,options){if(!this.options[view])return;Object.assign(this.options[view],options);this.rebuild();}
 rebuild(){
  this.scopes=scopesFrom(this.topics);
  for(const view of ['overview','energy','production','logistics','research','resources','forecasts']){
   const options=this.options[view];
   if(view==='resources'){
    const topic=this.topics.resources,signature=JSON.stringify([options,topic?.tick,!!topic&&(topic.stale||Date.now()-Date.parse(topic.written_at)>30000)]);
    if(this.signatures[view]===signature)continue;this.signatures[view]=signature;
    this.models.resources=resourcesModel(this.topics,options,this.resourceTracker);const {searchNames,...normalized}=this.models.resources.options;Object.assign(options,normalized);this.counts.resources++;continue;
   }
   if(view==='research'){
    const signature=JSON.stringify([options,['research','production','machines'].map(k=>[k,this.topics[k]?.tick,Date.now()-Date.parse(this.topics[k]?.written_at)>15000]),this.researchHistory.at(-1)?.tick,this.productionHistory.at(-1)?.tick]);
    if(this.signatures[view]===signature)continue;this.signatures[view]=signature;
    const model=researchModel(this.topics,options,this.researchHistory,this.productionHistory);this.models.research=model;Object.assign(options,model.options);this.counts.research++;continue;
   }
   if(!this.scopes.some(s=>s.id===options.scope))options.scope=this.scopes[0]?.id;
   const scope=this.scopes.find(s=>s.id===options.scope);
   if(!scope){this.models[view]=null;continue;}
   const dependencies=view==='energy'?['power']:view==='production'?['production','machines','status']:view==='forecasts'?['production','machines']:view==='logistics'?['logistics']:Object.keys(this.topics);
   const signature=JSON.stringify([options,this.scopes,dependencies.map(k=>[k,this.topics[k]?.tick,Date.now()-Date.parse(this.topics[k]?.written_at)>15000]),(view==='production'||view==='forecasts')?[this.productionHistory.at(-1)?.tick,this.stockHistory.at(-1)?.tick]:view==='logistics'?this.logisticsHistory.at(-1)?.tick:this.history.at(-1)?.tick]);
   if(this.signatures[view]===signature)continue;this.signatures[view]=signature;
   if(view==='overview')this.models.overview={scopes:this.scopes,scope:options.scope,model:summarize(this.topics,scope),history:seriesPoints(this.history.map(p=>{const v=powerPoint(p,scope);return {tick:p.tick,production:v.production,consumption:v.consumption};}),180)};
   else if(view==='energy'){if(options.network!=='all'&&!powerPoint(this.topics.power,scope).networks.some(n=>String(n.id)===options.network))options.network='all';this.models.energy={scopes:this.scopes,scope:options.scope,...energyModel(this.topics,scope,options,this.history)};}
   else if(view==='production'){this.models.production={scopes:this.scopes,...productionModel(this.topics,scope,options,this.productionHistory,this.stockHistory),ups:this.ups.value()};options.selected=this.models.production.selected?.id||null;}
   else if(view==='forecasts'){this.models.forecasts={scopes:this.scopes,...forecastsModel(this.topics,scope,options,this.productionHistory,this.stockHistory)};const {searchNames,...normalized}=this.models.forecasts.options;Object.assign(options,normalized);}
   else {this.models.logistics={scopes:this.scopes,...logisticsModel(this.topics,scope,options,this.logisticsHistory,this.logisticsObservations)};options.network=this.models.logistics.options.network;options.train=this.models.logistics.selectedTrain?.id??null;}
   this.counts[view]++;
  }
  const damageSignature=JSON.stringify([this.options.damage,['combat','machines'].map(k=>[k,this.topics[k]?.tick,Date.now()-Date.parse(this.topics[k]?.written_at)>15000])]);
  if(this.signatures.damage!==damageSignature){this.signatures.damage=damageSignature;this.models.damage=damageModel(this.topics,this.options.damage);this.counts.damage=(this.counts.damage||0)+1;}
 }
 connection(){
  const topics={};
  for(const [key,topic]of Object.entries(this.topics)){
   const data=topic.payload.data;let summary;
   if(key==='status')summary=data;
   else if(key==='machines')summary={collection_mode:data.collection_mode,inventory_complete:data.inventory_complete,sampled_entities:data.sampled_entities,expected_entities:data.expected_entities,sample_window_ticks:data.sample_window_ticks,sample_start_tick:data.sample_start_tick,sample_end_tick:data.sample_end_tick};
   else summary={rows_count:data.rows?.length,networks_count:data.networks?.length};
   topics[key]={topic:key,tick:topic.tick,written_at:topic.written_at,stale:topic.stale,payload:{coverage:topic.payload.coverage,data:summary}};
  }
  return {status:{...this.status,topics},sessions:this.sessions};
 }
 frame(){return {view:this.view,model:this.models[this.view]||null,connection:this.connection(),alarm:combatStatus(this.topics,this.status.session_id),statistics:this.describe()};}
 describe(){return {packets:this.packetCount,revision:this.status.revision,session:this.status.session_id,historySamples:this.history.length,productionHistorySamples:this.productionHistory.length,stockHistorySamples:this.stockHistory.length,logisticsHistorySamples:this.logisticsHistory.length,researchHistorySamples:this.researchHistory.length,resourceCells:this.resourceTracker.cells.size,resourceHistorySamples:this.resourceTracker.groups.reduce((n,g)=>n+g.history.length,0),models:{...this.counts},activeView:this.view};}
}
