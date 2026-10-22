const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const module=await import('data:text/javascript;base64,'+fs.readFileSync('D:/ChatGPT/Projects/FactorioMonitor/src/Factorio.Desktop/Web/overview-model.js').toString('base64'));
 const now=Date.now(),scope={surface:'nauvis',force:'player'},row={...scope,name:'iron-plate',kind:'item',quality:'normal'};
 const wrap=data=>({written_at:new Date(now).toISOString(),payload:{coverage:{discovery_complete:true},data}});
 const topics={production:wrap({rows:[{...row,produced_per_minute:100,consumed_per_minute:120,produced_per_minute_5s:80,produced_per_minute_10m:100},{...row,surface:'vulcanus',produced_per_minute:10000,consumed_per_minute:10000}]}),machines:wrap({collection_mode:'rolling',inventory_complete:true,sample_window_ticks:600,stocks:[{...row,count:200},{...row,quality:'legendary',count:5000},{...row,force:'another',count:5000}],groups:[{...scope,name:'electric-furnace',type:'furnace',status:'working',count:12},{...scope,name:'electric-furnace',type:'furnace',status:'full_output',count:8}]}),power:wrap({networks:[{...scope,production_watts:100,consumption_watts:90},{...scope,surface:'vulcanus',production_watts:9999,consumption_watts:9999}],accumulators:[{...scope,joules:20,capacity_joules:40}]})};
 const result=module.summarize(topics,scope,now);
 assert.equal(result.materials.length,1);assert.equal(result.materials[0].stock,200);assert.equal(result.materials[0].balance,-20);assert.equal(result.materials[0].emptyMinutes,10);
 assert(Math.abs(result.materials[0].change+.2)<1e-12);assert.equal(result.power.production,100);assert.equal(result.power.percent,.5);
 assert.equal(result.groups[0].total,20);assert.equal(result.groups[0].working,12);assert.equal(result.groups[0].stopped,8);assert.equal(result.groups[0].reason,'full_output');
 topics.machines.payload.data.inventory_complete=false;
 assert.equal(module.summarize(topics,scope,now).materials[0].emptyMinutes,null,'Partial sweep must not produce a depletion estimate');
 topics.machines.payload.data.inventory_complete=true;
 topics.machines.written_at=new Date(now-200000).toISOString();
 assert.equal(module.summarize(topics,scope,now).materials[0].stock,null,'Stale inventory must not be presented as current');
 assert.equal(module.scopesFrom(topics).length,2);
 assert.deepEqual(module.summarize({},scope,now).materials,[]);
 console.log('Overview calculations: all checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
