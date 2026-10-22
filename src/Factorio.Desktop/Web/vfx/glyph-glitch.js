// Paint-only substitutions. Semantic text, layout, input and telemetry are never changed.
const shapes=['AАа4^','BВв8b','CСсc([{','DДдO0','EЕеЁёe3','FГгf7','HНнh#','IИиЙй1!|/','Jj]','KКкk<','LЛлl1|','MМмmW','NПпn^','OОоoQ0@','PРрp9','RЯяr2','SЗзs$35','TТтt7+','UЦцЧчuY','VvУуv/','WШшЩщw#','XХхx%*','YyУу4','Zz2','БбЬьЪъЫыb6','ЖжФфЮюж#@*','Ээe3','0123456789OISZBg'];
export function similarGlyph(char,random=Math.random){
 const group=shapes.find(row=>row.includes(char))||'@#%*+?';
 const choices=[...new Set([...group].filter(c=>c!==char&&c.charCodeAt(0)>=33&&c.charCodeAt(0)<=126))];
 return choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];
}
export function glyphParameters(values){const frequency=values.glyphFrequency/100;return {amount:values.glyphAmount/100*.01,minInterval:frequency?6500/frequency:Infinity,maxInterval:frequency?13000/frequency:Infinity};}
export function glyphPose(progress,direction){return progress>=1?{visible:false,x:0,y:0}:{visible:true,x:(progress<.3?2:progress<.7?-1:1)*direction,y:progress<.3?-1:0};}

