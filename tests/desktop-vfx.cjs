const {chromium} = require('D:/ChatGPT/Tools/playwright-runner/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async()=>{
  const browser=await chromium.connectOverCDP('http://127.0.0.1:18742');
  try {
    const page=browser.contexts()[0].pages().find(p=>p.url().startsWith('https://factory.local'));
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.evaluate(()=>localStorage.removeItem('factory-control.crt'));
    await page.reload();
    await page.locator('#vfx-toggle').waitFor();
    if(await page.locator('#fullscreen').getAttribute('aria-pressed')==='true') await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.querySelector('#fullscreen').getAttribute('aria-pressed')==='false');
    assert.equal(await page.locator('#vfx-toggle').getAttribute('aria-pressed'),'true','CRT is enabled by default');
    await page.waitForFunction(()=>document.querySelector('.crt-overlay')?.dataset.ready==='true');
    const projection=await page.evaluate(async()=>{
      const {projectCrtPoint}=await import('./vfx/crt-overlay.js');
      return [[500,400],[0,0],[1000,400],[0,400],[500,0],[750,600]].map(([x,y])=>projectCrtPoint(x,y,1000,800,.02));
    });
    assert.deepEqual(projection,[{x:500,y:400},{x:-20,y:-16},{x:1010,y:400},{x:-10,y:400},{x:500,y:-8},{x:752.5,y:602}],'Uniform radial projection across the whole screen');
    const pipeline=await page.evaluate(()=>({
      filter:getComputedStyle(document.querySelector('.console')).filter,
      displacement:document.querySelectorAll('.crt-definitions feDisplacementMap').length,
      channels:document.querySelectorAll('.crt-definitions feColorMatrix').length,
      pointer:getComputedStyle(document.querySelector('.crt-overlay')).pointerEvents
    }));
    assert.match(pipeline.filter,/url/); assert.equal(pipeline.displacement,2); assert.equal(pipeline.channels,3); assert.equal(pipeline.pointer,'none');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>document.querySelector('.crt-overlay').dataset.motion==='reduced');
    assert.equal(await page.locator('.crt-overlay').getAttribute('data-glitch'),'idle');
    await page.locator('#overview-screen').waitFor();
    await page.keyboard.press('F9');
    await page.locator('#session-screen').waitFor();
    await page.waitForFunction(()=>!document.querySelector('#inventory-window').hidden);
    await page.evaluate(()=>document.fonts.ready);
    const baseline=await page.locator('#refresh').boundingBox();
    await page.locator('#vfx-toggle').click();
    assert.equal(await page.locator('.console').evaluate(el=>getComputedStyle(el).filter),'none');
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('#vfx-toggle').getAttribute('aria-pressed')==='false');
    await page.locator('#overview-screen').waitFor();
    await page.keyboard.press('F9');
    await page.locator('#session-screen').waitFor();
    await page.waitForFunction(()=>!document.querySelector('#inventory-window').hidden);
    await page.locator('#vfx-toggle').click();
    await page.waitForFunction(()=>document.querySelector('.crt-overlay').dataset.ready==='true');
    assert.deepEqual(await page.locator('#refresh').boundingBox(),baseline,'Effect never changes layout');
    for(const [width,height] of [[1152,864],[1024,768]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForFunction(()=>Number(document.querySelector('.crt-overlay').dataset.width)===innerWidth);
      for(const id of ['fullscreen','refresh','vfx-toggle','language']) {
        assert.equal(await page.locator('#'+id).evaluate(el=>{
          const b=el.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===el||el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));
        }),true,`${id} remains clickable through overlay`);
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:`D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/vfx-${width}x${height}.png`});
    }
    // Click the visually displaced left edge, outside the original DOM button.
    const warpedPoint=await page.locator('#fullscreen').evaluate(async el=>{
      const {projectCrtPoint}=await import('./vfx/crt-overlay.js');
      const profile=await (await fetch('./vfx/crt-profile.json')).json();
      const rect=el.getBoundingClientRect(),sx=rect.left+2,sy=rect.top+rect.height/2;
      let x=sx,y=sy;
      for(let i=0;i<12;i++){const source=projectCrtPoint(x,y,innerWidth,innerHeight,profile.curvature);x+=sx-source.x;y+=sy-source.y;}
      return {x,y};
    });
    await page.mouse.click(warpedPoint.x,warpedPoint.y);
    await page.waitForFunction(()=>document.querySelector('#fullscreen').getAttribute('aria-pressed')==='true');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.querySelector('#fullscreen').getAttribute('aria-pressed')==='false');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.mouse.move(2,100);
    await page.waitForFunction(()=>document.querySelector('.crt-overlay').dataset.glitch==='active',{},{timeout:18000,polling:25});
    const blocks=await page.evaluate(async()=>{
      const image=new Image(); image.src=[...document.querySelectorAll('.crt-definitions feImage')].at(-1).getAttribute('href'); await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const context=canvas.getContext('2d');context.drawImage(image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
      let changed=0,maxRow=0,verticalChanges=0;
      for(let y=0;y<canvas.height;y++){let row=0;for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4;if(pixels[i]!==128){row++;changed++;}if(pixels[i+1]!==128)verticalChanges++;}maxRow=Math.max(maxRow,row);}
      return {width:canvas.width,height:canvas.height,changed,maxRow,verticalChanges};
    });
    assert.ok(blocks.width>1 && blocks.height>1 && blocks.changed>0,'Glitch map contains screen fragments');
    assert.ok(blocks.maxRow<blocks.width,'Fragments never displace an entire horizontal stripe');
    assert.equal(blocks.verticalChanges,0,'Glitches move horizontally');
    await page.waitForFunction(()=>document.querySelector('.crt-overlay').dataset.glitch==='idle');
    assert.equal(await page.locator('.crt-definitions feDisplacementMap').last().getAttribute('scale'),'0');
    assert.deepEqual(errors,[]);
    const cdp=await page.context().newCDPSession(page); await cdp.send('Emulation.clearDeviceMetricsOverride');
    fs.writeFileSync('D:/ChatGPT/Projects/FactorioMonitor/docs/evidence/desktop-vfx.json',JSON.stringify({passed:true,checked:['default enabled','RGB/lens pipeline','no blocked hit targets','unchanged layout','persisted toggle','reduced motion','live glitch pulse','1152x864','1024x768','fullscreen/Esc'],captured_at:new Date().toISOString()},null,2));
    console.log('CRT VFX: all checks passed');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
