import test from 'node:test';
import assert from 'node:assert/strict';
import { frequentEmojis, normalizeUsage, recordEmojiUse } from '../src/emoji-frequency.js';

test('frequents rank by use count, then recency, with common choices for new users', () => {
  let usage = recordEmojiUse([], '🚀', 1);
  usage = recordEmojiUse(usage, '🚀', 2);
  usage = recordEmojiUse(usage, '💙', 3);
  assert.deepEqual(frequentEmojis(usage).slice(0, 2), ['🚀', '💙']);
  usage = recordEmojiUse(usage, '💙', 4);
  assert.deepEqual(frequentEmojis(usage).slice(0, 2), ['💙', '🚀']);
  assert.equal(frequentEmojis([]).length, 16);
  assert.equal(new Set(frequentEmojis(usage)).size, 16);
  assert.deepEqual(recordEmojiUse(usage, null), usage);
});

test('malformed saved usage cannot break the picker', () => {
  assert.deepEqual(normalizeUsage({}), []);
  assert.deepEqual(normalizeUsage([null, {}, {emoji:'no',count:1,lastUsed:1}, {emoji:'🚀',count:-1,lastUsed:1}]), []);
  assert.deepEqual(normalizeUsage([{emoji:'🚀',count:2,lastUsed:1}, {emoji:'🚀',count:1,lastUsed:0}]), [{emoji:'🚀',count:2,lastUsed:1}]);
});
