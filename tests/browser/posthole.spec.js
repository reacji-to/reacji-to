import { test, expect } from '@playwright/test';
import { pagePost } from '../../src/web.js';
const ids = ['123456789', '987654321'];
const card = (id, index, original = false, platform = 'x', url) => `<section class="post-entry ${index === 0 ? 'is-active' : ''}" data-key="${platform}:${id}" data-title="Post ${index + 1}" data-creator="Author ${index + 1}"><article class="${original ? 'card' : 'interface-card'}" data-read-key="${platform}:${id}" aria-label="Post ${index + 1}"><div class="interface-author"><a class="original-link" href="${url || (platform === 'linkedin' ? `https://www.linkedin.com/feed/update/urn:li:activity:${id}/` : `https://x.com/author/status/${id}`)}">Original</a></div><p class="text">Post ${index + 1} about making things for the web.</p>${original ? '<footer class="actions"><a class="reply">Reply</a><a class="heart">Like</a><a class="share">Share</a></footer>' : '<div class="interface-bottom"><span>12 likes</span><button>Unread</button></div>'}</article></section>`;
async function setup(page, view, content = ids.map((id, i) => card(id, i, view === 'original')).join('')) {
  const pod = view.startsWith('ipod'), deck = pod || view === 'tinder';
  await page.route('https://posthole.ink/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;font:15px system-ui;background:${view === 'netflix' ? '#141414' : '#f5f3ee'};color:${view === 'netflix' ? '#eee' : '#222'};--bg:${view === 'netflix' ? '#141414' : '#f5f3ee'};--ink:${view === 'netflix' ? '#eee' : '#222'};--line:#888}.interface-toolbar{padding:12px}article{padding:24px;background:${view === 'netflix' ? '#222' : 'white'};margin:20px auto;max-width:600px;border-radius:12px}.actions,.interface-bottom{display:flex;align-items:center;gap:16px}a{color:inherit}.ipod-shell{width:380px;margin:32px auto;border-radius:32px;padding:28px;background:#ddd}.ipod-screen{height:280px;overflow:auto}.click-wheel{border-radius:50%;background:#eee;width:210px;height:210px;margin:30px auto 0}.ipod-list button{display:block;padding:10px;width:100%}[hidden]{display:none!important}${deck ? '.post-entry:not(.is-active){display:none}' : ''}dialog{width:600px;max-width:95vw;border:0;padding:0;background:#222;color:#eee}.nf-library{display:none}.nf-hero{padding:80px 30px}.nf-close{float:right;margin:12px}
  </style><body data-view="${view}"><div class="interface-toolbar"><form class="interface-picker"><select id="interface-select"><option>${view}</option></select></form></div><div class="viewer-layout">${pod ? '<div class="ipod-shell"><div class="ipod-screen">' : ''}<main class="feed ${view === 'netflix' ? 'nf-library' : ''}">${content}</main>${pod ? '<div class="ipod-list" hidden><button data-post-index="0" aria-current="true">First</button><button data-post-index="1" aria-current="false">Second</button></div></div><div class="click-wheel"></div></div>' : ''}</div>${view === 'netflix' ? `<section class="nf-hero"><button data-open-post="x:${ids[0]}">Read featured</button><button data-open-post="x:${ids[1]}">Read second</button></section><dialog class="nf-dialog"><button class="nf-close" onclick="this.parentElement.close()">Close post</button><div class="nf-dialog-content"></div></dialog>` : ''}</body>` }));
  await page.addInitScript(() => {
    window.sent = []; const docs = new Map();
    window.chrome = {runtime:{sendMessage:async m => {
      sent.push(m);
      const key = p => `${p.platform}:${p.id}:${m.visibility || (m.type === 'local-read' ? 'local' : 'public')}`;
      if (m.type === 'status') return {ok:true,value:{connected:true,actor:{id:42,login:'octocat'}}};
      if (m.type === 'visibility-get') return {ok:true,value:{visibility:'public'}};
      if (m.type === 'react') { const doc={users:m.event.operation === 'remove' || !m.event.emoji ? {} : {42:{login:'octocat',emoji:m.event.emoji}}}; docs.set(key(m.event.post), doc); return {ok:true,value:{actor:{id:42,login:'octocat'},document:doc}}; }
      if (m.type === 'local-read') return {ok:true,value:docs.get(key(m.post)) || {users:{}}};
      return {ok:true,value:{}};
    }}};
  });
  await page.goto(`https://posthole.ink/?view=${view}`);
  if (view === 'netflix') await page.evaluate(() => {
    let entry; const dialog = document.querySelector('dialog');
    document.querySelectorAll('[data-open-post]').forEach(button => button.onclick = () => {
      entry = [...document.querySelectorAll('.post-entry')].find(el => el.dataset.key === button.dataset.openPost);
      dialog.querySelector('.nf-dialog-content').append(entry.querySelector('article')); dialog.showModal();
    });
    dialog.addEventListener('close', () => entry.append(dialog.querySelector('article')));
  });
  await page.addScriptTag({path:'dist/content.js'});
}
async function react(page, scope = page) {
  await scope.getByRole('button', {name:'React with an emoji',exact:true}).first().click();
  await page.getByRole('searchbox').fill('🚀');
  await page.getByRole('button',{name:'rocket',exact:true}).click();
  await expect.poll(() => page.evaluate(() => sent.filter(m => m.type === 'react').length)).toBeGreaterThan(0);
  return page.evaluate(() => sent.filter(m => m.type === 'react').at(-1));
}
for (const view of ['original','x','linkedin','hackernews','gallery','ipod','ipod-color','tinder','terminal','netflix']) {
  test(`${view}: reactions share the original post identity and respect the view`, async ({page}) => {
    const errors=[]; page.on('pageerror', error => errors.push(error.message));
    await setup(page, view);
    const fancy = ['ipod','ipod-color','tinder','terminal','netflix'].includes(view);
    await expect(page.getByRole('button',{name:'React with an emoji',exact:true})).toHaveCount(fancy ? 1 : 2);
    await expect(page.locator('reacji-posthole-bar')).toHaveCount(fancy ? 1 : 0);
    expect((await react(page)).event.post).toEqual({platform:'x',id:ids[0]});
    await expect(page.locator('reacji-to-reactions .chip').first()).toHaveText('🚀');
    if (fancy) await expect(page.locator('.viewer-layout reacji-to-reactions')).toHaveCount(0);
    if (['original','ipod','netflix'].includes(view)) {
      await page.screenshot({path:`artifacts/posthole-${view}.png`});
      await page.setViewportSize({width:390,height:844});
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await page.screenshot({path:`artifacts/posthole-${view}-mobile.png`});
    }
    expect(errors).toEqual([]);
  });
}
test('Postpod follows menu selection, locks an open picker, then catches up', async ({page}) => {
  await setup(page, 'ipod');
  await page.evaluate(() => { document.querySelector('.feed').hidden=true; document.querySelector('.ipod-list').hidden=false; document.querySelectorAll('[data-post-index]').forEach((b,i)=>b.setAttribute('aria-current',String(i===1))); });
  await expect(page.locator('reacji-posthole-bar .label')).toContainText('Post 2');
  await page.getByRole('button',{name:'React with an emoji',exact:true}).click();
  await page.evaluate(() => document.querySelectorAll('[data-post-index]').forEach((b,i)=>b.setAttribute('aria-current',String(i===0))));
  await page.getByRole('searchbox').fill('🚀'); await page.getByRole('button',{name:'rocket',exact:true}).click();
  expect((await page.evaluate(() => sent.find(m=>m.type==='react'))).event.post.id).toBe(ids[1]);
  await expect(page.locator('reacji-posthole-bar .label')).toContainText('Post 1');
  await expect(page.locator('.ipod-screen reacji-to-reactions')).toHaveCount(0);
});
test('Postflix bar remains usable in its modal and returns after closing', async ({page}) => {
  await setup(page, 'netflix');
  await page.getByRole('button',{name:'Read second'}).click();
  await expect(page.locator('dialog reacji-posthole-bar .label')).toContainText('Post 2');
  expect((await react(page, page.locator('dialog'))).event.post.id).toBe(ids[1]);
  await page.getByRole('button',{name:'Close post'}).click();
  await expect(page.locator('body > reacji-posthole-bar')).toHaveCount(1);
  await expect(page.locator('reacji-posthole-bar .chip')).toHaveText('🚀');
});
test('LinkedIn, web URLs, nested replies, and appended posts keep distinct identities', async ({page}) => {
  const url = 'https://news.ycombinator.com/item?id=41234567';
  await setup(page, 'gallery', card(ids[0],0,false,'linkedin') + card('41234567',1,false,'hackernews',url));
  expect((await react(page, page.locator('.post-entry').first())).event.post).toEqual({platform:'linkedin',id:ids[0]});
  expect((await react(page, page.locator('.post-entry').nth(1))).event.post).toEqual(await pagePost(url));
  await page.locator('.interface-bottom').first().evaluate((bottom, html) => bottom.insertAdjacentHTML('beforeend',html), card('111222333',2));
  await expect(page.locator('.post-entry .post-entry reacji-to-reactions')).toHaveCount(1);
  expect((await react(page,page.locator('.post-entry .post-entry'))).event.post.id).toBe('111222333');
  await page.locator('.feed').evaluate((feed,html)=>feed.insertAdjacentHTML('beforeend',html),card('444555666',3));
  await expect(page.getByRole('button',{name:'React with an emoji',exact:true})).toHaveCount(1);
  await page.locator('.post-entry').last().evaluate(el=>el.remove());
  await expect(page.getByRole('button',{name:'React with an emoji',exact:true})).toHaveCount(0);
});

test('existing reactions are read again when selecting a different post and returning', async ({page}) => {
  await setup(page,'netflix');
  await react(page);
  await page.getByRole('combobox',{name:'Reactions for post'}).selectOption(`x:${ids[1]}`);
  await expect(page.getByRole('button',{name:'React with an emoji',exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>sent.some(m=>m.type==='local-read' && m.post.id==='987654321' && m.archive?.url.endsWith('987654321')))).toBe(true);
  await page.getByRole('combobox',{name:'Reactions for post'}).selectOption(`x:${ids[0]}`);
  await expect(page.locator('reacji-posthole-bar .chip')).toHaveText('🚀');
});
test('no reaction bar is shown for an empty deck or a mismatched original URL', async ({page}) => {
  await setup(page,'tinder');
  await expect(page.locator('reacji-posthole-bar')).toBeVisible();
  await page.locator('.is-active').evaluate(el=>el.classList.remove('is-active'));
  await expect(page.locator('reacji-posthole-bar')).toHaveCount(0);
  await page.locator('.post-entry').first().evaluate(el=>{el.querySelector('.original-link').href='https://x.com/author/status/555555555';el.classList.add('is-active');});
  await expect(page.locator('reacji-posthole-bar')).toHaveCount(0);
});
