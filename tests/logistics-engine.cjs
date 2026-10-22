const assert=require('node:assert/strict');
(async()=>{const {TelemetryEngine}=await import('../src/Factorio.Desktop/Web/telemetry-engine.js');const e=new TelemetryEngine();
 const packet=(tick,session='a')=>({status:{session_id:session,revision:tick,topics:{logistics:{tick,written_at:new Date().toISOString(),payload:{coverage:{discovery_complete:true},data:{networks:[{surface:'nauvis',force:'player',id:1,logistic_total:100,logistic_available:40}],trains:[],requests:[],requesters_available:true}}}}},sessions:{processes:[]}});
 e.accept(packet(100));e.select('logistics');assert.equal(e.frame().view,'logistics');assert.equal(e.frame().model.summary.logisticBusy,60,'Logistics-only worlds must create a usable scope');
 e.select('energy');const before=e.describe().models.logistics;e.accept(packet(400));e.accept(packet(400));assert.equal(e.describe().logisticsHistorySamples,2);assert(e.describe().models.logistics>before);assert(!JSON.stringify(e.frame()).includes('logisticBusy'),'Inactive logistics model must not be sent');
 for(let i=1;i<=500;i++)e.accept(packet(400+i*300));assert(e.describe().logisticsHistorySamples<=450);
 e.accept(packet(1,'b'));assert.equal(e.describe().logisticsHistorySamples,1);console.log('Logistics background processing: all checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
