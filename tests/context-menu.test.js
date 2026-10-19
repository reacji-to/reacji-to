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

test('missing or stale content scripts are injected into the clicked frame and retried', async () => {
  for (const missing of [true, false]) {
    const calls = [];
    let injected = false;
    await placeFromMenu({ menuItemId: 'reacji-to-place', frameId: 7 }, { id: 12 }, {
      scripting: { executeScript: async options => { calls.push(options); injected = true; } },
      tabs: {
        sendMessage: async (...args) => {
          calls.push(args);
          if (injected) return { handled: true };
          if (missing) throw new Error('Receiving end does not exist.');
        },
        create: () => assert.fail('Recovered pages should not open help'),
      },
    });
    assert.deepEqual(calls, [
      [12, { type: 'place-reaction' }, { frameId: 7 }],
      { target: { tabId: 12, frameIds: [7] }, files: ['content.js'] },
      [12, { type: 'place-reaction' }, { frameId: 7 }],
    ]);
  }
});

test('failed injection or an unresponsive injected script still shows guidance', async () => {
  for (const missing of [true, false]) {
    const tabs = [];
    await placeFromMenu({ menuItemId: 'reacji-to-place' }, { id: 12 }, {
      runtime: { getURL: path => `chrome-extension://test/${path}` },
      scripting: { executeScript: async () => { if (missing) throw new Error('Cannot access this page.'); } },
      tabs: {
        sendMessage: async () => { if (missing) throw new Error('Receiving end does not exist.'); },
        create: async value => tabs.push(value),
      },
    });
    assert.deepEqual(tabs, [{ url: 'chrome-extension://test/placement-help.html' }]);
  }
});

test('unrelated menu clicks and missing tabs do nothing', async () => {
  await placeFromMenu({ menuItemId: 'another-menu' }, { id: 12 }, {});
  await placeFromMenu({ menuItemId: 'reacji-to-place' }, undefined, {});
});
