-- Isolated synthetic world. Never loaded into a player's save.
script.on_init(function()
  game.speed=10
  local s=game.surfaces[1]
  s.request_to_generate_chunks({0,0},1);s.force_generate_chunk_requests()
  local chest=s.create_entity{name="steel-chest",position={0,0},force="player"}
  chest.insert{name="iron-plate",count=42}
  local tank=s.create_entity{name="storage-tank",position={5,0},force="player"}
  tank.insert_fluid{name="water",amount=125}
  local assembler=s.create_entity{name="assembling-machine-2",position={10,0},force="player"}
  assembler.set_recipe("iron-gear-wheel")
  s.create_entity{name="accumulator",position={15,0},force="player"}
  s.create_entity{name="small-electric-pole",position={14,3},force="player"}
  s.create_entity{name="solar-panel",position={17,3},force="player"}
  s.create_entity{name="iron-ore",position={22,0},amount=1000}
  game.forces.player.chart(s,{{-32,-32},{32,32}})
end)
script.on_event(defines.events.on_tick,function()
  if game.tick==1 then
    game.forces.player.chart(game.surfaces[1],{{-32,-32},{32,32}})
    -- A headless force without connected players has no chart updates.
    -- Exercise the normal construction events to index this synthetic fixture.
    for _,e in pairs(game.surfaces[1].find_entities_filtered{force="player"})do script.raise_script_built{entity=e}end
  end
end)
script.on_nth_tick(1800,function()
  if game.tick<1800 then return end
  local docs={}
  for _,topic in ipairs({"status","power","production","machines","logistics","research","resources","combat"})do
    local raw=remote.call("factory_telemetry","snapshot",topic)
    assert(raw,"Missing channel: "..topic)
    docs[topic]=helpers.json_to_table(raw)
    assert(docs[topic].topic==topic,"Wrong channel: "..topic)
  end
  assert(next(docs.status.data.errors)==nil,"Collector errors: "..helpers.table_to_json(docs.status.data.errors))
  assert(docs.status.data.mod_version==script.active_mods["factory-telemetry"],"Wrong mod version")
  assert(docs.machines.data.inventory_complete,"Incomplete inventory")
  local amounts={}
  for _,row in ipairs(docs.machines.data.stocks)do amounts[row.name]=(amounts[row.name]or 0)+row.count end
  assert(amounts["iron-plate"]==42,"Wrong chest inventory: "..helpers.table_to_json({amounts=amounts,coverage=docs.status.data.coverage}))
  assert(amounts.water==125,"Wrong fluid inventory: "..tostring(amounts.water))
  assert(#docs.power.data.networks>0,"No measured electric network")
  assert(type(docs.resources.data.chunks)=="table","Invalid resource channel")
  local chart=game.forces.player.get_chunk_chart(game.surfaces[1],{x=0,y=0})
  log("FACTORY_TELEMETRY_SMOKE_OK "..helpers.table_to_json({game=script.active_mods.base,mod=docs.status.data.mod_version,channels=8,water=amounts.water,iron=amounts["iron-plate"],entities=docs.status.data.coverage.indexed_entities,chart_api=true,chart_bytes=chart and #chart or 0,errors=docs.status.data.errors}))
end)
