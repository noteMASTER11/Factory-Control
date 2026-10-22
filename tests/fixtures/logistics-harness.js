import {startup} from './startup.js';startup.skip();
// Isolated UI fixture. No native API or game calls are made from this page.
import {Logistics} from './logistics.js';
import {Localization} from './i18n.js';
import {logisticsModel,logisticsSample,LogisticsObservations} from './logistics-model.js';
import {FrameClock} from './frame-clock.js';
import {PixiCrtOverlay} from './vfx/pixi-overlay.js';
const i18n=await Localization.load();i18n.apply();
for(const main of document.querySelectorAll('main'))main.hidden=main.id!=='logistics-screen';
document.querySelector('#link-text').textContent='ПРОВЕРОЧНЫЕ ДАННЫЕ';document.querySelector('#link-state').dataset.state='ready';
for(const b of document.querySelectorAll('.screen-nav button')){b.removeAttribute('aria-current');b.disabled=false;}document.querySelector('#nav-logistics').setAttribute('aria-current','page');const option=document.createElement('option');option.textContent='Русский';document.querySelector('#language').append(option);document.querySelector('#vfx-status').textContent=i18n.text('vfx.on');
const scope={surface:'nauvis',force:'player',id:JSON.stringify(['nauvis','player'])},tick=54000;
const names=['iron-ore','copper-ore','stone','coal','automation-science-pack','iron-plate','copper-plate','steel-plate','plastic-bar','logistic-science-pack','electronic-circuit','advanced-circuit','processing-unit','battery','engine-unit','electric-engine-unit','low-density-structure','rocket-fuel','uranium-235','uranium-238'];
const networks=Array.from({length:14},(_,i)=>({...scope,id:i+1,name:i===0?'Центр':undefined,logistic_total:100+i*10,logistic_available:20+i,construction_total:60+i*5,construction_available:40+i,item_count:1000+i*2300}));
const requests=names.map((name,i)=>({...scope,name,quality:i===19?'rare':'normal',requested:1000+i*100,present:500,incoming:100,missing:i===18?0:400+i*100,containers:3+i}));
const trains=Array.from({length:14},(_,i)=>({...scope,id:i+1,state:i===0?'no_path':i%3===0?'wait_signal':'on_the_path',manual:false,speed:i===0||i%3===0?0:.3,position:{x:i%4*170+(i%2)*50,y:Math.floor(i/4)*110},station:i%3===0?'База · разгрузка':null,destination:i%2?'Плавильня':'Рудник',cargo:[{kind:'item',name:i%2?'iron-plate':'iron-ore',quality:'normal',count:4000}],route:['Рудник','Плавильня','База · разгрузка']}));
const topic={tick,written_at:new Date().toISOString(),payload:{coverage:{discovery_complete:true},data:{networks,requests,trains,requests_tick:tick,request_groups_total:requests.length,requesters_available:true}}};
const observations=new LogisticsObservations();observations.accept({...topic,tick:tick-600});observations.accept(topic);
const history=Array.from({length:90},(_,i)=>logisticsSample({...topic,tick:tick-54000+i*600,payload:{data:{networks:networks.map(n=>({...n,logistic_available:Math.floor(n.logistic_available*(1+Math.sin(i/6)*.3))}))}}}));
const options={network:'all',filter:'missing',search:'',minutes:15};
const renderer=new Logistics(i18n,patch=>{Object.assign(options,patch);render();});
function render(){const model=logisticsModel({logistics:topic},scope,options,history,observations);model.scopes=[scope];renderer.render(model,{status:{topics:{logistics:topic}}},()=>1);window.fixtureModel=model;}
render();window.fixtureOptions=options;
const profile=await(await fetch('./vfx/crt-profile.json')).json();const effect=await PixiCrtOverlay.create(document.querySelector('.console'),profile,new FrameClock(30));effect.setEnabled(true);effect.nextGlitch=performance.now()+3600000;
window.fixtureReady=true;
