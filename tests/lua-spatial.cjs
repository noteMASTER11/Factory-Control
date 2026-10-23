const fs=require('node:fs'),assert=require('node:assert/strict');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('D:/ChatGPT/Tools/FactorioLuaTest/node_modules/fengari');
const source=fs.readFileSync('mod/factory-telemetry/spatial.lua','utf8');
const test=`
local Spatial=(function() ${source} end)()
local tracker=Spatial.new(4)
local function entity(id,x,surface,force)return {unit_number=id,name='electric-furnace',type='furnace',position={x=x,y=-1},surface={name=surface or 'nauvis',index=1},force={name=force or 'player',index=1}}end
tracker:observe(entity(1,-1),'item_ingredient_shortage','iron-plate',100)
tracker:observe(entity(2,-2),'item_ingredient_shortage','iron-plate',110)
tracker:observe(entity(3,0,'vulcanus'),'no_power',nil,120)
tracker:observe(entity(4,0,'nauvis','another'),'no_fuel',nil,120)
tracker:observe(entity(5,100),'full_output',nil,120)
local data=tracker:snapshot(150)
assert(#data.cells==3,'routine idle states must be excluded and scopes isolated')
local selected
for _,cell in ipairs(data.cells)do if cell.surface=='nauvis' and cell.force=='player'then selected=cell end end
assert(selected.count==2 and selected.x==-1 and selected.y==-1,'negative coordinates use floor and actual spatial cells')
tracker:observe(entity(1,-1),'item_ingredient_shortage','iron-plate',300)
tracker:observe(entity(2,-2),'working','iron-plate',300)
data=tracker:snapshot(300)
for _,cell in ipairs(data.cells)do if cell.surface=='nauvis' and cell.force=='player'then assert(cell.count==1 and cell.first_seen_tick==100,'repeated observation retains duration without double counts')end end
tracker:remove(1)
assert(#tracker:snapshot(301).cells==2,'destroyed or unreadable objects must leave diagnostics')
for id=10,30 do tracker:observe(entity(id,id*32),'no_power',nil,400)end
data=tracker:snapshot(400)
assert(#data.cells<=4 and not data.complete,'overflow must remain bounded and visible')
`;
const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);const status=lauxlib.luaL_dostring(L,to_luastring(test));const error=status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(L,-1));lua.lua_close(L);assert.equal(status,lua.LUA_OK,error);console.log('Spatial collector: all checks passed');
