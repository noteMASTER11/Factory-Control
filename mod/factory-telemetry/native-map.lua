-- Native M-map pixels. No UI-driven game queries; capture is bounded and cached on disk.
local NativeMap={};NativeMap.__index=NativeMap
local player_offsets={}
for radius=0,12 do for dx=-radius,radius do for dy=-radius,radius do if math.abs(dx)==radius or math.abs(dy)==radius then player_offsets[#player_offsets+1]={dx,dy}end end end end
local function fingerprint(pixels)
 local hash=5381;for i=1,#pixels do hash=(hash*33+string.byte(pixels,i))%4294967296 end;return hash
end
function NativeMap.new(session)
 return setmetatable({session=session,generation=session:gsub('[^%w_-]','_'),scopes={},rows={},known={},halos={},players={},player_cursor=1,cursor=1,captured=0,pending={},pending_head=1,pending_tail=0,capture_turn=0,last_manifest=-300,dirty=true,complete=true},NativeMap)
end
function NativeMap:enqueue(s,f,x,y,important)
 local scope_id=s.index..'-'..f.index;local key=scope_id..':'..x..':'..y
 if self.known[key]then return end
 local scope=self.scopes[scope_id]
 if not important and (not f.is_chunk_visible or not f.is_chunk_visible(s,{x=x,y=y}))then return end
 if #self.rows>=131072 then self.complete=false;return end
 if not f.get_chunk_chart or not f.is_chunk_charted(s,{x=x,y=y})then return end
 if not scope then scope={id=scope_id,surface=s.name,force=f.name,surface_id=s.index,force_id=f.index,queued=0,tiles={}};self.scopes[scope_id]=scope end
 scope.queued=scope.queued+1
 local row={surface=s,force=f,scope=scope,x=x,y=y,tick=nil}
 self.rows[#self.rows+1]=row;self.known[key]=true
 self.pending_tail=self.pending_tail+1;self.pending[self.pending_tail]=row;self.dirty=true
end
function NativeMap:discover(s,c,forces,important)
 for _,f in ipairs(forces)do self:enqueue(s,f,c.x,c.y,important)end
end
function NativeMap:track(e)
 local x,y=math.floor(e.position.x/32),math.floor(e.position.y/32)
 local key=e.surface.index..'-'..e.force.index..':'..x..':'..y
 if self.halos[key]then return end;self.halos[key]=true
 for dx=-1,1 do for dy=-1,1 do self:enqueue(e.surface,e.force,x+dx,y+dy,true)end end
end
function NativeMap:publish(tick,multiplayer)
 local scopes={}
 for _,scope in pairs(self.scopes)do
  scopes[#scopes+1]={id=scope.id,surface=scope.surface,force=scope.force,surface_id=scope.surface_id,force_id=scope.force_id,tiles=scope.tiles}
 end
 local doc={schema_version=1,session_id=self.session,generation=self.generation,tick=tick,chunk_size=32,format='rgb565le',area_policy='factory_player_and_visible',scopes=scopes,captured=self.captured,queued=#self.rows,pending_captures=#self.rows-self.captured,complete=self.complete and self.captured==#self.rows,overflow=not self.complete}
 helpers.write_file('factory-telemetry/map.json',helpers.table_to_json(doc),false,multiplayer and 0 or nil)
 self.last_manifest=tick;self.dirty=false
end
function NativeMap:step(tick,multiplayer,players)
 -- One nearby chart coordinate per scheduled step, including while the player
 -- moves. This only queues already charted terrain; no UI controls this work.
 if tick%6==3 and players and #players>0 then
  if self.player_cursor>#players then self.player_cursor=1 end
  local p=players[self.player_cursor];self.player_cursor=self.player_cursor+1
  local cx,cy=math.floor(p.position.x/32),math.floor(p.position.y/32);local id=p.index
  local job=self.players[id]
  if not job or job.surface~=p.surface.index or job.force~=p.force.index or math.abs(job.x-cx)>4 or math.abs(job.y-cy)>4 or (job.at>#player_offsets and (job.x~=cx or job.y~=cy))then
   job={surface=p.surface.index,force=p.force.index,x=cx,y=cy,at=1};self.players[id]=job
  end
  local offset=player_offsets[job.at]
  if offset then self:enqueue(p.surface,p.force,job.x+offset[1],job.y+offset[2],true);job.at=job.at+1 end
 end
 if tick%6==0 and #self.rows>0 then
  local function pending()
   local row=self.pending[self.pending_head]
   if row then self.pending[self.pending_head]=nil;self.pending_head=self.pending_head+1 end
   if self.pending_head>self.pending_tail then self.pending={};self.pending_head=1;self.pending_tail=0 end
   return row
  end
  -- Fill new terrain first; reserve every sixth slot for existing map updates.
  self.capture_turn=self.capture_turn%6+1
  local row=self.capture_turn~=6 and pending()or nil
  if not row then for _=1,8 do
   if self.cursor>#self.rows then self.cursor=1 end
   local candidate=self.rows[self.cursor];self.cursor=self.cursor+1
   if candidate and candidate.tick and tick-candidate.tick>=1800 then row=candidate;break end
  end end
  row=row or pending()
  if row then
    if row.surface.valid~=false and row.force.valid~=false then
     local pixels=row.force.get_chunk_chart(row.surface,{x=row.x,y=row.y})
     local hash=pixels and #pixels==2048 and fingerprint(pixels)
     if hash and hash~=row.hash then
      helpers.write_file('factory-telemetry/map/'..self.generation..'/'..row.scope.id..'/'..row.x..'_'..row.y..'.bin',pixels,false,multiplayer and 0 or nil)
      if not row.tile then row.tile={row.x,row.y,tick};row.scope.tiles[#row.scope.tiles+1]=row.tile;self.captured=self.captured+1 end
      row.tile[3]=tick;row.hash=hash;self.dirty=true
     end
     -- Expand through currently visible terrain, including empty gaps and belts.
     -- Failed boundary checks are retried on the normal cached-map refresh.
     self:enqueue(row.surface,row.force,row.x-1,row.y,false)
     self:enqueue(row.surface,row.force,row.x+1,row.y,false)
     self:enqueue(row.surface,row.force,row.x,row.y-1,false)
     self:enqueue(row.surface,row.force,row.x,row.y+1,false)
    end
    row.tick=tick
  end
 end
 if self.dirty and tick-self.last_manifest>=300 then self:publish(tick,multiplayer)end
end
return NativeMap
