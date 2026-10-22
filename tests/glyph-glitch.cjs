const assert=require('node:assert/strict');
(async()=>{
 const {similarGlyph,glyphParameters,glyphPose}=await import('../src/Factorio.Desktop/Web/vfx/glyph-glitch.js');
 for(const char of 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюяABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'){
  for(const random of [0,.49,.999]){const result=similarGlyph(char,()=>random);assert(/^[\x21-\x7e]$/.test(result),char);assert.notEqual(result,char);}
 }
 const defaults=glyphParameters({glyphFrequency:100,glyphAmount:100});assert.equal(defaults.amount,.01);assert.equal(defaults.minInterval,6500);assert.equal(defaults.maxInterval,13000);
 assert.equal(glyphParameters({glyphFrequency:0,glyphAmount:300}).minInterval,Infinity);
 assert.equal(glyphParameters({glyphFrequency:300,glyphAmount:0}).amount,0);
 assert.equal(glyphParameters({glyphFrequency:300,glyphAmount:300}).amount,.03);
 assert(glyphPose(.1,1).visible);assert(glyphPose(.7,1).visible);assert.equal(glyphPose(1,1).visible,false);assert.equal(glyphPose(1,1).x,0);
 console.log('Similar ASCII glyphs, bounded density, frequency and restoration: all checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
