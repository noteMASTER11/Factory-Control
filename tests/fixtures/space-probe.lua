-- Only loaded by the explicit isolated save-copy server. Never installed in a player's mod set.
local stage=0
script.on_nth_tick(30,function()
 if stage~=0 then return end;stage=1
 local f=game.create_force('factory-control-probe')
 local platform=f.create_space_platform{name='Isolated transport probe',planet='nauvis',starter_pack={name='space-platform-starter-pack',quality='normal'}}
 platform.apply_starter_pack()
 local s=game.surfaces.nauvis
 local pad=s.create_entity{name='cargo-landing-pad',position={100000,100000},force=f}
 local pod=platform.hub.create_cargo_pod()
 pod.get_inventory(defines.inventory.cargo_unit).insert{name='iron-plate',count=123,quality='normal'}
 storage.probe={force=f,pod=pod,pad=pad,source=platform.surface,before_import=f.get_item_production_statistics(s).get_input_count('iron-plate'),before_export=f.get_item_production_statistics(platform.surface).get_output_count('iron-plate')}
 local receiver=f.create_space_platform{name='Isolated orbital receiver',planet='nauvis',starter_pack={name='space-platform-starter-pack',quality='normal'}}
 receiver.apply_starter_pack()
 local orbital=platform.hub.create_cargo_pod()
 local cargo=orbital.get_inventory(defines.inventory.cargo_unit)
 for _,item in ipairs{{name='iron-plate',quality='normal',count=43},{name='copper-plate',quality='rare',count=17},{name='iron-plate',quality='rare',count=9}}do cargo.insert(item)end
 storage.probe.orbital=orbital;storage.probe.receiver=receiver
 storage.probe.orbital_before=receiver.hub.get_inventory(defines.inventory.hub_main).get_contents()
 orbital.cargo_pod_destination={type=defines.cargo_destination.station,station=receiver.hub}
 pod.cargo_pod_destination={type=defines.cargo_destination.station,station=pad}
 log('SPACE_PROBE_CREATED '..helpers.table_to_json{tick=game.tick,pod=pod.unit_number})
 script.on_nth_tick(30,function()
  local p=storage.probe;if p and p.delivered_tick and game.tick>p.delivered_tick+60 then
   log('SPACE_PROBE_SETTLED '..helpers.table_to_json{items=p.pad.get_inventory(defines.inventory.cargo_landing_pad_main).get_contents(),input=p.force.get_item_production_statistics(p.pad.surface).get_input_count('iron-plate'),output=p.force.get_item_production_statistics(p.source).get_output_count('iron-plate')})
   script.on_nth_tick(30,nil)
  end
 end)
end)
script.on_event(defines.events.on_cargo_pod_finished_descending,function(e)
 local p=storage.probe
 if p and e.cargo_pod==p.orbital then p.orbital_items=p.orbital.get_inventory(defines.inventory.cargo_unit).get_contents()end
 if p and e.cargo_pod==p.pod then
  log('SPACE_PROBE_PRE_DELIVERY '..helpers.table_to_json{items=p.pod.get_inventory(defines.inventory.cargo_unit).get_contents(),input=p.force.get_item_production_statistics(p.pad.surface).get_input_count('iron-plate')})
 end
end)
script.on_event(defines.events.on_cargo_pod_delivered_cargo,function(e)
 local p=storage.probe;if not p then return end
 if e.cargo_pod==p.orbital then
  local result={origin=p.source.name,destination=p.receiver.surface.name,items=p.orbital_items,before=p.orbital_before,after=p.receiver.hub.get_inventory(defines.inventory.hub_main).get_contents()}
  helpers.write_file('space-orbital-probe-result.json',helpers.table_to_json(result),false);log('SPACE_PROBE_ORBITAL '..helpers.table_to_json(result));return
 end
 if e.cargo_pod~=p.pod then return end
 local after_import=p.force.get_item_production_statistics(p.pad.surface).get_input_count('iron-plate')
 local after_export=p.force.get_item_production_statistics(p.source).get_output_count('iron-plate')
 local result={import_delta=after_import-p.before_import,export_delta=after_export-p.before_export,delivered=p.pad.get_inventory(defines.inventory.cargo_landing_pad_main).get_item_count('iron-plate')}
 p.delivered_tick=game.tick;helpers.write_file('space-probe-result.json',helpers.table_to_json(result),false);log('SPACE_PROBE_RESULT '..helpers.table_to_json(result))
end)
