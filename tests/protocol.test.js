import test from 'node:test';
import assert from 'node:assert/strict';
import { emojiValue, parseReaction, parseIssue, applyReaction, summarize } from '../src/protocol.js';

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
test('actor comes from GitHub issue, never a body field', () => {
  const value = parseIssue({ number: 9, title: '[reaction:v1]', body: JSON.stringify({ version: 1, commit: id, emoji: '🔥', actor: { id: 1, login: 'forged' } }), user: { id: 42, login: 'octocat' } });
  assert.deepEqual(value.actor, { id: 42, login: 'octocat' });
});
test('unrelated issues and pull requests are ignored', () => {
  assert.equal(parseIssue({ title: 'Feature request' }), null);
  assert.equal(parseIssue({ title: '[reaction:v1]', pull_request: {} }), null);
});
test('one reaction per stable user id; changing and removing preserve ordering', () => {
  let document = applyReaction(null, event('❤️')).document;
  document = applyReaction(document, event('🔥', 2, { id: 42, login: 'renamed' })).document;
  document = applyReaction(document, event('🔥', 3, { id: 99, login: 'friend' })).document;
  assert.deepEqual(summarize(document, 42), [{ emoji: '🔥', count: 2, mine: true, people: ['renamed', 'friend'] }]);
  document = applyReaction(document, event(null, 4)).document;
  assert.equal(summarize(document, 42)[0].count, 1);
  assert.equal(summarize(document, 42)[0].mine, false);
  assert.equal(applyReaction(document, event('❤️', 1)).changed, false);
  assert.equal(applyReaction(document, event(null, 4)).changed, false);
});
test('invalid data never becomes a rendered emoji', () => {
  assert.deepEqual(summarize({ users: { 42: { emoji: '<img src=x onerror=alert(1)>' } } }, 42), []);
});
