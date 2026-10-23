storage={};snapshots={};entities_test={};max_reads=0;reads=0;files_test={};serialized_test={}
log=function(message)error('Unexpected collector error: '..message)end
local events={};local init
local function copy(value)
 if type(value)~='table'then return value end
 local out={};for k,v in pairs(value)do out[k]=copy(v)end;return out
end
defines={events=setmetatable({},{__index=function(t,k)local n=0;for _ in pairs(t)do n=n+1 end;rawset(t,k,n+1);return n+1 end}),entity_status={working=1,item_ingredient_shortage=2},train_state={},inventory={chest=1}}
script={active_mods={base='2.0.77'},on_init=function(f)init=f end,on_configuration_changed=function()end,on_event=function(id,f)if type(id)=='table'then for _,i in ipairs(id)do events[i]=f end else events[id]=f end end}
local last_encoded
helpers={table_to_json=function(doc)last_encoded=copy(doc);if doc.topic then snapshots[doc.topic]=last_encoded end;serialized_test[#serialized_test+1]={tick=game.tick,document=last_encoded};return '{}' end,write_file=function(path)files_test[path]=last_encoded end}
remote={add_interface=function()end};commands={add_command=function()end}
local force={name='player',index=1,research_progress=0,research_queue={},logistic_networks={}}
force.is_chunk_charted=function()return true end
force.get_item_production_statistics=function()return {input_counts={},output_counts={}}end
force.get_fluid_production_statistics=force.get_item_production_statistics
local surface={name='nauvis',index=1,valid=true}
surface.get_chunks=function()local done=false;return function()if done then return nil end;done=true;return {x=0,y=0}end end
surface.is_chunk_generated=function()return true end
surface.find_entities_filtered=function(filter)if filter.type then return {}end;return entities_test end
local function profiler()return setmetatable({stop=function()end,add=function()end,divide=function()end},{__tostring=function()return '0 ms'end})end
game={tick=0,speed=1,default_map_gen_settings={seed=1},surfaces={surface},forces={force},players={},connected_players={},create_profiler=profiler,is_multiplayer=function()return false end,train_manager={get_trains=function()return {}end}}
function make_entity(id,amount)
 local e={valid=true,unit_number=id,type='container',name='steel-chest',status=1,surface=surface,force=force,position={x=id,y=0},amount=amount}
 e.get_inventory=function()reads=reads+1;return {valid=true,get_contents=function()if e.amount==0 then return {}end;return {{name='iron-plate',quality='normal',count=e.amount}}end}end
 return e
end
function make_requester(id)
 local e=make_entity(id,1);e.type='logistic-container';e.name='requester-chest'
 e.get_logistic_point=function()return {{sections={{active=true,multiplier=1,filters={{value={name='iron-plate',quality='normal'},min=10}}}},targeted_items_deliver={}}}end
 return e
end
function init_test()init()end
function advance(ticks)
 for _=1,ticks do game.tick=game.tick+1;reads=0;events[defines.events.on_tick]();max_reads=math.max(max_reads,reads)end
end
function stock(name)local total=0;for _,s in ipairs(snapshots.machines.data.stocks)do if s.name==name then total=total+s.count end end;return total end
function group_count()local total=0;for _,g in ipairs(snapshots.machines.data.groups)do total=total+g.count end;return total end
