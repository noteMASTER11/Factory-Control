-- Spatial observations piggyback on the existing bounded entity sampler.
local Spatial={};Spatial.__index=Spatial
local statuses={no_power=true,low_power=true,no_fuel=true,item_ingredient_shortage=true,fluid_ingredient_shortage=true,no_input_fluid=true,missing_science_packs=true}
local types={["assembling-machine"]=true,furnace=true,["mining-drill"]=true,lab=true,boiler=true,generator=true,["rocket-silo"]=true}
function Spatial.new(limit)return setmetatable({cells={},records={},count=0,record_count=0,limit=limit or 512,complete=true},Spatial)end
function Spatial:remove(id)
 local old=self.records[id];if not old then return end
 local cell=self.cells[old]
 if cell then
  cell.count=cell.count-1
  for i=#cell.examples,1,-1 do if cell.examples[i].unit_number==id then table.remove(cell.examples,i)end end
  if cell.count==0 then self.cells[old]=nil;self.count=self.count-1 end
 end
 self.records[id]=nil;self.record_count=self.record_count-1
end
function Spatial:observe(e,status,recipe,tick,missing)
 local id=e.unit_number
 if not types[e.type] or not statuses[status]then self:remove(id);return end
 local x,y=math.floor(e.position.x/32),math.floor(e.position.y/32)
 local missing_key={};for _,item in ipairs(missing or {})do missing_key[#missing_key+1]=item.name..':'..item.quality end;table.sort(missing_key)
 local key=e.surface.name..'|'..e.force.name..'|'..e.name..'|'..status..'|'..(recipe or '')..'|'..x..'|'..y..'|'..table.concat(missing_key,',')
 if self.records[id]~=key then
  self:remove(id)
  if (not self.cells[key] and self.count>=self.limit)or self.record_count>=32768 then self.complete=false;return end
  if not self.cells[key]then
   self.cells[key]={id=key,surface=e.surface.name,force=e.force.name,surface_id=e.surface.index,force_id=e.force.index,name=e.name,type=e.type,status=status,recipe=recipe,missing_ingredients=missing,x=x,y=y,count=0,first_seen_tick=tick,last_seen_tick=tick,examples={}}
   self.count=self.count+1
  end
  self.cells[key].count=self.cells[key].count+1;self.records[id]=key;self.record_count=self.record_count+1
 end
 local cell=self.cells[key];cell.last_seen_tick=tick
 local found=false;for _,p in ipairs(cell.examples)do if p.unit_number==id then found=true;break end end
 if not found and #cell.examples<3 then cell.examples[#cell.examples+1]={unit_number=id,x=e.position.x,y=e.position.y}end
end
function Spatial:snapshot(tick)
 local cells={};for _,cell in pairs(self.cells)do cells[#cells+1]=cell end
 return {schema_version=1,cells=cells,complete=self.complete,tracked_entities=self.record_count,sampled_at_tick=tick,cell_size=32}
end
return Spatial
