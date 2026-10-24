import { test, expect } from '@playwright/test';
const tweet = id => `<article data-testid="tweet"><p>Illustrative post for extension testing.</p><div data-testid="quoteTweet"><a role="link" href="/quoted/status/555555555"><time>Quoted post</time></a></div><div role="link"><a role="link" href="/quoted/status/666666666"><time>Another quote</time></a></div><a role="link" href="/someone/status/${id}"><time>Today</time></a><div role="group"><button data-testid="reply">Reply</button><button>Repost</button><div class="like-action"><button data-testid="like">Like</button></div></div></article>`;
const linked = id => `<article data-urn="urn:li:activity:${id}"><p>Illustrative LinkedIn post for extension testing.</p><div class="social-details-social-actions"><span class="like-action"><button class="react-button__trigger">Like</button></span><button>Comment</button><button>Repost</button></div></article>`;
for (const platform of ['x','linkedin']) test(`${platform}: picker uses GitHub identity, scopes posts, and handles recycled feed nodes`, async ({page}) => {
  const host = platform === 'x' ? 'x.com' : 'www.linkedin.com';
  await page.route(`https://${host}/**`, route => route.fulfill({ contentType: 'text/html', body: `<html><meta charset="utf-8"><style>body{font:16px system-ui;background:white;color:#151515;margin:50px auto;max-width:600px}article{padding:24px;border-bottom:1px solid #ddd}button{padding:10px}</style><body><h1>Test feed · ${platform}</h1>${(platform === 'x' ? tweet : linked)('123456789')}</body></html>` }));
  await page.addInitScript(() => { window.sent=[]; window.chrome={runtime:{sendMessage:async m=>{sent.push(m);return {ok:true,value:m.type==='status'?{connected:true,actor:{id:42,login:'octocat'}}:m.type==='react'?{actor:{id:42,login:'octocat'},document:{users:m.event.operation==='remove'?{}:{42:{login:'octocat',emoji:m.event.emoji}}}}:{users:{}}};}}}; });
  await page.goto(`https://${host}/feed`); await page.addScriptTag({path:'dist/content.js'});
  const trigger = page.getByRole('button',{name:'React with an emoji',exact:true});
  await expect(trigger).toHaveCount(1);
  await expect(page.locator('.like-action + reacji-to-reactions')).toHaveCount(1);
  await expect(trigger).toHaveAttribute('title','reacji.to');
  await expect(trigger.locator('img')).toBeVisible();
  await expect(trigger).toHaveText('');
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Choose a reaction' }).locator('.identity')).toHaveText('@octocat');
  await page.getByRole('button',{name:'Private',exact:true}).click(); await page.getByRole('searchbox').fill('🚀'); await page.getByRole('button',{name:'rocket',exact:true}).click();
  await expect(trigger).toBeVisible();
  await expect(page.locator('.chip')).toHaveText('🚀1');
  await expect(page.locator('.chip span')).toHaveCount(1);
  const message = await page.evaluate(()=>sent.find(m=>m.type==='react'));
  expect(message.event.post).toEqual({platform,id:'123456789'}); expect(message.visibility).toBe('private'); expect(message.username).toBeUndefined();
  await page.locator('.chip').click();
  await expect(trigger).toBeVisible();
  await expect(page.locator('.chip')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await page.evaluate(()=>sent.filter(m=>m.type==='react').at(-1))).event.operation).toBe('remove');
  await page.evaluate(platform => { const a=document.querySelector('article');if(platform==='x')a.querySelector('a[href*="someone"]').href='/someone/status/987654321';else a.setAttribute('data-urn','urn:li:activity:987654321'); },platform);
  await expect(trigger).toHaveCount(1); await trigger.click(); await page.getByRole('searchbox').fill('🔥');
  await page.screenshot({path:`artifacts/${platform}-picker.png`,animations:'disabled'});
  await page.getByRole('button',{name:'fire',exact:true}).click();
  expect((await page.evaluate(()=>sent.filter(m=>m.type==='react'))).at(-1).event.post.id).toBe('987654321');
});

