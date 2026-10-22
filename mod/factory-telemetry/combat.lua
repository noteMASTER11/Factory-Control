-- Event driven; no world searches, inventory reads or per-entity ticking.
local Combat={};Combat.__index=Combat
local excluded={character=true,unit=true,spider_unit=true,["logistic-robot"]=true,["construction-robot"]=true,["entity-ghost"]=true,["tile-ghost"]=true,["item-entity"]=true,corpse=true,projectile=true,stream=true,fire=true}
local function building(e)return e and e.valid and e.force and e.surface and e.position and not excluded[e.type] and e.force.name~="enemy" and e.force.name~="neutral" end
local function hostile(event)
 local e=event.entity;if not building(e) then return false end
 local attacker=event.force or (event.cause and event.cause.valid and event.cause.force)
 return attacker and e.force.is_enemy(attacker)
end
local function position(e)return e.name.."@"..tostring(e.position.x)..","..tostring(e.position.y) end
local function close(episode,tick)if not episode.ended_tick and tick-episode.last_hostile_tick>=900 then episode.ended_tick=episode.last_hostile_tick+900 end end
function Combat.new(saved)return setmetatable({state=saved or {sequence=0,episodes={}}},Combat)end
function Combat:episode(e,tick)
 for i=#self.state.episodes,1,-1 do local a=self.state.episodes[i];close(a,tick);if not a.ended_tick and a.force==e.force.name and a.surface==e.surface.name then a.last_hostile_tick=tick;return a end end
 self.state.sequence=self.state.sequence+1
 local a={id=tostring(self.state.sequence),force=e.force.name,surface=e.surface.name,started_tick=tick,last_hostile_tick=tick,damage_events=0,damage=0,destroyed=0,losses={},by_group={},sites={},site_count=0,tracking_complete=true,unclassified=0}
 self.state.episodes[#self.state.episodes+1]=a;while #self.state.episodes>8 do table.remove(self.state.episodes,1)end;return a
end
function Combat:damage(event,tick)
 if not hostile(event) or (event.final_damage_amount or 0)<=0 then return end
 local a=self:episode(event.entity,tick);a.damage_events=a.damage_events+1;a.damage=a.damage+event.final_damage_amount
end
function Combat:death(event,tick)
 if not hostile(event) then return end
 local e=event.entity;local a=self:episode(e,tick);a.destroyed=a.destroyed+1
 local quality=e.quality and e.quality.name or "normal";local key=e.name.."|"..quality;local index=a.by_group[key]
 if not index then
  if #a.losses>=128 then a.tracking_complete=false;a.unclassified=a.unclassified+1;return end
  local placement={};for _,item in pairs(e.prototype.items_to_place_this or {})do placement[#placement+1]={name=item.name,count=item.count or 1,quality=quality};if #placement>=4 then break end end
  local row={name=e.name,type=e.type,quality=quality,count=0,rebuilt=0,placement=placement,examples={}};a.losses[#a.losses+1]=row;index=#a.losses;a.by_group[key]=index
 end
 local row=a.losses[index];row.count=row.count+1
 if #row.examples<3 then row.examples[#row.examples+1]={x=e.position.x,y=e.position.y}end
 local site=position(e)
 if a.sites[site] then a.tracking_complete=false end
 if a.site_count<8192 then if not a.sites[site]then a.site_count=a.site_count+1 end;a.sites[site]=index else a.tracking_complete=false end
end
function Combat:built(e)
 if not building(e) then return end
 local key=position(e)
 for i=#self.state.episodes,1,-1 do local a=self.state.episodes[i]
  if a.force==e.force.name and a.surface==e.surface.name and a.sites[key]then local row=a.losses[a.sites[key]];row.rebuilt=row.rebuilt+1;a.sites[key]=nil;a.site_count=a.site_count-1;return end
 end
end
function Combat:snapshot(tick)
 local episodes={}
 for i,a in ipairs(self.state.episodes)do
  close(a,tick);local losses={};local rebuilt=0;local details=not a.ended_tick or i==#self.state.episodes
  for _,g in ipairs(a.losses)do rebuilt=rebuilt+g.rebuilt;if details then losses[#losses+1]={name=g.name,type=g.type,quality=g.quality,count=g.count,rebuilt=g.rebuilt,pending=math.max(0,g.count-g.rebuilt),placement=g.placement,examples=g.examples}end end
  episodes[#episodes+1]={id=a.id,force=a.force,surface=a.surface,started_tick=a.started_tick,last_hostile_tick=a.last_hostile_tick,ended_tick=a.ended_tick,active=not a.ended_tick,damage_events=a.damage_events,damage=a.damage,destroyed=a.destroyed,rebuilt=rebuilt,losses=losses,tracking_complete=a.tracking_complete,unclassified=a.unclassified,details_available=details}
 end
 return {episodes=episodes,quiet_ticks=900,observation="hostile damage events to owned buildings"}
end
return Combat
