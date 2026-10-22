// Optional rebuild; the checked-in ES module needs no package manager at runtime.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const esbuild=require('D:/ChatGPT/Tools/PixiCrtProbe/node_modules/esbuild');
await esbuild.build({stdin:{contents:"import 'pixi.js/unsafe-eval';export {Application,Sprite,Texture,CanvasSource,DisplacementFilter,Rectangle,ColorMatrixFilter,TexturePool} from 'pixi.js';export {CRTFilter,RGBSplitFilter,GlitchFilter,ConvolutionFilter} from 'pixi-filters';",resolveDir:'D:/ChatGPT/Tools/PixiCrtProbe'},bundle:true,minify:true,format:'esm',target:'es2022',outfile:new URL('../src/Factorio.Desktop/Web/vfx/vendor/pixi-vendor.js',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),legalComments:'external'});
