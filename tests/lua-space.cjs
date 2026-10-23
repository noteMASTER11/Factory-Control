const fs=require('node:fs'),assert=require('node:assert/strict');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('D:/ChatGPT/Tools/FactorioLuaTest/node_modules/fengari');
const source=fs.existsSync('mod/factory-telemetry/space.lua')?fs.readFileSync('mod/factory-telemetry/space.lua','utf8'):'return {}';
const test=`local Space=(function() ${source} end)()
defines={inventory={hub_main=1,rocket_silo_rocket=2,cargo_landing_pad_main=3,cargo_unit=4},space_platform_state={on_the_path=1},rocket_silo_status={rocket_ready=1}}
game={tick=0,surfaces={}}
local force={name='Newbies',platforms={}}
local planet={name='gleba',index=1};local other={name='nauvis',index=2};game.surfaces.gleba=planet;game.surfaces.nauvis=other
local slots=0;local inv=setmetatable({valid=true},{__len=function()return 200 end,__index=function(_,i)if type(i)=='number'then slots=slots+1;return {valid_for_read=true,name='agricultural-science-pack',count=10,quality={name='rare'},spoil_tick=9000,spoil_percent=.25}end end})
local hub={valid=true,type='space-platform-hub',unit_number=10,surface={name='ship'},force=force,get_inventory=function()return inv end,status=1}
local platform={valid=true,index=1,name='Gleba supply',force=force,surface=hub.surface,hub=hub,state=1,paused=false,speed=100,distance=.4,space_connection={name='gleba-nauvis',from={name='gleba'},to={name='nauvis'}},last_visited_space_location={name='gleba'},schedule={current=1,records={{station='nauvis',allows_unloading=true},{station='gleba'}}}}
force.platforms={platform};local space=Space.new(nil,0)
for tick=1,500 do game.tick=tick;local before=slots;space:step(tick,{force});assert(slots-before<=16,'snapshot slot reads bounded per tick')end
local snap=space:snapshot(500);assert(#snap.platforms==1);assert(snap.platforms[1].items[1].quality=='rare');assert(snap.platforms[1].items[1].count==2000);assert(snap.platforms[1].items[1].spoil_tick_min==9000)
platform.get_schedule=function()return {valid=true,current=2,interrupt_count=1,tick_of_last_schedule_change=400,ticks_in_station=12,get_record=function(position)assert(position.schedule_index==2);return {station='fulgora',temporary=true,allows_unloading=false}end}end
space:start(hub,platform,501);local active=space:snapshot(501).platforms[1].active_route
assert(active and active.observed and active.station=='fulgora' and active.temporary and active.changed_tick==400,'full active schedule includes the interrupt destination')
local origin={valid=true,surface=planet,force=force,type='rocket-silo',unit_number=42}
local cargoInv={{valid_for_read=true,name='iron-plate',count=100,quality={name='normal'},spoil_tick=0},{valid_for_read=true,name='agricultural-science-pack',count=50,quality={name='rare'},spoil_tick=9000,spoil_percent=.25}}
local pod={valid=true,unit_number=55,force=force,cargo_pod_origin=origin,cargo_pod_destination={station={valid=true,surface=other,force=force}},get_inventory=function()return cargoInv end,surface=planet}
space:pod('departed',pod,600);space:pod('departed',pod,600);pod.surface=other;space:pod('landing',pod,700);space:pod('delivered',pod,701);space:pod('delivered',pod,702)
snap=space:snapshot(720);assert(#snap.events==2,'dispatch and delivery deduplicated');assert(snap.events[1].kind=='export');assert(snap.events[2].kind=='import');assert(snap.events[2].items[1].quality=='rare');assert(snap.events[2].items[1].count==50);assert(snap.events[2].surface=='nauvis');assert(snap.events[1].surface=='gleba')
local restored=Space.new(space.state,720);snap=restored:snapshot(720);assert(#snap.events==2,'journal survives load');assert(snap.started_tick==0)
-- The same event path must preserve a mixed rocket and a platform-to-platform leg.
local transfers=Space.new(nil,0)
local mixed={{name='iron-plate',quality='normal',count=123},{name='copper-plate',quality='rare',count=17},{name='iron-plate',quality='rare',count=9}}
local mixedInv={get_contents=function()return mixed end}
local a,b={valid=true,name='platform-A'},{valid=true,name='platform-B'}
local aHub={valid=true,type='space-platform-hub',surface=a,force=force}
local bHub={valid=true,type='space-platform-hub',surface=b,force=force}
local mixedPod={valid=true,type='cargo-pod',unit_number=800,force=force,cargo_pod_origin=origin,cargo_pod_destination={station=aHub},get_inventory=function()return mixedInv end,surface=planet}
transfers:pod('departed',mixedPod,100);mixedPod.surface=a;transfers:pod('landing',mixedPod,150);transfers:pod('delivered',mixedPod,151)
local orbitalPod={valid=true,type='cargo-pod',unit_number=801,force=force,cargo_pod_origin=aHub,cargo_pod_destination={station=bHub},get_inventory=function()return mixedInv end,surface=a}
transfers:pod('launching',orbitalPod,200);transfers:pod('departed',orbitalPod,210)
local movingCargo=transfers:snapshot(220).shipments[1];assert(movingCargo.origin=='platform-A' and movingCargo.destination=='platform-B');assert(#movingCargo.items==3,'mixed payload is not reduced to the primary item')
orbitalPod.surface=b;transfers:pod('landing',orbitalPod,250);transfers:pod('delivered',orbitalPod,251);transfers:pod('delivered',orbitalPod,252)
local events=transfers:snapshot(260).events;assert(#events==4,'each leg exports and imports once');assert(events[3].surface=='platform-A' and events[4].surface=='platform-B');assert(events[4].destination~='nauvis','orbital transfer is not a planetary import')
for tick=3600,3603 do transfers:step(tick,{})end
local rates=transfers:snapshot(3603).flow_rates;local counts={};for _,r in ipairs(rates)do counts[r.surface..'|'..r.name..'|'..r.quality]=r end
assert(counts['platform-B|iron-plate|normal'].imported==123);assert(counts['platform-A|copper-plate|rare'].exported==17);assert(counts['platform-B|iron-plate|rare'].imported==9)
local loading={id=99,type='rocket-silo',target_platform=1,weight_limit=1000,items={{name='iron-plate',quality='normal'}},weight=100}
space:estimate(loading,1000);loading.weight=200;space:estimate(loading,1120);assert(not loading.loading_eta_seconds)
loading.weight=300;space:estimate(loading,1240);assert(math.abs(loading.loading_eta_seconds-14)<.01,'loading ETA follows measured mass delta')
space:estimate(loading,1360);assert(loading.loading_eta_seconds,'short robot delivery gaps retain the measured average');space:estimate(loading,1960);assert(not loading.loading_eta_seconds,'a sustained stall removes the countdown')
loading.weight=50;space:estimate(loading,1480);assert(not loading.loading_eta_seconds,'launch/removal resets estimate')
local moving={id=3,type='space-platform-hub',connection={name='a-b',from='gleba',to='nauvis'},previous_location='gleba',distance=.2,speed=100}
space:estimate(moving,1000);moving.distance=.3;space:estimate(moving,1300);moving.distance=.4;space:estimate(moving,1600);assert(math.abs(moving.flight_eta_seconds-30)<.01)
moving.paused=true;moving.flight_eta_seconds=nil;space:estimate(moving,1900);assert(not moving.flight_eta_seconds)
moving.paused=false;moving.active_route={station='nauvis',changed_tick=1901,index=1};moving.distance=.5;moving.flight_eta_seconds=nil;space:estimate(moving,2200);assert(not moving.flight_eta_seconds,'route changes reset old flight estimates')
local shrinking=Space.new(nil,0);local size=200;local shrinking_inv=setmetatable({valid=true},{__len=function()return size end,__index=function(_,index)if type(index)=='number'then assert(index<=size,'inventory may shrink after a rocket launch');return {valid_for_read=false}end end})
local shrinking_hub={valid=true,type='space-platform-hub',unit_number=100,surface=hub.surface,force=force,get_inventory=function()return shrinking_inv end}
shrinking:start(shrinking_hub,platform,1);shrinking:step(3,{});size=1;shrinking:step(5,{})
local crowded=Space.new(nil,0);for i=1,520 do crowded:track{valid=true,type='rocket-silo',unit_number=i}end
crowded:track{valid=true,type='cargo-landing-pad',unit_number=1000};assert(crowded.port_ids[1000],'landing pad requests must survive a large silo census');assert(#crowded.ports<=512)
for i=56,700 do pod.unit_number=i;space:pod('departed',pod,800+i)end
snap=space:snapshot(2000);assert(#snap.events<=512,'bounded journal');assert(snap.dropped_events>0,'loss of history is explicit')
space:step(4200,{force});snap=space:snapshot(4200);assert(#snap.flow_rates==4,'throughput survives journal rollover');local delivered_rate;for _,r in ipairs(snap.flow_rates)do if r.surface=='nauvis' and r.quality=='rare'then delivered_rate=r end end;assert(delivered_rate.imported==50,'independent bucket counters retain delivery even after its journal entry was overwritten')
`;
const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);const status=lauxlib.luaL_dostring(L,to_luastring(test)),error=status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1));lua.lua_close(L);assert.equal(status,lua.LUA_OK,error);console.log('Space collector: bounded inventory sampling, mixed quality/spoilage, events and persistence pass');
