import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaycastActions, raycastDeeplink, validateRaycastActions } from '../src/raycast.js';
const action = { emoji: '🚀', name: 'Focus', description: '', deeplink: 'raycast://extensions/raycast/raycast/search?arguments=%7B%22query%22%3A%22hello%20world%22%7D', enabled: true };
function setup() {
  const data = {}, launches = [];
  const api = createRaycastActions({ storage: { get: async () => data, set: async value => Object.assign(data, value) }, launch: async url => { launches.push(url); } });
  return { data, launches, api };
}
test('only command deeplinks are accepted and encoded arguments are preserved', () => {
  assert.equal(raycastDeeplink(action.deeplink), action.deeplink);
  assert.equal(raycastDeeplink('raycast://script-commands/focus?arguments=hello'), 'raycast://script-commands/focus?arguments=hello');
  for (const invalid of ['https://example.com', 'javascript:alert(1)', 'raycast://extensions/a/b', 'raycast://extensions/a/b/c/d', 'raycast://extensions/a/b/c\n?x=y', 'raycast://user:pass@extensions/a/b/c', 'raycast://extensions:80/a/b/c', 'raycast://extensions/a/b/c#x', 'raycast://unknown/foo']) assert.throws(() => raycastDeeplink(invalid));
});
test('canonical emoji keys, duplicates, and malformed settings are validated', () => {
  assert.equal(validateRaycastActions([{ ...action, emoji: '❤' }])[0].emoji, '❤️');
  for (const invalid of [null, {}, Array(33).fill(action), [action, action], [{ ...action, emoji: 'word' }], [{ ...action, name: '' }], [{ ...action, enabled: 'true' }], [{ ...action, deeplink: 'https://example.com' }], [{ ...action, emoji: '❤' }, { ...action, emoji: '❤️' }]]) assert.throws(() => validateRaycastActions(invalid));
});
test('actions persist locally, run only for eligible reactions, and can be paused or removed', async () => {
  const { api, launches, data } = setup();
  assert.deepEqual(await api.list(), []);
  await api.save([action]);
  assert.deepEqual(data.raycastActions, [action]);
  assert.equal((await api.afterReaction({ emoji: '🚀' })).status, 'requested');
  for (const [event, usage] of [[{ emoji: null }], [{ emoji: '🚀', operation: 'remove' }], [{ emoji: '❤️' }], [{ emoji: '🚀', moveFrom: 'old' }], [{ emoji: '🚀' }, false]]) assert.equal(await api.afterReaction(event, usage), null);
  assert.deepEqual(launches, [action.deeplink]);
  await api.save([{ ...action, enabled: false }]);
  assert.equal(await api.afterReaction({ emoji: '🚀' }), null);
  await api.test('🚀');
  assert.equal(launches.length, 2);
  await api.save([]);
  await assert.rejects(api.test('🚀'), /Save this/);
  assert.equal(await api.afterReaction({ emoji: '🚀' }), null);
});
test('launch failures are separate from successful reaction commits', async () => {
  const api = createRaycastActions({ storage: { get: async () => ({ raycastActions: [action] }) }, launch: async () => { throw new Error('No handler'); } });
  const result = await api.afterReaction({ emoji: '🚀' });
  assert.equal(result.status, 'failed'); assert.match(result.error, /Reaction saved/);
  await assert.rejects(api.test('🚀'), /No handler/);
});

test('picker catalog exposes descriptions but never command URLs or arguments', async () => {
  const { api } = setup();
  await api.save([action, { ...action, emoji: '❤️', enabled: false }]);
  assert.deepEqual(await api.catalog(), [{ emoji: '🚀', name: 'Focus', description: '', destination: 'raycast' }]);
});
