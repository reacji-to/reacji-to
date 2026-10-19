import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkedInPostUrn, createLinkedInResolver } from '../src/linkedin.js';

test('SDUI reference decodes without losing 64-bit precision', () => {
  assert.equal(linkedInPostUrn('EgsIgIC5sK61ltLQAQ-replaceableCommentToolsopaque'), 'urn:li:ugcPost:7517120023304282112');
  assert.equal(linkedInPostUrn('CgsIgICz/Mnnk9TQAQ-replaceableCommentToolsopaque'), 'urn:li:activity:7517677238884917248');
  for (const key of [null, '', 'opaque', 'EgIIAA-replaceableCommentToolsx', 'garbage-replaceableCommentToolsx', 'EgsIgIC5sK61ltLQAQ-other']) assert.equal(linkedInPostUrn(key), null);
});

test('resolver uses the canonical activity, omits credentials, and coalesces requests', async () => {
  let calls = 0;
  const resolve = createLinkedInResolver(async (url, options) => {
    calls++;
    assert.equal(url, 'https://www.linkedin.com/embed/feed/update/urn:li:ugcPost:7517120023304282112');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.referrerPolicy, 'no-referrer');
    return new Response('<div>urn:li:activity:999999999</div><link rel="canonical" href="https://www.linkedin.com/feed/update/urn:li:activity:7517120066396717056">');
  });
  const urn = 'urn:li:ugcPost:7517120023304282112';
  assert.deepEqual(await Promise.all([resolve(urn), resolve(urn)]), [{ id: '7517120066396717056' }, { id: '7517120066396717056' }]);
  await resolve(urn);
  assert.equal(calls, 1);
  await assert.rejects(resolve('https://example.com'), /Invalid/);
  assert.equal(calls, 1);
});

test('unavailable or ambiguous markup cannot become a reaction target', async () => {
  for (const response of [new Response('no', { status: 403 }), new Response('<div>urn:li:activity:123456789</div>'), new Response('<link rel="canonical" href="https://evil.test/urn:li:activity:123456789">')]) {
    const resolve = createLinkedInResolver(async () => response);
    await assert.rejects(resolve('urn:li:ugcPost:7517120023304282112'));
  }
});
