export class FrameBudget {
  constructor(fps) { this.fps=fps; this.interval=1000/fps; this.bucket=-1; }
  take(now) {
    const bucket=Math.floor(now/this.interval);
    if(bucket===this.bucket)return false;
    this.bucket=bucket; return true;
  }
}

// A single visual clock owns UI commits and paused CSS animation timelines.
// Chromium can still composite an unchanged surface at the display refresh rate.
export class FrameClock {
  constructor(fps=30) {
    this.budget=new FrameBudget(fps); this.jobs=new Map(); this.animations=[];
    this.frames=0; this.startedAt=performance.now(); this.origin=performance.now();
    this.tick=now=>{
      this.raf=0;
      if(document.hidden)return;
      if(this.budget.take(now)) {
        const jobs=[...this.jobs.values()];this.jobs.clear();
        for(const job of jobs)job();
        for(const entry of this.animations)entry.animation.currentTime=now-this.origin;
        this.frames++;
      }
      if(this.jobs.size || this.animations.length)this.wake();
    };
    this.visibility=()=>{if(document.hidden){cancelAnimationFrame(this.raf);this.raf=0;}else this.wake();};
    document.addEventListener('visibilitychange',this.visibility);
    document.documentElement.classList.add('ui-frame-limited');
  }
  wake(){if(!this.raf&&!document.hidden&&(this.jobs.size||this.animations.length))this.raf=requestAnimationFrame(this.tick);}
  request(key,callback){this.jobs.set(key,callback);this.wake();}
  cancel(key){this.jobs.delete(key);}
  setAnimations(root,enabled) {
    this.animations=[];
    for(const animation of root.getAnimations({subtree:true})) {
      animation.pause();
      if(enabled)this.animations.push({animation});
    }
    this.wake();
  }
  describe(){return {limit:this.budget.fps,frames:this.frames,elapsed_ms:performance.now()-this.startedAt,animations:this.animations.length};}
  destroy(){cancelAnimationFrame(this.raf);document.removeEventListener('visibilitychange',this.visibility);this.jobs.clear();this.animations=[];}
}
