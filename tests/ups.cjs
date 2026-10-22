const assert=require('node:assert/strict');
(async()=>{const {UpsEstimator}=await import('../src/Factorio.Desktop/Web/ups.js');const e=new UpsEstimator();const at=Date.now();const point=(tick,ms)=>({tick,written_at:new Date(at+ms).toISOString()});
 e.add(point(100,0));assert.equal(e.value(at),null);
 e.add(point(220,2000));assert.equal(e.value(at+2000),60);e.add(point(220,2000));assert.equal(e.samples.length,2);
 e.add(point(700,10000));assert.equal(e.value(at+10000),60);assert.equal(e.value(at+26000),null,'Stale source must not claim a live UPS');
 e.clear();e.add(point(0,0));e.add(point(60,2000));assert.equal(e.value(at+2000),30,'UPS must be measured, not hardcoded to 60');
 e.clear();e.add(point(0,0));e.add(point(4000,2000));assert.equal(e.value(at+2000),2000,'Accelerated sessions must not be clamped');
 e.add(point(1,3000));assert.equal(e.value(at+3000),null,'A counter restart must reset the estimate');
 console.log('UPS estimation: all checks passed');})();
