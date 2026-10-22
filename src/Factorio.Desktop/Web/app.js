import {startup,localeReady} from './startup.js';
import { CrtOverlay } from './vfx/crt-overlay.js';
import { Overview } from './overview.js';
import { Energy } from './energy.js';
import { Production } from './production.js';
import { Logistics } from './logistics.js';
import { Research } from './research.js';
import {Resources} from './resources.js';
import {Forecasts} from './forecasts.js';
import {TerminalSound} from './sound.js';
import {Settings} from './settings.js';
import {hoverSelector} from './interactive.js';
import {Damage} from './damage.js';
import {CombatAlert} from './combat-alert.js';
import { TabTransition } from './vfx/tab-transition.js';

const $ = id => document.getElementById(id);
const i18n = await localeReady;
const t = (key, values) => i18n.text(key, values);
const number = (value, decimal = false) => i18n.number(value, decimal);
const empty = () => t('common.empty');
const topicsList = ['status','power','production','machines','logistics','research','resources','combat'];
const pending = new Map();
const crtProfile = await (await fetch('./vfx/crt-profile.json')).json();
startup.mark('profile');
export const visualClock = startup.clock;
let overlay;
export const sound=new TerminalSound(i18n,{startup:true,hoverTarget:event=>overlay?.enabled&&overlay.targetAt?overlay.targetAt(event,hoverSelector):event.target});
startup.bindSound(sound);
export const tabTransition=new TabTransition(i18n,visualClock,{ascii:crtProfile.tabAscii,source:()=>overlay?.enabled?overlay.source:null,onComplete:()=>sound.screenShow()});
if(new URLSearchParams(location.search).get('renderer')!=='svg'){
  try{const {PixiCrtOverlay}=await import('./vfx/pixi-overlay.js');overlay=await PixiCrtOverlay.create(document.querySelector('.console'),crtProfile,visualClock);}
  catch(error){console.error('Pixi probe unavailable',error);}
  overlay??={enabled:false,setEnabled(){this.enabled=false;}};
}else overlay=new CrtOverlay(document.querySelector('.console'),crtProfile,visualClock);
startup.mark('renderer',window.pixiProbe||overlay instanceof CrtOverlay?'ready':'degraded');
let snapshot = null, selectedPid = null, attachedPid = null, busy = false, failed = false, timer;
let windowState = { fullscreen:false };
let lastReceived = 0;
let screen='sessions';
let restored=false;
let frame=null,renderedView=null,renderedRevision=-1,initialRequest=true,nativeError=null;
const worker=new Worker(new URL('./telemetry-worker.js',import.meta.url),{type:'module'});
const configure=(view,options)=>worker.postMessage({type:'configure',view,options});
const overview=new Overview(i18n,scope=>configure('overview',{scope}));
const energy=new Energy(i18n,options=>configure('energy',options));
const production=new Production(i18n,options=>configure('production',options));
const logistics=new Logistics(i18n,options=>configure('logistics',options));
const research=new Research(i18n,options=>configure('research',options));
const resources=new Resources(i18n,options=>configure('resources',options));
const forecasts=new Forecasts(i18n,options=>configure('forecasts',options));
const damage=new Damage(i18n,options=>configure('damage',options),()=>showScreen('overview'));

