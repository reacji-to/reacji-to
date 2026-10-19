import test from 'node:test';
import assert from 'node:assert/strict';
import { senderPage } from '../src/sender.js';

test('main-frame checks follow browser-reported SPA navigation', () => {
  assert.equal(senderPage({ frameId: 0, url: 'https://www.linkedin.com/preload/', tab: { url: 'https://www.linkedin.com/feed/' } }).href, 'https://www.linkedin.com/feed/');
});

test('iframes never inherit the parent page URL', () => {
  assert.equal(senderPage({ frameId: 2, url: 'https://example.com/embed', tab: { url: 'https://www.linkedin.com/feed/' } }).href, 'https://example.com/embed');
});

test('stale documents cannot borrow a new origin and missing tab URLs retain the sender URL', () => {
  assert.throws(() => senderPage({ frameId: 0, url: 'https://example.com/', tab: { url: 'https://www.linkedin.com/feed/' } }), /does not match/);
  assert.equal(senderPage({ frameId: 0, url: 'https://example.com/', tab: {} }).href, 'https://example.com/');
  assert.equal(senderPage({ url: 'chrome-extension://test/options.html' }), null);
});
