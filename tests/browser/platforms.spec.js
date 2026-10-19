import { test, expect } from '@playwright/test';
const tweet = id => `<article data-testid="tweet"><p>Illustrative post for extension testing.</p><div data-testid="quoteTweet"><a role="link" href="/quoted/status/555555555"><time>Quoted post</time></a></div><div role="link"><a role="link" href="/quoted/status/666666666"><time>Another quote</time></a></div><a role="link" href="/someone/status/${id}"><time>Today</time></a><div role="group"><button data-testid="reply">Reply</button><button>Repost</button><div class="like-action"><button data-testid="like">Like</button></div></div></article>`;
const linked = id => `<article data-urn="urn:li:activity:${id}"><p>Illustrative LinkedIn post for extension testing.</p><div class="social-details-social-actions"><span class="like-action"><button class="react-button__trigger">Like</button></span><button>Comment</button><button>Repost</button></div></article>`;
for (const platform of ['x','linkedin']) test(`${platform}: picker uses GitHub identity, scopes posts, and handles recycled feed nodes`, async ({page}) => {
  const host = platform === 'x' ? 'x.com' : 'www.linkedin.com';
  await page.route(`https://${host}/**`, route => route.fulfill({ contentType: 'text/html', body: `<html><meta charset="utf-8"><style>body{font:16px system-ui;background:white;color:#151515;margin:50px auto;max-width:600px}article{padding:24px;border-bottom:1px solid #ddd}button{padding:10px}</style><body><h1>Test feed · ${platform}</h1>${(platform === 'x' ? tweet : linked)('123456789')}</body></html>` }));
  await page.addInitScript(() => { window.sent=[]; window.chrome={runtime:{sendMessage:async m=>{sent.push(m);return {ok:true,value:m.type==='status'?{connected:true,actor:{id:42,login:'octocat'}}:m.type==='react'?{actor:{id:42,login:'octocat'},document:{users:{42:{login:'octocat',emoji:m.event.emoji}}}}:{users:{}}};}}}; });
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
  await expect(trigger).toBeHidden();
  await expect(page.locator('.chip')).toHaveText('🔒 🚀');
  await expect(page.locator('.chip span')).toHaveCount(0);
  const message = await page.evaluate(()=>sent.find(m=>m.type==='react'));
  expect(message.event.post).toEqual({platform,id:'123456789'}); expect(message.visibility).toBe('private'); expect(message.username).toBeUndefined();
  await page.locator('.chip').click();
  await expect(trigger).toBeVisible();
  await expect(page.locator('.chip')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await page.evaluate(()=>sent.filter(m=>m.type==='react').at(-1))).event.emoji).toBeNull();
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
      if (m.type === 'react') documents.set(m.event.post.id, {users:m.event.emoji ? {42:{login:'octocat',emoji:m.event.emoji}} : {}});
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

test('LinkedIn reactions stay beside the thumb, replace the eyes, and omit counters', async ({page}) => {
  await sduiFeed(page, sduiPost('7517120023304282112'));
  const host = page.locator('.like-action + reacji-to-reactions');
  const eyes = host.getByRole('button',{name:'React with an emoji',exact:true});
  await expect(eyes).toBeVisible();
  const likeBox = await page.locator('.like-action').boundingBox();
  const eyesBox = await eyes.boundingBox();
  expect(Math.abs((eyesBox.y + eyesBox.height / 2) - (likeBox.y + likeBox.height / 2))).toBeLessThan(12);
  await eyes.click();
  await page.getByRole('searchbox').fill('😁');
  await page.getByRole('button',{name:'beaming face with smiling eyes',exact:true}).click();
  const chip = host.locator('.chip');
  await expect(chip).toHaveText('😁');
  await expect(chip.locator('span')).toHaveCount(0);
  await expect(eyes).toBeHidden();
  await page.screenshot({path:'artifacts/linkedin-inline-reaction.png'});
  await chip.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(chip).toHaveCount(0);
  await expect(eyes).toBeVisible();
  expect((await page.evaluate(()=>sent.filter(m=>m.type==='react').at(-1))).event.emoji).toBeNull();
});
