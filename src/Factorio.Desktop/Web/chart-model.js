export function decodeRgb565(buffer){
 if(buffer.byteLength!==2048)throw new RangeError('Invalid native chart size');
 const source=new DataView(buffer),out=new Uint8ClampedArray(4096);
 for(let i=0;i<1024;i++){const pixel=source.getUint16(i*2,true),r=(pixel>>11)&31,g=(pixel>>5)&63,b=pixel&31;out[i*4]=(r<<3)|(r>>2);out[i*4+1]=(g<<2)|(g>>4);out[i*4+2]=(b<<3)|(b>>2);out[i*4+3]=255;}
 return out;
}
export function visibleChartTiles(rows,camera,width,height,limit=256){
 const left=(camera.x-width/camera.scale/2)/32,right=(camera.x+width/camera.scale/2)/32,top=(camera.y-height/camera.scale/2)/32,bottom=(camera.y+height/camera.scale/2)/32;
 return rows.filter(r=>r[0]+1>=left&&r[0]<=right&&r[1]+1>=top&&r[1]<=bottom).sort((a,b)=>Math.hypot(a[0]*32+16-camera.x,a[1]*32+16-camera.y)-Math.hypot(b[0]*32+16-camera.x,b[1]*32+16-camera.y)).slice(0,limit);
}
export const chartLevel=scale=>Math.max(0,Math.min(2,Math.ceil(Math.log2(1/scale))));
export function chartPages(rows,level){
 const chunks=8<<level,pages=new Map();
 for(const row of rows){
  const x=Math.floor(row[0]/chunks),y=Math.floor(row[1]/chunks),key=`${x}/${y}`;
  let page=pages.get(key);if(!page){page={x,y,level,size:chunks*32,count:0,version:2166136261};pages.set(key,page);}
  page.count++;for(const value of row)page.version=Math.imul(page.version^(value|0),16777619)>>>0;
 }
 return pages;
}
export function visibleChartPages(pages,camera,width,height){
 const left=camera.x-width/camera.scale/2,right=camera.x+width/camera.scale/2,top=camera.y-height/camera.scale/2,bottom=camera.y+height/camera.scale/2;
 return [...pages.values()].filter(p=>(p.x+1)*p.size>left&&p.x*p.size<right&&(p.y+1)*p.size>top&&p.y*p.size<bottom)
  .sort((a,b)=>Math.hypot((a.x+.5)*a.size-camera.x,(a.y+.5)*a.size-camera.y)-Math.hypot((b.x+.5)*b.size-camera.x,(b.y+.5)*b.size-camera.y));
}
