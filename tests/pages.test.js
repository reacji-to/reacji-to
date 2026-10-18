import test from 'node:test';
import assert from 'node:assert/strict';
import { publicPage } from '../worker/pages.js';
import { postRef, postPath, postKey } from '../src/posts.js';
test('platform keys are distinct and path/URL injection is rejected', () => {
  assert.notEqual(postKey({ platform: 'x', id: '123456' }), postKey({ platform: 'linkedin', id: '123456' }));
  assert.equal(postPath({ platform: 'x', id: '123456' }), 'data/x/123456.json');
  for (const post of [{ platform: 'evil', id: '123456' }, { platform: 'x', id: '../secrets' }, { platform: 'linkedin', id: 123456 }]) assert.throws(() => postRef(post));
});
test('profile resolves renamed handle by numeric ID and never reads private data', async () => {
  const calls = [];
  const res = await publicPage(new URL('https://reacji.to/renamed'), {}, async url => {
    calls.push(url);
    return url.includes('/users/') ? Response.json({ id: 42, login: 'renamed' }) : Response.json({ version: 1, id: 42, reactions: {
      valid: { post: { platform: 'x', id: '123456789' }, emoji: '🚀', at: '2026-10-18T00:00:00Z', url: 'https://evil.test/' },
      bad: { post: { platform: 'linkedin', id: '123456789' }, emoji: '<script>alert(1)</script>', at: '2026-10-18' },
    } });
  });
  const html = await res.text();
  assert.equal(res.status, 200); assert.match(html, /@renamed/); assert.match(html, /1 public reaction/); assert.match(html, /https:\/\/x.com\/i\/status\/123456789/); assert.doesNotMatch(html, /evil.test|<script>/);
  assert.equal(calls[1], 'https://raw.githubusercontent.com/reacji-to/reacji-to/main/profiles/42.json');
});
test('profile distinguishes missing data from a network error', async () => {
  for (const status of [404, 403]) {
    const res = await publicPage(new URL('https://reacji.to/octocat'), {}, async url => url.includes('/users/') ? Response.json({ id: 42, login: 'octocat' }) : new Response('', { status }));
    assert.equal(res.status, status === 404 ? 200 : 503);
    assert.match(await res.text(), status === 404 ? /No public reactions yet/ : /couldn’t load/);
  }
});
