import test from 'node:test';
import assert from 'node:assert/strict';
import { emojiValue, parseReaction, summarize, reactionEmojis, updateReactionUser } from '../src/protocol.js';

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
test('adds and removes one reaction while preserving legacy reactions and counting each person once', () => {
  const owner = { login: 'octocat' };
  let user = { ...owner, emoji: '👍' };
  for (const emoji of ['🔥', '🔥', '💙']) user = updateReactionUser(user, parseReaction({version:1,commit:id,emoji,operation:'add'}), owner);
  assert.deepEqual(reactionEmojis(user), ['👍','🔥','💙']);
  user = updateReactionUser(user, {emoji:'🔥',operation:'remove'}, owner);
  assert.deepEqual(reactionEmojis(user), ['👍','💙']);
  const groups = summarize({users:{42:user,99:{emoji:'👍',emojis:['👍','👍','🔥','bad']}}},42);
  assert.equal(groups.find(item=>item.emoji==='👍').count,2);
  assert.equal(groups.find(item=>item.emoji==='💙').mine,true);
  assert.equal(groups.find(item=>item.emoji==='🔥').mine,false);
  assert.equal(updateReactionUser(user,{emoji:null},owner),null);
  assert.deepEqual(updateReactionUser(user,{emoji:'😂'},owner),{login:'octocat',emoji:'😂'});
  assert.throws(()=>parseReaction({version:1,commit:id,emoji:null,operation:'remove'}));
  assert.throws(()=>parseReaction({version:1,commit:id,emoji:'🔥',operation:'toggle'}));
});
