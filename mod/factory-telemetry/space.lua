-- Read-only transport observations. No world search or UI-driven reads.
local Space={};Space.__index=Space
local SLOT_BUDGET,EVENT_SLOTS,MAX_EVENTS,MAX_PORTS,MAX_PLATFORMS=16,128,512,512,128
local major,minor=string.match(script and script.active_mods.base or '2.1','^(%d+)%.(%d+)')
local modern=tonumber(major)>2 or tonumber(major)==2 and tonumber(minor)>=1
local function name(value)return type(value)=='string' and value or value and value.name end
local function surface(e)return e and e.valid and e.surface.name or nil end
local function destination(pod)
 local d=pod.cargo_pod_destination
 if d.station and d.station.valid then return d.station.surface.name end
 if d.surface then local s=game.surfaces[d.surface];return s and s.name end
 if d.space_platform and d.space_platform.valid then return d.space_platform.surface.name end
end
local function inventory(entity)
 if not entity or not entity.valid then return nil end
 local names={['space-platform-hub']='hub_main',['cargo-landing-pad']='cargo_landing_pad_main',['rocket-silo']='rocket_silo_rocket',['cargo-pod']='cargo_unit'}
 local id=defines.inventory[names[entity.type] or 'cargo_unit'];return id and entity.get_inventory(id)
end
local function add_stack(map,stack)
 if not stack or not stack.valid_for_read then return end
 local quality=name(stack.quality)or'normal';local key=stack.name..'|'..quality
 local row=map[key];if not row then row={name=stack.name,quality=quality,count=0};map[key]=row end
 row.count=row.count+stack.count
 local spoil=stack.spoil_tick
 if spoil and spoil>0 then
  row.spoil_tick_min=math.min(row.spoil_tick_min or spoil,spoil);row.spoil_tick_max=math.max(row.spoil_tick_max or spoil,spoil)
  -- Freshness groups are intentionally compact; no per-slot telemetry history.
  row.spoilable_count=(row.spoilable_count or 0)+stack.count
  row.freshness_sum=(row.freshness_sum or 0)+(1-stack.spoil_percent)*stack.count
 end