const combatAlert=new CombatAlert(i18n,visualClock,episode=>{configure('damage',{episode});showScreen('damage');},{sound});
let appliedScale,appliedEffects;
export const settings=new Settings(i18n,value=>{sound.setChannels(value.channels);tabTransition.effects=value.effects;setCrtEnabled(value.crt);visualClock.request('ui.settings',()=>{const signature=JSON.stringify(value.effects);if(appliedEffects!==signature){overlay.applyEffects?.(value.effects);appliedEffects=signature;}if(appliedScale!==value.scale){appliedScale=value.scale;post({type:'settings.zoom',scale:value.scale});}});},{rgbDefault:crtProfile.pixi.rgbSplitPixels});
export const telemetryState={statistics:{},renders:{sessions:0,overview:0,energy:0,production:0,logistics:0,research:0,resources:0,forecasts:0,damage:0},describe(){return {...this.statistics,renders:{...this.renders},visible:screen};}};
worker.onerror=()=>{startup.mark('worker','degraded');failed=true;render();};
worker.onmessage=({data})=>{
  if(data.type==='error'){startup.mark('worker','degraded');failed=true;render();return;}
  startup.mark('worker');
  snapshot=data.connection;frame=data;telemetryState.statistics=data.statistics;
  const processes=snapshot.sessions.processes||[];
  if(!processes.some(p=>p.pid===selectedPid))selectedPid=processes.find(p=>p.telemetry_associated)?.pid??processes[0]?.pid??null;
  if(!restored&&snapshot.status.telemetry_ready){
    restored=true;
    try{const remembered=Number(localStorage.getItem('factory-control.process')),process=processes.find(p=>p.pid===remembered);
      if(process&&available(process)){attachedPid=selectedPid=remembered;showScreen('overview');}
    }catch{}
  }
  render();
};
const write = (id, text) => { if($(id).textContent!==text)$(id).textContent = text; };
const post = message => window.chrome?.webview?.postMessage(message);
i18n.apply();
if(window.pixiProbe)document.querySelector('.footer-build').textContent=t('vfx.pixiExperimental');
for (const locale of i18n.catalog.locales) {
  const option = document.createElement('option'); option.value = locale.id; option.textContent = locale.name;
  $('language').append(option);
}
$('language').value = i18n.locale;
$('language').addEventListener('change', () => i18n.select($('language').value));

function requestSnapshot() {
  return new Promise((resolve, reject) => {
    if (!window.chrome?.webview) { reject(new Error('native_host_unavailable')); return; }
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('timeout')); }, 10000);
    pending.set(id, {resolve, reject, timeout});
    post({type:'api.snapshot', id,reset:initialRequest});
  });
}
window.chrome?.webview?.addEventListener('message', ({data}) => {
  if (data.type === 'api.reply') {
    const request = pending.get(data.id);
    if (!request) return;
    clearTimeout(request.timeout); pending.delete(data.id);
    data.error ? request.reject(new Error(data.error)) : request.resolve(data.data);
  }
  if (data.type === 'window.state') {
    windowState = data.data;
    const label = t(windowState.fullscreen ? 'app.fullscreenExit' : 'app.fullscreenEnter');
    $('fullscreen').setAttribute('aria-pressed', String(windowState.fullscreen));
    $('fullscreen').setAttribute('aria-label', label); $('fullscreen').title = label;
    write('monitor-size', t('app.monitorSize', {width:windowState.width, height:windowState.height, mode:t(windowState.fullscreen?'app.fullscreenMode':'app.windowMode')}));
  }
  if (data.type === 'window.error') {nativeError=data.error;render();}
});

function age(topic) {
  if (!topic) return null;
  return Math.max(0,(Date.now()-Date.parse(topic.written_at))/1000);
}
function stale(topic) { return !topic || topic.stale || age(topic) > Math.max(15, topic.topic === 'resources' ? 45 : 15); }
function available(process) { return process?.telemetry_associated && !failed && snapshot?.status.connected && !stale(snapshot.status.topics?.status); }
function selected() { return snapshot?.sessions.processes.find(p => p.pid === selectedPid); }
function select(pid) { selectedPid = pid; render(); }

