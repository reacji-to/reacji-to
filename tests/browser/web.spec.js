import {test,expect} from '@playwright/test';
import {pagePost} from '../../src/web.js';

test('saved pins show only emoji; changes and removals are optimistic and roll back on failure', async({page})=>{
  let finishWrite;
  let doc={users:{},placements:{}};
  await page.route('https://example.test/**',r=>r.fulfill({body:'<p id="target">A sentence worth reacting to.</p>',contentType:'text/html'}));
  await page.exposeFunction('testSend',m=>{
    if(m.type==='status')return {ok:true,value:{connected:true,actor:{id:42,login:'octocat'}}};
    if(m.type==='react')return new Promise(resolve=>{finishWrite=success=>{
      if(!success)return resolve({ok:false,error:'Could not save. Try again.'});
      doc=structuredClone(doc);
      if(m.event.emoji===null)delete doc.placements[m.event.placement.id];
      else doc.placements[m.event.placement.id]={anchor:m.event.placement,users:{42:{login:'octocat',emoji:m.event.emoji}}};
      resolve({ok:true,value:{actor:{id:42,login:'octocat'},document:doc}});
    };});
    return {ok:true,value:doc};
  });
  await page.addInitScript(()=>{window.chrome={runtime:{sendMessage:m=>window.testSend(m),onMessage:{addListener:fn=>window.fromBackground=fn}}};});
  await page.goto('https://example.test/');await page.addScriptTag({path:'dist/content.js'});
  await page.locator('#target').click({button:'right'});await page.evaluate(()=>fromBackground({type:'place-reaction'}));
  await page.getByRole('searchbox').fill('🐣');await page.getByRole('button',{name:'hatching chick',exact:true}).click();
  const chip=page.locator('.pin .chip');
  await expect(chip).toContainText('🐣');await expect(chip).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.pin .trigger')).toBeHidden();
  await expect.poll(()=>Boolean(finishWrite)).toBe(true);finishWrite(true);
  await expect(chip).toBeEnabled();
  await page.screenshot({path:'artifacts/reaction-chip-only.png'});
  await page.setViewportSize({width:390,height:844});
  await chip.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.head strong')).toHaveText('reacji.to @octocat');
  await expect(page.getByRole('button',{name:'Settings',exact:true})).toBeVisible();
  await expect(page.locator('.footer')).toHaveCount(0);
  await page.getByRole('dialog').screenshot({path:'artifacts/picker-header.png'});
  const box=await page.getByRole('dialog').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
  await page.getByRole('searchbox').fill('💙');finishWrite=null;await page.getByRole('button',{name:'blue heart',exact:true}).click();
  await expect(chip).toContainText('💙');await expect.poll(()=>Boolean(finishWrite)).toBe(true);finishWrite(false);
  await expect(chip).toContainText('🐣');await expect(page.getByText(/Previous reaction restored/)).toBeVisible();
  finishWrite=null;await page.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(chip).toContainText('💙');await expect.poll(()=>Boolean(finishWrite)).toBe(true);finishWrite(true);await expect(chip).toBeEnabled();
  await chip.click();finishWrite=null;await page.getByRole('searchbox').fill('💙');await page.getByRole('button',{name:'blue heart',exact:true}).click();
  await expect(chip).toHaveCount(0);await expect(page.locator('.pin')).toBeHidden();
  await expect.poll(()=>Boolean(finishWrite)).toBe(true);finishWrite(false);
  await expect(chip).toContainText('💙');await expect(chip).toBeVisible();
  await chip.click();finishWrite=null;await page.getByRole('searchbox').fill('💙');await page.getByRole('button',{name:'blue heart',exact:true}).click();
  await expect.poll(()=>Boolean(finishWrite)).toBe(true);finishWrite(true);await expect(chip).toHaveCount(0);
  expect(doc.placements).toEqual({});
});

test('picker opens while the existing-reaction read is stalled', async({page})=>{
  await page.route('https://example.test/**',r=>r.fulfill({body:'<p id="target">A slow connection should not hide the picker.</p>',contentType:'text/html'}));
  await page.exposeFunction('testSend',m=>m.type==='visibility-get' ? {ok:true,value:{visibility:'public'}} : m.type==='status'
    ? {ok:true,value:{connected:false,actor:null}}
    : new Promise(()=>{}));
  await page.addInitScript(()=>{window.chrome={runtime:{sendMessage:m=>window.testSend(m),onMessage:{addListener:fn=>window.fromBackground=fn}}};});
  await page.goto('https://example.test/');await page.addScriptTag({path:'dist/content.js'});
  await page.locator('#target').click({button:'right'});
  const reply=await page.evaluate(()=>{let result;fromBackground({type:'place-reaction'},{},value=>result=value);return result;});
  expect(reply).toEqual({handled:true});
  await expect(page.getByRole('dialog')).toBeVisible({timeout:1500});
  await expect(page.getByRole('searchbox')).toBeEditable();
  await expect(page.getByText('Connect GitHub in settings before reacting.')).toBeVisible();
});

