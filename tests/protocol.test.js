import test from 'node:test';
import assert from 'node:assert/strict';
import { emojiValue, parseReaction, summarize } from '../src/protocol.js';

export const id = '01a14f9d-76a7-72d9-a92d-48ae9ea999cb';
const event = (emoji, issue = 1, actor = { id: 42, login: 'octocat' }) => ({ version: 1, commit: id, emoji, issue, actor, at: '2026-10-18T20:00:00Z' });
test('accepts complete emoji sequences and canonicalizes variation selectors', () => {
  for (const emoji of ['👍🏽', '👩🏾‍💻', '👨‍👩‍👧‍👦', '🇳🇿', '1️⃣', '🫩']) assert.equal(emojiValue(emoji), emoji);
  assert.equal(emojiValue('❤'), '❤️');
});
test('rejects text, multiple emoji, lone modifiers, and path traversal', () => {
  for (const value of ['hello', '😂😂', '🏽', '<script>', '', null]) assert.equal(emojiValue(value), null);
  assert.throws(() => parseReaction({ version: 1, commit: '../../README', emoji: '😂' }));
  assert.throws(() => parseReaction({ version: 1, commit: id, emoji: '' }));
});
test('invalid data never becomes a rendered emoji', () => {
  assert.deepEqual(summarize({ users: { 42: { emoji: '<img src=x onerror=alert(1)>' } } }, 42), []);
});
