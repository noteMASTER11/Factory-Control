// Timer uses real monotonic time; combat duration itself uses game ticks in the collector.
export class AlarmState {
 constructor(){this.manualNormal=false;this.session=null;this.initialized=false;this.seen=new Set();this.deadline=0;this.nextModalAt=0;this.pending=null;this.episode=null;this.alarm={active:false,episodes:[]};}
 accept(alarm,now){
  if(alarm.session!==this.session){this.session=alarm.session;this.initialized=false;this.seen.clear();this.deadline=0;this.episode=null;this.pending=null;}
  this.alarm=alarm;if(!alarm.available)return;
  let notify=null;
  for(const e of alarm.episodes){if(!this.seen.has(e.id)&&(this.initialized||e.active))notify=e;this.seen.add(e.id);}
  this.initialized=true;const ids=new Set(alarm.episodes.map(e=>e.id));for(const id of this.seen)if(!ids.has(id))this.seen.delete(id);
  if(this.episode)this.episode=alarm.episodes.find(e=>e.id===this.episode.id)||this.episode;
  if(notify&&!this.manualNormal)this.pending=notify;
  if(this.pending)this.pending=alarm.episodes.find(e=>e.id===this.pending.id)||this.pending;
  this.showPending(now);
 }
 showPending(now){if(this.manualNormal||!this.pending||now<this.nextModalAt||now<this.deadline)return;this.episode=this.pending;this.pending=null;this.deadline=now+10000;this.nextModalAt=now+15000;}
 dismiss(){this.deadline=0;}
 normal(){this.manualNormal=true;this.pending=null;this.dismiss();}
 view(now){this.showPending(now);return {active:this.alarm.active,modeActive:this.alarm.active&&!this.manualNormal,manualNormal:this.manualNormal,fresh:this.alarm.fresh,available:this.alarm.available,open:now<this.deadline&&!!this.episode,pendingNotification:!!this.pending,remaining:Math.max(0,Math.ceil((this.deadline-now)/1000)),episode:this.episode,latest:this.alarm.episodes.filter(e=>e.active).at(-1)||this.alarm.episodes.at(-1)||null};}
}
