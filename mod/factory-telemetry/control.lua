-- All world access is scheduled here. remote/MCP consumers only read finished JSON.
local tracked = {}
local api_major,api_minor=string.match(script.active_mods.base,"^(%d+)%.(%d+)")
local modern_api=tonumber(api_major)>2 or (tonumber(api_major)==2 and tonumber(api_minor)>=1)
local function create_profiler(stopped)
  if modern_api then return helpers.create_profiler(stopped) end
  return game.create_profiler(stopped)
end
for _,n in ipairs({"assembling-machine","furnace","lab","mining-drill","boiler","generator","solar-panel","reactor","accumulator","electric-pole","roboport","container","logistic-container","storage-tank","cargo-wagon","fluid-wagon","locomotive","train-stop","rocket-silo","cargo-landing-pad"}) do tracked[n]=true end
local states,train_states={},{}
for k,v in pairs(defines.entity_status) do states[v]=k end
for k,v in pairs(defines.train_state) do train_states[v]=k end
local entities,seen,chunks,chunk_keys={},{},{},{}
local surfaces,forces,scan_surface,iterator={}, {},1,nil
local scan_complete=false
local scan_visited,scan_charted=0,0
local cursor,work,latest=1,nil,{machines={},stocks={},accumulators={},poles={},generators={},requests={}}
local flow_job,logistic_job,power_job=nil,nil,nil
local last_flow,last_logistics,last_research,last_power,last_resources=0,0,0,0,0
local encoded,errors={},{}
local loaded=false
local profile,profile_ticks=nil,0
local resource_cursor=1
local source_kind="game"
local rolling={groups={},stocks={},records={},sampled=0,buckets={},queue={},head=1,last_bucket=nil,last_emit=0}
local ENTITY_BUDGET=16
local REQUEST_PAGE_ROWS=16
local request_export,request_ref,request_started=nil,nil,nil
local logistics_current=nil
local Combat=require("combat")
local Spatial=require("spatial")
local NativeMap=require("native-map")
local Space=require("space")
local space=nil
local combat=nil
local spatial=Spatial.new()
local native_map=nil
local priority_chunks,priority_cursor,scanned={},1,{}

local function problem(where,err)
  local x=errors[where] or {count=0}; x.count=x.count+1; x.last=tostring(err); errors[where]=x
  if x.count==1 then log("factory-telemetry "..where..": "..x.last) end
end
local function guarded(where,fn)
  local ok,err=pcall(fn); if not ok then problem(where,err) end
  return ok
