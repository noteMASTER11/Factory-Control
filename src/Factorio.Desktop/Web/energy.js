import {prototypeLabel} from './prototype-label.js';
import {node,lineChart,sparkline} from './charts.js';
const $=id=>document.getElementById(id);
export class Energy {
 constructor(i18n,configure){this.i18n=i18n;this.t=(k,v)=>i18n.text(k,v);this.configure=configure;
  $('energy-scope').addEventListener('change',()=>configure({scope:$('energy-scope').value,network:'all'}));
  $('energy-network').addEventListener('change',()=>configure({network:$('energy-network').value}));
  for(const button of document.querySelectorAll('[data-energy-minutes]'))button.addEventListener('click',()=>configure({minutes:Number(button.dataset.energyMinutes)}));
 }
 n(value,decimal=true){return this.i18n.number(value,decimal);}
 name(value,kind){return this.i18n.prototype(value,kind);}
 mw(value){return value===null||value===undefined?this.t('common.empty'):this.t('energy.mw',{value:this.n(value/1e6)});}
 percent(value){return value===null?this.t('common.empty'):this.t('energy.percent',{value:this.n(value)});}
 selectOptions(id,rows,value){const select=$(id),signature=JSON.stringify(rows);if(select.dataset.signature!==signature){select.replaceChildren();for(const [key,label]of rows){const option=node('option',label);option.value=key;select.append(option);}select.dataset.signature=signature;}select.value=value;}
 render(frame,snapshot,age){
  if(!frame)return;this.frame=frame;const c=frame.current,scopeId=JSON.stringify([frame.scope.surface,frame.scope.force]);
  this.selectOptions('energy-scope',frame.scopes.map(s=>[s.id,this.t('overview.scopeValue',s)]),scopeId);
  this.selectOptions('energy-network',[['all',this.t('energy.allNetworks')],...frame.networks.map(n=>[String(n.id),this.t('energy.networkValue',{id:n.id})])],frame.network);
  for(const button of document.querySelectorAll('[data-energy-minutes]'))button.setAttribute('aria-pressed',String(Number(button.dataset.energyMinutes)===frame.minutes));
  const topic=snapshot.status.topics.power;
  $('energy-age').textContent=this.t(!topic||age(topic)>15?'overview.stale':'overview.snapshotAge',{seconds:this.n(topic?age(topic):null)});
  $('energy-age').className=age(topic)>15?'warn':'muted';
  const batteryEnergy=c.charge===null||c.capacity===null?this.t('common.empty'):this.t('energy.storedEnergy',{charge:this.n(c.charge/1e9),capacity:this.n(c.capacity/1e9)});
  for(const [id,value,color]of [['generation',this.mw(c.production),'cyan'],['consumption',this.mw(c.consumption),'good'],['battery-flow',this.mw(c.batteryFlow),c.batteryFlow<0?'warn':'good'],['nameplate',this.mw(c.nameplate),'muted'],['battery-energy',batteryEnergy,'good']]){const field=$('energy-'+id);field.textContent=value;field.className=color;}
  $('energy-charge-meter').value=c.percent??0;$('energy-charge-meter').title=this.t('energy.batteryScope');
  const formatX=tick=>{const m=(tick-c.tick)/3600;return Math.abs(m)<.01?this.t('overview.now'):this.t('energy.axisMinutes',{value:(m>0?'+':'')+this.n(m,false)});};
  const points=key=>frame.history.map(p=>({tick:p.tick,value:p[key]}));
  lineChart($('energy-power-chart'),{label:this.t('energy.powerChart'),formatY:v=>this.n(v/1e6),formatX,xMin:c.tick-frame.minutes*3600,xMax:c.tick,series:[{points:points('production'),color:'var(--cyan)'},{points:points('consumption'),color:'var(--green)'}]});
  lineChart($('energy-battery-chart'),{label:this.t('energy.batteryChart'),formatY:v=>this.percent(v),formatX,maxY:100,xMin:c.tick-frame.minutes*3600,xMax:c.tick+(frame.batteryProjection.length?30*3600:0),series:[{points:points('percent'),color:'var(--blue)'},{points:frame.batteryProjection.map(p=>({tick:p.tick,value:p.percent})),color:'var(--blue)',dashed:true}]});
  $('energy-history-note').textContent=this.t('energy.historyNote',{count:this.n(frame.historyCount,false),minutes:this.n(frame.observedMinutes)});
  $('energy-battery-note').textContent=this.t(c.capacity===null?'energy.batteryUnassigned':frame.batteryProjection.length?'energy.batteryEstimate':'energy.batterySteady',{minutes:this.n(frame.batteryEta)});
  this.sources(frame);this.consumers(frame);this.networks(frame);this.forecasts(frame);this.capacity(frame);this.events(frame,snapshot,age);
 }
 sources(frame){const body=$('energy-sources');body.replaceChildren();
  for(const source of frame.sources){const tr=node('tr');const current=source.watts;const cells=[this.name(source.name),source.count===null?this.t('common.empty'):this.n(source.count,false),this.mw(current),this.mw(source.nameplate),source.nameplate>0?this.percent(current/source.nameplate*100):this.t('common.empty'),this.i18n.has('machineStatus.'+source.status)?this.t('machineStatus.'+source.status):this.t('energy.unmeasured')];
   cells.forEach((text,index)=>{const cell=node('td',text,index===2?'cyan':index===5?'muted':'');cell.title=text;if(index===0)cell.replaceChildren(prototypeLabel(this.i18n,source.name,'entity'));tr.append(cell);});const trend=node('td',undefined,'spark');trend.append(sparkline(source.trend,'var(--cyan)',this.t('energy.sourceTrend')));tr.append(trend);body.append(tr);
  }
 }
 consumers(frame){const body=$('energy-consumers');body.replaceChildren();
  for(const consumer of frame.consumers){const tr=node('tr');[this.name(consumer.name),this.mw(consumer.watts),this.percent(consumer.share*100),this.mw(consumer.peak)].forEach((text,index)=>{const cell=node('td',text,index===1?'good':'');cell.title=text;if(index===0)cell.replaceChildren(prototypeLabel(this.i18n,consumer.name,'entity'));tr.append(cell);});const trend=node('td',undefined,'spark');trend.append(sparkline(consumer.trend,'var(--green)',this.t('energy.consumerTrend')));tr.append(trend);body.append(tr);}
 }
 networks(frame){const body=$('energy-networks');body.replaceChildren();
  for(const network of frame.networks){const tr=node('tr');tr.dataset.network=network.id;tr.dataset.selected=String(frame.network===String(network.id));
   const select=node('button',this.t('energy.networkValue',{id:network.id}),'network-link');select.type='button';select.title=this.t('energy.selectNetwork',{id:network.id});select.addEventListener('click',()=>this.configure({network:String(network.id)}));const first=node('td');first.append(select);tr.append(first);
   for(const text of [network.surface,this.mw(network.production_watts),this.mw(network.consumption_watts),this.t(network.production_watts||network.consumption_watts?'energy.measured':'energy.inactive')])tr.append(node('td',text));body.append(tr);
  }
 }
 forecasts(frame){const body=$('energy-projections');body.replaceChildren();
  for(const row of frame.projections){const tr=node('tr');[this.t('energy.inMinutes',{minutes:row.minutes}),this.mw(frame.current.consumption),this.mw(row.change),this.mw(row.watts)].forEach((text,i)=>tr.append(node('td',text,i===2?(row.change>0?'warn':'good'):'')));body.append(tr);}
  if(!frame.projections.length){const tr=node('tr'),cell=node('td',this.t('energy.insufficientHistory'),'muted');cell.colSpan=4;tr.append(cell);body.append(tr);}
  $('energy-trend-note').textContent=this.t(frame.trend===null?'energy.trendNeedsHistory':'energy.trendScope',{value:this.mw(frame.trend)});
 }
 capacity(frame){const c=frame.current,host=$('energy-capacity');host.replaceChildren();
  for(const [label,value]of [['batteries',c.batteryCount===null?this.t('common.empty'):this.n(c.batteryCount,false)],['capacity',c.capacity===null?this.t('common.empty'):this.t('energy.gj',{value:this.n(c.capacity/1e9)})],['charge',c.charge===null?this.t('common.empty'):this.t('energy.gj',{value:this.n(c.charge/1e9)})],['chargePercent',this.percent(c.percent)]])host.append(node('dt',this.t('energy.'+label)),node('dd',value));
 }
 events(frame,snapshot,age){const host=$('energy-observations');host.replaceChildren();
  const rows=[this.t('energy.noReserve'),this.t('energy.noFuel'),this.t('energy.batteryScope')];
  if(!frame.fresh)rows.unshift(this.t('energy.staleMeasurements'));
  const errors=snapshot.status.topics.status?.payload.data.errors;if(errors&&Object.keys(errors).length)rows.unshift(this.t('energy.collectorErrors',{count:Object.keys(errors).length}));
  for(const text of rows)host.append(node('div',text));
 }
}
