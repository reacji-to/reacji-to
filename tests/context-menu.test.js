import test from 'node:test';
import assert from 'node:assert/strict';
import { placeFromMenu } from '../src/context-menu.js';

test('context menu targets the clicked frame and leaves an acknowledged picker alone', async () => {
  const calls = [];
  await placeFromMenu({ menuItemId: 'reacji-to-place', frameId: 7 }, { id: 12 }, {
    tabs: { sendMessage: async (...args) => { calls.push(args); return { handled: true }; }, create: () => assert.fail('Unexpected help page') },
  });
  assert.deepEqual(calls, [[12, { type: 'place-reaction' }, { frameId: 7 }]]);
});

test('missing or stale content scripts show reload guidance instead of silently doing nothing', async () => {
  for (const missing of [true, false]) {
    const tabs = [];
    await placeFromMenu({ menuItemId: 'reacji-to-place' }, { id: 12 }, {
      runtime: { getURL: path => `chrome-extension://test/${path}` },
      tabs: {
        sendMessage: async () => { if (missing) throw new Error('Receiving end does not exist.'); },
        create: async value => tabs.push(value),
      },
    });
    assert.deepEqual(tabs, [{ url: 'chrome-extension://test/placement-help.html' }]);
  }
});
