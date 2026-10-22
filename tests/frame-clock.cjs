const assert=require('node:assert/strict');
(async()=>{
  const {FrameBudget}=await import('../src/Factorio.Desktop/Web/frame-clock.js');
  const gate=new FrameBudget(30);let count=0;
  for(let t=0;t<1000;t++)if(gate.take(t))count++;
  assert.equal(count,30,'At most 30 visual commits in one second despite 1000 attempts');
  assert.equal(gate.take(10000),true);assert.equal(gate.take(10000),false,'No catch-up burst after suspension');
  assert.equal(gate.take(10001),false);
  console.log('Frame clock: all checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
