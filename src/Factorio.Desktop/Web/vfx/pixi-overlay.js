import {Application,Sprite,Texture,CanvasSource,DisplacementFilter,Rectangle,CRTFilter,RGBSplitFilter,GlitchFilter,ConvolutionFilter,ColorMatrixFilter} from './vendor/pixi-vendor.js';
import {effectProfile,colorMatrix} from '../settings-model.js';
import {projectCrtPoint} from './crt-overlay.js';
import {makeGlitchBlocks,insideQuad} from './glitch-geometry.js';
import {GlyphGlitch} from './glyph-glitch.js';
import {interactiveSelector as interactive} from '../interactive.js';
// Experimental adapter. HTML remains the source of layout, input and semantics.
// Native HTML-in-Canvas paints it; Pixi owns only the post-processing output.
export class PixiCrtOverlay {
 static async create(surface,profile,clock){
  if(typeof CanvasRenderingContext2D.prototype.drawElementImage!=='function')throw new Error('html_in_canvas_unavailable');
  const effect=new PixiCrtOverlay(surface,profile,clock);
  try{await effect.initialize();return effect;}catch(error){try{effect.destroy();}catch{}throw error;}
 }
 constructor(surface,profile,clock){this.surface=surface;this.profile=profile;this.clock=clock;this.enabled=false;this.id='pixi.crt';this.frames=0;this.uploads=0;this.paintMs=[];this.started=performance.now();this.motion=matchMedia('(prefers-reduced-motion: reduce)');
  this.glyphs=new GlyphGlitch(surface);this.originalParent=surface.parentNode;this.originalNext=surface.nextSibling;
  this.source=document.createElement('canvas');this.source.className='pixi-dom-source';this.source.setAttribute('layoutsubtree','');this.source.setAttribute('content','drawable');
  this.surface.setAttribute('drawable','');this.ctx=this.source.getContext('2d');
  this.paint=()=>{if(this.enabled){this.dirty=true;this.queue();}};this.source.addEventListener('paint',this.paint);
  this.resize=()=>{this.glyphs.cancel();this.geometryDirty=true;this.dirty=true;this.queue();};window.addEventListener('resize',this.resize);
  this.cancelGlyphs=()=>{this.glyphs.cancel();this.queue();};document.addEventListener('scroll',this.cancelGlyphs,true);document.addEventListener('pointerdown',this.cancelGlyphs,true);
  this.activity=()=>{if(!document.hidden)this.queue();};document.addEventListener('visibilitychange',this.activity);
  this.retarget=event=>{if(!this.enabled||!event.isTrusted||event.button!==0)return;this.glitchUntil=0;
   const target=this.targetAt(event);
   if(!target||!surface.contains(target)||target===event.target.closest?.(interactive)||target.disabled)return;
   event.preventDefault();event.stopImmediatePropagation();target.focus?.({preventScroll:true});if(target instanceof HTMLSelectElement){try{target.showPicker();}catch{target.focus();}}else target.click();
  };document.addEventListener('click',this.retarget,true);
 }
 targetAt(event,selector=interactive){if(event.target.closest?.('[aria-modal=true]'))return event.target.closest(selector);const p=projectCrtPoint(event.clientX,event.clientY,innerWidth,innerHeight,this.profile.curvature);return document.elementFromPoint(p.x,p.y)?.closest(selector);}
 applyEffects(values){this.glyphs.apply(values);this.baseProfile??=structuredClone(this.profile);const p=effectProfile(this.baseProfile,values);Object.assign(this.profile,p);this.settings=this.profile.pixi;this.rgb.red={x:-this.settings.rgbSplitPixels,y:0};this.rgb.blue={x:this.settings.rgbSplitPixels,y:0};this.crt.noise=this.settings.noise;this.crt.vignettingAlpha=Math.min(1,this.settings.vignetteAlpha);const sharp=this.settings.sharpen;this.sharpen.matrix=[0,-sharp,0,-sharp,1+4*sharp,-sharp,0,-sharp,0];this.color.matrix=colorMatrix(values);this.colorConfigured=[values.redBalance,values.greenBalance,values.blueBalance].some(v=>v!==100);this.color.enabled=this.colorConfigured&&!this.surface.classList.contains('threat-active');this.geometryDirty=true;this.mapDirection=null;this.glitchUntil=0;this.nextGlitch=performance.now()+p.glitchMinIntervalMs;this.queue();}
 async initialize(){
  this.settings=this.profile.pixi;
  this.app=new Application();await this.app.init({width:innerWidth,height:innerHeight,preference:'webgl',autoStart:false,sharedTicker:false,resolution:Math.min(2,devicePixelRatio),autoDensity:true,antialias:true,background:'#02080d',preserveDrawingBuffer:true});
  this.app.stop();this.app.canvas.className='pixi-crt-output';this.app.canvas.hidden=true;this.app.canvas.setAttribute('aria-hidden','true');document.body.append(this.app.canvas);
  this.sourceTexture=new Texture({dynamic:true,source:new CanvasSource({resource:this.source,width:innerWidth,height:innerHeight,resolution:1,scaleMode:'linear',autoDensity:false})});
  this.screen=new Sprite(this.sourceTexture);this.app.stage.addChild(this.screen);
  this.map=document.createElement('canvas');this.map.width=384;this.map.height=288;this.mapTexture=Texture.from(this.map);this.mapTexture.source.style.scaleMode='linear';this.mapSprite=new Sprite(this.mapTexture);this.app.stage.addChild(this.mapSprite);
  this.warp=new DisplacementFilter({sprite:this.mapSprite,scale:0});
  this.crt=new CRTFilter({curvature:0,lineWidth:this.settings.lineContrast>0?1:0,lineContrast:this.settings.lineContrast,noise:this.settings.noise,noiseSize:1,vignetting:.15,vignettingAlpha:.2,vignettingBlur:.55});
  const split=this.settings.rgbSplitPixels,sharp=this.settings.sharpen;
  this.rgb=new RGBSplitFilter({red:{x:-split,y:0},green:{x:0,y:0},blue:{x:split,y:0}});
  this.sharpen=new ConvolutionFilter({matrix:[0,-sharp,0,-sharp,1+4*sharp,-sharp,0,-sharp,0],width:innerWidth,height:innerHeight});
  this.bandGlitch=new GlitchFilter({slices:32,minSize:1,sampleSize:1024,offset:2,fillMode:3});this.bandGlitch.enabled=false;
  this.color=new ColorMatrixFilter();this.color.enabled=false;this.screen.filters=[this.rgb,this.warp,this.bandGlitch,this.sharpen,this.crt,this.color];
  for(const filter of this.screen.filters){filter.resolution=1;filter.antialias='on';filter.padding=0;}
  this.geometryDirty=true;this.nextGlitch=performance.now()+8000;window.pixiProbe=this;
 }
 queue(){if(!this.enabled||this.destroyed||document.hidden)return;this.clock.request(this.id,()=>this.draw());}
 geometry(){const w=innerWidth,h=innerHeight;this.source.width=w;this.source.height=h;this.source.style.width=w+'px';this.source.style.height=h+'px';
  this.sourceTexture.source.resize(w,h,1);this.screen.width=w;this.screen.height=h;this.app.renderer.resize(w,h,Math.min(2,devicePixelRatio));this.sharpen.width=w;this.sharpen.height=h;this.mapSprite.width=w;this.mapSprite.height=h;this.screen.filterArea=new Rectangle(0,0,w,h);this.drawMap(0);this.geometryDirty=false;this.dirty=true;this.source.requestPaint?.();
 }
 drawMap(direction){const w=innerWidth,h=innerHeight,p=this.profile,scale=Math.max(.000001,Math.max(w,h)*p.curvature*2+(direction?2*this.settings.blockGlitchPixels:0)),ctx=this.map.getContext('2d'),image=ctx.createImageData(this.map.width,this.map.height);
  for(let y=0;y<this.map.height;y++)for(let x=0;x<this.map.width;x++){const px=x/(this.map.width-1)*w,py=y/(this.map.height-1)*h,point=projectCrtPoint(px,py,w,h,p.curvature);let dx=point.x-px;
   for(const block of this.blocks||[])if(direction&&insideQuad(px/w,py/h,block.points))dx+=block.shift*direction*this.settings.blockGlitchPixels;
   const i=(y*this.map.width+x)*4;image.data[i]=Math.round(255*(.5+dx/scale));image.data[i+1]=Math.round(255*(.5+(point.y-py)/scale));image.data[i+2]=128;image.data[i+3]=255;
  }ctx.putImageData(image,0,0);this.mapTexture.source.update();this.warp.scale.set(scale,scale);
 }
 draw(){if(!this.enabled||this.destroyed||document.hidden)return;
  if(this.geometryDirty)this.geometry();this.color.enabled=!!this.colorConfigured&&!this.surface.classList.contains('threat-active');const start=performance.now();
  let uploaded=false;
  if(this.dirty){try{this.ctx.setTransform(1,0,0,1,0,0);this.ctx.clearRect(0,0,innerWidth,innerHeight);this.ctx.drawElementImage(this.surface,0,0,innerWidth,innerHeight);this.source.updateElementGeometry(this.surface,{canvasTransform:new DOMMatrix()});this.glyphs.capture(this.source);uploaded=true;this.dirty=false;}catch{this.source.requestPaint?.();}}
  const glyphNow=performance.now(),glyphPaused=this.motion.matches||!!document.querySelector('#app-intro:not([hidden]),.tab-boot:not([hidden])');this.glyphs.advance(glyphNow,glyphPaused);const glyphPainted=this.glyphs.paint(this.ctx,glyphNow);if(uploaded||glyphPainted){this.sourceTexture.source.update();this.uploads++;}
  const now=performance.now();if(!this.motion.matches&&now>=this.nextGlitch&&!this.surface.querySelector('button:hover,select:hover,input:hover,[data-resource]:hover,[data-forecast]:hover,[data-action]:hover'))this.pulse();
  const direction=this.glitchUntil>now?(now>this.glitchUntil-80 ? .3 : now>this.glitchUntil-160 ? -.8 : 1):0;
  if(direction!==this.mapDirection){this.mapDirection=direction;this.drawMap(direction);}
  this.bandGlitch.enabled=this.settings.bandGlitchPixels>0&&direction!==0;this.bandGlitch.offset=direction*this.settings.bandGlitchPixels;
  this.crt.time=this.motion.matches||!this.settings.fieldPeriodMs?0:Math.floor(now/this.settings.fieldPeriodMs)%2*Math.PI;this.crt.seed=Math.floor(now/100);this.app.renderer.render(this.app.stage);this.frames++;this.paintMs.push(performance.now()-start);if(this.paintMs.length>300)this.paintMs.shift();
  if(!this.motion.matches)this.queue();
 }
 pulse(){this.blocks=makeGlitchBlocks();this.bandGlitch.seed=Math.random();this.bandGlitch.shuffle();this.glitchUntil=performance.now()+this.profile.glitchDurationMs;this.nextGlitch=performance.now()+this.profile.glitchMinIntervalMs+Math.random()*(this.profile.glitchMaxIntervalMs-this.profile.glitchMinIntervalMs);this.mapDirection=null;}
 setEnabled(value){if(this.destroyed)return;this.enabled=!!value;if(this.app?.renderer)this.app.canvas.hidden=!this.enabled;
  if(this.enabled){this.originalParent.insertBefore(this.source,this.surface);this.source.append(this.surface);this.geometryDirty=true;this.dirty=true;this.source.requestPaint?.();this.queue();}
  else{this.glyphs.cancel();this.clock.cancel(this.id);if(this.surface.parentNode===this.source)this.originalParent.insertBefore(this.surface,this.source);this.source.remove();}
 }
 describe(){const sorted=[...this.paintMs].sort((a,b)=>a-b);return {renderer:'pixi',glyphs:this.glyphs.describe(),experimental:true,enabled:this.enabled,frames:this.frames,uploads:this.uploads,elapsedMs:performance.now()-this.started,p50Ms:sorted[Math.floor(sorted.length*.5)]||0,p95Ms:sorted[Math.floor(sorted.length*.95)]||0,htmlInCanvas:typeof this.ctx.drawElementImage==='function',sourceResolution:1,filterResolution:1,sampling:'linear',sharpen:.16,webgl:!!this.app.renderer.gl};}
 destroy(){if(this.destroyed)return;this.setEnabled(false);this.destroyed=true;window.removeEventListener('resize',this.resize);document.removeEventListener('scroll',this.cancelGlyphs,true);document.removeEventListener('pointerdown',this.cancelGlyphs,true);document.removeEventListener('visibilitychange',this.activity);document.removeEventListener('click',this.retarget,true);this.source.removeEventListener('paint',this.paint);this.surface.removeAttribute('drawable');this.app?.destroy(true,{children:true,texture:true,textureSource:true});this.mapTexture?.destroy(true);}
}