const sduiKey = id => {
  let value = BigInt(id) << 1n;
  const bytes = [];
  do { const byte = Number(value & 127n); value >>= 7n; bytes.push(byte | (value ? 128 : 0)); } while (value);
  return Buffer.from([18, bytes.length + 1, 8, ...bytes]).toString('base64url') + '-replaceableCommentToolsfixture';
};
const sduiPost = (id, style = '') => `<div role="listitem" componentkey="update-card-focus${id}" style="${style}"><h2>Feed post</h2><p>Illustrative LinkedIn SDUI post.</p><div class="actions"><div class="like-action"><button aria-label="Reaction button state: no reaction">Like</button><button aria-label="Open reactions menu">Reactions</button></div><button aria-label="Comment">Comment</button><button aria-label="Repost">Repost</button></div><div componentkey="${sduiKey(id)}"></div></div>`;
async function sduiFeed(page, body, unavailable = false) {
  await page.route('https://www.linkedin.com/**', route => route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>body{font:16px system-ui;max-width:600px;margin:40px auto}.actions{display:flex;gap:16px}button{padding:10px}[role=listitem]{padding:24px;border:1px solid #ddd}</style>${body}`}));
  await page.addInitScript(({ unavailable }) => {
    window.sent = [];
    const documents = new Map();
    window.chrome = {runtime:{sendMessage:async m => {
      sent.push(m);
      if (m.type === 'linkedin-resolve') return unavailable ? {ok:false,error:'Unavailable'} : {ok:true,value:{id:m.urn.endsWith('7517120023304282112') ? '7517120066396717056' : '7517120066396717999'}};
      if (m.type === 'react') documents.set(m.event.post.id, {users:m.event.emoji && m.event.operation!=='remove' ? {42:{login:'octocat',emoji:m.event.emoji}} : {}});
      if (m.type === 'read' || m.type === 'private-read') return {ok:true,value:documents.get(m.post.id) || {users:{}}};
      return {ok:true,value:m.type==='status'?{connected:true,actor:{id:42,login:'octocat'}}:m.type==='react'?{actor:{id:42,login:'octocat'},document:documents.get(m.event.post.id)}:{users:{}}};
    }}};
  }, { unavailable });
  await page.goto('https://www.linkedin.com/feed/');
  await page.addScriptTag({path:'dist/content.js'});
}

test('LinkedIn SDUI resolves the canonical post and updates recycled cards', async ({page}) => {
  await sduiFeed(page, sduiPost('7517120023304282112'));
  const trigger = page.getByRole('button',{name:'React with an emoji',exact:true});
  await expect(trigger).toHaveCount(1);
  await trigger.click();
  await page.getByRole('searchbox').fill('🚀');
  await page.getByRole('button',{name:'rocket',exact:true}).click();
  expect((await page.evaluate(()=>sent.find(m=>m.type==='react'))).event.post).toEqual({platform:'linkedin',id:'7517120066396717056'});
  await page.evaluate(key=>document.querySelector('[componentkey*="-replaceableCommentTools"]').setAttribute('componentkey',key),sduiKey('7517120023304282999'));
  await expect.poll(()=>page.evaluate(()=>sent.filter(m=>m.type==='linkedin-resolve').length)).toBe(2);
  await expect(trigger).toHaveCount(1);
  await trigger.click();
  await page.getByRole('searchbox').fill('🔥');
  await page.screenshot({path:'artifacts/linkedin-sdui-picker.png'});
  await page.getByRole('button',{name:'fire',exact:true}).click();
  expect((await page.evaluate(()=>sent.filter(m=>m.type==='react').at(-1))).event.post.id).toBe('7517120066396717999');
});

test('LinkedIn SDUI keeps the reaction-menu overlay with the thumb and aligns the icon row', async ({page}) => {
  const icon = '<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="8"/></svg>';
  await sduiFeed(page, `<style>
    body{max-width:600px;margin:24px auto} [role=listitem]{padding:0 12px}
    .actions{align-items:center;height:48px;gap:0}
    .actions button,.actions a{display:flex;align-items:center;gap:4px;border:0;background:none;color:#555;padding:6px;font:14px system-ui}
    .like-action{position:relative;display:flex}
    .actions [aria-label="Open reactions menu"]{position:absolute;inset:0;opacity:0}
    .summary svg{width:12px;height:12px;margin-left:-4px}
    </style><div role="listitem" componentkey="update-card-focus123"><h2>Feed post</h2><p>Illustrative LinkedIn action row</p>
    <div class="actions"><div class="like-action"><button aria-label="Reaction button state: no reaction">${icon}<span>10</span></button><button aria-label="Open reactions menu"></button></div>
    <button aria-label="Comment">${icon}</button><button aria-label="Repost">${icon}<span>2</span></button><a aria-label="Send" href="#send">${icon}</a>
    <a class="summary" href="#reactions" aria-label="10 reactions">${icon}${icon}${icon}</a></div>
    <div componentkey="${sduiKey('7517120023304282112')}"></div></div>`);
  const eyes = page.getByRole('button', { name: 'React with an emoji', exact: true });
  const metrics = () => page.locator('.actions').evaluate(row => {
    const elements = [row.querySelector('.like-action svg'), row.querySelector('reacji-to-reactions').shadowRoot.querySelector('.reaction-slot'),
      ...[...row.querySelectorAll(':scope > button,:scope > a:not(.summary)')].map(el => el.querySelector('svg'))];
    return elements.map(el => { const b = el.getBoundingClientRect(); return { x:b.x+b.width/2, y:b.y+b.height/2 }; });
  });
  for (const width of [1280, 760, 390, 320]) {
    await page.setViewportSize({width, height:900});
    await expect(eyes).toBeVisible();
    await expect.poll(async () => {
      const m = await metrics(), gaps = m.slice(1).map((p,i) => p.x-m[i].x);
      return Math.max(Math.max(...gaps)-Math.min(...gaps), Math.max(...m.map(p=>p.y))-Math.min(...m.map(p=>p.y)));
    }).toBeLessThan(1);
    await expect(page.getByRole('button', {name:'Open reactions menu',exact:true})).toHaveCSS('position','absolute');
    await expect(page.locator('.like-action')).toHaveCSS('display','flex');
    const before = await metrics(), box = await eyes.boundingBox();
    await eyes.click(); await page.getByRole('searchbox').fill('😀'); await page.getByRole('button',{name:'grinning face',exact:true}).click();
    const selected = page.locator('.chip[aria-pressed=true]');
    await expect(selected).toBeVisible();
    await expect.poll(() => eyes.boundingBox()).toEqual(box);
    expect(await metrics()).toEqual(before);
    await page.locator('[role=listitem]').screenshot({path:`artifacts/linkedin-sdui-alignment-${width}.png`});
    await selected.click(); await expect(eyes).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test('LinkedIn SDUI resolves offscreen posts only when scrolled into view', async ({page}) => {
  await sduiFeed(page, sduiPost('7517120023304282112','margin-top:1600px'));
  expect(await page.evaluate(()=>sent.filter(m=>m.type==='linkedin-resolve').length)).toBe(0);
  await page.getByRole('heading',{name:'Feed post'}).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button',{name:'React with an emoji',exact:true})).toHaveCount(1);
});

test('LinkedIn SDUI activity references work directly, including standard base64 slashes', async ({page}) => {
  await sduiFeed(page, sduiPost('7517120023304282112').replace(sduiKey('7517120023304282112'), 'CgsIgICz/Mnnk9TQAQ-replaceableCommentToolsfixture'));
  const trigger = page.getByRole('button',{name:'React with an emoji',exact:true});
  await expect(trigger).toHaveCount(1);
  await trigger.click();
  await page.getByRole('searchbox').fill('🚀');
  await page.getByRole('button',{name:'rocket',exact:true}).click();
  expect((await page.evaluate(()=>sent.find(m=>m.type==='react'))).event.post.id).toBe('7517677238884917248');
  expect(await page.evaluate(()=>sent.filter(m=>m.type==='linkedin-resolve').length)).toBe(0);
});

test('LinkedIn SDUI leaves unidentified posts untouched without retry loops', async ({page}) => {
  await sduiFeed(page, sduiPost('7517120023304282112'), true);
  await expect.poll(()=>page.evaluate(()=>sent.filter(m=>m.type==='linkedin-resolve').length)).toBe(1);
  await page.evaluate(()=>{for(let i=0;i<5;i++)document.body.append(document.createElement('span'));});
  await expect(page.getByRole('button',{name:'React with an emoji',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>sent.filter(m=>m.type==='linkedin-resolve').length)).toBe(1);
});

test('LinkedIn reactions use a separate counted row and keep the eyes beside the thumb', async ({page}) => {
  await sduiFeed(page, sduiPost('7517120023304282112'));
  const host = page.locator('.like-action + reacji-to-reactions');
  const eyes = host.getByRole('button',{name:'React with an emoji',exact:true});
  await expect(eyes).toBeVisible();
  const likeBox = await page.locator('.like-action button').first().boundingBox();
  const eyesBox = await eyes.boundingBox();
  expect(Math.abs((eyesBox.y + eyesBox.height / 2) - (likeBox.y + likeBox.height / 2))).toBeLessThan(12);
  await eyes.click();
  await page.getByRole('searchbox').fill('😁');
  await page.getByRole('button',{name:'beaming face with smiling eyes',exact:true}).click();
  const chip = page.locator('[data-reaction-row] .chip');
  await expect(chip).toHaveText('😁1');
  expect(await eyes.boundingBox()).toEqual(eyesBox);
  expect((await chip.boundingBox()).y).toBeGreaterThan(eyesBox.y);
  await expect(chip.locator('span')).toHaveCount(1);
  await expect(eyes).toBeVisible();
  await page.screenshot({path:'artifacts/linkedin-inline-reaction.png'});
  await chip.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(chip).toHaveCount(0);
  await expect(eyes).toBeVisible();
  expect((await page.evaluate(()=>sent.filter(m=>m.type==='react').at(-1))).event.operation).toBe('remove');
});

test('X spaces every icon equally after the heart, including grouped trailing actions, without selection jitter', async ({page}) => {
  const svg='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>';
  const action=(name,count='')=>`<div class="slot"><button data-testid="${name}">${svg}${count?`<span>${count}</span>`:''}</button></div>`;
  await page.route('https://x.com/**',r=>r.fulfill({contentType:'text/html',body:`<style>
    body{margin:24px;font:14px Arial;color:#536471}article{max-width:1000px;margin:auto;padding:16px;border:1px solid #ddd}
    [role=group]{display:flex;justify-content:space-between;align-items:center;margin-top:40px}.slot{flex:1}.trailing{display:flex;gap:8px}
    button{display:flex;align-items:center;gap:5px;border:0;background:none;color:inherit;padding:6px 0;font:inherit}svg{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:2}
    </style><article data-testid="tweet"><a href="/someone/status/123456789"><time>Today</time></a><p>An X action row with different counter widths.</p><div role="group">
    ${action('reply','2')}${action('retweet')}${action('like','22')}<div class="slot"><a href="/someone/status/123456789/analytics">${svg}<span>747</span></a></div><div class="trailing">${action('bookmark')}${action('share')}</div></div></article>`}));
  await page.addInitScript(()=>{window.chrome={runtime:{sendMessage:async m=>({ok:true,value:m.type==='status'?{connected:true,actor:{id:42,login:'octocat'}}:m.type==='react'?{actor:{id:42,login:'octocat'},document:{users:m.event.emoji && m.event.operation!=='remove'?{42:{login:'octocat',emoji:m.event.emoji}}:{}}}:{users:{}}})}};});
  await page.goto('https://x.com/feed');await page.addScriptTag({path:'dist/content.js'});
  const row=page.locator('article > [role=group]'),eyes=row.getByRole('button',{name:'React with an emoji',exact:true});
  await expect(eyes).toBeVisible();
  const centers=()=>row.evaluate(row=>{
    const icons=[...row.querySelectorAll('svg')];
    icons.splice(3,0,row.querySelector('reacji-to-reactions').shadowRoot.querySelector('.trigger:not([hidden]),.chip'));
    return icons.map(el=>{const b=el.getBoundingClientRect();return Math.round((b.x+b.width/2)*10)/10;});
  });
  for(const width of [1280,760,390]){
    await page.setViewportSize({width,height:900});
    await expect.poll(async()=>{const x=await centers(),gaps=x.slice(1).map((v,i)=>v-x[i]);return Math.max(...gaps)-Math.min(...gaps);}).toBeLessThan(1);
    const before=await centers(),eyesBox=await eyes.boundingBox();
    await eyes.click();await page.getByRole('searchbox').fill('💙');await page.getByRole('button',{name:'blue heart',exact:true}).click();
    const chip=page.locator('[data-reaction-row] .chip');await expect(chip).toBeVisible();
    const chipBox=await chip.boundingBox();
    expect(chipBox.y).toBeGreaterThan(eyesBox.y);expect(await eyes.boundingBox()).toEqual(eyesBox);
    expect(await centers()).toEqual(before);
    await chip.click();await expect(eyes).toBeVisible();expect(await centers()).toEqual(before);
  }
  await page.setViewportSize({width:1280,height:900});
  const beforeCountChange=await centers();
  await page.locator('[data-testid=like] span').evaluate(el=>{el.firstChild.data='2222';});
  await expect.poll(centers).toEqual(beforeCountChange);
  await page.screenshot({path:'artifacts/x-even-action-spacing.png'});
});
