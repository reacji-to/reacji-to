import test from 'node:test';
import assert from 'node:assert/strict';
import { createDestinationRegistry, createDestinationDispatcher } from '../src/destination-registry.js';
import { destinations } from '../src/destinations.js';
import { createLocalDestination } from '../src/local-destination.js';
import { reactionPayload } from '../src/reaction-payload.js';
import { textSelectionRef } from '../src/web.js';
const post = { platform: 'x', id: '123456789' };
test('a new provider uses the same registry, routing, catalog and dispatcher', async () => {
  const note = { id: 'notes', label: 'Notes', matches: emoji => emoji === '📝',
    catalog: () => [{ emoji: '📝', name: 'Save note' }], describe: emoji => ({ emoji, destination: 'notes', description: 'Saves a note' }) };
  const registry = createDestinationRegistry([...destinations.entries, note]);
  const context = { state: {}, catalogs: {}, unicode: [], emojiName: x => x };
  assert.equal(registry.resolve('local', '📝', context), 'notes');
  assert.equal(registry.resolve('raycast', '📝', context), 'raycast');
  assert.equal(registry.action('notes', '📝', context).description, 'Saves a note');
  assert.equal(registry.dataField('notes'), 'notesData');
  assert.equal(registry.readType('notes'), 'notes-read');
  const calls = [], dispatch = createDestinationDispatcher(registry, { notes: { react: value => calls.push(value) } });
  await dispatch('notes', 'react', { post }); assert.deepEqual(calls, [{ post }]);
  await assert.rejects(dispatch('unknown', 'react', {}), /supported/);
  await assert.rejects(dispatch('notes', 'read', {}), /does not support/);
});
test('local integration receipts persist without remote writes and never replay on reads or removals', async () => {
  const data = {}, executions = [];
  const adapter = createLocalDestination({ id: 'notes', storage: { get: async () => data, set: async value => Object.assign(data, value) },
    actor: async () => ({ id: 0, login: 'you' }), validate: async emoji => { if (emoji !== '📝') throw new Error('Unmapped'); }, execute: async (...args) => executions.push(args) });
  const event = { emoji: '📝', post };
  const result = await adapter.react({ post, event, message: { payload: { version: 1 } } });
  assert.equal(result.mode, 'local'); assert.equal(result.document.users[0].emoji, '📝');
  assert.equal((await adapter.read({ post })).users[0].emoji, '📝');
  await adapter.react({ post, event: { ...event, emoji: null }, message: {} });
  assert.equal(executions.length, 1); assert.deepEqual((await adapter.read({ post })).users, {});
  await assert.rejects(adapter.react({ post, event: { ...event, emoji: '🔥' }, message: {} }), /Unmapped/);
  assert.equal(executions.length, 1);
});
test('payload keeps current URL, authoritative destination and optional validated selected span', () => {
  const result = reactionPayload({ url: 'https://example.com/article#section', title: 'Article', quote: 'A passage', event: { post, emoji: '📝' }, destination: 'notes' });
  assert.equal(result.version, 1); assert.equal(result.source.url, 'https://example.com/article#section');
  assert.deepEqual(result.reaction, { emoji: '📝', destination: 'notes', operation: 'set' });
  assert.deepEqual(result.attachments, []);
  assert.throws(() => reactionPayload({ url: 'javascript:alert(1)', event: { post }, destination: 'notes' }));
  assert.deepEqual(textSelectionRef({ exact: 'hello', prefix: '', suffix: ' world', start: 0, end: 5 }), { exact: 'hello', prefix: '', suffix: ' world', start: 0, end: 5 });
  assert.throws(() => textSelectionRef({ exact: 'hello', prefix: '', suffix: '', start: 0, end: 99 }));
});

test('local post receipts keep multiple emoji and remove one without executing its action', async () => {
  const data = {}, executions = [], validations = [];
  const adapter = createLocalDestination({ id: 'notes', storage: { get: async () => data, set: async value => Object.assign(data, value) },
    actor: async () => ({ id: 0, login: 'you' }), validate: async emoji => validations.push(emoji), execute: async emoji => executions.push(emoji) });
  const send = (emoji, operation) => adapter.react({ post, event: { post, emoji, operation }, message: {} });
  await send('📝', 'add'); await send('🔥', 'add');
  assert.deepEqual((await adapter.read({ post })).users[0].emojis, ['📝', '🔥']);
  await send('📝', 'remove');
  assert.deepEqual((await adapter.read({ post })).users[0].emojis, ['🔥']);
  assert.deepEqual(executions, ['📝', '🔥']); assert.deepEqual(validations, executions);
});
