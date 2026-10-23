// Test transport for archived native chart files; never contacts Factorio.
exports.atlas=(tiles,level,x,y,read)=>{
 const out=Buffer.alloc(256*256*4),chunks=8<<level,sample=1<<level,size=32/sample,index=new Set(tiles.map(r=>r[0]+'/'+r[1]));let found=false;
 for(let dy=0;dy<chunks;dy++)for(let dx=0;dx<chunks;dx++){
  const cx=x*chunks+dx,cy=y*chunks+dy;if(!index.has(cx+'/'+cy))continue;
  let data;try{data=read(cx,cy);}catch{continue;}if(data.length!==2048)continue;found=true;
  for(let py=0;py<size;py++)for(let px=0;px<size;px++){
   const value=data.readUInt16LE(((py*sample)*32+px*sample)*2),r=value>>11,g=value>>5&63,b=value&31,target=((dy*size+py)*256+dx*size+px)*4;
   out[target]=(r<<3)|(r>>2);out[target+1]=(g<<2)|(g>>4);out[target+2]=(b<<3)|(b>>2);out[target+3]=255;
  }
 }
 return found?out:null;
};
