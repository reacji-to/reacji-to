import test from 'node:test';
import assert from 'node:assert/strict';
import { emojiValue, parseReaction } from '../src/protocol.js';
import { reactionRoute, serviceOrigin } from '../src/slack.js';
test('workspace-qualified emojis are valid; arbitrary image URLs and invalid names are rejected', () => {
  assert.equal(emojiValue('slack:T123:foo'), 'slack:T123:foo');
  for (const value of ['slack:OTHER:foo', 'slack:T123:<img>', 'https://emoji.test/foo', ':foo:']) assert.equal(emojiValue(value), null);
  assert.equal(parseReaction({ version: 1, post: { platform: 'x', id: '123456789' }, emoji: 'slack:T123:foo' }).emoji, 'slack:T123:foo');
});
test('emoji rules override GitHub; Slack selection/custom emojis never fall back to GitHub', () => {
  const settings = { channel: 'CDEFAULT', rules: [{ emoji: '🔥', channel: 'CRULE' }] };
  assert.deepEqual(reactionRoute(settings, '🔥', 'private'), { destination: 'slack', channel: 'CRULE' });
  assert.deepEqual(reactionRoute(settings, '👀', 'slack'), { destination: 'slack', channel: 'CDEFAULT' });
  assert.deepEqual(reactionRoute(null, 'slack:T123:foo', 'public'), { destination: 'slack', channel: '' });
  assert.deepEqual(reactionRoute(settings, '👀', 'public'), { destination: 'github' });
});
test('personal Worker endpoints require HTTPS except loopback and forbid credentials or path tricks', () => {
  assert.equal(serviceOrigin('https://my-worker.workers.dev/'), 'https://my-worker.workers.dev');
  assert.equal(serviceOrigin('http://127.0.0.1:8787'), 'http://127.0.0.1:8787');
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/api', 'https://example.com?token=x', 'file:///tmp']) assert.throws(() => serviceOrigin(url));
});
