const ns='http://www.w3.org/2000/svg';
export const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
const svg=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
export function lineChart(host,{series,bands=[],markers=[],label,formatY,formatX,minY=0,maxY,xMin,xMax}){
 host.replaceChildren();const points=[...series.flatMap(s=>s.points),...bands.flatMap(b=>b.points.flatMap(p=>[{tick:p.tick,value:p.low},{tick:p.tick,value:p.high}]))].filter(p=>Number.isFinite(p.tick)&&Number.isFinite(p.value));
 if(!points.length){host.append(node('div',label,'chart-wait'));return;}
 const width=600,height=190,left=52,right=12,top=12,bottom=26;
 xMin??=Math.min(...points.map(p=>p.tick));xMax??=Math.max(...points.map(p=>p.tick));if(xMin===xMax)xMin--;
 maxY??=Math.max(1,...points.map(p=>p.value))*1.12;if(maxY===minY)maxY=minY+1;
 const x=t=>left+(t-xMin)/(xMax-xMin)*(width-left-right),y=v=>height-bottom-(v-minY)/(maxY-minY)*(height-top-bottom);
 const chart=svg('svg',{viewBox:`0 0 ${width} ${height}`,preserveAspectRatio:'none',role:'img','aria-label':label});
 for(let i=0;i<=4;i++){
  const yy=top+(height-top-bottom)*i/4,val=maxY-(maxY-minY)*i/4;
  chart.append(svg('line',{x1:left,y1:yy,x2:width-right,y2:yy,class:'chart-grid'}));
  const text=svg('text',{x:left-6,y:yy+4,'text-anchor':'end',class:'chart-label'});text.textContent=formatY(val);chart.append(text);
 }
 for(let i=0;i<=4;i++){
  const tick=xMin+(xMax-xMin)*i/4,xx=x(tick);
  chart.append(svg('line',{x1:xx,y1:top,x2:xx,y2:height-bottom,class:'chart-grid'}));
  const text=svg('text',{x:xx,y:height-7,'text-anchor':i===0?'start':i===4?'end':'middle',class:'chart-label'});text.textContent=formatX(tick);chart.append(text);
 }
 for(const marker of markers)if(marker.tick>=xMin&&marker.tick<=xMax){const xx=x(marker.tick);chart.append(svg('line',{'data-marker':'true',x1:xx,y1:top,x2:xx,y2:height-bottom,stroke:marker.color,'stroke-dasharray':'2 3','stroke-width':.8}));const text=svg('text',{x:xx+3,y:top+9,class:'chart-label'});text.textContent=marker.label;chart.append(text);}
 for(const band of bands){const visible=band.points.filter(p=>p.tick>=xMin&&p.tick<=xMax&&Number.isFinite(p.low)&&Number.isFinite(p.high));if(visible.length>1)chart.append(svg('polygon',{'data-band':'true',points:[...visible.map(p=>`${x(p.tick)},${y(p.high)}`),...visible.toReversed().map(p=>`${x(p.tick)},${y(p.low)}`)].join(' '),fill:band.color,opacity:.13}));}
 for(const s of series){const visible=s.points.filter(p=>p.tick>=xMin&&p.tick<=xMax&&Number.isFinite(p.value));
  if(visible.length===1)chart.append(svg('circle',{cx:x(visible[0].tick),cy:y(visible[0].value),r:2.5,fill:s.color}));
  else if(visible.length>1)chart.append(svg('path',{d:visible.map((p,i)=>`${i?'L':'M'}${x(p.tick).toFixed(2)},${y(Math.max(minY,Math.min(maxY,p.value))).toFixed(2)}`).join(' '),fill:'none',stroke:s.color,'stroke-width':1.8,'stroke-dasharray':s.dashed?'5 4':'none','vector-effect':'non-scaling-stroke'}));
 }
 host.append(chart);
}
export function sparkline(points,color,label){
 const chart=svg('svg',{viewBox:'0 0 100 22',preserveAspectRatio:'none',role:'img','aria-label':label});
 if(points.length<2)return chart;
 const max=Math.max(1,...points.map(p=>p.value)),min=Math.min(0,...points.map(p=>p.value));
 chart.append(svg('path',{d:points.map((p,i)=>`${i?'L':'M'}${i/(points.length-1)*100},${20-(p.value-min)/(max-min)*18}`).join(' '),fill:'none',stroke:color,'stroke-width':1.2,'vector-effect':'non-scaling-stroke'}));return chart;
}
