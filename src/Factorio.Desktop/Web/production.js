import {prototypeLabel} from './prototype-label.js';
import {node,lineChart} from './charts.js';
import {FactoryMap} from './factory-map.js';
const $=id=>document.getElementById(id);
const icons=await (await fetch('./icons/catalog.json')).json();
export class Production {
 constructor(i18n,configure,clock={request(){}}){this.i18n=i18n;this.t=(k,v)=>i18n.text(k,v);this.configure=configure;this.mode='table';this.active=false;this.tableRenders=0;this.mapRenders=0;
  this.map=new FactoryMap($('production-map'),i18n,clock,mapSelected=>configure({mapSelected}));
  const tabs=[...document.querySelectorAll('[data-production-view]')];
  for(const tab of tabs){tab.addEventListener('click',()=>this.setMode(tab.dataset.productionView));tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=tabs.indexOf(tab),next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length];this.setMode(next.dataset.productionView);next.focus();});}
  $('production-map-resource').addEventListener('change',event=>configure({mapResource:event.target.value,...(event.target.value==='all'?{}:{selected:event.target.value}),mapSelected:null}));
  for(const button of document.querySelectorAll('[data-production-map-role]'))button.addEventListener('click',()=>configure({mapRole:button.dataset.productionMapRole,mapSelected:null}));
  $('production-map-zoom-in').addEventListener('click',()=>this.map.zoom(1.3));$('production-map-zoom-out').addEventListener('click',()=>this.map.zoom(1/1.3));$('production-map-locate').addEventListener('click',()=>this.map.fit());
  for(const [id,key]of [['scope','scope'],['filter','filter'],['units','units'],['rate-window','rateWindow']])$('production-'+id).addEventListener('change',()=>configure({[key]:$('production-'+id).value}));
  $('production-search').addEventListener('input',()=>{clearTimeout(this.searchTimer);this.searchTimer=setTimeout(()=>{const search=$('production-search').value.trim().toLocaleLowerCase();const searchNames=i18n.prototypeSearch(search);configure({search,searchNames});},180);});
  for(const b of document.querySelectorAll('[data-production-minutes]'))b.addEventListener('click',()=>configure({minutes:Number(b.dataset.productionMinutes)}));
 }
 setActive(value){this.active=value;this.map.setActive(value&&this.mode==='map');}
 setMode(value){if(!['table','map'].includes(value))return;this.mode=value;for(const tab of document.querySelectorAll('[data-production-view]')){const selected=tab.dataset.productionView===value;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}$('production-table-view').hidden=value!=='table';$('production-map-view').hidden=value!=='map';this.map.setActive(this.active&&value==='map');if(this.frame&&this.active)this.render(this.frame,this.snapshot,this.age);}
 describe(){return {mode:this.mode,active:this.active,tableRenders:this.tableRenders,mapRenders:this.mapRenders,map:this.map.describe()};}
 n(value,decimal=false){return this.i18n.number(value,decimal);}
 name(name,kind){return this.i18n.prototype(name,kind);}
 compact(value){if(!Number.isFinite(value))return this.t('common.empty');const abs=Math.abs(value);return abs>=1e6?this.t('overview.million',{value:this.n(value/1e6,true)}):abs>=1e4?this.t('overview.thousand',{value:this.n(value/1e3,true)}):this.n(value,abs<100);}
 rate(value){return this.compact(value===null?null:value/this.divisor);}
 eta(value){return value===null?this.t('common.empty'):value>=60?this.t('production.hours',{value:this.n(value/60,true)}):this.t('production.minutes',{value:this.n(value,true)});}
 percent(value){return value===null?this.t('common.empty'):this.t('energy.percent',{value:this.n(value)});}
 resource(row){const host=node('span',undefined,'resource-cell'),path=icons[row.kind+'|'+row.name]||icons['item|'+row.name];if(path){const img=node('img');img.src='./icons/'+path;img.alt='';host.append(img);}host.append(node('span',this.name(row.name)));if(row.quality&&row.quality!=='normal')host.append(node('small',this.t('quality.'+row.quality),'quality-'+row.quality));return host;}
 optionList(id,scopes,value){const select=$(id),signature=JSON.stringify(scopes);if(select.dataset.signature!==signature){select.replaceChildren();for(const s of scopes){const o=node('option',this.t('overview.scopeValue',s));o.value=s.id;select.append(o);}select.dataset.signature=signature;}select.value=value;}
 render(frame,snapshot,age){if(!frame)return;this.frame=frame;this.snapshot=snapshot;this.age=age;this.divisor=frame.options.units==='second'?60:1;
  this.optionList('production-scope',frame.scopes,frame.scope.id);
  $('production-ups').textContent=this.t(frame.ups===null?'production.upsMissing':'production.upsValue',{value:this.n(frame.ups,true)});
  if(document.activeElement!==$('production-search'))$('production-search').value=frame.options.search;
  for(const [id,key]of [['filter','filter'],['units','units'],['rate-window','rateWindow']])$('production-'+id).value=frame.options[key];
  for(const b of document.querySelectorAll('[data-production-minutes]'))b.setAttribute('aria-pressed',String(Number(b.dataset.productionMinutes)===frame.options.minutes));
  $('production-age').textContent=this.t(frame.fresh?'overview.snapshotAge':'overview.stale',{seconds:this.n(age(snapshot.status.topics.production),true)});$('production-age').className=frame.fresh?'muted':'warn';
  if(this.mode==='map'){this.renderMap(frame,snapshot);return;}
  this.tableRenders++;
  $('production-count').textContent=this.t('production.count',{shown:this.n(frame.rows.length),total:this.n(frame.total),deficits:this.n(frame.deficits)});
  $('production-rate-unit').textContent=this.t(this.divisor===60?'production.perSecond':'production.perMinute');
  const scroll=$('production-balance-scroll'),top=scroll.scrollTop,focused=document.activeElement?.closest?.('[data-resource]')?.dataset.resource;
  const body=$('production-rows');body.replaceChildren();
  frame.rows.forEach((r,index)=>{const tr=node('tr');tr.dataset.resource=r.id;tr.dataset.deficit=String(r.balance<-.01);tr.tabIndex=r.id===frame.selected?.id?0:-1;tr.setAttribute('aria-selected',String(r.id===frame.selected?.id));
   const first=node('td');first.append(this.resource(r));first.title=this.t('production.resourceLabel',{name:this.name(r.name),quality:this.i18n.has('quality.'+r.quality)?this.t('quality.'+r.quality):r.quality});tr.append(first);
   const values=[this.rate(r.produced),this.rate(r.consumed),r.balance>0?'+'+this.rate(r.balance):this.rate(r.balance),this.percent(r.coverage),this.compact(r.stock),this.eta(r.emptyMinutes)];
   values.forEach((text,i)=>{const cell=node('td',text,i===0?'cyan':i===1?'good':i===2||i===3?(r.balance<-.01?'bad':'good'):i===4?'warn':'');cell.title=text;tr.append(cell);});
   const select=()=>this.configure({selected:r.id});tr.addEventListener('click',select);tr.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();select();}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();this.configure({selected:frame.rows[(index+(e.key==='ArrowDown'?1:frame.rows.length-1))%frame.rows.length].id});this.focusSelection=true;}});body.append(tr);
  });
  if(!frame.rows.length)this.emptyRow(body,7,'production.noRows');
  scroll.scrollTop=top;
  if(focused||this.focusSelection){body.querySelector('[aria-selected=true]')?.focus({preventScroll:true});this.focusSelection=false;}
  $('production-stock-note').textContent=this.t(!frame.inventoryComplete?'production.stockIncomplete':!frame.usableInventory?'production.stockStale':'production.stockScope',{seconds:this.n(frame.sampleWindowSeconds,true)});
  this.detail(frame);this.chain(frame);this.machines(frame);this.blockers(frame);
 }
 renderMap(frame,snapshot){
  this.mapRenders++;const model=frame.map;if(!model)return;
  const select=$('production-map-resource'),signature=JSON.stringify(frame.rows.map(r=>[r.id,r.name,r.quality]));
  if(this.resourceSignature!==signature){select.replaceChildren();const all=node('option',this.t('production.map.allResources'));all.value='all';select.append(all);for(const row of frame.rows){const option=node('option',this.name(row.name)+(row.quality!=='normal'?' · '+this.t('quality.'+row.quality):''));option.value=row.id;select.append(option);}this.resourceSignature=signature;}select.value=frame.options.mapResource||'all';select.disabled=false;
  for(const button of document.querySelectorAll('[data-production-map-role]'))button.setAttribute('aria-pressed',String(button.dataset.productionMapRole===model.role));
  $('production-map-coverage').textContent=this.t('production.map.coverage',{points:this.n(model.coordinateCount),machines:this.n(model.totalMachines)});
  $('production-map-title').textContent=this.t('overview.scopeValue',frame.scope);$('production-map-locate').disabled=!model.selected?.located;
  const list=$('production-map-locations'),top=list.scrollTop;list.replaceChildren();
  for(const group of model.issues){const button=node('button',undefined,'production-map-location');button.type='button';button.dataset.location=group.id;button.setAttribute('aria-pressed',String(group.id===model.selected?.id));button.style.setProperty('--location-color',group.color);
   const title=node('span',undefined,'production-map-location-title');title.append(prototypeLabel(this.i18n,group.name,'entity'));const count=node('b',this.n(group.totalMachines));title.append(count);
   button.append(title,node('span',this.name(group.recipe,'recipe')),node('small',this.t('production.map.role.'+group.role)+' · '+this.status(group.status)),node('small',this.t(group.located?'production.map.points':'production.map.noCoordinates',{count:this.n(group.points.length)})));button.addEventListener('click',()=>this.configure({mapSelected:group.id}));list.append(button);
  }
  if(!model.issues.length)list.append(node('p',this.t(frame.selected?'production.map.noMachines':'production.selectResource'),'analysis-empty'));list.scrollTop=top;
  const detail=$('production-map-detail');detail.replaceChildren();
  const heading=node('div',undefined,'panel-heading');heading.append(node('h2',model.allResources?this.t('production.map.allResources'):this.name(model.resource.name)));detail.append(heading);
  const body=node('div',undefined,'production-map-detail-body'),group=model.selected,info=node('div',undefined,'production-map-observation');
  if(group){info.append(prototypeLabel(this.i18n,group.name,'entity'),node('span',this.name(group.recipe,'recipe')),node('small',this.status(group.status)),node('small',this.t('production.map.groupCoverage',{machines:this.n(group.totalMachines),points:this.n(group.points.length)})));if(group.points.length)info.append(node('small',group.points.slice(0,3).map(p=>this.t('production.position',{x:this.n(p.x,true),y:this.n(p.y,true)})).join(this.t('production.separator'))));}
  else info.append(node('span',this.t('production.map.noMachines')));
  if(!frame.machinesFresh)info.append(node('small',this.t('production.machineStale'),'warn'));if(model.qualityUnmeasured)info.append(node('small',this.t('production.map.qualityUnmeasured'),'warn'));
  const stats=node('dl',undefined,'production-map-rates');if(model.resource)for(const [key,value,color]of [['produced',model.resource.produced,'cyan'],['consumed',model.resource.consumed,'good'],['balance',model.resource.balance,model.resource.balance<0?'bad':'good']])stats.append(node('dt',this.t('production.'+key)),node('dd',this.rate(value)+' '+this.t(this.divisor===60?'production.perSecond':'production.perMinute'),color));body.append(info,stats);detail.append(body);
  this.map.setModel(model,snapshot.status.session_id);this.map.setActive(this.active);
 }
 emptyRow(host,columns,key){const tr=node('tr'),cell=node('td',this.t(key),'muted');cell.colSpan=columns;tr.append(cell);host.append(tr);}
 detail(frame){const r=frame.selected;
  $('production-selected').textContent=r?this.t('production.detailTitle',{name:this.name(r.name)}):this.t('production.selectResource');
  $('production-detail-stats').replaceChildren();
  const now=frame.tick,formatX=tick=>Math.abs(tick-now)<1?this.t('overview.now'):this.t('energy.axisMinutes',{value:this.n((tick-now)/3600)});
  const chart=(id,series,label)=>lineChart($(id),{series,label:this.t(label),formatY:v=>this.compact(v),formatX,xMin:now-frame.options.minutes*3600,xMax:now});
  chart('production-flow-chart',[{points:frame.history.map(p=>({tick:p.tick,value:p.produced===null?null:p.produced/this.divisor})),color:'var(--cyan)'},{points:frame.history.map(p=>({tick:p.tick,value:p.consumed===null?null:p.consumed/this.divisor})),color:'var(--green)'}],'production.flowChart');
  chart('production-stock-chart',[{points:frame.stockHistory,color:'var(--amber)'}],'production.stockChart');
  if(r)for(const [key,value,color]of [['produced',this.rate(r.produced),'cyan'],['consumed',this.rate(r.consumed),'good'],['imported',this.rate(r.imported),'cyan'],['exported',this.rate(r.exported),'warn'],['balance',this.rate(r.balance),r.balance<-.01?'bad':'good'],['coverage',this.percent(r.coverage),'muted'],['stock',this.compact(r.stock),'warn'],['untilEmpty',this.eta(r.emptyMinutes),'warn']]){$('production-detail-stats').append(node('dt',this.t('production.'+key)),node('dd',value,color));}
  $('production-history-note').textContent=this.t('production.historyNote',{points:this.n(frame.historyCount),window:this.t(frame.options.rateWindow==='10m'?'production.window10':'production.window1')});
  $('production-action').textContent=this.t(!r?'production.selectResource':!frame.fresh?'production.staleAction':r.balance<-.01?'production.deficitAction':'production.balancedAction',{rate:this.rate(r?-r.balance:0),unit:this.t(this.divisor===60?'production.perSecond':'production.perMinute')});
 }
 chain(frame){const host=$('production-chain');host.replaceChildren();const r=frame.selected;
  for(const [rows,key]of [[frame.chain.inputs,'production.ingredients'],[r?[r]:[],'production.selectedResource'],[frame.chain.outputs,'production.downstream']]){
   const col=node('div',undefined,'production-chain-column');col.append(node('small',this.t(key)));
   for(const item of rows.slice(0,3)){const button=node('button',undefined,'production-chain-node');button.type='button';button.dataset.deficit=String(item.balance<-.01);button.append(this.resource(item));button.title=this.t('production.selectNamed',{name:this.name(item.name)});button.addEventListener('click',()=>this.configure({selected:item.id,filter:'all',search:'',searchNames:[]}));col.append(button);}
   if(rows.length>3)col.append(node('span',this.t('production.more',{count:rows.length-3}),'muted'));
   if(!rows.length)col.append(node('span',this.t('common.empty'),'muted'));host.append(col);
  }
 }
 status(value){return this.i18n.has('machineStatus.'+value)?this.t('machineStatus.'+value):this.t('machineStatus.other',{status:value});}
 machines(frame){const body=$('production-machines');body.replaceChildren();for(const g of frame.selectedGroups.slice(0,20)){const tr=node('tr');[this.name(g.name),this.name(g.recipe,'recipe'),this.n(g.count),this.status(g.status)].forEach((v,i)=>{const cell=node('td',v,i===3?(g.status==='working'?'good':'warn'):'');cell.title=v;if(i<2)cell.replaceChildren(prototypeLabel(this.i18n,i===0?g.name:g.recipe,i===0?'entity':'recipe'));tr.append(cell);});body.append(tr);}if(!frame.selectedGroups.length)this.emptyRow(body,4,'production.noMachines');
  $('production-machine-note').textContent=this.t(frame.machinesFresh?'production.machineScope':'production.machineStale',{seconds:this.n(frame.sampleWindowSeconds,true)});
 }
 blockers(frame){const body=$('production-blockers');body.replaceChildren();for(const g of frame.blockers){const tr=node('tr');const places=(g.examples||[]).slice(0,2).map(p=>this.t('production.position',{x:this.n(p.x,true),y:this.n(p.y,true)})).join(this.t('production.separator'));[this.name(g.name),this.name(g.recipe||g.name,'recipe'),this.n(g.count),this.status(g.status),places||this.t('common.empty')].forEach((v,i)=>{const cell=node('td',v,i===3?'warn':'');cell.title=v;if(i<2)cell.replaceChildren(prototypeLabel(this.i18n,i===0?g.name:g.recipe,i===0?'entity':'recipe'));tr.append(cell);});body.append(tr);}if(!frame.blockers.length)this.emptyRow(body,5,'production.noBlockers');$('production-blocker-count').textContent=this.t('production.blockerCount',{count:this.n(frame.blockerCount)});
 }
}
