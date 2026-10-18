import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, pagePost, verifyPagePost, placementRef } from '../src/web.js';
import { postRef, postPath } from '../src/posts.js';
import { loadFollowing, filterReactions } from '../src/following.js';
import { currentDevNullUser } from '../src/identity.js';

test('web identity preserves meaningful routes, rejects unsafe URLs, and binds hash to URL', async () => {
  assert.equal(canonicalUrl('https://example.test/a?x=1&utm_source=test#section'), 'https://example.test/a?x=1');
  assert.notEqual((await pagePost('https://example.test/#/one')).id,(await pagePost('https://example.test/#/two')).id);
  const post = await pagePost('https://example.test/a?x=1');
  assert.equal(postPath(post),`data/web/${post.id}.json`);
  await verifyPagePost(post);
  await assert.rejects(verifyPagePost({...post,url:'https://elsewhere.test/'}),/match/);
  for (const url of ['javascript:alert(1)','file:///etc/passwd','https://token@example.test/']) assert.throws(()=>postRef({...post,url}));
});
test('placements reject arbitrary selector syntax and oversized excerpts', () => {
  const good = {id:crypto.randomUUID(),selector:'html:nth-of-type(1) > body:nth-of-type(1) > p:nth-of-type(2)',tag:'p',quote:'A sentence.',x:200,y:500};
  assert.deepEqual(placementRef(good),good);
  for(const bad of [{selector:'body:has(*)'},{quote:'a'.repeat(161)},{id:'__proto__'},{x:1001},{selector:'script'}]) assert.throws(()=>placementRef({...good,...bad}));
});
test('following pagination uses dev-null identities, no credentials, and never follows another origin', async () => {
  let count=0;
  const page = next => `<script data-page="app" type="application/json">${JSON.stringify({component:'user/connections',props:{type:'following',user:{username:'octocat'},users:{data:[{username:'friend',avatar_url:'https://avatars.githubusercontent.com/u/99?v=4'}],next_page_url:next}}})}</script>`;
  const result=await loadFollowing('octocat',async(url,init)=>{assert.equal(init.credentials,'omit');assert.equal(init.headers,undefined);return new Response(page(++count===1?'https://dev-null.sh/@octocat/following?cursor=next':null));});
  assert.equal(count,2);assert.deepEqual(result.ids,['99']);
  await assert.rejects(loadFollowing('octocat',async()=>new Response(page('https://evil.test/'))),/finish/);
  const doc={users:{42:{login:'octocat',emoji:'👀'},99:{login:'friend',emoji:'🔥'},100:{login:'stranger',emoji:'💙'}},placements:{a:{anchor:{id:'a'},users:{99:{emoji:'🔥'},100:{emoji:'💙'}}}}};
  assert.deepEqual(Object.keys(filterReactions(doc,{id:42},'following',result).users),['42','99']);
  assert.deepEqual(Object.keys(filterReactions(doc,{id:42},'following',result).placements.a.users),['99']);
  assert.deepEqual(Object.keys(filterReactions(doc,{id:42},'following').users),['42']);
});
test('dev-null identity survives an Inertia asset version change without using a stale session', async () => {
  let calls=0;
  const user=await currentDevNullUser(async()=>++calls===1?new Response('',{status:409}):new Response('<script data-page="app" type="application/json">{"props":{"auth":{"user":{"username":"octocat"}}}}</script>',{headers:{'Content-Type':'text/html'}}));
  assert.equal(user.username,'octocat');assert.equal(calls,2);
});
