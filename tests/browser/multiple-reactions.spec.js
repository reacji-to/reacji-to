import { test, expect } from '@playwright/test';
import { parseReaction, updateReactionUser } from '../../src/protocol.js';

const owner={id:42,login:'octocat'};
const posts={x:{platform:'x',id:'123456789'},linkedin:{platform:'linkedin',id:'123456789'},devnull:{platform:'devnull',id:'01a14f9d-76a7-72d9-a92d-48ae9ea999cb'}};
const urls={x:'https://x.com/home',linkedin:'https://www.linkedin.com/feed/',devnull:'https://dev-null.sh/'};
async function setup(page,platform,{empty=false}={}) {
  const post=posts[platform];
  const identity=platform==='x'?'data-testid="tweet"':platform==='linkedin'?'data-urn="urn:li:activity:123456789"':`data-commit="${post.id}"`;
  const link=platform==='x'?'/someone/status/123456789':platform==='devnull'?`/@octocat/commits/${post.id}`:'#';
  const actions=platform==='x'?'<button data-testid="reply">Reply</button><button data-testid="like">Like</button><button>Repost</button>':platform==='linkedin'?'<button class="react-button__trigger">Like</button><button>Comment</button><button>Repost</button>':'<button data-test="star-commit-button">Star</button><button>Quote</button><button>Reply</button>';
  const html=`<meta charset="utf-8"><style>body{margin:0;font:16px system-ui;background:#f8f9fb;color:#18212b}article{margin:24px auto;padding:20px;max-width:560px;background:white;border:1px solid #dce1e8;border-radius:12px;box-sizing:border-box}h2{font-size:18px;margin:0}p{margin:12px 0 20px}.actions{display:flex;justify-content:space-between;align-items:center;gap:8px}button{font:14px system-ui;border:0;background:transparent;padding:8px;color:#52606d}a{color:#52606d;font-size:12px}@media(max-width:600px){article{margin:16px 12px}}</style><article ${identity}><h2>Russell Horton</h2><a href="${link}"><time>11:16 AM</time></a><p>just playing with something here</p><div class="actions social-details-social-actions" role="group">${actions}</div></article>`;
  await page.route(urls[platform].replace(/\/(home|feed\/)?$/, '/**'),route=>route.request().headers()['x-inertia']?route.fulfill({json:{props:{auth:{user:{username:'octocat'}}}}}):route.fulfill({body:html,contentType:'text/html'}));
  const docs={public:{version:1,commit:post.id,post,users:empty?{}:{99:{login:'friend',emoji:'🔥'}}},private:{version:1,commit:post.id,post,users:{}}};
  let visibility='public',gate=null;
  const writes=[];
  await page.exposeFunction('testRuntime',async message=>{
    try {
      if(message.type==='status')return {ok:true,value:{connected:true,actor:owner}};
      if(message.type==='visibility-get')return {ok:true,value:{visibility}};
      if(message.type==='visibility-save'){visibility=message.visibility;return {ok:true,value:{}};}
      if(message.type==='read'||message.type==='private-read')return {ok:true,value:structuredClone(docs[message.type==='read'?'public':'private'])};
      if(message.type==='react'){
        writes.push(message);
        if(gate){const pending=gate;gate=null;await pending;}
        const event=parseReaction(message.event),doc=docs[message.visibility];
        const next=updateReactionUser(doc.users[owner.id],event,{login:owner.login});
        if(next)doc.users[owner.id]=next;else delete doc.users[owner.id];
        return {ok:true,value:{actor:owner,document:structuredClone(doc)}};
      }
      return {ok:true,value:{}};
    }catch(error){return {ok:false,error:error.message};}
  });
  await page.addInitScript(()=>{window.chrome={runtime:{sendMessage:message=>window.testRuntime(message)}};});
  const load=async()=>{await page.goto(urls[platform]);await page.addScriptTag({path:'dist/content.js'});};
  await load();
  return {docs,writes,load,hold:()=>{let reject,resolve;gate=new Promise((yes,no)=>{resolve=yes;reject=no;});return {resolve,reject};}};
}
async function pick(page,emoji,add=false) {
  await page.getByRole('button',{name:add?'Add reaction':'React with an emoji',exact:true}).first().click();
  await page.getByRole('searchbox').fill(emoji);
  await page.locator('.grid .emoji').click();
}
for(const platform of ['x','linkedin','devnull'])test(`${platform}: independent reactions, counts, dedicated row, reload and private separation`,async({page})=>{
  const {docs,load}=await setup(page,platform);
  const eyes=page.getByRole('button',{name:'React with an emoji',exact:true});
  const row=page.locator('[data-reaction-row]');
  const before=await page.locator('.actions').boundingBox();
  await pick(page,'🙌');await pick(page,'😅',true);await pick(page,'🔥',true);
  await expect(row.locator('.chip')).toHaveCount(3);
  await expect(row.getByRole('button',{name:/🔥, 2 reactions, yours/})).toHaveText('🔥2');
  await expect(eyes).toBeVisible();
  const after=await page.locator('.actions').boundingBox();expect(after).toEqual(before);
  expect((await row.boundingBox()).y).toBeGreaterThanOrEqual(after.y+after.height);
  await row.getByRole('button',{name:'Add reaction'}).click();
  await page.getByRole('searchbox').fill('🙌');
  await expect(page.locator('.grid .emoji')).toHaveAttribute('aria-pressed','true');
  await page.getByRole('searchbox').press('Escape');
  await expect(row.getByRole('button',{name:'Add reaction'})).toBeFocused();
  await row.getByRole('button',{name:/😅, 1 reaction, yours/}).click();
  await expect(row.locator('.chip')).toHaveCount(2);
  await expect.poll(()=>docs.public.users[42]?.emojis).toEqual(['🙌','🔥']);
  await load();await expect(row.locator('.chip')).toHaveCount(2);
  await row.getByRole('button',{name:'Add reaction'}).click();
  await page.getByRole('button',{name:'Private',exact:true}).click();
  await page.getByRole('searchbox').fill('💙');await page.locator('.grid .emoji').click();
  await expect(row.locator('.chip')).toHaveCount(1);
  expect(docs.public.users[42].emojis).toEqual(['🙌','🔥']);
  await row.getByRole('button',{name:'Add reaction'}).click();
  await page.getByRole('button',{name:'Public',exact:true}).click();
  await page.getByRole('searchbox').press('Escape');
  await pick(page,'🐱',true);await pick(page,'💯',true);
  await page.locator('article').screenshot({path:`artifacts/${platform}-multiple-reactions.png`});
  await page.setViewportSize({width:320,height:800});
  await expect(row.locator('.chip')).toHaveCount(4);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const add=await row.getByRole('button',{name:'Add reaction'}).boundingBox();
  expect(add.x+add.width).toBeLessThanOrEqual(320);
  await page.locator('article').screenshot({path:`artifacts/${platform}-multiple-reactions-mobile.png`});
});
test('queued additions survive an earlier failure and removal rolls back only its own emoji',async({page})=>{
  const {docs,hold,writes}=await setup(page,'x',{empty:true});
  const first=hold();await pick(page,'🙌');
  await expect.poll(()=>writes.length).toBe(1);
  await pick(page,'💙',true);
  await expect(page.locator('[data-reaction-row] .chip')).toHaveCount(2);
  first.reject(new Error('Save failed.'));
  await expect.poll(()=>docs.public.users[42]?.emojis).toEqual(['💙']);
  await expect(page.locator('[data-reaction-row] .chip')).toHaveCount(1);
  const removal=hold();await page.locator('[data-reaction-row] .chip').click();
  await expect(page.locator('[data-reaction-row]')).toBeHidden();
  removal.reject(new Error('Remove failed.'));
  await expect(page.locator('[data-reaction-row] .chip')).toHaveText('💙1');
});
