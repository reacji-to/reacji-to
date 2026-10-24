import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveTarget, postholeOrigin } from '../src/archive-target.js';
import { pagePost, verifyPagePost } from '../src/web.js';
const site = new URL('http://127.0.0.1:4747/?view=ipod');
const x = {platform:'x',id:'123456789'};
const archive = {url:'https://x.com/someone/status/123456789'};
test('archive origins are narrowly scoped and source IDs are checked', () => {
  for (const origin of ['http://127.0.0.1:4747','http://localhost:9000','http://[::1]:4747','https://posthole.ink']) {
    assert.deepEqual(archiveTarget(x,new URL(origin),archive),x);
  }
  for (const origin of ['https://example.com','https://posthole.ink.evil.test','http://posthole.ink','https://localhost.evil.test','https://u:p@posthole.ink']) {
    assert.equal(postholeOrigin(new URL(origin)),false);
    assert.throws(()=>archiveTarget(x,new URL(origin),archive));
  }
  for (const url of ['https://x.com/someone/status/987654321','https://x.com.evil.test/someone/status/123456789','https://example.com/status/123456789','javascript:alert(1)']) {
    assert.throws(()=>archiveTarget(x,site,{url}));
  }
});
test('LinkedIn activity permalinks and web targets keep their original identity', async () => {
  const linkedin = {platform:'linkedin',id:'123456789'};
  for (const url of ['https://www.linkedin.com/feed/update/urn:li:activity:123456789/','https://www.linkedin.com/posts/someone_hello-activity-123456789-abcd']) assert.deepEqual(archiveTarget(linkedin,site,{url}),linkedin);
  const url='https://news.ycombinator.com/item?id=41234567'; const post=await pagePost(url);
  assert.deepEqual(archiveTarget(post,site,{url}),post);
  await verifyPagePost(post);
  assert.throws(()=>archiveTarget(post,site,{url:'https://example.com/'}));
  await assert.rejects(()=>verifyPagePost({...post,id:'a'.repeat(64)}));
});
