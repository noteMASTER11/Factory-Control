const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve('src/Factorio.Desktop/Web'),strings=JSON.parse(fs.readFileSync(path.join(root,'locales/ru-RU.json'),'utf8')),icons=JSON.parse(fs.readFileSync(path.join(root,'icons/catalog.json'),'utf8'));
 const {Localization}=await import('../src/Factorio.Desktop/Web/i18n.js'),i18n=new Localization({},'ru-RU',strings);
 for(const name of ['water-barrel','petroleum-gas-barrel','sulfuric-acid-barrel','empty-water-barrel','heavy-oil-cracking','light-oil-cracking','solid-fuel-from-light-oil','solid-fuel-from-petroleum-gas'])assert.notEqual(i18n.prototype(name),name);
 assert.equal(i18n.prototype('water-barrel','item'),'Вода (бочка)');assert.equal(i18n.prototype('water-barrel','recipe'),'Наполнить бочку (Вода)');assert.equal(i18n.prototype('empty-water-barrel','recipe'),'Опустошить бочку (Вода)');
 const matches=i18n.prototypeSearch('боч');assert(matches.includes('water-barrel'));assert(matches.includes('empty-water-barrel'));assert.equal(new Set(matches).size,matches.length);assert(!matches.includes('item.water-barrel'));
 for(const [key,file]of Object.entries(icons))assert(fs.existsSync(path.join(root,'icons',file)),key+': '+file);
 for(const file of Object.values(JSON.parse(fs.readFileSync(path.join(root,'icons/technology/catalog.json'),'utf8'))))assert(fs.existsSync(path.join(root,'icons',file)));
 const audit=path.resolve('docs/evidence/catalog-audit-before.json');if(fs.existsSync(audit))for(const name of JSON.parse(fs.readFileSync(audit,'utf8')).names){assert.notEqual(i18n.prototype(name),name,'Missing live name: '+name);assert(Object.keys(icons).some(key=>key.endsWith('|'+name)),'Missing live icon: '+name);}
 for(const [key,text]of Object.entries(strings))if(key.startsWith('prototype.'))assert(!/__\d+__|__(?:ITEM|FLUID|ENTITY)__/u.test(text),key);
 assert.equal(i18n.prototype('unknown-user-mod-item'),'unknown-user-mod-item');console.log('Game catalog names, typed recipes, search, icons and live coverage: all checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
