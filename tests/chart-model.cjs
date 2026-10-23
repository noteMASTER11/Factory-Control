const assert=require('node:assert/strict');
(async()=>{
 const {decodeRgb565,visibleChartTiles,chartPages,visibleChartPages,chartLevel}=await import('../src/Factorio.Desktop/Web/chart-model.js');
 const data=new Uint8Array(2048);data.set([0,248,224,7,31,0]);
 const rgba=decodeRgb565(data.buffer);assert.deepEqual([...rgba.slice(0,12)],[255,0,0,255,0,255,0,255,0,0,255,255]);
 assert.throws(()=>decodeRgb565(new ArrayBuffer(10)));
 const rows=Array.from({length:1000},(_,x)=>[x-500,0,10]);
 const visible=visibleChartTiles(rows,{x:0,y:16,scale:1},320,200,20);
 assert(visible.length>0&&visible.length<=20);assert(visible.every(r=>r[0]>=-6&&r[0]<=5),'only intersecting tiles may be requested');
 const bounded=visibleChartTiles(rows,{x:0,y:16,scale:.01},320,200,20);assert.equal(bounded.length,20,'zoomed out requests stay bounded');
 const dense=[];for(let y=-24;y<24;y++)for(let x=-32;x<32;x++)dense.push([x,y,100]);
 for(const scale of [.25,.5,1,2]){
  const level=chartLevel(scale),pages=chartPages(dense,level),visible=visibleChartPages(pages,{x:0,y:0,scale},800,600);
  for(const [x,y]of [[-399,-299],[399,-299],[-399,299],[399,299]]){
   const wx=x/scale,wy=y/scale;
   if(Math.abs(wx)>1024||Math.abs(wy)>768)continue;
   assert(visible.some(p=>wx>=p.x*p.size&&wx<(p.x+1)*p.size&&wy>=p.y*p.size&&wy<(p.y+1)*p.size),'viewport corners must remain covered, not a radial subset');
  }
  assert.equal([...pages.values()].reduce((n,p)=>n+p.count,0),dense.length,'every known base chunk belongs to an atlas');
 }
 const negative=[...chartPages([[-1,-1,1]],0).values()][0];assert.equal(negative.x,-1);assert.equal(negative.y,-1);
 console.log('Native chart decoding and viewport: all checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
