import {prototypeLabel} from './prototype-label.js';
import {FactoryMap} from './factory-map.js';
const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
export class Overview{
 constructor(i18n,onConfigure,clock){
  this.i18n=i18n;this.t=(key,values)=>i18n.text(key,values);this.configure=onConfigure;
  this.map=new FactoryMap($('analysis-map'),i18n,clock,selected=>onConfigure({selected}));
  $('overview-scope').addEventListener('change',event=>onConfigure({scope:event.target.value,selected:null}));
  for(const button of document.querySelectorAll('[data-analysis-filter]'))button.addEventListener('click',()=>onConfigure({filter:button.dataset.analysisFilter}));
  $('analysis-zoom-in').addEventListener('click',()=>this.map.zoom(1.3));$('analysis-zoom-out').addEventListener('click',()=>this.map.zoom(1/1.3));$('analysis-locate').addEventListener('click',()=>this.map.fit());
 }
 setActive(value){this.map.setActive(value);}
 number(value,decimal=false){return Number.isFinite(value)?this.i18n.number(value,decimal):this.t('common.empty');}
 duration(seconds){return seconds>=60?this.t('analysis.minutes',{value:this.number(seconds/60,true)}):this.t('analysis.seconds',{value:this.number(seconds)});}
 supplyText(item){const values={name:this.i18n.prototype(item.name,'item'),source:item.source||this.t('common.empty'),count:this.number(item.count),eta:Number.isFinite(item.etaSeconds)?this.duration(item.etaSeconds):this.t('space.etaUnknown')};let text=this.t('space.supply.'+item.stage,values);if(item.etaSeconds===null&&Number.isFinite(item.orbitEtaSeconds))text+=' · '+this.t('space.orbitEta',{eta:this.duration(item.orbitEtaSeconds)});if(item.remainingSeconds!==null)text+=' · '+this.t('space.spoilIn',{eta:this.duration(item.remainingSeconds)});return text;}
 render(model,snapshot){
  if(!model)return;this.model=model;
  const select=$('overview-scope'),signature=JSON.stringify(model.scopes);
  if(signature!==this.scopes){select.replaceChildren();const all=el('option',this.t('analysis.allSurfaces'));all.value='all';select.append(all);for(const scope of model.scopes){const option=el('option',this.t('overview.scopeValue',scope));option.value=scope.id;select.append(option);}this.scopes=signature;}select.value=model.options.scope;
  for(const button of document.querySelectorAll('[data-analysis-filter]'))button.setAttribute('aria-pressed',String(button.dataset.analysisFilter===model.options.filter));
  $('analysis-critical').textContent=this.number(model.critical);$('analysis-warning').textContent=this.number(model.warning);$('analysis-located').textContent=this.number(model.issues.filter(r=>r.located).length);
  $('overview-freshness').textContent=this.t(!model.supported?'analysis.collectorRequired':!model.live?'analysis.stale':!model.spatialComplete?'analysis.partial':!model.complete?'analysis.indexing':'analysis.live',{sampled:this.number(model.sampled),total:this.number(model.expected)});$('overview-freshness').dataset.stale=String(!model.live||!model.complete);
  const list=$('analysis-issues');list.replaceChildren();
  for(const issue of model.issues){
   const button=el('button',undefined,'analysis-issue');button.type='button';button.dataset.issue=issue.id;button.dataset.severity=issue.severity;button.setAttribute('aria-pressed',String(issue.id===model.selected?.id));
   const icon=el('span',undefined,'analysis-issue-icon');icon.append(prototypeLabel(this.i18n,issue.name,issue.kind||'entity'));
   const copy=el('span',undefined,'analysis-issue-copy'),title=el('strong',this.t(issue.supply?.length?'space.supplyTitle':'analysis.category.'+issue.category)),line=el('span');line.append(el('span',this.i18n.prototype(issue.recipe||issue.name,issue.recipe?'recipe':issue.kind||'entity')),el('b',issue.count===null?'':this.number(issue.count)));
   if(issue.supply?.length)copy.append(el('small',this.supplyText(issue.supply[0]),'cyan'));
   copy.append(title,line,el('small',this.t('analysis.issueScope',{surface:issue.surface,force:issue.force,duration:this.duration(issue.durationSeconds)})));
   button.append(icon,copy,el('span',issue.located?'⌖':'↘','analysis-issue-marker'));button.addEventListener('click',()=>this.configure({selected:issue.id}));list.append(button);
  }
  if(!model.issues.length)list.append(el('p',this.t(!model.supported?'analysis.collectorRequired':!model.live?'analysis.noCurrentData':model.complete?'analysis.noIssues':'analysis.noIssuesYet'),'analysis-empty'));
  $('analysis-list-count').textContent=this.number(model.total);this.detail(model);this.map.setModel(model,snapshot?.status.session_id);
 }
 detail(model){
  const issue=model.selected,host=$('analysis-detail');host.replaceChildren();$('analysis-map-title').textContent=issue?this.t('analysis.mapTitle',issue):this.t('analysis.map');$('analysis-locate').disabled=!issue?.located;
  if(!issue){host.append(el('div',this.t('analysis.chooseIssue'),'analysis-empty'));return;}
  const heading=el('div',undefined,'analysis-detail-heading'),title=el('h2',this.t(issue.supply?.length?'space.supplyTitle':'analysis.category.'+issue.category)),scope=el('span',this.t('analysis.mapTitle',issue));heading.append(title,scope);host.append(heading);
  const body=el('div',undefined,'analysis-detail-body'),evidence=el('div',undefined,'analysis-evidence');
  const status=issue.status?(this.i18n.has('machineStatus.'+issue.status)?this.t('machineStatus.'+issue.status):this.t('machineStatus.other',{status:issue.status})):'';
  evidence.append(el('span',this.t('analysis.observed'),'analysis-label'),el('strong',this.t(issue.type==='balance'?'analysis.balanceObservation':'analysis.machineObservation',{name:this.i18n.prototype(issue.name,issue.kind||'entity'),count:this.number(issue.count),status,produced:this.number(issue.produced,true),consumed:this.number(issue.consumed,true)})),el('small',this.t('analysis.observedFor',{duration:this.duration(issue.durationSeconds)})));
  if(!model.live)evidence.append(el('small',this.t('analysis.stale'),'warn'));
  if(issue.located&&model.tick-issue.lastSeenTick>900)evidence.append(el('small',this.t('analysis.sampleAge',{value:this.number((model.tick-issue.lastSeenTick)/60)}),'warn'));
  if(issue.type==='balance')evidence.append(el('small',this.t(issue.emptyMinutes===null?'analysis.noLocalisation':'analysis.reserveEstimate',{value:this.number(issue.emptyMinutes,true)}),'warn'));
  const advice=el('div',undefined,'analysis-advice');advice.append(el('span',this.t(issue.supply?.length?'space.supplyTitle':'analysis.check'),'analysis-label'));
  if(issue.supply?.length)for(const item of issue.supply.slice(0,3))advice.append(el('p',this.supplyText(item),item.remainingSeconds!==null&&item.etaSeconds!==null&&item.remainingSeconds<=item.etaSeconds?'bad':'cyan'));
  else advice.append(el('p',this.t('analysis.advice.'+issue.category)));
  body.append(evidence,this.chart(model),advice);host.append(body);
 }
 chart(model){
  const host=el('div',undefined,'analysis-trend'),issue=model.selected;host.append(el('span',this.t('analysis.surfaceTrend'),'analysis-label'));
  if(model.trend.length<2){host.append(el('p',this.t('analysis.historyWaiting'),'muted'));return host;}
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 300 100');svg.setAttribute('role','img');svg.setAttribute('aria-label',this.t('analysis.surfaceTrend'));
  const first=model.trend[0].tick,last=model.trend.at(-1).tick,max=Math.max(1,...model.trend.flatMap(p=>[p.produced,p.consumed]));
  for(const [field,color]of [['produced','var(--cyan)'],['consumed','var(--amber)']]){const path=document.createElementNS(ns,'path');path.setAttribute('d',model.trend.map((p,i)=>`${i?'L':'M'}${8+(p.tick-first)/Math.max(1,last-first)*284},${88-p[field]/max*78}`).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke',color);path.setAttribute('stroke-width','1.6');svg.append(path);}host.append(svg);
  const legend=el('small');legend.append(el('span',this.t('overview.produced'),'cyan'),el('span',' / '),el('span',this.t('overview.consumed'),'warn'));if(issue?.product)legend.append(el('span',' · '+this.i18n.prototype(issue.product,issue.productKind||issue.kind||'item')));host.append(legend);return host;
 }
}
