const fs=require('node:fs'),assert=require('node:assert/strict');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('D:/ChatGPT/Tools/FactorioLuaTest/node_modules/fengari');
const modulePath='D:/ChatGPT/Projects/FactorioMonitor/mod/factory-telemetry/combat.lua';
assert(fs.existsSync(modulePath),'Combat event collector is not implemented');
const moduleSource=fs.readFileSync(modulePath,'utf8');
const tests=`
local Combat=(function() ${moduleSource} end)()
local friendly={name='player',is_enemy=function(other)return other.name=='enemy'end}
local enemy={name='enemy'}
local function building(id,name,quality) return {valid=true,unit_number=id,name=name or 'stone-wall',type='wall',force=friendly,surface={name='nauvis'},quality={name=quality or 'normal'},position={x=id,y=0},prototype={items_to_place_this={{name='stone-wall',count=1}}}} end
local c=Combat.new();local e=building(1)
c:damage({entity=e,force=friendly,final_damage_amount=10},1);assert(#c:snapshot(1).episodes==0,'friendly fire is not an attack')
c:damage({entity=e,force=enemy,final_damage_amount=10},10);local s=c:snapshot(10);assert(#s.episodes==1 and s.episodes[1].active,'hostile damage starts an episode')
c:death({entity=e,force=enemy},20);s=c:snapshot(20);assert(s.episodes[1].destroyed==1);assert(s.episodes[1].losses[1].pending==1);assert(s.episodes[1].losses[1].placement[1].name=='stone-wall')
c:built(building(1));s=c:snapshot(30);assert(s.episodes[1].losses[1].rebuilt==1 and s.episodes[1].losses[1].pending==0,'robot or player rebuilding clears the pending cost')
c:death({entity=building(1),force=enemy},40);s=c:snapshot(40);assert(s.episodes[1].destroyed==2 and s.episodes[1].losses[1].pending==1,'a rebuilt building can be destroyed again')
assert(c:snapshot(939).episodes[1].active);assert(not c:snapshot(940).episodes[1].active,'900 quiet ticks end the attack')
c:damage({entity=building(2),force=enemy,final_damage_amount=1},950);assert(#c:snapshot(950).episodes==2,'a later attack gets a distinct episode')
local bot=building(3);bot.type='logistic-robot';c:death({entity=bot,force=enemy},960);assert(c:snapshot(960).episodes[2].destroyed==0,'mobile robots are not reconstruction buildings')
local restored=Combat.new(c.state);assert(#restored:snapshot(960).episodes==2,'state survives save reload')
for i=1,300 do local b=building(10+i,'building-'..i);restored:death({entity=b,force=enemy},970)end
s=restored:snapshot(970);assert(#s.episodes[2].losses<=128 and not s.episodes[2].tracking_complete,'bounded loss groups must disclose overflow')
for i=1,12 do restored:damage({entity=building(i),force=enemy,final_damage_amount=1},2000+i*1000)end
assert(#restored:snapshot(15000).episodes<=8,'history must remain bounded')
local bounded=Combat.new();for i=1,8200 do bounded:death({entity=building(i),force=enemy},1)end
assert(bounded.state.episodes[1].site_count==8192 and not bounded:snapshot(1).episodes[1].tracking_complete,'rebuild index overflow must remain bounded and explicit')
`;
const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);const result=lauxlib.luaL_dostring(L,to_luastring(tests));const error=result===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1));lua.lua_close(L);assert.equal(result,lua.LUA_OK,error);console.log('Combat Lua events: all checks passed');
