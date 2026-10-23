const fs=require('node:fs'),assert=require('node:assert/strict');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('D:/ChatGPT/Tools/FactorioLuaTest/node_modules/fengari');
const source=fs.readFileSync('mod/factory-telemetry/native-map.lua','utf8');
const test=`local NativeMap=(function() ${source} end)()
local calls,writes,docs,binary_writes=0,{},{},0
helpers={write_file=function(p,v)writes[p]=v;if p:match('%.bin$')then binary_writes=binary_writes+1 end end,table_to_json=function(v)docs[#docs+1]=v;return '{}'end}
local surface={index=7,name='gleba'}
local color='a'
local force={index=3,name='Newbies',is_chunk_charted=function(_,c)return c.x>=-2 end,get_chunk_chart=function()calls=calls+1;return string.rep(color,2048)end}
local map=NativeMap.new('seed:load')
for i=0,50 do map:discover(surface,{x=i,y=-1},{force},true)end
map:discover(surface,{x=-10,y=0},{force},true)
map:discover(surface,{x=0,y=-1},{force},true)
for tick=1,360 do local old=calls;map:step(tick,false);assert(calls-old<=1,'at most one native chart read per step')end
assert(calls==51,'new chunks are captured once, duplicate and uncharted chunks excluded')
local doc=docs[#docs]
assert(doc.session_id=='seed:load' and doc.chunk_size==32 and doc.format=='rgb565le','native format and session are explicit')
assert(#doc.scopes==1 and #doc.scopes[1].tiles==51,'manifest contains completed captures only')
assert(doc.scopes[1].surface=='gleba' and doc.scopes[1].force=='Newbies','map scopes retain actual force and planet')
assert(doc.generation:match('^[%w_-]+$'),'generation must be a valid path component')
for path,bytes in pairs(writes)do if path:match('%.bin$')then assert(#bytes==2048,'native binary layout preserved')end end
for tick=361,6000 do map:step(tick,false)end
assert(binary_writes==51,'unchanged map pixels must not rewrite files or invalidate the client cache')
color='b';for tick=6001,9000 do map:step(tick,false)end
assert(binary_writes==102,'changed pixels eventually replace their cached versions')
local base=NativeMap.new('base')
base:discover(surface,{x=10000,y=10000},{force},false)
assert(#base.rows==0,'distant charted radar terrain is outside the navigator collection area')
for x=0,599 do base:discover(surface,{x=x,y=0},{force},true)end
assert(#base.rows==600,'the player/base region must not stop at 256 chunks')
base:track{surface=surface,force=force,position={x=32,y=0}}
assert(base.known['7-3:1:1'],'a factory retains its surrounding terrain even if its centre was already queued')
local moving=NativeMap.new('moving')
for tick=1,180 do moving:step(tick,false,{{index=1,surface=surface,force=force,position={x=3200,y=3200}}})end
assert(moving.known['7-3:100:100'],'the player area is scheduled without a UI request')
local visible_right,visibility_reads=6,0
local live_force={index=4,name='live',is_chunk_charted=function()return true end,is_chunk_visible=function(_,c)visibility_reads=visibility_reads+1;return c.x>=-4 and c.x<=visible_right and c.y>=-3 and c.y<=5 end,get_chunk_chart=force.get_chunk_chart}
local active=NativeMap.new('active')
active:discover(surface,{x=0,y=0},{live_force},true)
active:discover(surface,{x=10000,y=10000},{live_force},false)
for tick=1,3000 do local old,before=calls,visibility_reads;active:step(tick,false);assert(calls-old<=1,'visible-region fill retains one chart read per scheduled step');assert(visibility_reads-before<=4,'visibility probes remain bounded too')end
assert(active.known['7-4:6:5'],'the complete actively visible area must fill beyond factory halos')
assert(active.captured==99,'empty visible terrain is included, historical radar-only terrain is excluded')
assert(not active.known['7-4:10000:10000'])
visible_right=8
for tick=3001,10000 do active:step(tick,false)end
assert(active.known['7-4:8:5'],'visibility expanding after the initial pass must be discovered without player movement')
assert(active.captured==117)
local queued=NativeMap.new('priority')
for x=0,999 do queued:discover(surface,{x=x,y=0},{force},true)end
for tick=1,7200 do queued:step(tick,false)end
queued:discover(surface,{x=2000,y=0},{force},true)
for tick=7201,7236 do queued:step(tick,false)end
assert(queued.rows[#queued.rows].tile,'first capture must not wait behind a complete old-map refresh cycle')
`;
const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);const status=lauxlib.luaL_dostring(L,to_luastring(test));const error=status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1));lua.lua_close(L);assert.equal(status,lua.LUA_OK,error);console.log('Native chart export: all checks passed');