end
local function rows(map)local out={};for _,row in pairs(map)do out[#out+1]=row end;table.sort(out,function(a,b)return a.name..'|'..a.quality<b.name..'|'..b.quality end);return out end
function Space.new(state,tick)
 state=state or {started_tick=tick,events={},pending={},sequence=0,dropped_events=0,event_floor_tick=tick,partial_events=0}
 state.durations=state.durations or {}
 state.flows=state.flows or {};state.flow_order=state.flow_order or {};state.rate_gap_tick=state.rate_gap_tick or state.started_tick
 state.pending_count=0;for _ in pairs(state.pending)do state.pending_count=state.pending_count+1 end
 return setmetatable({state=state,ports={},port_ids={},platforms={},port_rows={},next_poll=0,port_cursor=1,job=nil,jobs={},fresh_jobs={},fresh_known={},event_tick=-1,event_reads=0,overflow=false,loading={},motion={},rate_cursor=1,rates={}},Space)
end
function Space:track(e)
 if not e or not e.valid or (e.type~='rocket-silo' and e.type~='cargo-landing-pad') or self.port_ids[e.unit_number]then return end
 if #self.ports>=MAX_PORTS then
  self.overflow=true
  if e.type=='cargo-landing-pad' then for i=#self.ports,1,-1 do local old=self.ports[i]
   if not old.entity.valid or old.entity.type=='rocket-silo' then self.port_ids[old.id]=nil;self.port_rows[old.id]=nil;table.remove(self.ports,i);break end
  end end
  if #self.ports>=MAX_PORTS then return end
 end
 self.port_ids[e.unit_number]=true;self.ports[#self.ports+1]={entity=e,id=e.unit_number}
end
function Space:append(kind,record,tick)
 self.state.sequence=self.state.sequence+1
 local event={id=self.state.sequence,kind=kind,tick=tick,force=record.force,surface=kind=='export' and record.origin or record.destination,origin=record.origin,destination=record.destination,items=record.items,complete=record.complete,pod=record.id}
 local events=self.state.events;events[#events+1]=event
 if not record.complete then self.state.partial_events=self.state.partial_events+1;self.state.rate_gap_tick=tick end
 if record.complete and event.surface then for _,item in ipairs(record.items)do
  local key=event.force..'|'..event.surface..'|'..item.name..'|'..item.quality;local flow=self.state.flows[key]
  if not flow and #self.state.flow_order<1024 then flow={name=item.name,quality=item.quality,force=event.force,surface=event.surface,buckets={}};self.state.flows[key]=flow;self.state.flow_order[#self.state.flow_order+1]=key end
  if flow then local bucket_tick=math.floor(tick/600)*600;local slot=math.floor(tick/600)%61+1;local bucket=flow.buckets[slot]
   if not bucket or bucket.tick~=bucket_tick then bucket={tick=bucket_tick,import=0,export=0};flow.buckets[slot]=bucket end
   bucket[kind]=bucket[kind]+item.count
  else self.state.rate_overflow=true end
 end end
 if #events>MAX_EVENTS then local old=table.remove(events,1);self.state.event_floor_tick=old.tick;self.state.dropped_events=self.state.dropped_events+1 end
end
function Space:cargo(pod,tick)
 if self.event_tick~=tick then self.event_tick=tick;self.event_reads=0 end
 local inv=inventory(pod);local map={};local count=inv and #inv or 0
 -- Native aggregation keeps exact quantities even in expanded mostly-empty pods.
 local complete=inv~=nil;local needs_freshness=false;local kinds=0
 if inv and inv.get_contents then for _,item in pairs(inv.get_contents())do
  kinds=kinds+1;if kinds<=128 then local quality=name(item.quality)or'normal';map[item.name..'|'..quality]={name=item.name,quality=quality,count=item.count};local prototype=prototypes and prototypes.item[item.name];if prototype and prototype.get_spoil_ticks(quality)>0 then needs_freshness=true end else complete=false end
 end else needs_freshness=true end
 if not needs_freshness then return rows(map),complete end
 local limit=math.max(0,math.min(count,EVENT_SLOTS-self.event_reads))
 local freshness={};for i=1,limit do add_stack(freshness,inv[i])end;self.event_reads=self.event_reads+limit
 if inv and inv.get_contents then
  for key,row in pairs(map)do local sample=freshness[key];if sample and limit==count then for _,field in ipairs({'spoil_tick_min','spoil_tick_max','spoilable_count','freshness_sum'})do row[field]=sample[field]end end;row.freshness_complete=limit==count end
  return rows(map),complete
 end
 return rows(freshness),inv~=nil and limit==count
end
function Space:pod(kind,pod,tick)
 if not pod or not pod.valid or not pod.unit_number then return end
 local id=pod.unit_number;local record=self.state.pending[id]
 if not record then
  if self.state.pending_count>=2048 then self.overflow=true;self.state.rate_gap_tick=tick;return end
  local origin=pod.cargo_pod_origin
  record={id=id,entity=pod,origin=surface(origin),destination=destination(pod),force=origin and origin.valid and origin.force.name or pod.force.name}
  self.state.pending[id]=record
  self.state.pending_count=self.state.pending_count+1
 end
 if kind=='launching' and not record.launched and not record.delivered then
  record.items,record.complete=self:cargo(pod,tick);record.launched=tick
 elseif kind=='departed' and not record.departed and not record.delivered then
  record.items,record.complete=self:cargo(pod,tick);record.departed=tick;record.destination=destination(pod)or record.destination
  self:append('export',record,tick)
 elseif kind=='landing' and not record.delivered then
  -- This event precedes cargo removal; delivered_cargo itself is too late to read it.
  record.items,record.complete=self:cargo(pod,tick);record.destination=pod.surface.name;record.landing=tick
 elseif kind=='delivered' and not record.delivered then
  record.destination=pod.surface.name
  if not record.landing then record.items={};record.complete=false end
  record.delivered=tick;record.items=record.items or {};self:append('import',record,tick)
  if record.departed and record.destination and record.origin then
   local key=record.origin..'|'..record.destination;local duration=self.state.durations[key]
   if not duration then local n=0;for _ in pairs(self.state.durations)do n=n+1 end;if n<256 then duration={samples=0,total=0};self.state.durations[key]=duration end end
   if duration then duration.samples=math.min(20,duration.samples+1);duration.total=duration.total*(duration.samples==20 and .95 or 1)+(tick-record.departed)end
  end
 end
end
function Space:start(entity,platform,tick)
 if not entity or not entity.valid then return end
 local row={id=platform and platform.index or entity.unit_number,name=platform and platform.name or entity.name,surface=entity.surface.name,force=entity.force.name,type=entity.type,sample_start_tick=tick}
 if platform then
  row.location=name(platform.space_location);row.previous_location=name(platform.last_visited_space_location)
  row.speed=platform.speed;row.distance=platform.distance;row.paused=platform.paused
  row.state=platform.state;row.status=entity.status
  local c=platform.space_connection;if c then row.connection={name=c.name,from=name(c.from),to=name(c.to)}end
  local schedule=platform.schedule
  if schedule then row.schedule={current=schedule.current,records={}};for i,r in ipairs(schedule.records)do if i>64 then row.schedule.truncated=true;break end;row.schedule.records[#row.schedule.records+1]={station=r.station,allows_unloading=r.allows_unloading,wait_conditions=r.wait_conditions}end end
  -- One active record, not a scan of interrupt definitions or future route variants.
  if modern and platform.get_schedule then
   local active=platform.get_schedule()
   if active and active.valid then
    local record=active.get_record{schedule_index=active.current}
    row.active_route={observed=true,index=active.current,station=record and record.station,allows_unloading=record and record.allows_unloading,temporary=record and record.temporary,interrupt_count=active.interrupt_count,changed_tick=active.tick_of_last_schedule_change,ticks_in_station=active.ticks_in_station}
   end
  end
 else
  row.position=entity.position;row.status=entity.status
  if entity.type=='rocket-silo' then row.rocket_parts=entity.rocket_parts;row.rocket_status=entity.rocket_silo_status;local target=entity.transitional_request_target;row.target_platform=target and target.index end
 end
 local inv=inventory(entity)
 if inv then
  row.weight=inv.weight
  if entity.type=='rocket-silo' then row.weight_limit=modern and entity.prototype and entity.prototype.lift_weight or inv.max_weight end
 end
 local aggregate,needs_freshness={},false
 if inv and inv.get_contents then
  for _,item in pairs(inv.get_contents())do local quality=name(item.quality)or'normal';aggregate[item.name..'|'..quality]={name=item.name,quality=quality,count=item.count}
   local prototype=prototypes and prototypes.item[item.name];if prototype and prototype.get_spoil_ticks(quality)>0 then needs_freshness=true end
  end
 else needs_freshness=true end
 row.items=rows(aggregate);row.sample_end_tick=tick;row.complete=inv~=nil and inv.get_contents~=nil;self:estimate(row,tick)
 if row.type=='cargo-landing-pad' then
  local point=entity.get_requester_point();row.requests={}
  if point and point.enabled then for i,filter in ipairs(point.filters or {})do
   if i>128 then row.requests_truncated=true;break end
   if filter.value and (filter.min or 0)>0 and (filter.value.comparator==nil or filter.value.comparator=='=')then row.requests[#row.requests+1]={name=filter.value.name,quality=name(filter.value.quality)or'normal',min=filter.min}end
  end end
 end
 local target=platform and self.platforms or self.port_rows;local previous=target[row.id]
 if previous then for _,item in ipairs(row.items)do for _,old in ipairs(previous.items)do
  if item.name==old.name and item.quality==old.quality and item.count==old.count then for _,field in ipairs({'spoil_tick_min','spoil_tick_max','spoilable_count','freshness_sum','freshness_sample_tick'})do item[field]=old[field]end;break end
 end end end
 target[row.id]=row
 local fresh_key=entity.unit_number
 if needs_freshness and inv and not self.fresh_known[fresh_key] and #self.fresh_jobs<640 then
  self.fresh_known[fresh_key]=true;self.fresh_jobs[#self.fresh_jobs+1]={entity=entity,row=row,platform=platform,inventory=inv,cursor=1,items={},slots=#inv,key=fresh_key}
 end
end
function Space:estimate(row,tick)
 if row.type=='rocket-silo' and row.weight and row.weight_limit and row.weight_limit>0 then
  local old=self.loading[row.id]
  if not old or tick-old.tick>=120 then
   local signature={};for _,item in ipairs(row.items)do signature[#signature+1]=item.name..'|'..item.quality end
   signature=table.concat(signature,',')..':'..tostring(row.target_platform)..':'..tostring(row.weight_limit)
   local next={tick=tick,weight=row.weight,signature=signature,samples=1,start_tick=tick,start_weight=row.weight,last_gain_tick=tick}
   if old and old.signature==signature and row.weight>=old.weight and tick-old.last_gain_tick<=600 then
    next.samples=old.samples+(row.weight>old.weight and 1 or 0);next.start_tick=old.start_tick;next.start_weight=old.start_weight;next.last_gain_tick=row.weight>old.weight and tick or old.last_gain_tick
    local elapsed=tick-next.start_tick;local rate=elapsed>0 and (row.weight-next.start_weight)/elapsed or 0
    if next.samples>=3 and rate>0 then next.eta_seconds=math.max(0,(row.weight_limit-row.weight)/rate/60)end
   end
   if row.weight>=row.weight_limit then next.eta_seconds=0 end
   self.loading[row.id]=next;old=next
  end
  row.loading_eta_seconds=old.eta_seconds;row.loading_samples=old.samples
 elseif row.type=='space-platform-hub' and row.connection and row.distance then
  local goal=row.previous_location==row.connection.from and row.connection.to or row.previous_location==row.connection.to and row.connection.from or nil
  row.next_location=goal
  local route=row.active_route;local signature=route and table.concat({tostring(route.index),tostring(route.station),tostring(route.changed_tick)},'|')or''
  local old=self.motion[row.id];local next={tick=tick,distance=row.distance,connection=row.connection.name,goal=goal,route=signature,samples=1}
  if old and old.connection==next.connection and old.goal==goal and old.route==signature and tick>old.tick and not row.paused and row.speed~=0 then
   local delta=row.distance-old.distance;local direction=goal==row.connection.to and 1 or -1
   if goal and delta*direction>0 then
    next.samples=old.samples+1;local rate=math.abs(delta)/(tick-old.tick);local remaining=direction==1 and 1-row.distance or row.distance
    if next.samples>=3 then row.flight_eta_seconds=remaining/rate/60 end
   end
  end
  self.motion[row.id]=next
 end
end
function Space:step(tick,forces)
 -- Four small rate rows per tick; journal retention never truncates measured throughput.
 local ending=math.floor(tick/600)*600
 for _=1,4 do
  if self.rate_cursor>#self.state.flow_order then self.rate_cursor=1 end
  local key=self.state.flow_order[self.rate_cursor];if not key then break end;self.rate_cursor=self.rate_cursor+1
  local flow=self.state.flows[key];local rate={name=flow.name,quality=flow.quality,surface=flow.surface,force=flow.force,window_end_tick=ending,imported=0,exported=0,imported_10m=0,exported_10m=0}
  for _,b in pairs(flow.buckets)do if b.tick<ending and b.tick>=ending-36000 then
   rate.imported_10m=rate.imported_10m+b.import/10;rate.exported_10m=rate.exported_10m+b.export/10
   if b.tick>=ending-3600 then rate.imported=rate.imported+b.import;rate.exported=rate.exported+b.export end
  end end
  self.rates[key]=rate
 end
 if #self.jobs==0 and tick>=self.next_poll then
  self.next_poll=tick+300;local known={};local count=0
  for _,force in ipairs(forces)do for _,platform in pairs(force.platforms or {})do
   if platform.valid and platform.hub then
    count=count+1;if count<=MAX_PLATFORMS then known[platform.index]=true;self.jobs[#self.jobs+1]={entity=platform.hub,platform=platform}else self.overflow=true end
   end
  end end
  for _,port in ipairs(self.ports)do if port.entity.valid and port.entity.type=='cargo-landing-pad' then self.jobs[#self.jobs+1]={entity=port.entity}end end
  for id in pairs(self.platforms)do if not known[id]then self.platforms[id]=nil end end
  for id,pending in pairs(self.state.pending)do if pending.delivered and tick-pending.delivered>600 or not pending.entity.valid then self.state.pending[id]=nil;self.state.pending_count=self.state.pending_count-1 end end
 end
 if tick%2==0 then
  local next;if not self.prefer_port or #self.ports==0 then next=table.remove(self.jobs,1)end
  self.prefer_port=not self.prefer_port
  if next then self:start(next.entity,next.platform,tick)
  elseif #self.ports>0 then
   if self.port_cursor>#self.ports then self.port_cursor=1 end
   local port=self.ports[self.port_cursor];local e=port.entity;self.port_cursor=self.port_cursor+1
   if e.valid then self:start(e,nil,tick)else self.port_rows[port.id]=nil;self.port_ids[port.id]=nil;table.remove(self.ports,self.port_cursor-1);self.port_cursor=self.port_cursor-1 end
  end
 end
 self.job=self.job or table.remove(self.fresh_jobs,1)
 local job=self.job;if not job then return end
 if not job.entity.valid or job.inventory and not job.inventory.valid then self.fresh_known[job.key]=nil;self.job=nil;return end
 local current_size=#job.inventory
 if current_size~=job.slots then self.fresh_known[job.key]=nil;self.job=nil;return end
 for _=1,SLOT_BUDGET do
  if job.cursor>job.slots then
   local target=job.platform and self.platforms or self.port_rows;local current=target[job.row.id]
   if current then
    if not job.inventory.get_contents then current.items=rows(job.items);current.complete=true end
    for _,item in ipairs(current.items)do local observed=job.items[item.name..'|'..item.quality]
     if observed and observed.count==item.count then for _,field in ipairs({'spoil_tick_min','spoil_tick_max','spoilable_count','freshness_sum'})do item[field]=observed[field]end;item.freshness_sample_tick=tick end
    end
   end
   self.fresh_known[job.key]=nil;self.job=nil;return
  end
  add_stack(job.items,job.inventory[job.cursor]);job.cursor=job.cursor+1
 end
end
function Space:snapshot(tick)
 local platforms,ports={},{};for _,row in pairs(self.platforms)do platforms[#platforms+1]=row end;for _,row in pairs(self.port_rows)do ports[#ports+1]=row end
 table.sort(platforms,function(a,b)return a.id<b.id end);table.sort(ports,function(a,b)return a.id<b.id end)
 local shipments={};for _,p in pairs(self.state.pending)do if not p.delivered and p.entity.valid and #shipments<512 then
  local d=p.origin and p.destination and self.state.durations[p.origin..'|'..p.destination];local elapsed=p.departed and tick-p.departed
  local eta=d and d.samples>=3 and elapsed and d.total/d.samples-elapsed
  shipments[#shipments+1]={id=p.id,origin=p.origin,destination=p.destination,force=p.force,items=p.items,complete=p.complete,stage=p.landing and 'unloading' or p.departed and 'transit' or 'launching',departed_tick=p.departed,eta_seconds=eta and eta>0 and eta/60 or nil,eta_basis=eta and eta>0 and 'history' or nil}
 end end
 local durations={};for key,d in pairs(self.state.durations)do durations[#durations+1]={route=key,seconds=d.total/d.samples/60,samples=d.samples}end
 local flow_rates=rows(self.rates)
 return {schema_version=1,started_tick=self.state.started_tick,sampled_at_tick=tick,platforms=platforms,ports=ports,shipments=shipments,durations=durations,flow_rates=flow_rates,rate_gap_tick=self.state.rate_gap_tick,rate_overflow=self.state.rate_overflow==true,rate_window_end_tick=math.floor(tick/600)*600,rate_bucket_ticks=600,events=self.state.events,event_floor_tick=self.state.event_floor_tick,dropped_events=self.state.dropped_events,partial_events=self.state.partial_events,overflow=self.overflow,slot_budget=SLOT_BUDGET,event_slot_budget=EVENT_SLOTS,inventory_sampling='incremental',production_statistics_include_transfers=false}
end
return Space