test('right-click placement persists, follows DOM movement, hides on mismatch, and separates Private',async({page})=>{
  const docs={public:new Map(),private:new Map()},writes=[];
  const html='<meta charset="utf-8"><style>body{font:18px system-ui;max-width:720px;margin:60px auto;padding:24px;background:#f6f7f8;color:#121417}p{padding:30px;background:white}</style><h1>A page worth reacting to</h1><p id="target">This particular sentence deserves a reaction.</p><input type="password" aria-label="Password">';
  await page.route('https://example.test/**',r=>r.fulfill({body:html,contentType:'text/html'}));
  await page.exposeFunction('testSend',m=>{
    if(m.type==='status')return {ok:true,value:{connected:true,actor:{id:42,login:'octocat'}}};
    const post=m.post||m.event?.post;const scope=m.type==='private-read'?'private':m.visibility||'public';
    let doc=docs[scope].get(post?.id)||{version:1,commit:post?.id,post,users:{},placements:{}};
    if(m.type==='react'){writes.push(m);doc=structuredClone(doc);if(m.event.emoji===null)delete doc.placements[m.event.placement.id];else doc.placements[m.event.placement.id]={anchor:m.event.placement,users:{42:{login:'octocat',emoji:m.event.emoji}}};docs[scope].set(post.id,doc);return {ok:true,value:{document:doc,actor:{id:42,login:'octocat'}}};}
    return {ok:true,value:doc};
  });
  await page.addInitScript(()=>{window.chrome={runtime:{sendMessage:m=>window.testSend(m),onMessage:{addListener:fn=>window.fromBackground=fn}}};});
  const load=async()=>{await page.goto('https://example.test/article?utm_source=test');await page.addScriptTag({path:'dist/content.js'});};
  await load();
  await page.evaluate(()=>fromBackground({type:'place-reaction'}));await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('#target').click({button:'right'});await page.evaluate(()=>fromBackground({type:'place-reaction'}));
  await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('searchbox').fill('💙');await page.getByRole('button',{name:'blue heart',exact:true}).click();
  await expect(page.getByRole('button',{name:/💙, 1 reaction/})).toBeVisible();
  expect(writes[0].event.post).toEqual(await pagePost('https://example.test/article'));expect(writes[0].event.placement.quote).toBe('This particular sentence deserves a reaction.');
  await load();await expect(page.getByRole('button',{name:/💙, 1 reaction/})).toBeVisible();
  await page.locator('#target').evaluate(p=>{const before=document.createElement('p');before.textContent='A newly inserted paragraph.';p.before(before);});
  await expect(page.getByRole('button',{name:/💙, 1 reaction/})).toBeVisible();
  await expect.poll(async()=>{const target=await page.locator('#target').boundingBox(),pin=await page.locator('.pin .chip').first().boundingBox();return pin && pin.y>=target.y+target.height;}).toBe(true);
  await page.locator('.pin .chip').first().click();await page.getByRole('button',{name:'Private',exact:true}).click();await page.getByRole('searchbox').fill('🔥');await page.getByRole('button',{name:'fire',exact:true}).click();
  await expect(page.getByRole('button',{name:/Private: 🔥, 1 reaction/})).toBeVisible();expect(docs.public.values().next().value.placements[writes[0].event.placement.id].users[42].emoji).toBe('💙');
  await page.screenshot({path:'artifacts/web-placement.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.locator('#target').evaluate(p=>{p.style.marginLeft='240px';p.style.width='80px';p.style.padding='8px';});
  await expect.poll(async()=>{const pin=await page.locator('.pin .chip').first().boundingBox();const target=await page.locator('#target').boundingBox();return pin && pin.x>=0 && pin.x+pin.width<=390 && pin.y>=target.y+target.height;}).toBe(true);
  await page.screenshot({path:'.impeccable/review/web-placement-mobile.png',fullPage:true});
  await page.locator('#target').evaluate(p=>{p.style.marginTop='900px';});
  await page.locator('#target').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button',{name:/Private: 🔥, 1 reaction/})).toBeVisible();
  await page.screenshot({path:'.impeccable/review/web-placement-scroll.png',fullPage:true});

  await page.locator('#target').evaluate(p=>p.textContent='Completely different content.');await expect(page.locator('.pin .chip').first()).toBeHidden();
  await page.getByLabel('Password',{exact:true}).click({button:'right'});await page.evaluate(()=>fromBackground({type:'place-reaction'}));await expect(page.getByText('Choose page content outside a text field.')).toBeVisible();expect(writes).toHaveLength(2);
  await page.evaluate(()=>{history.pushState({},'', '/different');document.body.append(document.createElement('hr'));});await expect(page.locator('.pin .chip').first()).toHaveCount(0);
});

test('a private read that finishes after the page is hidden cannot restore private reactions', async({page})=>{
  let resolveRead, placement;
  await page.route('https://example.test/**',r=>r.fulfill({body:'<p id="target">A private annotation target.</p>',contentType:'text/html'}));
  await page.exposeFunction('testSend',m=>{
    if(m.type==='status') return {ok:true,value:{connected:true,actor:{id:42,login:'octocat'}}};
    if(m.type==='react'){placement=m.event.placement;return {ok:true,value:{actor:{id:42,login:'octocat'},document:{placements:{[placement.id]:{anchor:placement,users:{42:{login:'octocat',emoji:'💙'}}}}}}};}
    if(m.type==='private-read') return new Promise(resolve=>{resolveRead=()=>resolve({ok:true,value:{placements:{[placement.id]:{anchor:placement,users:{42:{login:'octocat',emoji:'🔥'}}}}}});});
    return {ok:true,value:{users:{},placements:{}}};
  });
  await page.addInitScript(()=>{window.chrome={runtime:{sendMessage:async m=>{const result=await window.testSend(m);if(m.type==='private-read')window.privateReadFinished=true;return result;},onMessage:{addListener:fn=>window.fromBackground=fn}}};});
  await page.goto('https://example.test/');await page.addScriptTag({path:'dist/content.js'});
  await page.locator('#target').click({button:'right'});await page.evaluate(()=>fromBackground({type:'place-reaction'}));
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('searchbox').fill('💙');await page.getByRole('button',{name:'blue heart',exact:true}).click();
  await expect(page.getByRole('button',{name:/💙, 1 reaction/})).toBeVisible();
  await page.locator('.pin .chip').first().click();
  await page.getByRole('button',{name:'Private',exact:true}).click();
  await expect.poll(()=>Boolean(resolveRead)).toBe(true);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  resolveRead();
  await expect.poll(()=>page.evaluate(()=>window.privateReadFinished)).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.chip')).toHaveCount(0);
});

test('rapid choices stay interactive and older saves cannot undo the newest intent', async ({page}) => {
  let doc={users:{},placements:{}},finish;
  const writes=[];
  await page.route('https://example.test/**',r=>r.fulfill({body:'<p id="target">React here</p>',contentType:'text/html'}));
  await page.exposeFunction('testSend',m=>{
    if(m.type==='status')return {ok:true,value:{connected:true,actor:{id:42,login:'octocat'}}};
    if(m.type==='react') { writes.push(m.event.emoji);return new Promise(resolve=>{finish=success=>{
      if(!success)return resolve({ok:false,error:'Save failed.'});
      doc=structuredClone(doc);
      if(m.event.emoji===null)delete doc.placements[m.event.placement.id];
      else doc.placements[m.event.placement.id]={anchor:m.event.placement,users:{42:{login:'octocat',emoji:m.event.emoji}}};
      resolve({ok:true,value:{actor:{id:42,login:'octocat'},document:doc}});
    };}); }
    return {ok:true,value:doc};
  });
  await page.addInitScript(()=>{window.chrome={runtime:{sendMessage:m=>window.testSend(m),onMessage:{addListener:fn=>window.fromBackground=fn}}};});
  await page.goto('https://example.test/');await page.addScriptTag({path:'dist/content.js'});
  await page.locator('#target').click({button:'right'});await page.evaluate(()=>fromBackground({type:'place-reaction'}));
  const pick=async(emoji,name)=>{await page.getByRole('searchbox').fill(emoji);await page.getByRole('button',{name,exact:true}).click();};
  await pick('🐣','hatching chick');
  const chip=page.locator('.pin .chip');
  await expect(chip).toHaveText('🐣');await expect(chip).toBeEnabled();
  await expect.poll(()=>writes.length).toBe(1);
  await chip.click();await pick('💙','blue heart');
  await expect(chip).toHaveText('💙');expect(writes).toEqual(['🐣']);
  finish(true);await expect.poll(()=>writes.length).toBe(2);
  await expect(chip).toHaveText('💙');
  finish(false);await expect(chip).toHaveText('🐣');
  await expect(page.getByText(/Previous reaction restored/)).toBeVisible();
  await chip.click();await pick('🔥','fire');await expect.poll(()=>writes.length).toBe(3);
  await chip.click();await pick('🎉','party popper');await expect(chip).toHaveText('🎉');
  finish(false);await expect.poll(()=>writes.length).toBe(4);await expect(chip).toHaveText('🎉');
  finish(true);await expect(chip).toHaveAttribute('aria-pressed','true');
  await chip.click();await pick('🎉','party popper');
  await expect(chip).toHaveCount(0);await expect.poll(()=>writes.length).toBe(5);
  finish(true);await expect.poll(()=>Object.keys(doc.placements).length).toBe(0);
});