export class GlyphGlitch {
 constructor(surface,random=Math.random){this.surface=surface;this.random=random;this.clean=document.createElement('canvas');this.cleanContext=this.clean.getContext('2d',{willReadFrequently:true});this.entries=[];this.active=false;this.restoreNeeded=false;this.pulses=0;this.painted=0;this.settings={amount:.01,minInterval:6500,maxInterval:13000};this.schedule(performance.now());}
 schedule(now){this.next=now+this.settings.minInterval+this.random()*(this.settings.maxInterval-this.settings.minInterval);if(!Number.isFinite(this.next))this.next=Infinity;}
 apply(values){const signature=values.glyphFrequency+':'+values.glyphAmount;if(signature===this.signature)return;this.signature=signature;this.settings=glyphParameters(values);this.cancel();this.schedule(performance.now());}
 capture(source){if(this.clean.width!==source.width||this.clean.height!==source.height){this.clean.width=source.width;this.clean.height=source.height;this.cancel();}this.cleanContext.clearRect(0,0,this.clean.width,this.clean.height);this.cleanContext.drawImage(source,0,0);}
 cancel(){if(this.active)this.restoreNeeded=true;this.active=false;this.entries=[];}
 pulse(now=performance.now()){
  this.schedule(now);if(!this.settings.amount||!Number.isFinite(this.settings.minInterval)||!this.clean.width)return false;
  const walker=document.createTreeWalker(this.surface,NodeFilter.SHOW_TEXT),candidates=[];let node,visited=0,inspected=0;
  const boxes=new Map(),styles=new Map(),blocked='[hidden],button,input,textarea,select,option,[contenteditable]:not([contenteditable=false]),.tab-boot,.app-intro';
  while((node=walker.nextNode())&&visited++<1024&&inspected<8192){
   const parent=node.parentElement;if(!parent||parent.namespaceURI!=='http://www.w3.org/1999/xhtml'||parent.closest(blocked))continue;
   let box=boxes.get(parent);if(!box){box=parent.getBoundingClientRect();boxes.set(parent,box);}if(!box.width||!box.height||box.bottom<=0||box.top>=innerHeight||box.right<=0||box.left>=innerWidth)continue;
   for(let index=0;index<node.length&&inspected++<8192;index++)if(/[\p{L}\p{N}]/u.test(node.data[index]))candidates.push({node,index,char:node.data[index]});
  }
  const count=Math.min(48,Math.ceil(candidates.length*this.settings.amount)),range=document.createRange();this.entries=[];
  while(candidates.length&&this.entries.length<count){
   const index=Math.floor(this.random()*candidates.length),entry=candidates[index];candidates[index]=candidates.at(-1);candidates.pop();
   range.setStart(entry.node,entry.index);range.setEnd(entry.node,entry.index+1);const box=range.getBoundingClientRect();
   if(box.width<=0||box.height<=0||box.left<0||box.top<0||box.right>innerWidth||box.bottom>innerHeight)continue;
   let clipped=false;for(let parent=entry.node.parentElement;parent&&parent!==this.surface;parent=parent.parentElement){let style=styles.get(parent);if(!style){style=getComputedStyle(parent);styles.set(parent,style);}if(style.visibility!=='visible'||Number(style.opacity)===0){clipped=true;break;}if(/hidden|clip|auto|scroll/.test(style.overflowX+' '+style.overflowY)){const r=boxes.get(parent)||parent.getBoundingClientRect();boxes.set(parent,r);if(box.left<r.left||box.right>r.right||box.top<r.top||box.bottom>r.bottom){clipped=true;break;}}}if(clipped)continue;
   const style=styles.get(entry.node.parentElement)||getComputedStyle(entry.node.parentElement);
   const x=Math.max(0,Math.min(this.clean.width-1,Math.floor(box.left))),y=Math.max(0,Math.min(this.clean.height-1,Math.floor(box.top))),w=Math.max(1,Math.min(this.clean.width-x,Math.ceil(box.width))),h=Math.max(1,Math.min(this.clean.height-y,Math.ceil(box.height)));
   const data=this.cleanContext.getImageData(x,y,w,h).data,corners=[0,(w-1)*4,(h-1)*w*4,(w*h-1)*4];const i=corners.reduce((a,b)=>data[a]+data[a+1]+data[a+2]<data[b]+data[b+1]+data[b+2]?a:b);
   this.entries.push({...entry,box,font:`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,color:style.color,background:`rgba(${data[i]},${data[i+1]},${data[i+2]},${data[i+3]/255})`,replacement:similarGlyph(entry.char,this.random),direction:this.random()<.5?-1:1});
  }
  this.started=now;this.duration=160+this.random()*80;this.active=this.entries.length>0;if(this.active)this.pulses++;return this.active;
 }
 advance(now,paused=false){
  if(paused){this.cancel();this.schedule(now);return;}
  if(this.active&&now-this.started>=this.duration)this.cancel();
  if(!this.active&&now>=this.next)this.pulse(now);
 }
 paint(context,now){
  if(!this.active&&!this.restoreNeeded)return false;
  context.save();context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,this.clean.width,this.clean.height);context.drawImage(this.clean,0,0);
  if(this.active){const progress=(now-this.started)/this.duration;
   for(const entry of this.entries){if(!entry.node.isConnected||entry.node.data[entry.index]!==entry.char)continue;const {box}=entry,pose=glyphPose(progress,entry.direction);if(!pose.visible)continue;context.save();context.beginPath();context.rect(box.left,box.top,box.width,box.height);context.clip();context.fillStyle=entry.background;context.fillRect(box.left,box.top,box.width,box.height);context.font=entry.font;context.textBaseline='alphabetic';context.fillStyle=entry.color;const metrics=context.measureText(entry.replacement);context.fillText(entry.replacement,box.left+pose.x,box.top+(metrics.fontBoundingBoxAscent||box.height*.8)+pose.y);context.restore();this.painted++;}
  }
  context.restore();this.restoreNeeded=false;return true;
 }
 describe(){return {active:this.active,characters:this.entries.length,pulses:this.pulses,painted:this.painted,amount:this.settings.amount,minInterval:this.settings.minInterval,maxInterval:this.settings.maxInterval,next:this.next};}
}
