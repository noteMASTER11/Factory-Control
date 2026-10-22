import {node,lineChart} from './charts.js';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
const svg=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
const icons=await(await fetch('./icons/catalog.json')).json();
export class Logistics {
 constructor(i18n,configure){this.i18n=i18n;this.t=(k,v)=>i18n.text(k,v);this.configure=configure;
  $('logistics-scope').addEventListener('change',()=>configure({scope:$('logistics-scope').value,network:'all',train:null}));
  $('logistics-network').addEventListener('change',()=>configure({network:$('logistics-network').value}));
  $('logistics-filter').addEventListener('change',()=>configure({filter:$('logistics-filter').value}));
  $('logistics-search').addEventListener('input',()=>{clearTimeout(this.searchTimer);this.searchTimer=setTimeout(()=>{const search=$('logistics-search').value.trim().toLocaleLowerCase(),searchNames=i18n.prototypeSearch(search);configure({search,searchNames});},180);});
  for(const b of document.querySelectorAll('[data-logistics-minutes]'))b.addEventListener('click',()=>configure({minutes:Number(b.dataset.logisticsMinutes)}));
 }
 n(v,decimal=false){return this.i18n.number(v,decimal);}
 compact(v){return v===null||v===undefined?this.t('common.empty'):Math.abs(v)>=1e6?this.t('overview.million',{value:this.n(v/1e6,true)}):Math.abs(v)>=1e4?this.t('overview.thousand',{value:this.n(v/1e3,true)}):this.n(v,v%1!==0);}
 name(v,kind){return this.i18n.prototype(v,kind);}
 state(t){return this.t(t.manual?'logistics.manual':this.i18n.has('logistics.train.'+t.state)?'logistics.train.'+t.state:'logistics.train.unknown');}
 waiting(ticks){return ticks===null?this.t('common.empty'):this.t(ticks<3600?'logistics.waitSeconds':'logistics.waitMinutes',{value:this.n(ticks/(ticks<3600?60:3600),ticks>=3600)});}
 network(n){return n.name||this.t('logistics.networkName',{id:n.id});}
 resource(r){const span=node('span',undefined,'resource-cell'),path=icons['item|'+r.name];if(path){const img=node('img');img.src='./icons/'+path;img.alt='';span.append(img);}span.append(node('span',this.name(r.name)));if(r.quality&&r.quality!=='normal')span.append(node('small',this.t('quality.'+r.quality)));return span;}
 options(id,rows,value){const el=$(id),signature=JSON.stringify(rows);if(el.dataset.signature!==signature){el.replaceChildren(...rows.map(([v,text])=>{const o=node('option',text);o.value=v;return o;}));el.dataset.signature=signature;}el.value=value;}
 empty(body,columns,key){const tr=body.insertRow(),td=tr.insertCell();td.colSpan=columns;td.className='empty';td.textContent=this.t(key);}
 row(body,values){const tr=body.insertRow();for(const v of values){const td=tr.insertCell();if(v instanceof Node)td.append(v);else td.textContent=v??this.t('common.empty');}return tr;}
 clickable(tr,select){tr.tabIndex=0;tr.addEventListener('click',select);tr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});}
 render(frame,snapshot,age){if(!frame)return;this.frame=frame;const s=frame.summary;
  this.options('logistics-scope',frame.scopes.map(s=>[s.id,this.t('overview.scopeValue',s)]),frame.scope.id);
  this.options('logistics-network',[['all',this.t('logistics.allNetworks')],...frame.networks.map(n=>[String(n.id),this.network(n)])],frame.options.network);
  $('logistics-filter').value=frame.options.filter||'missing';if(document.activeElement!==$('logistics-search'))$('logistics-search').value=frame.options.search||'';
  $('logistics-age').textContent=this.t(frame.fresh?'overview.snapshotAge':'overview.stale',{seconds:this.n(age(snapshot.status.topics.logistics),true)});$('logistics-age').className=frame.fresh?'muted':'warn';
  const robotValue=(available,total)=>frame.available?this.t('logistics.availableTotal',{available:this.n(available),total:this.n(total)}):this.t('common.empty');
  $('logistics-robots').textContent=robotValue(s.logisticAvailable,s.logisticTotal);$('logistics-builders').textContent=robotValue(s.constructionAvailable,s.constructionTotal);
  $('logistics-open').textContent=frame.requestsAvailable?this.n(s.requests):this.t('common.empty');$('logistics-train-count').textContent=frame.available?this.n(s.trains):this.t('common.empty');$('logistics-moving').textContent=this.t('logistics.moving',{value:this.n(s.moving)});$('logistics-attention').textContent=frame.fresh?this.n(s.issues):this.t('common.empty');$('logistics-attention').className=s.issues?'warn':'good';
  const body=$('logistics-networks');body.replaceChildren();for(const n of frame.networks){const load=node('span',undefined,'logistics-load'),meter=node('progress');meter.max=1;meter.value=n.load||0;meter.setAttribute('aria-label',this.t('logistics.load'));load.append(meter,node('span',n.load===null?this.t('common.empty'):this.t('energy.percent',{value:this.n(n.load*100)})));const tr=this.row(body,[this.network(n),robotValue(n.logistic_available,n.logistic_total),robotValue(n.construction_available,n.construction_total),this.compact(n.item_count),load]);tr.dataset.network=n.id;tr.setAttribute('aria-selected',String(String(n.id)===frame.options.network));this.clickable(tr,()=>this.configure({network:String(n.id)}));}
  if(!frame.networks.length)this.empty(body,5,frame.available?'logistics.noNetworks':'logistics.noData');
  $('logistics-network-count').textContent=this.t('logistics.countNetworks',{value:this.n(frame.networks.length)});
  const requests=$('logistics-requests');requests.replaceChildren();for(const r of frame.requests){const tr=this.row(requests,[this.resource(r),this.compact(r.requested),this.compact(r.present),this.compact(r.incoming),this.compact(r.missing),this.waiting(r.waitingTicks)]);tr.dataset.missing=String(r.missing>0);tr.dataset.request=r.id;tr.cells[4].className=r.missing?'bad':'good';tr.cells[3].className='cyan';tr.cells[5].className='warn';tr.title=this.t('logistics.containers',{value:this.n(r.containers)});}
  if(!frame.requests.length)this.empty(requests,6,!frame.requestsAvailable?'logistics.requestsUnavailable':frame.requestsCount?'logistics.noMatches':'logistics.noRequests');
  $('logistics-request-count').textContent=this.t('logistics.shown',{shown:this.n(frame.requests.length),total:this.n(frame.requestsCount)});$('logistics-request-count').title=this.t('logistics.requestCoverage',{groups:this.n(frame.groupsTotal),skipped:this.n(frame.unsupportedFilters)});
  const scopeLabel=$('logistics-request-scope');scopeLabel.textContent=this.t(frame.requestsAvailable&&!frame.requestFresh?'logistics.oldRequestSnapshot':'logistics.allScope');scopeLabel.className=frame.requestsAvailable&&!frame.requestFresh?'warn':'';scopeLabel.title=this.t('logistics.requestAge',{value:this.n(frame.requestAgeTicks/60,true)});
  const trains=$('logistics-trains');trains.replaceChildren();for(const t of frame.trains){const cargo=(t.cargo||[]).slice(0,2).map(c=>this.t('logistics.cargo',{name:this.name(c.name),count:this.compact(c.count)})).join(', ');const tr=this.row(trains,[this.t('logistics.trainName',{id:t.id}),t.station||t.destination||this.t('common.empty'),cargo||this.t('logistics.emptyCargo'),this.state(t)]);tr.dataset.train=t.id;tr.setAttribute('aria-selected',String(t.id===frame.selectedTrain?.id));tr.cells[3].className=t.problem?'warn':'good';this.clickable(tr,()=>this.configure({train:t.id}));}
  if(!frame.trains.length)this.empty(trains,4,frame.available?'logistics.noTrains':'logistics.noData');
  this.map(frame);this.trainDetail(frame.selectedTrain);
  for(const b of document.querySelectorAll('[data-logistics-minutes]'))b.setAttribute('aria-pressed',String(Number(b.dataset.logisticsMinutes)===frame.minutes));
  const points=k=>frame.history.map(p=>({tick:p.tick,value:p[k]}));lineChart($('logistics-history'),{label:this.t('logistics.historyTitle'),formatY:v=>this.compact(v),formatX:tick=>tick===frame.tick?this.t('overview.now'):this.t('energy.axisMinutes',{value:this.n((tick-frame.tick)/3600)}),xMin:frame.tick-frame.minutes*3600,xMax:frame.tick,series:[{points:points('busy'),color:'var(--cyan)'},{points:points('construction'),color:'var(--green)'}]});
  const issues=$('logistics-issues');issues.replaceChildren();for(const issue of frame.issues){const type=this.t('logistics.issue.'+issue.kind);let object,description;
   if(issue.kind==='request'){object=this.name(issue.name)+(issue.quality!=='normal'?' / '+this.t('quality.'+issue.quality):'');description=this.t('logistics.requestIssue',{value:this.compact(issue.missing)});}
   else if(issue.kind==='robots'){object=this.t('logistics.networkName',{id:issue.network});description=this.t('logistics.robotsIssue',{available:this.n(issue.available),total:this.n(issue.total)});}
   else{const b=node('button',this.t('logistics.trainName',{id:issue.train}),'logistics-issue-link');b.type='button';b.addEventListener('click',()=>this.configure({train:issue.train}));object=b;description=this.t('logistics.train.'+issue.state);}
   const tr=this.row(issues,[type,object,description,this.waiting(issue.waitingTicks)]);tr.cells[0].className=issue.kind==='train'&&['no_path','path_lost'].includes(issue.state)?'bad':'warn';}
  if(!frame.issues.length)this.empty(issues,4,!frame.fresh?'logistics.noFreshIssues':'logistics.noIssues');
  $('logistics-issue-count').textContent=this.t('logistics.countIssues',{value:this.n(s.issues)});
 }
 map(frame){const host=$('logistics-map');host.replaceChildren();const trains=frame.trains.filter(t=>Number.isFinite(t.position?.x)&&Number.isFinite(t.position?.y));if(!trains.length){host.append(node('div',this.t('logistics.noPositions'),'chart-wait'));return;}
  const chart=svg('svg',{viewBox:'0 0 500 205',role:'group','aria-label':this.t('logistics.positions')});const xs=trains.map(t=>t.position.x),ys=trains.map(t=>t.position.y),minX=Math.min(...xs)-32,maxX=Math.max(...xs)+32,minY=Math.min(...ys)-32,maxY=Math.max(...ys)+32;const scale=Math.min(440/(maxX-minX),155/(maxY-minY)),x=v=>250+(v-(minX+maxX)/2)*scale,y=v=>98+(v-(minY+maxY)/2)*scale;
  for(let i=0;i<=8;i++)chart.append(svg('line',{x1:15+i*58,y1:12,x2:15+i*58,y2:180,class:'map-grid'}));for(let i=0;i<=4;i++)chart.append(svg('line',{x1:15,y1:12+i*42,x2:480,y2:12+i*42,class:'map-grid'}));
  for(const t of trains){const g=svg('g',{class:'map-train',role:'button',tabindex:'0','aria-label':this.t('logistics.selectTrain',{id:t.id}),'aria-pressed':String(t.id===frame.selectedTrain?.id),'data-problem':t.problem,transform:`translate(${x(t.position.x)} ${y(t.position.y)})`});g.append(svg('circle',{r:6}));const text=svg('text',{x:9,y:-8});text.textContent=this.t('logistics.trainName',{id:t.id});g.append(text);const title=svg('title');title.textContent=this.t('logistics.position',{x:this.n(t.position.x),y:this.n(t.position.y)});g.append(title);g.addEventListener('click',()=>this.configure({train:t.id}));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.configure({train:t.id});}});chart.append(g);}
  const axis=svg('text',{x:15,y:199,class:'map-label'});axis.textContent=this.t('logistics.mapExtent',{x1:this.n(minX),y1:this.n(minY),x2:this.n(maxX),y2:this.n(maxY)});chart.append(axis);host.append(chart);
 }
 trainDetail(train){const host=$('logistics-train-detail');host.replaceChildren();if(!train){host.append(node('span',this.t('logistics.selectTrainEmpty'),'muted'));return;}const head=node('div',this.t('logistics.trainDetail',{id:train.id,state:this.state(train),speed:this.n(train.kmh,true)})),route=(train.route||[]).join(' → ');host.append(head,node('div',route||this.t('logistics.noRoute'),'muted'));host.title=[head.textContent,route,this.t('logistics.position',{x:this.n(train.position?.x),y:this.n(train.position?.y)}),this.t('logistics.noEta')].join('\n');}
}
