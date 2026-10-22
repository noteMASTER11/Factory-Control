import {prototypeLabel} from './prototype-label.js';
import {scienceOrder,materialOrder} from './overview-model.js';
const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const svgNamespace='http://www.w3.org/2000/svg';
const svg=(tag,attributes)=>{const node=document.createElementNS(svgNamespace,tag);for(const [key,value]of Object.entries(attributes))node.setAttribute(key,value);return node;};
export class Overview {
 constructor(i18n,onScopeChange){this.i18n=i18n;this.t=(key,values)=>i18n.text(key,values);this.history=[];$('overview-scope').addEventListener('change',()=>onScopeChange($('overview-scope').value));}
 name(value,kind){return this.i18n.prototype(value,kind);}
 number(value,decimal=false){return value===null||value===undefined||!Number.isFinite(value)?this.t('common.empty'):this.i18n.number(value,decimal);}
 compact(value){if(value===null||value===undefined)return this.t('common.empty');const magnitude=Math.abs(value);return magnitude>=1e9?this.t('overview.billion',{value:this.number(value/1e9,true)}):magnitude>=1e6?this.t('overview.million',{value:this.number(value/1e6,true)}):magnitude>=1e4?this.t('overview.thousand',{value:this.number(value/1e3,true)}):this.number(value,true);}
 rate(value){return this.t('overview.rate',{value:this.compact(value)});}
 resource(row){return prototypeLabel(this.i18n,row.name,row.kind||'item');}
 render(frame,snapshot,age){
  if(!frame)return;
  const topics=snapshot?.status.topics||{},scopes=frame.scopes,select=$('overview-scope');
  const signature=JSON.stringify(scopes.map(s=>s.id));
  if(signature!==this.scopesSignature){select.replaceChildren();for(const scope of scopes){const option=el('option',this.t('overview.scopeValue',scope));option.value=scope.id;select.append(option);}this.scopesSignature=signature;}
  select.value=frame.scope||'';
  const model=frame.model,status=topics.status;
  $('overview-tick').textContent=this.t('overview.tick',{tick:this.number(status?.tick)});
  const old=!status||age(status)>15||!snapshot.status.connected;
  $('overview-freshness').textContent=this.t(old?'overview.stale':'overview.snapshotAge',{seconds:this.number(status?age(status):null,true)});$('overview-freshness').dataset.stale=String(old);
  this.history=frame.history;
  this.drawPower(model);this.energy(model);this.science(model);this.materials(model);this.machines(model);this.chain(model);this.forecasts(model);this.bottom(model,topics,age);
 }
 drawPower(model){
  const host=$('power-history');host.replaceChildren();
  if(this.history.length<2){host.append(el('div',this.t('overview.historyWaiting'),'chart-wait'));}
  else{
   const width=440,height=136,left=41,right=8,top=9,bottom=21;
   const chart=svg('svg',{viewBox:`0 0 ${width} ${height}`,preserveAspectRatio:'none',role:'img','aria-label':this.t('overview.powerChart')});
   const max=Math.max(1,...this.history.flatMap(p=>[p.production,p.consumption]))*1.12;
   const first=this.history[0].tick,last=this.history.at(-1).tick;
   const x=tick=>left+(tick-first)/(last-first)*(width-left-right),y=watts=>height-bottom-watts/max*(height-top-bottom);
   for(let i=0;i<=4;i++){const yy=top+(height-top-bottom)*i/4;chart.append(svg('line',{x1:left,y1:yy,x2:width-right,y2:yy,class:'chart-grid'}));const text=svg('text',{x:left-4,y:yy+3,'text-anchor':'end',class:'chart-label'});text.textContent=this.number(max*(1-i/4)/1e6,true);chart.append(text);}
   for(const [field,color]of [['production','var(--cyan)'],['consumption','var(--green)']])chart.append(svg('path',{d:this.history.map((p,i)=>`${i?'L':'M'}${x(p.tick).toFixed(2)},${y(p[field]).toFixed(2)}`).join(' '),stroke:color,class:'chart-line'}));
   for(const [tick,label]of [[first,this.t('overview.historyMinutes',{minutes:this.number((last-first)/3600,true)})],[last,this.t('overview.now')]]){const text=svg('text',{x:x(tick),y:height-4,'text-anchor':tick===first?'start':'end',class:'chart-label'});text.textContent=label;chart.append(text);}
   host.append(chart);
  }
  $('power-history-note').textContent=this.t('overview.historyNote',{count:this.number(this.history.length),networks:this.number(model.power.networks)});
 }
 energy(model){
  const p=model.power,host=$('overview-energy');host.replaceChildren();
  const watts=value=>p.available?this.t('overview.megawatts',{value:this.number(value/1e6,true)}):this.t('common.empty');
  for(const [label,value,color]of [['generation',watts(p.production),''],['consumption',watts(p.consumption),'good'],['balance',watts(p.production-p.consumption),p.production<p.consumption?'bad':'good'],['accumulators',p.percent===null?this.t('common.empty'):this.t('overview.percent',{value:this.number(p.percent*100,true)}),'good'],['charge',this.t('overview.gigajoules',{value:this.number(p.charge/1e9,true),capacity:this.number(p.capacity/1e9,true)}),''],['capacityNotice',this.t('overview.sampled'),'muted']])host.append(el('dt',this.t(`overview.${label}`)),el('dd',p.available?value:this.t('common.empty'),color));
 }
 science(model){
  const host=$('overview-science');host.replaceChildren();
  const colors=['#f36b67','#7ce665','#d6d6da','#6dc3ff','#cc7ce5','#f7db61','#f4f4ff'];
  for(const [index,name]of scienceOrder.entries()){
   const row=model.rows.find(r=>r.name===name),node=el('div',undefined,'science-row'),img=el('img');img.src=`./icons/${name}.png`;img.alt='';
   const produced=row?.produced??null,consumed=row?.consumed??null,meter=el('span',undefined,'science-meter'),fill=el('i');fill.style.background=colors[index];fill.style.width=`${Math.min(100,consumed>0?produced/consumed*100:produced>0?100:0)}%`;meter.append(fill);meter.title=this.t('overview.scienceCoverage',{production:this.number(produced,true),consumption:this.number(consumed,true)});
   node.append(img,el('span',this.t(`science.${name}`)),el('span',this.compact(produced),'science-rate'),meter);host.append(node);
  }
  const research=$('overview-research');research.replaceChildren();const r=model.research;
  const title=el('div',undefined,'research-title');title.append(el('span',r?.current?this.name(r.current):this.t('overview.noResearch')),el('span',r?.current?this.t('overview.percent',{value:this.number(r.progress*100,true)}):''));
  research.append(title);if(r?.current){const progress=el('progress');progress.max=1;progress.value=r.progress;progress.setAttribute('aria-label',this.t('overview.researchProgress'));research.append(progress);}
 }
 materials(model){
  const host=$('overview-materials');host.replaceChildren();
  for(const row of model.materials){const tr=el('tr');tr.dataset.resource=row.name;
   const resource=el('td');resource.append(this.resource(row));tr.append(resource);
   for(const [value,color]of [[this.compact(row.produced),''],[this.compact(row.consumed),''],[`${row.balance>0?'+':''}${this.compact(row.balance)}`,row.balance<-.01?'bad':row.balance>.01?'good':'muted'],[this.compact(row.stock),'cyan'],[row.emptyMinutes===null?this.t('common.empty'):this.t('overview.minutes',{value:this.number(row.emptyMinutes,true)}),row.emptyMinutes!==null&&row.emptyMinutes<30?'bad':''],[row.change===null?this.t('common.empty'):row.change>.05?'↗':row.change<-.05?'↘':'→',row.change<-.05?'warn':'good']])tr.append(el('td',value,color));
   tr.title=this.t('overview.rowMeaning',{name:this.name(row.name)});host.append(tr);
  }
  $('overview-stock-note').textContent=this.t(model.usableInventory?'overview.stockScope':'overview.stockUnavailable',{seconds:this.number(model.sampleWindowSeconds,true),age:this.number(model.machineAge,true)});
 }
 machines(model){
  const host=$('overview-machines');host.replaceChildren();
  for(const group of model.groups){const tr=el('tr');for(const [text,color]of [[this.name(group.name),''],[this.t('overview.fraction',{value:this.number(group.working),total:this.number(group.total)}),'cyan'],[this.number(group.stopped),group.stopped?'warn':''],[group.reason?(this.i18n.has(`machineStatus.${group.reason}`)?this.t(`machineStatus.${group.reason}`):this.t('machineStatus.other',{status:group.reason})):this.t('overview.normal'),group.stopped?'warn':'good']]){const td=el('td',text,color);td.title=text;if(!tr.children.length)td.replaceChildren(prototypeLabel(this.i18n,group.name,'entity'));tr.append(td);}host.append(tr);}
  $('overview-machine-coverage').textContent=this.t('overview.fraction',{value:this.number(model.sampled),total:this.number(model.expected)});
 }
 chain(model){
  const host=$('overview-chain');host.replaceChildren();
  for(const names of [['iron-ore','copper-ore'],['iron-plate','copper-plate'],['electronic-circuit','advanced-circuit']]){
   const stage=el('div',undefined,'chain-stage');for(const name of names){const row=model.rows.find(r=>r.name===name);const node=el('div',undefined,'chain-node');node.dataset.deficit=String(row?.balance<-.01);const img=el('img');img.src=`./icons/${name}.png`;img.alt='';const label=el('div');label.append(el('span',this.name(name)),el('strong',this.rate(row?.produced??null)));node.append(img,label);stage.append(node);}host.append(stage);
  }
 }
 forecasts(model){
  const host=$('overview-forecasts');host.replaceChildren();
  for(const row of model.deficits.slice(0,3)){
   const tr=el('tr'),name=el('td');name.append(this.resource(row));tr.append(name,el('td',this.rate(row.balance),'bad'),el('td',row.emptyMinutes===null?this.t('overview.noStockForecast'):this.t('overview.estimateMinutes',{minutes:this.number(row.emptyMinutes,true)}),'warn'),el('td',this.t('overview.capacityAction',{value:this.compact(Math.ceil(row.consumed*1.05-row.produced))})));host.append(tr);
  }
  if(!model.deficits.length){const tr=el('tr'),td=el('td',this.t(model.productionFresh?'overview.noDeficits':'overview.flowsUnavailable'),'muted');td.colSpan=4;tr.append(td);host.append(tr);}
 }
 bottom(model,topics,age){
  const host=$('overview-logistics');host.replaceChildren();
  const l=model.logistics;
  for(const [label,value]of [['logisticRobots',this.t('overview.fraction',{value:this.number(l.logisticAvailable),total:this.number(l.logisticTotal)})],['constructionRobots',this.t('overview.fraction',{value:this.number(l.constructionAvailable),total:this.number(l.constructionTotal)})],['trains',this.number(l.trains)]]){const node=el('div');node.append(el('small',this.t(`overview.${label}`)),el('strong',value));host.append(node);}
  const coverage=$('overview-coverage');coverage.replaceChildren();
  for(const key of ['power','production','machines','logistics']){const topic=topics[key],node=el('span',this.t(`topics.${key}`)+' '),fresh=topic&&age(topic)<=Math.max(15,key==='resources'?45:15);node.append(el('b',topic?this.t('overview.seconds',{value:this.number(age(topic),true)}):this.t('common.empty'),fresh?'':'warn'));coverage.append(node);}
  const note=el('span',this.t('overview.machineWindow',{seconds:this.number(model.sampleWindowSeconds,true)}));note.title=this.t('overview.stockScope',{seconds:this.number(model.sampleWindowSeconds,true)});note.style.gridColumn='1 / -1';coverage.append(note);
 }
}
