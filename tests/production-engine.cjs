const assert=require('node:assert/strict');
(async()=>{
 const {TelemetryEngine}=await import('../src/Factorio.Desktop/Web/telemetry-engine.js');
 const e=new TelemetryEngine(),scope={surface:'nauvis',force:'player'};
 const env=(topic,tick,data)=>({topic,tick,written_at:new Date().toISOString(),payload:{coverage:{discovery_complete:true},data}});
 const packet=(tick,session='a')=>({status:{session_id:session,revision:tick,topics:{production:env('production',tick,{rows:[{...scope,name:'iron-plate',kind:'item',quality:'normal',produced_per_minute:50,consumed_per_minute:100}]}),machines:env('machines',tick,{collection_mode:'rolling',inventory_complete:true,stocks:[{...scope,name:'iron-plate',kind:'item',quality:'normal',count:1000}],groups:[]})}},sessions:{processes:[]}});
 e.accept(packet(100));e.select('production');
 assert.equal(e.frame().view,'production');assert.equal(e.frame().model.selected.stock,1000);assert.equal(e.frame().model.selected.emptyMinutes,20);
 e.select('energy');const before=e.describe();e.accept(packet(200));e.accept(packet(200));
 assert.equal(e.describe().productionHistorySamples,2);assert.equal(e.describe().stockHistorySamples,2);
 assert(e.describe().models.production>before.models.production,'Hidden production models must keep advancing');assert(!JSON.stringify(e.frame()).includes('emptyMinutes'),'Hidden model must not be sent');
 for(let i=1;i<=1000;i++)e.accept(packet(200+i*120));
 assert(e.describe().productionHistorySamples<=900);assert(e.describe().stockHistorySamples<=450);
 e.accept(packet(1,'b'));assert.equal(e.describe().productionHistorySamples,1);assert.equal(e.describe().stockHistorySamples,1);
 const p=packet(2,'b');p.productionHistory=[{session_id:'a',tick:500,payload:{data:{rows:[]}}}];e.accept(p);assert.equal(e.describe().productionHistorySamples,2,'Bootstrap from an old session must be ignored');
 console.log('Production background history: all checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
