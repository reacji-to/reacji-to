import { attachmentRef, screenshotData } from './attachments.js';

// The page can request a capture, but cannot supply image bytes, a file reference,
// a tab ID or a storage origin. All four come from the privileged runtime.
export function createScreenshotCapture({ tabs, windows, permissions, upload, backend }) {
  return async function capture(sender, sourceUrl, destination) {
    if (sender.frameId !== 0) throw new Error('Take screenshots from the main page.');
    if (!await permissions.contains({ origins: ['<all_urls>'] })) throw new Error('Enable screenshots in extension Settings first.');
    const check = async () => {
      const [tab] = await tabs.query({ active: true, windowId: sender.tab.windowId });
      const window = await windows.get(sender.tab.windowId);
      if (!window.focused || tab?.id !== sender.tab.id || tab.url !== sourceUrl || tab.status === 'loading') throw new Error('The page changed. Return to it and try again.');
    };
    await check();
    const dataUrl = await tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
    await check();
    if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('Screenshot capture failed.');
    const data = dataUrl.slice('data:image/png;base64,'.length), image = screenshotData(data);
    const origin = await backend();
    const reference = attachmentRef({ backend: origin, id: crypto.randomUUID(), kind: 'screenshot', access: 'private', mediaType: 'image/png',
      bytes: image.bytes.length, width: image.width, height: image.height, destination, capturedAt: new Date().toISOString() });
    const result = attachmentRef(await upload(origin, { reference, data }));
    if (JSON.stringify(result) !== JSON.stringify(reference)) throw new Error('The backend returned a different screenshot reference.');
    return result;
  };
}
