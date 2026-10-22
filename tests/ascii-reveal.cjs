const assert=require('node:assert/strict');
(async()=>{const {asciiSweep,pixelsToAscii}=await import('../src/Factorio.Desktop/Web/vfx/ascii-reveal.js');
 assert.deepEqual(asciiSweep(0,40,6),{clearRows:0,decodeRows:0});assert.deepEqual(asciiSweep(.5,40,6),{clearRows:17,decodeRows:23});assert.deepEqual(asciiSweep(1,40,6),{clearRows:40,decodeRows:40});
 let previous=0;for(let i=0;i<=100;i++){const s=asciiSweep(i/100,60,7);assert(s.clearRows>=previous,'Resolved rows must never disappear during the downward reveal');assert(s.decodeRows>=s.clearRows);previous=s.clearRows;}
 assert.equal(pixelsToAscii(new Uint8ClampedArray([0,0,0,255,255,255,255,255,255,255,255,0]),' .:-=+*#%@'),' @ ','Transparent pixels must remain empty, not become false white content');
 console.log('ASCII raster and downward sweep: all checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
