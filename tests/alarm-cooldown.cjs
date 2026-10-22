const assert=require('node:assert/strict');
(async()=>{
 const {AlarmState}=await import('../src/Factorio.Desktop/Web/alarm-state.js');
 const alarm=(ids,active=true,session='world')=>({session,available:true,fresh:true,active,episodes:ids.map(id=>({id,active,surface:'nauvis',force:'player'}))});
 const s=new AlarmState();s.accept(alarm(['1']),1000);assert(s.view(1000).open);
 s.accept(alarm(['1','2']),4000);assert.equal(s.view(4000).episode.id,'1','An attack does not replace the open modal');
 assert(!s.view(11000).open,'The first modal keeps its original ten-second deadline');
 assert(!s.view(15999).open,'Cooldown lasts fifteen seconds from the previous opening');
 assert(s.view(16000).open);assert.equal(s.view(16000).episode.id,'2');
 s.dismiss();s.accept(alarm(['1','2','3']),16001);s.accept(alarm(['1','2','3','4']),17000);
 assert(!s.view(30999).open);assert(s.view(31000).open);assert.equal(s.view(31000).episode.id,'4','Suppressed attacks coalesce into the latest notification');
 s.dismiss();s.accept(alarm(['1','2','3','4']),50000);assert(!s.view(50000).open,'An ongoing episode never produces periodic duplicate windows');
 s.accept(alarm(['5']),50001);assert(s.view(50001).open);s.normal();s.accept(alarm(['6']),70000);assert(!s.view(70000).open);assert(!s.view(70000).pendingNotification);assert(s.view(70000).active);
 const ended=new AlarmState();ended.accept(alarm(['1']),0);ended.accept(alarm(['1','2']),2000);ended.accept(alarm(['1','2'],false),5000);assert(!ended.view(5000).active);assert(ended.view(15000).open);assert(!ended.view(15000).episode.active,'A brief ended episode can notify without an attack sound');
 console.log('Attack modal cooldown, coalescing and monotonic deadlines: all checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
