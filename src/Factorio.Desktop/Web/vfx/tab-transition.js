import {AsciiReveal} from './ascii-reveal.js';
export function bootPhase(elapsed,reduced=false,asciiDuration=350,bootScale=1){
 const boot=560*bootScale,signal=boot+180;
 if(reduced)return {stage:elapsed<160*bootScale?'boot':'done',lines:6,progress:1};
 if(elapsed<boot)return {stage:'boot',lines:Math.min(6,1+Math.floor(elapsed/(85*bootScale))),progress:0};
 if(elapsed<signal)return {stage:'signal',lines:6,progress:(elapsed-boot)/180};
 if(elapsed<signal+asciiDuration)return {stage:'ascii',lines:6,progress:(elapsed-signal)/asciiDuration};
 return {stage:'done',lines:6,progress:1};
}
export class TabTransition {
 constructor(i18n,clock,options){this.clock=clock;this.i18n=i18n;this.options=options;this.id='vfx.tab-boot';this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.root=document.createElement('div');this.root.className='tab-boot';this.root.hidden=true;this.root.setAttribute('aria-hidden','true');this.log=document.createElement('div');this.log.className='tab-boot-log';this.flash=document.createElement('div');this.flash.className='tab-boot-signal';this.ascii=new AsciiReveal(options.ascii);this.root.append(this.ascii.canvas,this.log,this.flash);document.body.append(this.root);this.active=null;this.count=0;this.resize=()=>{if(this.active)this.cancel();};window.addEventListener('resize',this.resize);}
 bounds(){if(!this.active)return;const b=this.active.getBoundingClientRect();Object.assign(this.root.style,{left:b.x+'px',top:b.y+'px',width:b.width+'px',height:b.height+'px'});}
 start(pane,label){this.cancel();this.active=pane;this.started=performance.now();this.count++;this.lastLines=0;this.captured=false;this.root.hidden=false;this.root.dataset.stage='boot';this.root.style.opacity='1';const style=getComputedStyle(pane);this.root.style.setProperty('--boot-bg',style.getPropertyValue('--bg'));this.root.style.setProperty('--boot-ink',style.getPropertyValue('--cyan'));this.flash.style.opacity='0';this.log.replaceChildren();this.lines=Array.from({length:6},(_,i)=>this.i18n.text('boot.line'+i,{view:label}));this.bounds();this.tick();}
 tick(){if(!this.active)return;const elapsed=performance.now()-this.started,state=bootPhase(elapsed,this.motion.matches,this.options.ascii.durationMs*(this.effects?.ascii??100)/100,(this.effects?.boot??100)/100);this.root.dataset.stage=state.stage;
  if(state.stage==='done'){this.cancel();this.options.onComplete?.();return;}
  if(!this.motion.matches&&!this.captured&&elapsed>=180){this.ascii.capture(this.active,this.options.source?.());this.captured=true;}
  if(state.stage==='boot'){while(this.lastLines<state.lines){const line=document.createElement('div');line.textContent=this.lines[this.lastLines++];this.log.append(line);}this.log.scrollTop=this.log.scrollHeight;}
  else if(state.stage==='signal'){const p=state.progress,ease=1-Math.pow(1-p,3);this.log.style.visibility='hidden';this.flash.style.opacity=String(Math.min(1,(1-p)*.8*(this.effects?.phosphor??100)/100));this.flash.style.transform=`scale(${Math.min(1,p*5)},${Math.max(.006,ease)})`;this.active.style.clipPath=`inset(${(1-ease)*50}% 0)`;}
  else{this.log.style.visibility='hidden';this.flash.style.opacity='0';this.active.style.removeProperty('clip-path');this.ascii.draw(state.progress);}
  this.clock.request(this.id,()=>this.tick());
 }
 cancel(){this.clock.cancel(this.id);if(this.active)this.active.style.removeProperty('clip-path');this.active=null;this.root.hidden=true;this.log.style.visibility='';this.ascii?.release();}
 describe(){return {active:!!this.active,stage:this.root.dataset.stage,count:this.count,elapsed:performance.now()-(this.started||performance.now()),asciiSource:this.ascii.sourceMode,asciiCaptures:this.ascii.captures,sweep:this.ascii.sweep};}
}
