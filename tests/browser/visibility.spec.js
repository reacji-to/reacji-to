import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('last visibility follows new pickers across tabs, reloads, and browser restarts', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'reacji-visibility-'));
  const extension = path.resolve('dist');
  let context;
  const launch = async () => {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).hostname === 'dev-null.sh') {
        return route.request().headers()['x-inertia']
          ? route.fulfill({ json: { props: { auth: { user: null } } } })
          : route.fulfill({ path: 'fixtures/feed.html', contentType: 'text/html' });
      }
      return route.fulfill({ status: 404, body: '' });
    });
    return context.serviceWorkers()[0] || context.waitForEvent('serviceworker');
  };
  const open = async (page, index = 0) => {
    await page.getByRole('button', { name: 'React with an emoji', exact: true }).nth(index).click();
  };
  const mode = (page, name) => page.getByRole('button', { name, exact: true });
  try {
    let worker = await launch();
    const first = await context.newPage();
    await first.goto('https://dev-null.sh/');
    await open(first);
    await expect(mode(first, 'Public')).toHaveAttribute('aria-pressed', 'true');
    await mode(first, 'Private').click();
    await first.keyboard.press('Escape');
    await open(first, 1);
    await expect(mode(first, 'Private')).toHaveAttribute('aria-pressed', 'true');

    const second = await context.newPage();
    await second.goto('https://dev-null.sh/');
    await open(second);
    await expect(mode(second, 'Private')).toHaveAttribute('aria-pressed', 'true');
    await mode(second, 'Public').click();
    await first.bringToFront();
    await first.keyboard.press('Escape');
    await open(first);
    await expect(mode(first, 'Public')).toHaveAttribute('aria-pressed', 'true');
    await mode(first, 'Private').click();
    await expect.poll(() => worker.evaluate(async () => (await chrome.storage.local.get('lastVisibility')).lastVisibility)).toBe('private');
    await context.close();

    worker = await launch();
    const restarted = await context.newPage();
    await restarted.goto('https://dev-null.sh/');
    await open(restarted);
    await expect(mode(restarted, 'Private')).toHaveAttribute('aria-pressed', 'true');
    await mode(restarted, 'Public').click();
    await expect.poll(() => worker.evaluate(async () => (await chrome.storage.local.get('lastVisibility')).lastVisibility)).toBe('public');
    await restarted.reload();
    await open(restarted);
    await expect(mode(restarted, 'Public')).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