end
local function add_entity(e)
  if native_map and e and e.valid and e.type=='radar' and e.force.name~='enemy' and e.force.name~='neutral' then native_map:track(e)end
  if e and e.valid and tracked[e.type] and e.unit_number and not seen[e.unit_number] then
    seen[e.unit_number]=true; entities[#entities+1]={entity=e,id=e.unit_number}
    if native_map then native_map:track(e)end
    if space then space:track(e)end
  end
end
local function boot()
  if loaded then return end
  storage.factory_telemetry=storage.factory_telemetry or {world_id=tostring(game.default_map_gen_settings.seed)..":"..tostring(game.tick),load=0}
  storage.factory_telemetry.load=storage.factory_telemetry.load+1
  native_map=NativeMap.new(storage.factory_telemetry.world_id..":"..storage.factory_telemetry.load)
  combat=Combat.new(storage.factory_telemetry.combat);storage.factory_telemetry.combat=combat.state
  space=Space.new(storage.factory_telemetry.space,game.tick);storage.factory_telemetry.space=space.state
  for _,s in pairs(game.surfaces) do surfaces[#surfaces+1]=s end
  for _,f in pairs(game.forces) do if f.name~="enemy" and f.name~="neutral" then forces[#forces+1]=f end end
  -- Interleave known factory centres across planets before walking distant terrain.
  local seeds,seeded={},{}
  local function seed(s,position,player)
    local x,y=math.floor(position.x/32),math.floor(position.y/32);local key=s.index..':'..x..':'..y
    if not seeded[key] and #seeds<128 then seeded[key]=true;seeds[#seeds+1]={surface=s,x=x,y=y,player=player}end
  end
  for _,p in pairs(game.players)do seed(p.surface,p.position,true)end
  for _,f in ipairs(forces)do for _,networks in pairs(f.logistic_networks)do
    for _,network in pairs(networks)do
      if #seeds>=128 then break end
      if network.valid then local cells=network.cells;local owner=cells[1] and cells[1].owner
        if owner and owner.valid then seed(owner.surface,owner.position,false);break end
      end
    end
  end end
  if #seeds==0 then for _,s in ipairs(surfaces)do seed(s,{x=0,y=0},false)end end
  local function ring(point,radius)
    for dx=-radius,radius do for dy=-radius,radius do if math.abs(dx)==radius or math.abs(dy)==radius then priority_chunks[#priority_chunks+1]={surface=point.surface,x=point.x+dx,y=point.y+dy}end end end
  end
  for radius=0,4 do for _,point in ipairs(seeds)do ring(point,radius)end end
  for radius=5,12 do for _,point in ipairs(seeds)do if point.player then ring(point,radius)end end end
  profile=create_profiler(true)
  loaded=true
end
local function coverage()
  return {discovery_complete=scan_complete,generated_chunks_visited=scan_visited,charted_chunks_scanned=scan_charted,indexed_entities=#entities,resource_chunks=#chunks,scope="charted terrain; player-force entities; inventories exclude belts, inserter hands, pipes and player inventories"}
end
local function emit(topic,data)
  local doc={schema_version=1,topic=topic,session_id=storage.factory_telemetry.world_id..":"..storage.factory_telemetry.load,tick=game.tick,game_speed=game.speed,coverage=coverage(),data=data}
  encoded[topic]=helpers.table_to_json(doc)
  helpers.write_file("factory-telemetry/"..topic..".json",encoded[topic],false,game.is_multiplayer() and 0 or nil)
end
local function emit_logistics()
  if not logistics_current then return end
  local data=logistics_current
  data.requester_count=#latest.requests
  data.requesters_ref=request_ref
  data.requesters_available=request_ref~=nil
  data.space=space:snapshot(game.tick)
  emit("logistics",data)
end
local function request_export_step()
  if not request_export then
    if not latest.sample_end_tick or request_started==latest.sample_end_tick then return end
    request_started=latest.sample_end_tick
    request_export={rows=latest.requests,cursor=1,page=0,revision=request_started,bank=request_ref and (request_ref.bank=="a" and "b" or "a") or "a",
      sample_start_tick=latest.sample_start_tick,sample_end_tick=latest.sample_end_tick}
  end
  local job=request_export
  if job.cursor<=#job.rows then
    local rows={}
    for _=1,REQUEST_PAGE_ROWS do local row=job.rows[job.cursor];if not row then break end;rows[#rows+1]=row;job.cursor=job.cursor+1 end
    job.page=job.page+1
    local doc={schema_version=1,topic="requesters_page",session_id=storage.factory_telemetry.world_id..":"..storage.factory_telemetry.load,revision=job.revision,index=job.page,rows=rows}
    helpers.write_file("factory-telemetry/requesters/"..job.bank.."/"..string.format("%05d",job.page)..".json",helpers.table_to_json(doc),false,game.is_multiplayer() and 0 or nil)
  end
  if job.cursor>#job.rows then
    request_ref={schema_version=1,bank=job.bank,revision=job.revision,page_count=job.page,row_count=#job.rows,sample_start_tick=job.sample_start_tick,sample_end_tick=job.sample_end_tick}
    request_export=nil
    -- Publish the new reference before the previous bank can be reused.
    emit_logistics()
  end
end
local function scan_step()
  if scan_complete then return end
  for _=1,4 do
    local first=priority_chunks[priority_cursor]
    local s=first and first.surface or surfaces[scan_surface]
    if not s then scan_complete=true; return end
    local c
    if first then c=first;priority_cursor=priority_cursor+1 else iterator=iterator or s.get_chunks();c=iterator() end
    if not c then scan_surface=scan_surface+1; iterator=nil
    else
      scan_visited=scan_visited+1
      local scan_key=s.index..":"..c.x..":"..c.y
      local charted=false
      for _,f in ipairs(forces) do if f.is_chunk_charted(s,c) then charted=true; break end end
      if not scanned[scan_key] and charted and s.is_chunk_generated(c) then
        scanned[scan_key]=true
        local area={{c.x*32,c.y*32},{c.x*32+32,c.y*32+32}}
        local names={};for _,f in ipairs(forces) do names[#names+1]=f.name end
        for _,e in pairs(s.find_entities_filtered{area=area,force=names}) do add_entity(e) end
        local ores=s.find_entities_filtered{area=area,type="resource"}
        native_map:discover(s,c,forces,first~=nil)
        if #ores>0 then
          local key=s.index..":"..c.x..":"..c.y
          if not chunk_keys[key] then chunk_keys[key]=true;chunks[#chunks+1]={surface=s,x=c.x,y=c.y,amounts={}} end
        end
        scan_charted=scan_charted+1
        return -- at most one 32x32 chunk query in a scheduled scan step
      end
    end
  end
end

local inventory_names={
 ["container"]={"chest"},["logistic-container"]={"chest"},["cargo-wagon"]={"cargo_wagon"},
 ["assembling-machine"]={"assembling_machine_input","assembling_machine_output"},
 ["furnace"]={"furnace_source","furnace_result"},["lab"]={"lab_input"},
 ["rocket-silo"]={"assembling_machine_input","assembling_machine_output","rocket_silo_rocket"},
 ["cargo-landing-pad"]={"cargo_landing_pad_main"}
}
local function stock_add(target,name,quality,count,kind,surface,force)
  if count==0 then return end
  local k=surface.."|"..force.."|"..kind.."|"..name.."|"..quality
  local row=target[k]
  if not row then row={name=name,quality=quality,kind=kind,surface=surface,force=force,count=0};target[k]=row end
  row.count=row.count+count
end
local function values(t) local a={};for _,v in pairs(t) do a[#a+1]=v end;return a end
local function rolling_remove(id)
  local old=rolling.records[id];if not old then return end
  local group=rolling.groups[old.key]
  if group then group.count=group.count-1;group.total_crafting_speed=group.total_crafting_speed-old.speed;if group.count==0 then rolling.groups[old.key]=nil end end
  for key,s in pairs(old.stocks) do
    local total=rolling.stocks[key]
    if total then total.count=total.count-s.count;if math.abs(total.count)<0.000001 then rolling.stocks[key]=nil end end
  end
  rolling.buckets[old.tick]=(rolling.buckets[old.tick] or 1)-1
  if rolling.buckets[old.tick]==0 then rolling.buckets[old.tick]=nil end
  rolling.records[id]=nil;rolling.sampled=rolling.sampled-1
end
local function rolling_update(id,key,metadata,speed,stocks)
  rolling_remove(id)
  local group=rolling.groups[key]
  if not group then
    group={name=metadata.name,type=metadata.type,status=metadata.status,surface=metadata.surface,force=metadata.force,recipe=metadata.recipe,
      ingredients=metadata.ingredients,products=metadata.products,recipe_energy=metadata.recipe_energy,examples=metadata.examples,count=0,total_crafting_speed=0}
    rolling.groups[key]=group
  end
  group.count=group.count+1;group.total_crafting_speed=group.total_crafting_speed+speed
  for _,s in pairs(stocks) do stock_add(rolling.stocks,s.name,s.quality,s.count,s.kind,s.surface,s.force) end
  rolling.records[id]={key=key,speed=speed,stocks=stocks,tick=game.tick};rolling.sampled=rolling.sampled+1
  rolling.buckets[game.tick]=(rolling.buckets[game.tick] or 0)+1
  if rolling.last_bucket~=game.tick then rolling.queue[#rolling.queue+1]=game.tick;rolling.last_bucket=game.tick end
end
local function machines_export()
  while rolling.queue[rolling.head] and not rolling.buckets[rolling.queue[rolling.head]] do rolling.head=rolling.head+1 end
  local oldest=rolling.queue[rolling.head] or game.tick
  if rolling.head>4096 then local q={};for i=rolling.head,#rolling.queue do q[#q+1]=rolling.queue[i] end;rolling.queue=q;rolling.head=1 end
  emit("machines",{groups=values(rolling.groups),stocks=values(rolling.stocks),collection_mode="rolling",inventory_complete=scan_complete and rolling.sampled==#entities,
    sampled_entities=rolling.sampled,expected_entities=#entities,oldest_sample_tick=oldest,newest_sample_tick=game.tick,
    sample_start_tick=oldest,sample_end_tick=game.tick,sample_window_ticks=game.tick-oldest,
    diagnostics=spatial:snapshot(game.tick),last_full_cycle_ticks=rolling.last_full_cycle_ticks,inventory_scope="containers, machine inputs/outputs, labs, tanks and wagons; excludes belts/pipes/hands/players; rolling non-atomic sample"})
  rolling.last_emit=game.tick
end
local function entity_step()
  if not work then work={machines={},stocks={},accumulators={},poles={},networks={},generators={},requests={},keep={},started_tick=game.tick};cursor=1 end
  for _=1,ENTITY_BUDGET do
    local entry=entities[cursor]
    if not entry then
      latest={machines=values(rolling.groups),stocks=values(rolling.stocks),accumulators=values(work.accumulators),poles=work.poles,generators=values(work.generators),requests=work.requests,sample_start_tick=work.started_tick,sample_end_tick=game.tick}
      rolling.last_full_cycle_ticks=game.tick-work.started_tick
      entities=work.keep;work=nil;return
    end
    local e=entry.entity
    cursor=cursor+1
    if e.valid then local sampled=guarded("entity:"..e.type,function()
      work.keep[#work.keep+1]=entry
      local surface,force=e.surface.name,e.force.name
      local status=states[e.status] or "unknown"
      local recipe,recipe_quality=nil,nil
      if e.type=="assembling-machine" or e.type=="furnace" or e.type=="rocket-silo" then recipe,recipe_quality=e.get_recipe() end
      local key=surface.."|"..force.."|"..e.name.."|"..status.."|"..(recipe and recipe.name or "")
      local row=work.machines[key]
      if not row then
        row={name=e.name,type=e.type,status=status,surface=surface,force=force,recipe=recipe and recipe.name or nil,count=0,total_crafting_speed=0,ingredients=recipe and recipe.ingredients or nil,products=recipe and recipe.products or nil,recipe_energy=recipe and recipe.energy or nil,examples={}}
        work.machines[key]=row
      end
      row.count=row.count+1
      if #row.examples<3 then row.examples[#row.examples+1]={unit_number=e.unit_number,x=e.position.x,y=e.position.y} end
      local speed=recipe and e.crafting_speed or 0
      row.total_crafting_speed=row.total_crafting_speed+speed
      local entity_stocks,input_items={},{}
      for _,name in ipairs(inventory_names[e.type] or {}) do
        local id=defines.inventory[name]
        local inv=id and e.get_inventory(id)
        if inv and inv.valid then for _,item in pairs(inv.get_contents()) do
          stock_add(entity_stocks,item.name,item.quality or "normal",item.count,"item",surface,force)
          if name=='assembling_machine_input' or name=='furnace_source' or name=='lab_input' then input_items[item.name..'|'..(item.quality or 'normal')]=(input_items[item.name..'|'..(item.quality or 'normal')]or 0)+item.count end
        end end
      end
      if e.type=="storage-tank" or e.type=="fluid-wagon" or recipe then
        if modern_api then
          for i=1,e.fluids_count do local f=e.get_fluid(i);if f then stock_add(entity_stocks,f.name,"normal",f.amount,"fluid",surface,force) end end
        else
          for i=1,#e.fluidbox do local f=e.fluidbox[i];if f then stock_add(entity_stocks,f.name,"normal",f.amount,"fluid",surface,force) end end
        end
      end
      if e.type=="accumulator" then
        local k=surface.."|"..force
        local a=work.accumulators[k] or {surface=surface,force=force,joules=0,capacity_joules=0,count=0};work.accumulators[k]=a
        a.joules=a.joules+e.energy;a.capacity_joules=a.capacity_joules+(e.electric_buffer_size or 0);a.count=a.count+1
      end
      if e.type=="electric-pole" then local id=e.electric_network_id;if id and not work.networks[id] then work.networks[id]=true;work.poles[#work.poles+1]=e end end
      if e.type=="generator" or e.type=="solar-panel" then
        local k=surface.."|"..e.name.."|"..tostring(e.electric_network_id).."|"..status
        local g=work.generators[k] or {name=e.name,surface=surface,force=force,network_id=e.electric_network_id,status=status,count=0,theoretical_max_watts=0};work.generators[k]=g
        g.count=g.count+1;g.theoretical_max_watts=g.theoretical_max_watts+60*e.prototype.get_max_energy_production(e.quality)
      end
      if e.type=="logistic-container" then
        local points=e.get_logistic_point() or {}
        for _,point in pairs(points) do
          local sections={}
          for _,section in pairs(point.sections or {}) do sections[#sections+1]={active=section.active,multiplier=section.multiplier,filters=section.filters} end
          if #sections>0 then
            local inv=e.get_inventory(defines.inventory.chest)
            work.requests[#work.requests+1]={unit_number=e.unit_number,name=e.name,surface=surface,force=force,sections=sections,delivering=point.targeted_items_deliver,items=inv and inv.get_contents() or {},position=e.position}
          end
        end
      end
      rolling_update(entry.id,key,row,speed,entity_stocks)
      local missing=nil
      if status=='item_ingredient_shortage' and recipe then
        missing={};local quality=recipe_quality and recipe_quality.name or 'normal'
        for _,ingredient in ipairs(recipe.ingredients)do if ingredient.type=='item' and (input_items[ingredient.name..'|'..quality]or 0)<ingredient.amount then missing[#missing+1]={name=ingredient.name,type='item',quality=quality}end end
      elseif status=='missing_science_packs' and e.force.current_research then
        missing={};for _,ingredient in ipairs(e.force.current_research.research_unit_ingredients)do if (input_items[ingredient.name..'|normal']or 0)<ingredient.amount then missing[#missing+1]={name=ingredient.name,type='item',quality='normal'}end end
      end
      spatial:observe(e,status,recipe and recipe.name or nil,game.tick,missing)
    end);if not sampled then rolling_remove(entry.id);spatial:remove(entry.id)end
    else rolling_remove(entry.id);spatial:remove(entry.id);seen[entry.id]=nil end
  end
end

local function flow_start()
  local tasks={}
  for _,s in ipairs(surfaces) do for _,f in ipairs(forces) do
    for _,kind in ipairs({"item","fluid"}) do
      local stat=kind=="item" and f.get_item_production_statistics(s) or f.get_fluid_production_statistics(s)
      local names={};for name in pairs(stat.input_counts) do names[name]=true end;for name in pairs(stat.output_counts) do names[name]=true end
      for name in pairs(names) do tasks[#tasks+1]={stat=stat,name=name,kind=kind,surface=s.name,force=f.name} end
    end
  end end
  flow_job={tasks=tasks,cursor=1,rows={},started_tick=game.tick}
end
local function flow_step()
  if not flow_job then return end
  for _=1,4 do
    local j=flow_job.tasks[flow_job.cursor]
    if not j then emit("production",{rows=flow_job.rows,rate_unit="per_minute",item_quality_scope="normal",sample_start_tick=flow_job.started_tick,sample_end_tick=game.tick}); flow_job=nil;last_flow=game.tick;return end
    flow_job.cursor=flow_job.cursor+1
    guarded("flow",function()
      local function rate(category,precision) return j.stat.get_flow_count{name=j.name,category=category,precision_index=precision} end
      flow_job.rows[#flow_job.rows+1]={name=j.name,kind=j.kind,quality="normal",surface=j.surface,force=j.force,produced_per_minute=rate("input",defines.flow_precision_index.one_minute),consumed_per_minute=rate("output",defines.flow_precision_index.one_minute),produced_per_minute_5s=rate("input",defines.flow_precision_index.five_seconds),consumed_per_minute_5s=rate("output",defines.flow_precision_index.five_seconds),produced_per_minute_10m=rate("input",defines.flow_precision_index.ten_minutes),consumed_per_minute_10m=rate("output",defines.flow_precision_index.ten_minutes)}
    end)
  end
end
local function power_step()
  if not power_job then power_job={cursor=1,rows={}} end
  local p=latest.poles[power_job.cursor]
  if not p then emit("power",{networks=power_job.rows,accumulators=latest.accumulators,nameplate_generators=latest.generators,rate_unit="watts",installed_capacity_available=true,capacity_kind="theoretical nameplate; not guaranteed available reserve; solar depends on daylight and steam on supply"});power_job=nil;last_power=game.tick;return end
  power_job.cursor=power_job.cursor+1
  if p.valid then guarded("power",function()
    local stat=p.electric_network_statistics
    local consumption,production=0,0
    local consumers,producers={},{}
    for name in pairs(stat.input_counts) do local w=60*stat.get_flow_count{name=name,category="input",precision_index=defines.flow_precision_index.five_seconds};consumption=consumption+w;consumers[#consumers+1]={name=name,watts=w} end
    for name in pairs(stat.output_counts) do local w=60*stat.get_flow_count{name=name,category="output",precision_index=defines.flow_precision_index.five_seconds};production=production+w;producers[#producers+1]={name=name,watts=w} end
    power_job.rows[#power_job.rows+1]={id=p.electric_network_id,surface=p.surface.name,force=p.force.name,consumption_watts=consumption,production_watts=production,consumers=consumers,producers=producers,sampled_at_tick=game.tick}
  end) end
end
local function research()
  local rows={}
  for _,f in ipairs(forces) do
    local t=f.current_research;local queue={}
    for _,q in ipairs(f.research_queue or {}) do queue[#queue+1]={name=q.name,level=q.level,ingredients=q.research_unit_ingredients,unit_count=q.research_unit_count,unit_energy=q.research_unit_energy} end
    rows[#rows+1]={force=f.name,current=t and t.name or nil,progress=f.research_progress,level=t and t.level or nil,ingredients=t and t.research_unit_ingredients or nil,queue=queue}
  end
  emit("research",{forces=rows});last_research=game.tick
end
local function logistics_start()
  local networks={};local trains={}
  for _,f in ipairs(forces) do
    for surface,ns in pairs(f.logistic_networks) do for _,n in pairs(ns) do networks[#networks+1]={network=n,surface=surface,force=f.name} end end
    for _,t in pairs(game.train_manager.get_trains{force=f}) do trains[#trains+1]=t end
  end
  logistic_job={networks=networks,trains=trains,n=1,t=1,network_rows={},train_rows={}}
end
local function logistics_step()
  if not logistic_job then return end
  local j=logistic_job
  local entry=j.networks[j.n]
  if entry then
    j.n=j.n+1
    guarded("logistics",function()
      local n=entry.network
      if n.valid then j.network_rows[#j.network_rows+1]={id=n.network_id,name=n.custom_name,surface=entry.surface,force=entry.force,logistic_total=n.all_logistic_robots,logistic_available=n.available_logistic_robots,construction_total=n.all_construction_robots,construction_available=n.available_construction_robots,items=n.get_contents()} end
    end);return
  end
  local t=j.trains[j.t]
  if t then
    j.t=j.t+1
    guarded("train",function()
      if t.valid then
        local front=t.front_stock
        j.train_rows[#j.train_rows+1]={id=t.id,state=train_states[t.state] or "unknown",speed=t.speed,manual=t.manual_mode,force=front and front.force.name or nil,surface=front and front.surface.name or nil,position=front and front.position or nil,station=t.station and t.station.backer_name or nil,items=t.get_contents(),fluids=t.get_fluid_contents(),schedule=t.schedule,eta_available=false}
      end
    end);return
  end
  logistics_current={networks=j.network_rows,trains=j.train_rows,request_age_available=false,train_eta_available=false}
  emit_logistics();logistic_job=nil;last_logistics=game.tick
end
local function resource_step()
  local c=chunks[resource_cursor]
  if not c then resource_cursor=1;return end
  resource_cursor=resource_cursor+1
  if c.surface.valid then
    local sums={}
    for _,e in pairs(c.surface.find_entities_filtered{area={{c.x*32,c.y*32},{c.x*32+32,c.y*32+32}},type="resource"}) do
      local r=sums[e.name] or {name=e.name,amount=0,tiles=0,infinite=e.prototype.infinite_resource};sums[e.name]=r;r.amount=r.amount+e.amount;r.tiles=r.tiles+1
    end
    c.amounts=sums;c.sampled_at_tick=game.tick
  end
end
local function resources_export()
  local rows={}
  for _,c in ipairs(chunks) do for _,r in pairs(c.amounts) do rows[#rows+1]={surface=c.surface.name,chunk_x=c.x,chunk_y=c.y,name=r.name,amount=r.amount,tiles=r.tiles,infinite=r.infinite,sampled_at_tick=c.sampled_at_tick} end end
  emit("resources",{chunks=rows,scope="charted resource chunks; infinite resource amounts are not remaining units",patch_grouping="gateway"});last_resources=game.tick
end

script.on_init(function() boot() end)
script.on_configuration_changed(function() boot() end)
script.on_event({defines.events.on_built_entity,defines.events.on_robot_built_entity,defines.events.script_raised_built,defines.events.script_raised_revive},function(e) local entity=e.entity or e.created_entity;add_entity(entity);boot();guarded("combat_rebuilt",function()combat:built(entity)end) end)
script.on_event(defines.events.on_entity_damaged,function(e)boot();guarded("combat_damage",function()combat:damage(e,game.tick)end)end)
script.on_event(defines.events.on_entity_died,function(e)boot();guarded("combat_death",function()combat:death(e,game.tick)end)end)
script.on_event(defines.events.on_chunk_charted,function(e)
  local key=e.surface_index..":"..e.position.x..":"..e.position.y
  if not scanned[key] then priority_chunks[#priority_chunks+1]={surface=game.surfaces[e.surface_index],x=e.position.x,y=e.position.y};scan_complete=false end
end)
script.on_event(defines.events.on_surface_created,function(e)
  surfaces[#surfaces+1]=game.surfaces[e.surface_index];scan_complete=false
end)
script.on_event(defines.events.on_force_created,function(e)if e.force.name~='enemy' and e.force.name~='neutral'then forces[#forces+1]=e.force end end)
script.on_event(defines.events.on_tick,function()
  boot()
  local timer=create_profiler()
  if game.tick%2==0 then guarded("discovery",scan_step) end
  guarded("entities",entity_step)
  guarded("request_export",request_export_step)
  guarded("space",function()space:step(game.tick,forces)end)
  guarded("native_map",function()native_map:step(game.tick,game.is_multiplayer(),game.tick%6==3 and game.connected_players or nil)end)
  if game.tick-rolling.last_emit>=120 then guarded("machines_export",machines_export) end
  if game.tick%2==1 then
    if not flow_job and game.tick-last_flow>=120 then guarded("flow_start",flow_start) end
    guarded("flow_step",flow_step)
  end
  if game.tick%6==1 and (power_job or game.tick-last_power>=60) then guarded("power_step",power_step) end
  if game.tick%10==3 then
    if not logistic_job and game.tick-last_logistics>=300 then guarded("logistics_start",logistics_start) end
    guarded("logistics_step",logistics_step)
  end
  if game.tick-last_research>=300 then guarded("research",research) end
  if game.tick%10==7 then guarded("resource_step",resource_step) end
  if game.tick-last_resources>=600 then guarded("resources_export",resources_export) end
  if game.tick%120==0 then emit("combat",combat:snapshot(game.tick));emit("status",{game_version=script.active_mods.base,mod_version=script.active_mods["factory-telemetry"],players=#game.connected_players,coverage=coverage(),errors=errors,budgets={entities_per_step=ENTITY_BUDGET,entity_step_every_ticks=1,requester_rows_per_tick=REQUEST_PAGE_ROWS,max_chunk_queries_per_step=1,flow_rows_per_step=4},read_only=true}) end
  timer.stop();profile.add(timer);profile_ticks=profile_ticks+1
  if profile_ticks>=300 then
    profile.divide(profile_ticks)
    helpers.write_file("factory-telemetry/profile.txt",{"","tick=",game.tick," average_collector_tick=",profile,"\n"},true,game.is_multiplayer() and 0 or nil)
    profile=create_profiler(true);profile_ticks=0
  end
end)
-- Cargo callbacks are observational. Event inventories have a separate hard slot budget.
for event,kind in pairs({on_cargo_pod_started_ascending='launching',on_cargo_pod_finished_ascending='departed',on_cargo_pod_finished_descending='landing',on_cargo_pod_delivered_cargo='delivered'})do
 if defines.events[event]then script.on_event(defines.events[event],function(e)boot();local timer=create_profiler();guarded('space_event',function()space:pod(kind,e.cargo_pod,e.tick)end);timer.stop();profile.add(timer)end)end
end
script.on_event(defines.events.on_rocket_launch_ordered,function(e)boot();local timer=create_profiler();guarded('space_launch',function()local pod=e.rocket and e.rocket.valid and e.rocket.attached_cargo_pod;if pod then space:pod('launching',pod,e.tick)end end);timer.stop();profile.add(timer)end)
remote.add_interface("factory_telemetry",{snapshot=function(topic) return encoded[topic] end})
commands.add_command("factory-telemetry-status","Show collector coverage",function(c)
  local text=helpers.table_to_json(coverage());if c.player_index then game.get_player(c.player_index).print(text) else rcon.print(text) end
end)