function renderSessions() {
  const rows = snapshot?.sessions.processes || [];
  const body = $('sessions-body');
  // Keep focus on the same row while the process list is refreshed.
  const focusPid = document.activeElement?.closest?.('[data-pid]')?.dataset.pid;
  body.replaceChildren();
  rows.forEach((p, index) => {
    const tr = document.createElement('tr');
    tr.dataset.pid = p.pid; tr.dataset.associated = String(!!p.telemetry_associated);
    tr.tabIndex = p.pid === selectedPid ? 0 : -1;
    tr.setAttribute('aria-selected', String(p.pid === selectedPid));
    const source = p.telemetry_associated && snapshot.sessions.source_kind === 'validation_copy' ? t('sessions.copyHeadless') : p.window || t('sessions.noWindowTitle');
    const file = p.executable?.split(/[\\/]/).pop() || t('sessions.fileUnavailable');
    const state = t(p.telemetry_associated ? (available(p) ? 'sessions.ready' : snapshot.status.topics?.status ? 'sessions.stale' : 'sessions.waitingCollector') : 'sessions.noCollector');
    [String(index+1), String(p.pid), file, source, state].forEach((value, i) => {
      const td = document.createElement('td'); td.textContent = value; td.title = i === 2 ? p.executable || value : value; tr.append(td);
    });
    tr.addEventListener('click', () => select(p.pid));
    tr.addEventListener('keydown', e => {
      if (['ArrowDown','ArrowUp'].includes(e.key)) {
        e.preventDefault(); select(rows[(index+(e.key==='ArrowDown'?1:rows.length-1))%rows.length].pid);
        body.querySelector(`[data-pid="${selectedPid}"]`)?.focus();
      }
      if (e.key === ' ') { e.preventDefault(); select(p.pid); }
      if (e.key === 'Enter') { e.preventDefault(); connect(); }
    });
    body.append(tr);
  });
  if (!rows.length) {
    const tr = body.insertRow(), td = tr.insertCell(); td.colSpan = 5; td.className = 'empty';
    td.textContent = t(failed ? 'sessions.gatewayUnavailable' : 'sessions.noProcesses');
  }
  if (focusPid) body.querySelector(`[data-pid="${focusPid}"]`)?.focus();
  write('process-count', t('connection.processCount', {processes:number(rows.length),sources:number(rows.filter(p=>available(p)).length)}));
}

function renderTopics() {
  const topics = snapshot?.status.topics || {};
  const show = !!selected()?.telemetry_associated;
  let ready = 0;
  $('topics-body').replaceChildren();
  for (const key of topicsList) {
    const topic = show ? topics[key] : null;
    const old = failed || stale(topic);
    if (topic && !old) ready++;
    const tr = document.createElement('tr'); tr.dataset.stale = String(old);
    const data=topic?.payload.data;
    const summary = !topic ? empty() : key === 'machines' && data.collection_mode==='rolling' ? t('topics.rollingCoverage',{sampled:number(data.sampled_entities),total:number(data.expected_entities)}) : key === 'production' ? t('topics.productionRows',{count:number(data.rows_count)}) : key === 'power' ? t('topics.powerNetworks',{count:number(data.networks_count)}) : t(topic.payload.coverage?.discovery_complete ? 'topics.snapshotReady' : 'topics.indexing');
    if(key==='machines' && data?.collection_mode==='rolling')tr.title=t('topics.rollingWindow',{seconds:number(data.sample_window_ticks/60,true),complete:t(data.inventory_complete?'topics.coverageComplete':'topics.coveragePartial')});
    [t(`topics.${key}`), summary, topic ? t(old?'topics.staleAge':'topics.age',{age:number(age(topic),true)}) : empty()].forEach(text => {
      const td = document.createElement('td'); td.textContent = text; tr.append(td);
    });
    $('topics-body').append(tr);
  }
  write('topic-count', t('topics.count',{ready:number(ready),total:number(topicsList.length)}));
  const coverage = show ? topics.status?.payload.coverage : null;
  write('entity-count', number(coverage?.indexed_entities));
  write('chunk-count', number(coverage?.charted_chunks_scanned));
  write('call-count', show ? number(snapshot.status.telemetry_reads??snapshot.status.mcp_calls) : empty());
  const machineData=show?topics.machines?.payload.data:null;
  $('inventory-window').hidden=!machineData;
  if(machineData)write('inventory-window',machineData.collection_mode==='rolling'?
    t('topics.measurementWindow',{seconds:number(machineData.sample_window_ticks/60,true)}):
    t('topics.legacyWindow',{seconds:number((machineData.sample_end_tick-machineData.sample_start_tick)/60,true)}));
}

