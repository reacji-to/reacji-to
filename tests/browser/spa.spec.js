import { test, expect, chromium } from '@playwright/test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('LinkedIn page placements save and reload after SPA navigation', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reacji-spa-'));
  const extension = path.join(root, 'extension');
  await cp('dist', extension, { recursive: true });
  const context = await chromium.launchPersistentContext(path.join(root, 'profile'), { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const docs = new Map(), writes = [];
  try {
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'www.linkedin.com') return route.fulfill({ contentType: 'text/html', body: '<p id="target">A LinkedIn post to react to.</p>' });
      if (url.hostname === 'api.github.com' && url.pathname === '/user') return route.fulfill({ json: { id: 42, login: 'octocat' } });
      if (url.hostname === 'raw.githubusercontent.com') {
        const doc = docs.get(url.pathname.split('/').at(-1));
        return doc ? route.fulfill({ json: doc }) : route.fulfill({ status: 404, body: '' });
      }
      if (url.hostname === 'reacji.to' && url.pathname === '/v1/react') {
        const body = route.request().postDataJSON();
        writes.push(body);
        const { post, placement, emoji } = body.event;
        const document = { version: 1, commit: post.id, post, users: {}, placements: {
          [placement.id]: { anchor: placement, users: { 42: { login: 'octocat', emoji } } },
        } };
        docs.set(`${post.id}.json`, document);
        return route.fulfill({ json: { actor: { id: 42, login: 'octocat' }, document } });
      }
      return route.fulfill({ status: 404, body: '' });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ token: 'test-token', actor: { id: 42, login: 'octocat' } });
      globalThis.reads = [];
      chrome.runtime.onMessage.addListener((message, sender) => {
        if (message.type === 'read') reads.push({ url: sender.url, tabUrl: sender.tab.url, post: message.post });
      });
    });
    const page = await context.newPage();
    await page.goto('https://www.linkedin.com/preload/');
    await expect.poll(() => worker.evaluate(() => reads.length)).toBeGreaterThan(0);
    await page.evaluate(() => { history.replaceState({}, '', '/feed/'); document.body.append(document.createElement('hr')); });
    await expect.poll(() => worker.evaluate(() => reads.at(-1)?.post.url)).toBe('https://www.linkedin.com/feed/');
    expect(await worker.evaluate(() => reads.at(-1).url)).toBe('https://www.linkedin.com/preload/');
    await page.locator('#target').click({ modifiers: ['Alt'] });
    await page.getByRole('searchbox').fill('🚀');
    await page.getByRole('button', { name: 'rocket', exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].event.post.url).toBe('https://www.linkedin.com/feed/');
    await expect(page.getByText(/Previous reaction restored/)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: /🚀, 1 reaction, yours/ })).toBeVisible();
  } finally { await context.close(); await rm(root, { recursive: true, force: true }); }
});
