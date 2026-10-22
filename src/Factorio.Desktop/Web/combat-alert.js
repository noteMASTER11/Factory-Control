import {AlarmState} from './alarm-state.js';
const $=id=>document.getElementById(id),write=(id,text)=>{if($(id).textContent!==text)$(id).textContent=text;};
export class CombatAlert {
 constructor(i18n,clock,openDamage,{sound,now=()=>performance.now()}={}){this.sound=sound;this.now=now;this.i18n=i18n;this.clock=clock;this.openDamage=openDamage;this.state=new AlarmState();this.reduced=matchMedia('(prefers-reduced-motion: reduce)');this.wasOpen=false;
  $('combat-indicator').addEventListener('click',()=>{const v=this.state.view(this.now());if(v.latest)openDamage(v.latest.id);});
  $('combat-assess').addEventListener('click',()=>{const id=this.state.view(this.now()).episode?.id;this.state.dismiss();this.draw(false);openDamage(id);});
  $('combat-dismiss').addEventListener('click',()=>{this.state.dismiss();this.draw();});
  $('combat-normal').addEventListener('click',()=>{this.state.normal();this.sound?.stopAlarm();this.draw();});
  $('combat-modal').addEventListener('keydown',e=>{if(e.key==='Tab'){const buttons=[...$('combat-modal').querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 }
 accept(alarm){this.state.accept(alarm,this.now());if(!alarm.active||!alarm.available||!alarm.fresh){this.sound?.stopAlarm();this.alarmSoundActive=false;}this.clock.request('combat.alert',()=>this.draw());}
 draw(restoreFocus=true){const now=this.now(),v=this.state.view(now),confirmed=!!(v.active&&v.available&&v.fresh),t=(k,p)=>this.i18n.text(k,p),button=$('combat-indicator'),root=document.querySelector('.console');root.classList.toggle('threat-active',!!v.modeActive);button.hidden=!v.latest;button.dataset.active=String(!!v.active);const lit=confirmed&&(this.reduced.matches||Math.floor(now/650)%2===0);if(button.dataset.lit!==String(lit))button.dataset.lit=String(lit);write('combat-indicator-label',t(v.active?'combat.attack':'combat.damage'));button.title=t(v.manualNormal?'combat.indicatorMuted':v.active&&!v.fresh?'combat.signalStale':v.active?'combat.indicatorActive':'combat.indicatorHistory');button.setAttribute('aria-label',button.title);
  if(this.alarmSoundActive&&(!confirmed||!v.modeActive)){this.sound?.stopAlarm();this.alarmSoundActive=false;}
  const modal=$('combat-modal');if(v.open){const key=JSON.stringify([this.state.session,v.episode.id]);if(key!==this.soundedEpisode){this.soundedEpisode=key;if(confirmed&&v.modeActive&&v.episode.active){this.alarmSoundActive=true;this.sound?.alarm(key);}}}if(v.open!==this.wasOpen){if(v.open){this.previousFocus=document.activeElement;modal.hidden=false;$('combat-assess').focus({preventScroll:true});}else{modal.hidden=true;if(restoreFocus&&modal.contains(document.activeElement)&&this.previousFocus?.isConnected)this.previousFocus.focus({preventScroll:true});}this.wasOpen=v.open;}
  if(v.open){write('combat-modal-title',t(v.episode.active?'combat.modalTitle':'combat.modalEnded'));write('combat-modal-location',t('combat.location',v.episode));write('combat-modal-losses',t('combat.destroyedCount',{value:this.i18n.number(v.episode.destroyed||0)}));write('combat-countdown',t('combat.autoClose',{seconds:this.i18n.number(v.remaining)}));}
  if(v.active||v.open||v.pendingNotification)this.clock.request('combat.alert',()=>this.draw());
 }
}
