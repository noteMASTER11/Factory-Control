const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('D:/ChatGPT/Tools/FactorioLuaTest/node_modules/fengari');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/collector.lua'),'utf8');
const combat=fs.readFileSync(path.join(__dirname,'../mod/factory-telemetry/combat.lua'),'utf8');
const collector=['combat','spatial','native-map','space'].map(name=>'package.preload["'+name+'"]=function()\n'+fs.readFileSync(path.join(__dirname,'../mod/factory-telemetry/'+name+'.lua'),'utf8')+'\nend\n').join('')+fs.readFileSync(path.join(__dirname,'../mod/factory-telemetry/control.lua'),'utf8');
const cases=[
 ['Missing input diagnostics reuse existing inventory reads',`
  defines.entity_status.item_ingredient_shortage=2;defines.inventory.assembling_machine_input=2;defines.inventory.assembling_machine_output=3
  local e=make_entity(1,0);e.type='assembling-machine';e.name='assembling-machine-3';e.status=2;e.crafting_speed=1;e.fluidbox={}
  e.get_recipe=function()return {name='iron-gear-wheel',ingredients={{name='iron-plate',type='item',amount=2}},products={{name='iron-gear-wheel',type='item',amount=1}},energy=.5},{name='rare'}end
  entities_test={e};init_test();advance(360)
  local cell=snapshots.machines.data.diagnostics.cells[1];assert(cell.missing_ingredients[1].name=='iron-plate');assert(cell.missing_ingredients[1].quality=='rare')
 `],
 ['Discovery visits the player area before an empty or remote chunk iterator',`
  entities_test={make_entity(1,42)}
  game.players={{position={x=32000,y=-64000},surface=surface}}
  surface.get_chunks=function()return function()return nil end end
  init_test();advance(120)
  assert(snapshots.machines.data.sampled_entities==1,'player priority chunks must discover the factory before the global iterator')
  assert(stock('iron-plate')==42,'priority discovery must reach the existing sampler')
 `],
 ['Factorio 2.1 uses the relocated profiler and fluid storage API',`
  local e=make_entity(1,0);e.type='storage-tank';e.name='storage-tank';e.fluids_count=2
  e.get_fluid=function(i)if i==1 then return {name='water',amount=125}end;return {name='steam',amount=75}end
  setmetatable(e,{__index=function(_,key)if key=='fluidbox'then error('LuaEntity does not contain key fluidbox')end end})
  entities_test={e};init_test();advance(720)
  assert(stock('water')==125 and stock('steam')==75,'all fluid storages must be counted with the 2.1 API')
  assert(snapshots.status.data.game_version=='2.1.23','actual game version must be exported')
  assert(snapshots.status.data.mod_version=='0.4.1','actual mod version must be exported')
  assert(max_reads<=16,'2.1 must retain the entity budget')
 `,`
  script.active_mods.base='2.1.23';script.active_mods['factory-telemetry']='0.4.1'
  helpers.create_profiler=game.create_profiler;game.create_profiler=nil
  setmetatable(game,{__index=function(_,key)if key=='create_profiler'then error('LuaGameScript does not contain key create_profiler')end end})
 `],
 ['Factorio 2.0 retains fluidbox inventory support',`
  local e=make_entity(1,0);e.type='storage-tank';e.name='storage-tank';e.fluidbox={{name='water',amount=250}}
  entities_test={e};init_test();advance(360)
  assert(stock('water')==250,'2.0 fluidbox contents must still be collected')
 `],
 ['Combat events use bounded exports and rebuilding updates pending losses',`
  local e=make_entity(1,0);e.type='wall';e.name='stone-wall';e.quality={name='normal'};e.prototype={items_to_place_this={{name='stone-wall',count=1}}};e.force.is_enemy=function(f)return f.name=='enemy'end
  entities_test={e};init_test();local enemy={name='enemy'}
  local before=#serialized_test
  for i=1,100 do events[defines.events.on_entity_damaged]({entity=e,force=enemy,final_damage_amount=1})end
  assert(#serialized_test==before,'damage events must not serialize or write files')
  events[defines.events.on_entity_died]({entity=e,force=enemy});advance(120)
  assert(snapshots.combat.data.episodes[1].destroyed==1,'registered death event must reach telemetry')
  events[defines.events.on_robot_built_entity]({entity=e});advance(120)
  assert(snapshots.combat.data.episodes[1].losses[1].pending==0,'registered robot construction must clear reconstruction cost')
  advance(900);assert(not snapshots.combat.data.episodes[1].active,'quiet attacks must end without scanning entities')
 `],
 ['Large requester telemetry is streamed in bounded pages and committed only after completion',`
  for i=1,2000 do entities_test[i]=make_requester(i)end
  init_test();advance(420)
  assert(snapshots.logistics,'logistics summary must still be published')
  assert(#(snapshots.logistics.data.requesters or {})==0,'fast logistics snapshot must never serialize the full requester list')
  local ref=snapshots.logistics.data.requesters_ref
  assert(ref and ref.row_count==2000,'completed requester page set must be referenced')
  local total=0;local ids={}
  for page=1,ref.page_count do
   local name='factory-telemetry/requesters/'..ref.bank..'/'..string.format('%05d',page)..'.json'
   local doc=files_test[name]
   assert(doc and doc.revision==ref.revision,'all referenced pages must have the committed revision')
   assert(#doc.rows<=16,'a page must remain bounded')
   for _,row in ipairs(doc.rows)do
    assert(not ids[row.unit_number],'requester must not be duplicated across pages');ids[row.unit_number]=true
    assert(row.sections[1].filters[1].min==10,'request filter details must survive paging')
   end
   total=total+#doc.rows
  end
  assert(total==2000,'all requester details must survive paging')
  for _,event in ipairs(serialized_test)do
   local d=event.document
   assert(not(d.data and d.data.requesters and #d.data.requesters>16),'no serialization may contain the monolithic requester list')
  end
 `],
 ['Rolling inventory adds, replaces and removes contributions exactly',`
  entities_test={make_entity(1,10),make_entity(2,20),make_entity(3,5)}
  init_test();advance(360)
  assert(snapshots.machines.data.collection_mode=='rolling','rolling snapshots required')
  assert(stock('iron-plate')==35,'initial inventory is 35')
  entities_test[1].amount=4;entities_test[2].valid=false
  advance(240)
  assert(stock('iron-plate')==9,'updated inventory must replace old count and remove destroyed chest')
  assert(group_count()==2,'destroyed entity must leave machine counters')
  entities_test[1].amount=0;advance(240)
  assert(stock('iron-plate')==5,'empty inventory must remove previous contribution')
  entities_test[1].name='wooden-chest';entities_test[1].status=99;entities_test[1].amount=7
  advance(240)
  assert(stock('iron-plate')==12,'changing status and group must not duplicate stock')
  assert(group_count()==2,'changing group must not duplicate machines')
  local changed=false
  for _,g in ipairs(snapshots.machines.data.groups)do if g.name=='wooden-chest' then changed=g.count==1 end end
  assert(changed,'updated prototype/status group must be reflected')
  for _,s in ipairs(snapshots.machines.data.stocks)do assert(s.count>=0,'negative stock')end
 `],
 ['An unreadable entity does not retain an apparently current old contribution',`
  entities_test={make_entity(1,10),make_entity(2,5)}
  init_test();advance(360)
  log=function()end
  entities_test[1].get_inventory=function()error('entity no longer readable')end
  advance(240)
  assert(stock('iron-plate')==5,'failed measurement must discard the previous contribution')
  assert(snapshots.machines.data.inventory_complete==false,'failed measurement must make coverage partial')
 `],
 ['Partial sweep is published with explicit coverage and a bounded per-tick budget',`
  for i=1,4000 do entities_test[i]=make_entity(i,1)end
  init_test();advance(120)
  assert(snapshots.machines,'must publish before the entire 4000-object sweep completes')
  assert(snapshots.machines.data.inventory_complete==false,'partial inventory cannot be marked complete')
  assert(snapshots.machines.data.sampled_entities<4000,'coverage must describe the partial sweep')
  assert(max_reads<=16,'inventory reads must stay within the per-tick budget')
  advance(360)
  assert(snapshots.machines.data.inventory_complete==true,'complete after a full bounded sweep')
  assert(stock('iron-plate')==4000,'every entity counted exactly once')
  assert(snapshots.machines.data.oldest_sample_tick<=snapshots.machines.tick,'sample age must be exposed')
 `]
];
for(const [name,test,setup='']of cases){
 const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
 const status=lauxlib.luaL_dostring(L,to_luastring(fixture+'\n'+setup+'\n'+collector+'\n'+test));
 const error=status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1));lua.lua_close(L);
 assert.equal(status,lua.LUA_OK,`${name}: ${error}`);console.log('PASS '+name);
}
