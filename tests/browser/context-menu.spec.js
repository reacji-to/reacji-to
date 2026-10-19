import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

test('real extension recovers a tab without a content script, without reloading or opening help', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reacji-recovery-'));
  const extension = path.join(root, 'extension');
  let context;
  try {
    await cp('dist', extension, { recursive: true });
    const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
    // Model a tab that was already open when the extension was installed.
    manifest.content_scripts = [];
    await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
    await build({ stdin: { contents: `
      import { placeFromMenu } from './src/context-menu.js';
      globalThis.placeForTest = placeFromMenu;
      chrome.runtime.onMessage.addListener((message, sender, reply) => {
        reply({ ok: true, value: message.type === 'visibility-get' ? { visibility: 'public' } : { users: {}, placements: {} } });
      });
    `, resolveDir: process.cwd() }, bundle: true, outfile: path.join(extension, 'background.js'), format: 'iife', target: 'chrome120' });
    context = await chromium.launchPersistentContext(path.join(root, 'profile'), {
      channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    await page.route('https://github.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p id="target">A GitHub issue worth reacting to.</p>' }));
    await page.goto('https://github.com/example/repo/issues/1');
    await page.evaluate(() => { window.pagePreserved = true; });
    const place = () => worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://github.com/example/repo/issues/1' });
      await globalThis.placeForTest({ menuItemId: 'reacji-to-place', frameId: 0 }, tab);
    });
    const tabCount = context.pages().length;
    await place();
    await expect(page.getByRole('status')).toContainText('Right-click the page content again');
    expect(context.pages()).toHaveLength(tabCount);
    expect(await page.evaluate(() => window.pagePreserved)).toBe(true);
    await page.locator('#target').click({ button: 'right' });
    await place();
    await expect(page.getByRole('dialog')).toBeVisible();
    // A racing declarative injection must not duplicate listeners or UI.
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://github.com/example/repo/issues/1' });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    });
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.locator('reacji-to-reactions')).toHaveCount(2);
  } finally {
    await context?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('body replacement and immediate client navigation preserve right-click placement', async ({ page }) => {
  await page.route('https://github.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Initial page</p>' }));
  await page.addInitScript(() => {
    window.chrome = { runtime: {
      sendMessage: async () => ({ ok: true, value: { users: {}, placements: {} } }),
      onMessage: { addListener: listener => { window.fromBackground = listener; } },
    } };
  });
  await page.goto('https://github.com/example/repo');
  await page.addScriptTag({ path: 'dist/content.js' });
  await page.evaluate(() => {
    const body = document.createElement('body');
    body.innerHTML = '<p id="target">New issue body</p>';
    document.body.replaceWith(body);
    // Navigate between mousedown and contextmenu, before the scan can run.
    body.addEventListener('mousedown', () => history.pushState({}, '', '/example/repo/issues/2'), { once: true });
  });
  await page.locator('#target').click({ button: 'right' });
  expect(await page.evaluate(() => {
    let response;
    window.fromBackground({ type: 'place-reaction' }, {}, value => { response = value; });
    return response;
  })).toEqual({ handled: true });
  await expect(page.getByRole('dialog')).toBeVisible();
});
