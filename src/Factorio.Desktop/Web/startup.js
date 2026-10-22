import {FrameClock} from './frame-clock.js';
import {Localization} from './i18n.js';
import {AppIntro} from './vfx/app-intro.js';
export const startup=new AppIntro(new FrameClock(30));
export const localeReady=Localization.load().then(i18n=>{startup.localize(i18n);return i18n;}).catch(error=>{startup.fail();throw error;});
startup.assets();
Promise.all([document.fonts.load('400 16px "Iosevka Term Slab"'),document.fonts.load('600 16px "Iosevka Term Slab"')]).then(()=>startup.mark('fonts')).catch(()=>startup.mark('fonts','degraded'));
