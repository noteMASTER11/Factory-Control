// Paint-only effects. The application keeps its semantic DOM, layout and input handling.
import {makeGlitchBlocks} from './glitch-geometry.js';
const svgNamespace = 'http://www.w3.org/2000/svg';
const interactive = 'button,select,input,a,[data-pid]';
let instance = 0;
// Output-to-source coordinates: one continuous radial lens, independent of the UI.
export function projectCrtPoint(x,y,width,height,curvature) {
  const nx = 2*x/width-1, ny = 2*y/height-1, radial = (nx*nx+ny*ny)*curvature;
  return {x:x+width/2*nx*radial,y:y+height/2*ny*radial};
}
function svg(name, attributes = {}) {
  const element = document.createElementNS(svgNamespace, name);
  for (const [key,value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

export class CrtOverlay {
  constructor(surface, profile, clock) {
    this.surface = surface;
    this.profile = profile;
    this.clock = clock;
    this.enabled = false;
    this.destroyed = false;
    this.signature = '';
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.previousFilter = surface.style.getPropertyValue('--crt-screen-filter');
    this.id = `factory-crt-lens-${++instance}`;
    this.element = document.createElement('div');
    this.element.className = 'crt-overlay';
    this.element.setAttribute('aria-hidden','true');
    this.element.hidden = true;
    for (const name of ['interlace','scan','noise','tear','glass']) {
      const layer = document.createElement('div'); layer.className = `crt-${name}`; this.element.append(layer);
    }
    this.definitions = svg('svg', {class:'crt-definitions',width:0,height:0,'aria-hidden':'true'});
    this.filter = svg('filter', {id:this.id,filterUnits:'userSpaceOnUse',x:0,y:0,'color-interpolation-filters':'sRGB'});
    this.definitions.append(this.filter);
    this.createPipeline();
    document.body.append(this.definitions,this.element);
    this.createNoise();
    this.queueGeometry = () => {
      if (!this.enabled || this.frame || this.destroyed) return;
      this.frame = 1;
      this.clock.request(this.id+'.geometry',() => { this.frame = 0; this.refreshGeometry(); });
    };
    this.activity = () => this.syncActivity();
    this.protectControls = event => { if (event.target.closest?.(interactive)) this.endGlitch(); };
    this.resize = new ResizeObserver(this.queueGeometry); this.resize.observe(surface);
    surface.addEventListener('pointerover',this.protectControls,true);
    surface.addEventListener('pointerdown',this.protectControls,true);
    this.retargetClick = event => {
      if (!this.enabled || !event.isTrusted || event.button !== 0) return;
      this.endGlitch();
      const box = surface.getBoundingClientRect();
      const point = projectCrtPoint(event.clientX-box.left,event.clientY-box.top,box.width,box.height,this.profile.curvature);
      const target = document.elementFromPoint(point.x+box.left,point.y+box.top)?.closest(interactive);
      if (!target || !surface.contains(target) || target === event.target.closest?.(interactive) || target.disabled) return;
      event.preventDefault(); event.stopImmediatePropagation();
      target.focus?.({preventScroll:true});
      if (target instanceof HTMLSelectElement) { try { target.showPicker(); } catch { target.focus(); } }
      else target.click();
    };
    document.addEventListener('click',this.retargetClick,true);
    document.addEventListener('visibilitychange',this.activity);
    this.motion.addEventListener('change',this.activity);
  }

  createPipeline() {
    const p = this.profile;
    for (const [channel,dx] of [['red',-p.aberrationPixels],['green',0],['blue',p.aberrationPixels]]) {
      const values = [channel==='red'?1:0,0,0,0,0, 0,channel==='green'?1:0,0,0,0, 0,0,channel==='blue'?1:0,0,0, 0,0,0,1,0];
      this.filter.append(svg('feColorMatrix',{in:'SourceGraphic',type:'matrix',values:values.join(' '),result:channel}));
      this.filter.append(svg('feOffset',{in:channel,dx,dy:0,result:`${channel}-shift`}));
    }
    this.filter.append(svg('feBlend',{in:'red-shift',in2:'green-shift',mode:'screen',result:'rg'}));
    this.filter.append(svg('feBlend',{in:'rg',in2:'blue-shift',mode:'screen',result:'rgb'}));
    this.filter.append(svg('feComposite',{in:'SourceGraphic',in2:'rgb',operator:'arithmetic',k1:0,k2:1,k3:p.fringeStrength,k4:0,result:'readable-rgb'}));
    this.filter.append(svg('feGaussianBlur',{in:'readable-rgb',stdDeviation:p.phosphorBlur,result:'phosphor'}));
    this.filter.append(svg('feComposite',{in:'readable-rgb',in2:'phosphor',operator:'arithmetic',k1:0,k2:1,k3:p.phosphorBloom,k4:0,result:'bloom'}));
    this.lensImage = svg('feImage',{result:'lens-map',preserveAspectRatio:'none'});
    this.lens = svg('feDisplacementMap',{in:'bloom',in2:'lens-map',scale:0,xChannelSelector:'R',yChannelSelector:'G',result:'curved'});
    this.glitchImage = svg('feImage',{result:'glitch-raw',preserveAspectRatio:'none'});
    const glitchChannels = svg('feComponentTransfer',{in:'glitch-raw',result:'glitch-map'});
    glitchChannels.append(svg('feFuncR',{type:'linear',slope:255/256,intercept:0}),svg('feFuncG',{type:'linear',slope:0,intercept:.5}));
    this.glitch = svg('feDisplacementMap',{in:'curved',in2:'glitch-map',scale:0,xChannelSelector:'R',yChannelSelector:'G'});
    this.filter.append(this.lensImage,this.lens,this.glitchImage,glitchChannels,this.glitch,svg('feGaussianBlur',{stdDeviation:p.imageSmoothing}));
  }

  createNoise() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d'), data = context.createImageData(64,64);
    let seed = 4357;
    for (let i=0;i<data.data.length;i+=4) {
      seed = (seed*1664525+1013904223)>>>0;
      data.data[i] = data.data[i+1] = data.data[i+2] = seed>>>24; data.data[i+3] = 255;
    }
    context.putImageData(data,0,0);
    this.element.querySelector('.crt-noise').style.backgroundImage = `url("${canvas.toDataURL()}")`;
  }

  refreshGeometry() {
    const box = this.surface.getBoundingClientRect(), p = this.profile;
    if (!box.width || !box.height) return;
    const signature = JSON.stringify([box.width,box.height]);
    if (signature === this.signature) return;
    this.signature = signature;
    const canvas = document.createElement('canvas'); canvas.width = p.mapWidth; canvas.height = p.mapHeight;
    const context = canvas.getContext('2d'), data = context.createImageData(canvas.width,canvas.height);
    for (let y=0;y<canvas.height;y++) for (let x=0;x<canvas.width;x++) {
      const px = x/(canvas.width-1)*box.width, py = y/(canvas.height-1)*box.height;
      const point = projectCrtPoint(px,py,box.width,box.height,p.curvature);
      const scale = Math.max(box.width,box.height)*p.curvature*2;
      const i = (y*canvas.width+x)*4;
      data.data[i] = Math.round(255*(0.5+(point.x-px)/scale));
      data.data[i+1] = Math.round(255*(0.5+(point.y-py)/scale));
      data.data[i+2] = 128; data.data[i+3] = 255;
    }
    context.putImageData(data,0,0);
    this.lensImage.setAttribute('href',canvas.toDataURL());
    for (const element of [this.filter,this.lensImage,this.glitchImage]) {
      element.setAttribute('width',box.width); element.setAttribute('height',box.height);
    }
    this.lens.setAttribute('scale',Math.max(box.width,box.height)*p.curvature*2);
    this.element.dataset.width = Math.round(box.width);
    this.element.dataset.ready = 'true';
    this.endGlitch();
  }

  setEnabled(enabled) {
    if (this.destroyed) return;
    this.enabled = !!enabled;
    this.element.hidden = !this.enabled;
    this.surface.classList.toggle('crt-surface',this.enabled);
    if (this.enabled) {
      this.surface.style.setProperty('--crt-screen-filter',`url("#${this.id}")`);
      this.signature = ''; this.refreshGeometry();
    } else {
      this.surface.style.removeProperty('--crt-screen-filter');
      this.clock.cancel(this.id+'.geometry'); this.frame = 0;
    }
    this.syncActivity();
  }

  syncActivity() {
    clearTimeout(this.nextGlitch); this.endGlitch();
    this.element.dataset.motion = this.motion.matches ? 'reduced' : 'full';
    this.element.dataset.paused = String(!this.enabled || document.hidden);
    this.clock.setAnimations(this.element,this.enabled&&!document.hidden&&!this.motion.matches);
    if (this.enabled && !document.hidden && !this.motion.matches) this.scheduleGlitch();
  }
  scheduleGlitch() {
    clearTimeout(this.nextGlitch);
    const p = this.profile;
    this.nextGlitch = setTimeout(() => {
      if (this.enabled && !document.hidden && !this.motion.matches) {
        this.pulse(); this.scheduleGlitch();
      }
    },p.glitchMinIntervalMs+Math.random()*(p.glitchMaxIntervalMs-p.glitchMinIntervalMs));
  }
  pulse() {
    if (!this.enabled || this.motion.matches || document.hidden || this.surface.querySelector(`${interactive.split(',').map(s=>`${s}:hover`).join(',')}`)) return;
    this.blocks = makeGlitchBlocks();
    this.drawBlocks(1);
    this.reverseGlitch = setTimeout(()=>this.drawBlocks(-.8),this.profile.glitchDurationMs*.33);
    this.settleGlitch = setTimeout(()=>this.drawBlocks(.3),this.profile.glitchDurationMs*.66);
    this.stopGlitch = setTimeout(()=>this.endGlitch(),this.profile.glitchDurationMs);
  }
  drawBlocks(direction) {
    this.clock.request(this.id+'.glitch',()=>this.renderBlocks(direction));
  }
  renderBlocks(direction) {
    const canvas = document.createElement('canvas'); canvas.width = this.profile.mapWidth; canvas.height = this.profile.mapHeight;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(128,128,128)'; context.fillRect(0,0,canvas.width,canvas.height);
    for (const block of this.blocks) {
      context.fillStyle = `rgb(${Math.round(128+block.shift*direction*110)},128,128)`;
      context.beginPath();
      block.points.forEach(([x,y],index)=>{if(index===0)context.moveTo(x*canvas.width,y*canvas.height);else context.lineTo(x*canvas.width,y*canvas.height)});
      context.closePath(); context.fill();
    }
    const pixels = context.getImageData(0,0,canvas.width,canvas.height);
    for(let i=0;i<pixels.data.length;i+=4){pixels.data[i+1]=128;pixels.data[i+2]=128;pixels.data[i+3]=255;}
    context.putImageData(pixels,0,0);
    this.glitchImage.setAttribute('href',canvas.toDataURL());
    this.glitch.setAttribute('scale',this.profile.glitchDisplacementPixels*2);
    this.element.dataset.blocks = this.blocks.length;
    this.element.dataset.glitch = 'active';
  }
  endGlitch() {
    clearTimeout(this.stopGlitch); clearTimeout(this.reverseGlitch); clearTimeout(this.settleGlitch);
    this.clock.request(this.id+'.glitch',()=>{this.glitch.setAttribute('scale',0);this.element.dataset.glitch='idle';});
  }
  destroy() {
    this.setEnabled(false); this.destroyed = true;
    this.resize.disconnect();
    this.surface.removeEventListener('pointerover',this.protectControls,true);
    this.surface.removeEventListener('pointerdown',this.protectControls,true);
    document.removeEventListener('click',this.retargetClick,true);
    document.removeEventListener('visibilitychange',this.activity);
    this.motion.removeEventListener('change',this.activity);
    if (this.previousFilter) this.surface.style.setProperty('--crt-screen-filter',this.previousFilter);
    this.definitions.remove(); this.element.remove();
  }
}
