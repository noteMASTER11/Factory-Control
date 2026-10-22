// Tick advancement per real second, measured from collector file timestamps.
// It is an estimate of simulation throughput, independent of UI frame rate.
export class UpsEstimator {
 constructor(){this.samples=[];}
 clear(){this.samples=[];}
 add(topic){const tick=topic?.tick,time=Date.parse(topic?.written_at);if(!Number.isFinite(tick)||!Number.isFinite(time))return;
  const last=this.samples.at(-1);if(last&&tick<last.tick)this.clear();else if(last&&(tick===last.tick||time<=last.time))return;
  this.samples.push({tick,time});while(this.samples.length>12||(this.samples.length>2&&this.samples[0].time<time-10000))this.samples.shift();
 }
 value(now=Date.now()){const first=this.samples[0],last=this.samples.at(-1);if(this.samples.length<2||now-last.time>15000||last.time-first.time<1000)return null;return (last.tick-first.tick)/((last.time-first.time)/1000);}
}
