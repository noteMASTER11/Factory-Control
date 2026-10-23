const assert=require('node:assert/strict');
(async()=>{
 const {resolveLocale}=await import('../src/Factorio.Desktop/Web/i18n.js');
 const catalog={defaultLocale:'en-US',locales:['ru-RU','uk-UA','en-US','de-DE','es-ES','fr-FR','cs-CZ','hu-HU','et-EE','fi-FI','pt-PT'].map(id=>({id}))};
 assert.equal(typeof resolveLocale,'function','system locale resolution is available');
 for(const [input,expected]of [['uk','uk-UA'],['de-AT','de-DE'],['PT_br','pt-PT'],['es-MX','es-ES'],['RU-ru','ru-RU'],['en-GB','en-US'],[null,'en-US'],['xx-XX','en-US'],['','en-US']])assert.equal(resolveLocale(catalog,input).id,expected,input);
 console.log('Locale resolution: exact, language prefix, unknown and unavailable OS locale pass');
})().catch(e=>{console.error(e);process.exitCode=1});
