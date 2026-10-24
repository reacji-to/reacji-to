import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentRef, screenshotData } from '../src/attachments.js';
import { createScreenshotCapture } from '../src/screenshot.js';
const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=';
const source = 'https://example.com/article#selected';
const sender = { frameId: 0, tab: { id: 10, windowId: 3 } };
function setup() {
  const state = { allowed: true, tab: { id: 10, url: source, status: 'complete' }, uploads: [], captures: 0 };
  const capture = createScreenshotCapture({
    tabs: { query: async () => [state.tab], captureVisibleTab: async windowId => { assert.equal(windowId, 3); state.captures++; state.afterCapture?.(); return `data:image/png;base64,${data}`; } },
    windows: { get: async () => ({ focused: true }) }, permissions: { contains: async () => state.allowed },
    backend: async () => 'https://reacji.test', upload: async (_, body) => { state.uploads.push(body); return body.reference; },
  });
  return { state, capture };
}
test('explicit capture uses browser pixels and returns a private reference without inline bytes', async () => {
  const { state, capture } = setup();
  const ref = await capture(sender, source, 'raycast');
  assert.equal(state.captures, 1); assert.equal(state.uploads.length, 1); assert.equal(state.uploads[0].data, data);
  assert.equal(ref.access, 'private'); assert.equal(ref.destination, 'raycast'); assert.equal(ref.width, 1);
  assert.equal(ref.data, undefined); assert.deepEqual(attachmentRef(ref), ref);
  assert.throws(() => attachmentRef({ ...ref, access: 'public' }));
  assert.throws(() => attachmentRef({ ...ref, backend: 'https://reacji.test/public/file.png' }));
  assert.throws(() => screenshotData(btoa('<script>not a screenshot</script>')));
});
test('missing permission, a changed tab, frames and navigation during capture never upload', async () => {
  const { state, capture } = setup(); state.allowed = false;
  await assert.rejects(capture(sender, source, 'raycast'), /Enable screenshots/);
  state.allowed = true;
  await assert.rejects(capture({ ...sender, frameId: 1 }, source, 'raycast'), /main page/);
  state.tab = { ...state.tab, id: 11 };
  await assert.rejects(capture(sender, source, 'raycast'), /page changed/);
  assert.equal(state.captures, 0);
  state.tab.id = 10; state.afterCapture = () => { state.tab.url = 'https://example.com/other'; };
  await assert.rejects(capture(sender, source, 'raycast'), /page changed/);
  assert.deepEqual(state.uploads, []);
});
