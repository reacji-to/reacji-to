import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const deeplink = 'raycast://extensions/raycast/raycast/search?fallbackText=hello%20world';
test('Raycast settings validate, persist, edit, pause, test and remove a local mapping', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reacji-raycast-'));
  const extension = path.resolve('dist');
  const context = await chromium.launchPersistentContext(root, { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    await context.route('https://**/*', route => route.fulfill({ status: 404, body: '' }));
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(() => { globalThis.launches = []; chrome.tabs.create = async ({ url }) => { globalThis.launches.push(url); return { id: 123 }; }; });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
    await page.getByLabel('Reaction emoji', { exact: true }).fill('🚀');
    await page.getByLabel('Action name', { exact: true }).fill('Focus');
    await page.getByLabel('What it does (optional)').fill('Starts a 25-minute focus timer');
    await page.getByLabel('Raycast deeplink').fill('https://example.com');
    await page.getByRole('button', { name: 'Add action', exact: true }).click();
    await expect(page.locator('#raycast-status')).toContainText('Paste a Raycast command deeplink');
    await page.getByLabel('Raycast deeplink').fill(deeplink);
    await page.getByRole('button', { name: 'Add action', exact: true }).click();
    await expect(page.locator('#raycast-status')).toContainText('Action saved');
    await page.reload();
    await expect(page.getByLabel('Enable Focus', { exact: true })).toBeChecked();
    const catalog = await page.evaluate(async () => chrome.runtime.sendMessage({ type: 'raycast-catalog' }));
    expect(catalog.value.actions).toEqual([{ emoji: '🚀', name: 'Focus', description: 'Starts a 25-minute focus timer', destination: 'raycast' }]);
    await page.getByRole('button', { name: 'Test action', exact: true }).click();
    await expect(page.locator('#raycast-status')).toContainText('Sent to Raycast');
    expect(await worker.evaluate(() => globalThis.launches)).toEqual([deeplink]);
    await page.getByLabel('Enable Focus', { exact: true }).uncheck();
    await expect(page.locator('#raycast-status')).toHaveText('Action paused.');
    expect((await page.evaluate(async () => chrome.runtime.sendMessage({ type: 'raycast-catalog' }))).value.actions).toEqual([]);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Action name', { exact: true }).fill('Focus timer');
    await page.getByRole('button', { name: 'Save action', exact: true }).click();
    await expect(page.getByLabel('Enable Focus timer', { exact: true })).not.toBeChecked();
    await page.getByLabel('Enable Focus timer', { exact: true }).check();
    await expect(page.locator('#raycast-status')).toHaveText('Action enabled.');
    await page.locator('#raycast-section').screenshot({ path: 'artifacts/raycast-settings-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.locator('#raycast-section').screenshot({ path: 'artifacts/raycast-settings-mobile.png' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.locator('#raycast-section').screenshot({ path: 'artifacts/raycast-settings-dark.png' });
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.locator('#raycast-empty')).toBeVisible();
    await page.reload();
    await expect(page.locator('#raycast-actions li')).toHaveCount(0);
  } finally { await context.close(); await rm(root, { recursive: true, force: true }); }
});

test('explicit Raycast destination runs locally with the current URL and no sign-in or remote writes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reacji-local-destination-'));
  const extension = path.resolve('dist');
  const context = await chromium.launchPersistentContext(root, { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const writes = [];
  try {
    await context.route('https://**/*', route => {
      if (route.request().method() !== 'GET') writes.push(route.request().url());
      return new URL(route.request().url()).hostname === 'example.com'
        ? route.fulfill({ contentType: 'text/html', body: '<title>Local article</title><p id="target">An ordinary page paragraph for local actions.</p>' })
        : route.fulfill({ status: 404, body: '' });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ lastVisibility: 'raycast', raycastActions: [{ emoji: '🚀', name: 'Focus', enabled: true, deeplink: 'raycast://extensions/raycast/raycast/search' }] });
      globalThis.launches = []; chrome.tabs.create = async ({ url }) => { launches.push(url); return {}; };
    });
    const page = await context.newPage(); await page.goto('https://example.com/article#part');
    await page.keyboard.down('Alt'); await page.locator('#target').click(); await page.keyboard.up('Alt');
    await expect(page.getByRole('group', { name: 'Reaction visibility' }).getByRole('button')).toHaveText(['Public', 'Private', 'Slack', 'Raycast']);
    await expect(page.getByRole('toolbar', { name: 'Reaction sections' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await expect.poll(() => worker.evaluate(() => launches.length)).toBe(1);
    const url = new URL(await worker.evaluate(() => launches[0]));
    const payload = JSON.parse(url.searchParams.get('context')).reacji;
    expect(payload.source).toEqual({ url: 'https://example.com/article#part', title: 'Local article' });
    expect(payload.reaction.destination).toBe('raycast');
    expect(payload.target.post.platform).toBe('web');
    await page.reload();
    await expect(page.getByRole('button', { name: /Raycast: 🚀/ })).toBeVisible();
    expect(await worker.evaluate(() => launches.length)).toBe(1);
    expect(writes).toEqual([]);
  } finally { await context.close(); await rm(root, { recursive: true, force: true }); }
});

test('opted-in screenshot saves privately before Raycast; upload failure stops launch and retry reuses capture', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reacji-screenshot-'));
  const extension = path.resolve('dist');
  const context = await chromium.launchPersistentContext(root, { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const uploads = []; let rejectUpload = true, account = 42;
  try {
    await context.route('https://**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'example.com') return route.fulfill({ contentType: 'text/html', body: '<title>Screenshot article</title><p id="target">Capture this page.</p>' });
      if (url.hostname === 'api.github.com' && url.pathname === '/user') return route.fulfill({ json: { id: account, login: 'octocat' } });
      if (url.pathname === '/v1/attachments/create') {
        const body = route.request().postDataJSON(); uploads.push(body);
        return rejectUpload ? route.fulfill({ status: 503, json: { error: 'Screenshot storage unavailable.' } }) : route.fulfill({ json: body.reference });
      }
      return route.fulfill({ status: 404, body: '' });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ token: 'test-token', actor: { id: 42, login: 'octocat' }, lastVisibility: 'raycast', raycastActions: [{ emoji: '🚀', name: 'Focus', enabled: true, deeplink: 'raycast://extensions/raycast/raycast/search' }] });
      globalThis.launches = []; globalThis.captures = 0;
      chrome.tabs.create = async ({ url }) => { launches.push(url); return {}; };
      chrome.permissions.contains = async () => true;
      chrome.windows.get = async () => ({ focused: true });
      chrome.tabs.captureVisibleTab = async () => { captures++; return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII='; };
    });
    const page = await context.newPage(); await page.goto('https://example.com/article#part');
    await page.locator('#target').click({ modifiers: ['Alt'] });
    const checkbox = page.getByRole('checkbox', { name: /Include screenshot/ });
    await expect(checkbox).not.toBeChecked(); await checkbox.check();
    await page.getByRole('dialog').screenshot({ path: 'artifacts/picker-screenshot.png' });
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await expect(page.getByText(/Screenshot storage unavailable/)).toBeVisible();
    expect(await worker.evaluate(() => launches.length)).toBe(0);
    expect(uploads).toHaveLength(1);
    account = 43;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByText(/Your account changed/)).toBeVisible();
    expect(uploads).toHaveLength(1);
    expect(await worker.evaluate(() => launches.length)).toBe(0);
    account = 42; rejectUpload = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect.poll(() => worker.evaluate(() => launches.length)).toBe(1);
    expect(await worker.evaluate(() => captures)).toBe(1); expect(uploads).toHaveLength(2);
    expect(uploads[0].reference.id).toBe(uploads[1].reference.id);
    const payload = JSON.parse(new URL(await worker.evaluate(() => launches[0])).searchParams.get('context')).reacji;
    expect(payload.attachments).toEqual([uploads[1].reference]);
    expect(payload.attachments[0].access).toBe('private');
    expect(JSON.stringify(payload)).not.toContain('iVBOR');
    expect(payload.source.url).toBe('https://example.com/article#part');
  } finally { await context.close(); await rm(root, { recursive: true, force: true }); }
});
