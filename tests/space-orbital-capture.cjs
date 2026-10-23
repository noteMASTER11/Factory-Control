const fs=require('node:fs'),assert=require('node:assert/strict');
const root=process.env.FC_SPACE_CAPTURE;assert(root,'Set FC_SPACE_CAPTURE to the isolated probe directory');
const read=file=>JSON.parse(fs.readFileSync(root+'/'+file,'utf8'));
const probe=read('script-output/space-orbital-probe-result.json'),logistics=read('script-output/factory-telemetry/logistics.json'),status=read('script-output/factory-telemetry/status.json'),space=logistics.data.space;
assert.deepEqual(status.data.errors,{});
const count=(items,name,quality)=>items.filter(i=>i.name===name&&i.quality===quality).reduce((sum,i)=>sum+i.count,0),expected=[['iron-plate','normal',43],['iron-plate','rare',9],['copper-plate','rare',17]];
for(const [name,quality,amount]of expected){
 assert.equal(count(probe.items,name,quality),amount);
 assert.equal(count(probe.after,name,quality)-count(probe.before,name,quality),amount,'mixed payload reaches the actual target hub');
 const received=space.flow_rates.find(r=>r.force==='factory-control-probe'&&r.surface===probe.destination&&r.name===name&&r.quality===quality);
 assert.equal(received?.imported,amount,'collector preserves each item and quality');
 const sent=space.flow_rates.find(r=>r.force==='factory-control-probe'&&r.surface===probe.origin&&r.name===name&&r.quality===quality);
 assert.equal(sent?.exported,amount+(name==='iron-plate'&&quality==='normal'?123:0));
}
assert(!space.flow_rates.some(r=>r.force==='factory-control-probe'&&r.surface==='nauvis'&&(r.name==='copper-plate'||r.quality==='rare')),'an orbital transfer does not become a planetary import');
if(status.data.mod_version==='0.6.1')assert(space.platforms.every(p=>p.active_route?.observed),'the full active schedule is read on real platforms');
const evidence={passed:true,source:'isolated save copy; original game untouched',capture:root,collector:status.data.mod_version,origin:probe.origin,destination:probe.destination,items:probe.items,errors:status.data.errors,checks:['actual mixed cargo delivery between platform hubs','quantities and qualities preserved in independent import/export counters','no false planetary imports','full active schedule metadata when supported']};
fs.writeFileSync('docs/evidence/space-orbital-capture.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
