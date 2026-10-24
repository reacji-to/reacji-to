import test from 'node:test';
import assert from 'node:assert/strict';
import emojis from '../src/emoji.json' with { type: 'json' };
import { normalizeEmojiAliasName, validateEmojiAliases, emojiSearchResults } from '../src/emoji-aliases.js';

test('emoji names normalize, validate, and remain unique', () => {
  assert.equal(normalizeEmojiAliasName('  Design  Review '), 'design review');
  assert.deepEqual(validateEmojiAliases([{ name: 'Design', emoji: '🎨' }, { name: 'review', emoji: '🎨' }]), [
    { name: 'design', emoji: '🎨' }, { name: 'review', emoji: '🎨' },
  ]);
  assert.throws(() => validateEmojiAliases([{ name: 'design', emoji: '🎨' }, { name: 'DESIGN', emoji: '✅' }]), /already assigned/);
  assert.throws(() => validateEmojiAliases([{ name: 'bad:name', emoji: '🎨' }]), /letters/);
  assert.throws(() => validateEmojiAliases([{ name: 'design', emoji: 'not emoji' }]), /Unicode emoji/);
});

test('exact and prefix aliases rank before native emoji names', () => {
  const items = emojis.filter(item => ['🎨', '🖌️', '🏗️'].includes(item.emoji));
  const aliases = [{ name: 'design', emoji: '🎨' }, { name: 'design review', emoji: '🖌️' }];
  const exact = emojiSearchResults(items, aliases, 'design');
  assert.equal(exact[0].emoji, '🎨');
  assert.equal(exact[0].alias, 'design');
  assert.equal(exact[1].emoji, '🖌️');
  assert.equal(emojiSearchResults(items, aliases, 'building')[0].emoji, '🏗️');
});