function render() { visualClock.request('ui.render',renderNow); }
function renderConnection() {
  const p = selected(), status = snapshot?.status, topic = status?.topics?.status;
  renderSessions(); renderTopics();
  const show = !!p?.telemetry_associated;
  write('selected-pid', p ? t('details.pid',{pid:p.pid}) : empty());
  write('detail-exe', p?.executable || empty()); $('detail-exe').title = p?.executable || '';
  write('detail-window', p ? p.window || t('details.headless') : empty());
  write('source-label', t(show ? status.source_kind === 'validation_copy' ? 'details.validationCopy' : 'details.gameProfile' : 'details.unassociated'));
  $('source-label').style.color = show && status.source_kind === 'validation_copy' ? 'var(--amber)' : '';
  write('detail-version', show && topic ? t('details.versions',{game:topic.payload.data.game_version,mod:topic.payload.data.mod_version}) : empty());
  write('detail-tick', show ? number(topic?.tick) : empty());
  write('detail-age', show && topic ? t(stale(topic)?'details.staleAgeValue':'details.ageValue',{age:number(age(topic),true)}) : empty());
  const coverage = topic?.payload.coverage;
  write('detail-coverage', show && coverage ? coverage.discovery_complete ? t('details.discoveryComplete') : t('details.discoveryInProgress',{chunks:number(coverage.charted_chunks_scanned)}) : empty());
  const note = t(!p ? 'details.selectProcess' : !show ? 'details.noCollector' : failed ? 'details.gatewayUnavailable' : !topic ? 'details.loadCollector' : !available(p) ? 'details.noFreshData' : status.source_kind === 'validation_copy' ? 'details.copyNotice' : 'details.gameNotice');
  write('selection-note', note); $('selection-note').dataset.kind = available(p) && status.source_kind !== 'validation_copy' ? 'good' : 'notice';
  $('connect').disabled = !available(p);
  write('connect-label', t(attachedPid === selectedPid && attachedPid !== null ? 'connection.disconnect' : 'connection.connect'));
  write('diagnostic-message', t(failed ? 'diagnostics.offline' : !show ? 'diagnostics.selectProcess' : stale(topic) ? 'diagnostics.stale' : 'diagnostics.cache'));
  write('connection-hint-title', attachedPid ? t('connection.attached',{pid:attachedPid}) : t('connection.localGateway'));
  write('connection-hint', t(attachedPid ? 'connection.attachedHint' : 'connection.cacheHint'));
  $('refresh').disabled=busy;
  write('scan-time',lastReceived?t('sessions.scanTime',{time:i18n.clock.format(new Date(lastReceived))}):empty());
}

function showScreen(key){
  if(key!=='sessions'&&!attachedPid)return;
  screen=key;worker.postMessage({type:'select',view:key});render();
  if(!startup.active)visualClock.request('ui.tab-open',()=>tabTransition.start($(key==='sessions'?'session-screen':key+'-screen'),t(key==='sessions'?'overview.sessions':key+'.tab')));
}
function renderNow(){
  if(attachedPid&&!snapshot?.sessions.processes.some(p=>p.pid===attachedPid&&p.telemetry_associated)){attachedPid=null;showScreen('sessions');}
  const status=snapshot?.status;
  document.querySelector('.console').dataset.view=screen;
  if(!startup.active)combatAlert.accept(attachedPid&&frame?.alarm?frame.alarm:{session:status?.session_id,available:false,active:false,episodes:[]});
  const state=failed?'offline':attachedPid?'live':status?.connected?'ready':'idle';
  $('link-state').dataset.state=state;
  write('link-text',t(state==='offline'?'connection.gatewayOffline':state==='live'?status.source_kind==='validation_copy'?'connection.liveCopy':'connection.liveGame':state==='ready'?'connection.ready':'connection.waitingMcp'));
  for(const key of ['overview','energy','production','logistics','research','resources','forecasts','damage','sessions']){
    const button=$('nav-'+key),root=$(key==='sessions'?'session-screen':key+'-screen');
    if(root.hidden!==(screen!==key))root.hidden=screen!==key;
    if(!button)continue;
    button.disabled=key!=='sessions'&&!attachedPid;
    if(screen===key){if(button.getAttribute('aria-current')!=='page')button.setAttribute('aria-current','page');}else button.removeAttribute('aria-current');
  }
  if(screen==='sessions'){renderConnection();telemetryState.renders.sessions++;}
  else if(frame?.view===screen&&(renderedView!==screen||renderedRevision!==frame.statistics.models[screen])){
    if(screen==='overview')overview.render(frame.model,snapshot,age);
    if(screen==='energy')energy.render(frame.model,snapshot,age);
    if(screen==='production')production.render(frame.model,snapshot,age);
    if(screen==='logistics')logistics.render(frame.model,snapshot,age);
    if(screen==='research')research.render(frame.model,snapshot,age);
    if(screen==='resources')resources.render(frame.model,snapshot,age);
    if(screen==='forecasts')forecasts.render(frame.model,snapshot,age);
    if(screen==='damage')damage.render(frame.model,snapshot,age);
    renderedView=screen;renderedRevision=frame.statistics.models[screen];telemetryState.renders[screen]++;
  }
}

