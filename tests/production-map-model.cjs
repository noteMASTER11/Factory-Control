const assert=require('node:assert/strict');
(async()=>{
 const {productionMapModel}=await import('../src/Factorio.Desktop/Web/production-map-model.js');
 const scope={id:'["nauvis","player"]',surface:'nauvis',force:'player'},resource={id:'item|iron-plate|normal',name:'iron-plate',kind:'item',quality:'normal'};
 const group={surface:'nauvis',force:'player',name:'electric-furnace',recipe:'iron-plate',status:'working',count:120,products:[{name:'iron-plate',type:'item'}],ingredients:[{name:'iron-ore',type:'item'}],examples:[{x:-1,y:2}]};
 const consumer={...group,name:'assembling-machine-3',recipe:'iron-gear-wheel',count:20,products:[{name:'iron-gear-wheel',type:'item'}],ingredients:[{name:'iron-plate',type:'item'}],examples:[{x:96,y:64}]};
 const groups=[group,consumer,{...group,surface:'vulcanus',examples:[{x:9999,y:9999}]},{...group,force:'enemy'}, {...group,name:'no-location',examples:[{x:NaN,y:2}]}];
 let map=productionMapModel(groups,scope,resource,{});
 assert.equal(map.issues.length,3);assert.equal(map.coordinateCount,2);assert.equal(map.totalMachines,260);
 assert.equal(map.issues[0].count,1,'a sample coordinate must not be presented as all 120 machines');
 assert.equal(map.issues[0].bounds.left,-32);assert.equal(map.issues[0].bounds.right,0);
 assert.equal(map.issues[0].role,'producer');assert.equal(map.issues[1].role,'consumer');assert.equal(map.issues[2].located,false);
 assert(map.issues.every(r=>r.surface==='nauvis'&&r.force==='player'));
 map=productionMapModel(groups,scope,resource,{mapRole:'consumers'});assert.equal(map.issues.length,1);assert.equal(map.selected.name,'assembling-machine-3');
 map=productionMapModel(groups,scope,resource,{mapSelected:'old-save'});assert.equal(map.selected.id,map.issues[0].id);
 const cycle={...group,ingredients:[{name:'iron-plate',type:'item'}]};map=productionMapModel([cycle],scope,resource,{});assert.equal(map.issues.length,1);assert.equal(map.issues[0].role,'both');
 map=productionMapModel(groups,scope,null,{});assert.equal(map.issues.length,3,'all resources retains every scoped production group');assert.equal(map.allResources,true);
 console.log('Production map: scoped recipe locations, sample coverage and role filters pass');
})().catch(e=>{console.error(e);process.exitCode=1;});
