const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve('src/Factorio.Desktop/Web/locales'),source=JSON.parse(fs.readFileSync(path.join(dir,'ru-RU.json'))),catalog=JSON.parse(fs.readFileSync(path.join(dir,'index.json'))),keys=Object.keys(source).sort();
assert.equal(catalog.defaultLocale,'en-US');assert.equal(catalog.locales.length,11);
assert.deepEqual(catalog.locales.slice(-2).map(e=>e.id),['ru-RU','uk-UA']);assert.equal(catalog.locales[0].id,'en-US');
const parameters=s=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
for(const entry of catalog.locales){const target=JSON.parse(fs.readFileSync(path.join(dir,entry.file),'utf8'));assert.deepEqual(Object.keys(target).sort(),keys,entry.id+' key parity');for(const key of keys){assert.equal(typeof target[key],'string',entry.id+':'+key);assert.deepEqual(parameters(target[key]),parameters(source[key]),entry.id+':'+key+' placeholders');if(!['ru-RU','uk-UA'].includes(entry.id))assert(!/[А-Яа-яЁё]/.test(target[key]),entry.id+':'+key+' Russian copy');}assert(target['language.choose']);}
console.log('Locales: 11 complete JSON dictionaries, key parity, interpolation and no Russian leakage pass ('+keys.length+' keys each)');