async function refresh() {
  clearTimeout(timer);
  if (busy) return;
  busy = true;
  try {
    const packet=await requestSnapshot();startup.mark('gateway');lastReceived=Date.now();failed=false;initialRequest=false;
    worker.postMessage({type:'ingest',packet});
  } catch { startup.mark('gateway','degraded');failed = true;worker.postMessage({type:'clock'}); }
  finally { busy=false;render();timer=setTimeout(refresh,document.hidden?10000:3000); }
}
function connect(){
  if(!available(selected()))return;
  attachedPid=attachedPid===selectedPid?null:selectedPid;
  try{if(attachedPid)localStorage.setItem('factory-control.process',String(attachedPid));else localStorage.removeItem('factory-control.process');}catch{}
  showScreen(attachedPid?'overview':'sessions');
}
for(const key of ['overview','energy','production','logistics','research','resources','forecasts','sessions'])$('nav-'+key).addEventListener('click',()=>showScreen(key));
$('fullscreen').addEventListener('click', () => post({type:'window.toggleFullscreen'}));
$('refresh').addEventListener('click', refresh);
$('connect').addEventListener('click', connect);
function setCrtEnabled(enabled) {
  if(overlay.enabled!==!!enabled)overlay.setEnabled(enabled);enabled=overlay.enabled; $('vfx-toggle').setAttribute('aria-pressed', String(enabled));
  write('vfx-status', t(enabled ? 'vfx.on' : 'vfx.off'));
  $('vfx-toggle').title = t(enabled ? 'vfx.disable' : 'vfx.enable');
  $('vfx-toggle').setAttribute('aria-label',t(enabled ? 'vfx.disable' : 'vfx.enable'));
}
document.addEventListener('keydown', e => {
  if (e.key === 'F11') { e.preventDefault(); if (!e.repeat) post({type:'window.toggleFullscreen'}); }
  if (e.key === 'Escape' && windowState.fullscreen) { e.preventDefault(); post({type:'window.exitFullscreen'}); }
  if (e.key === 'F1') { e.preventDefault(); showScreen('overview'); }
  if (e.key === 'F2') { e.preventDefault(); showScreen('energy'); }
  if (e.key === 'F3') { e.preventDefault(); showScreen('production'); }
  if (e.key === 'F4') { e.preventDefault(); showScreen('logistics'); }
  if (e.key === 'F6') { e.preventDefault(); showScreen('research'); }
  if (e.key === 'F7') { e.preventDefault(); showScreen('resources'); }
  if (e.key === 'F8') { e.preventDefault(); showScreen('forecasts'); }
  if (e.key === 'F9') { e.preventDefault(); showScreen('sessions'); }
  if (e.key === 'F5') { e.preventDefault(); refresh(); }
  if (e.key === 'Enter' && !e.defaultPrevented && !e.target.closest('button,select,input,summary,[data-pid],[aria-modal=true]')) { e.preventDefault(); connect(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
post({type:'settings.locale',locale:i18n.locale});
write('frame-rate',t('footer.frameLimit',{fps:number(crtProfile.maxFramesPerSecond)}));
post({type:'window.state'}); render(); settings.apply(settings.value); refresh();
startup.ready(()=>overlay?.enabled?overlay.source:null,()=>render());
