import { test, expect, chromium } from '@playwright/test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const commit = '01a14f9d-76a7-72d9-a92d-48ae9ea999cb';
const markup = await readFile('fixtures/feed.html', 'utf8');
async function setup(page, { connected = true, fail = false, readFail = false } = {}) {
  await page.route('https://dev-null.sh/**', route => route.fulfill({ body: markup, contentType: 'text/html' }));
  await page.addInitScript(({ commit, connected, fail, readFail }) => {
    window.sent = [];
    window.chrome = { runtime: { sendMessage: async message => {
      window.sent.push(message);
      if (message.type === 'status') return { ok: true, value: { connected, actor: connected ? { id: 42, login: 'octocat' } : null } };
      if (message.type === 'read') return readFail ? { ok: false, error: 'Reactions are unavailable. Try again shortly.' } : { ok: true, value: { version: 1, commit, users: { 99: { login: 'friend', emoji: '🔥', issue: 1 } } } };
      if (message.type === 'react') return fail ? { ok: false, error: 'GitHub refused this request. Check token permissions or wait for the rate limit to reset.' } : { ok: true, value: connected ? { mode: 'queued', issue: 12, actor: { id: 42, login: 'octocat' }, url: 'https://github.com/test/repo/issues/12' } : { mode: 'manual' } };
      return { ok: true, value: {} };
    } } };
  }, { commit, connected, fail, readFail });
  await page.goto('https://dev-null.sh/');
  await page.addScriptTag({ path: 'dist/content.js' });
}
test('smiley sits immediately beside the star; search, react, change, remove', async ({ page }) => {
  await setup(page);
  const first = page.locator('article[data-commit]').first();
  await expect(first.locator('[data-test="star-commit-button"] + devnull-reactions')).toHaveCount(1);
  await first.getByRole('button', { name: 'React with an emoji', exact: true }).click();
  await page.getByRole('searchbox').fill('woman technologist: medium-dark skin tone');
  await page.getByRole('button', { name: 'woman technologist: medium-dark skin tone', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(first.getByRole('button', { name: /👩🏾‍💻.*yours/ })).toBeVisible();
  await first.getByRole('button', { name: /🔥, 1 reaction/ }).click();
  await expect(first.getByRole('button', { name: /🔥, 2 reactions, yours/ })).toBeVisible();
  await first.getByRole('button', { name: /🔥, 2 reactions, yours/ }).click();
  await expect(first.getByRole('button', { name: /🔥, 1 reaction/ })).toBeVisible();
  expect((await page.evaluate(() => sent.filter(m => m.type === 'react').map(m => m.event.emoji)))).toEqual(['👩🏾‍💻', '🔥', null]);
});
test('keyboard, pasting multi-codepoint emoji, and empty search', async ({ page }) => {
  await setup(page);
  const trigger = page.getByRole('button', { name: 'React with an emoji', exact: true }).first();
  await trigger.click();
  const search = page.getByRole('searchbox');
  await expect(search).toBeFocused();
  await search.fill('not-an-emoji-zzzz');
  await expect(page.getByText('No emoji found.', { exact: false })).toBeVisible();
  await search.fill('👨‍👩‍👧‍👦');
  await expect(page.getByRole('button', { name: 'family: man, woman, girl, boy', exact: true })).toBeVisible();
  await search.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('failures leave counts unchanged and allow retry', async ({ page }) => {
  await setup(page, { fail: true });
  await page.getByRole('button', { name: 'React with an emoji', exact: true }).first().click();
  await page.getByRole('searchbox').fill('❤️');
  await page.getByRole('button', { name: 'red heart', exact: true }).click();
  await expect(page.getByText('GitHub refused this request.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'red heart', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: /❤️, 1 reaction/ })).toHaveCount(0);
});
test('page scripts cannot submit reactions by synthesizing clicks', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'React with an emoji', exact: true }).first().click();
  await page.getByRole('searchbox').fill('❤️');
  await page.getByRole('button', { name: 'red heart', exact: true }).evaluate(button => button.click());
  expect(await page.evaluate(() => sent.filter(m => m.type === 'react'))).toHaveLength(0);
});
test('token-free submission does not pretend a reaction has been saved', async ({ page }) => {
  await setup(page, { connected: false });
  await page.getByRole('button', { name: 'React with an emoji', exact: true }).first().click();
  await page.getByRole('searchbox').fill('❤️');
  await page.getByRole('button', { name: 'red heart', exact: true }).click();
  await expect(page.getByText('Finish by clicking', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /❤️, 1 reaction/ })).toHaveCount(0);
});
test('feed mutations do not duplicate controls; readonly stars also get reactions', async ({ page }) => {
  await setup(page);
  const before = await page.getByRole('button', { name: 'React with an emoji', exact: true }).count();
  await page.evaluate(() => {
    const card = document.querySelector('article[data-commit]').cloneNode(true);
    card.querySelectorAll('devnull-reactions').forEach(el => el.remove());
    card.querySelector('[data-test="star-commit-button"]').setAttribute('data-test', 'star-count-readonly');
    document.querySelector('main').append(card);
  });
  await expect(page.getByRole('button', { name: 'React with an emoji', exact: true })).toHaveCount(before + 1);
  await page.evaluate(() => document.body.append(document.createElement('p')));
  await expect(page.getByRole('button', { name: 'React with an emoji', exact: true })).toHaveCount(before + 1);
});
test('picker fits narrow viewport and dark theme', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await setup(page);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.getByRole('button', { name: 'React with an emoji', exact: true }).first().click();
  const box = await page.getByRole('dialog').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.y + box.height).toBeLessThanOrEqual(720);
  await page.screenshot({ path: 'artifacts/picker-dark-mobile.png', animations: 'disabled' });
});
test('packaged MV3 extension injects into the feed with its real service worker', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'devnull-ext-'));
  const extension = path.resolve('dist');
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    await context.route('https://dev-null.sh/**', route => route.fulfill({ body: markup, contentType: 'text/html' }));
    await context.route('https://raw.githubusercontent.com/**', route => route.fulfill({ status: 404, body: '' }));
    const submissions = [];
    await context.route('https://api.github.com/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/user') return route.fulfill({ json: { id: 42, login: 'octocat' } });
      if (url.pathname.endsWith('/issues') && route.request().method() === 'POST') {
        expect(route.request().headers().authorization).toBe('Bearer test-token-never-a-real-secret');
        submissions.push(route.request().postDataJSON());
        return route.fulfill({ json: { number: 12, user: { id: 42, login: 'octocat' }, html_url: 'https://github.com/test/repo/issues/12' } });
      }
      return route.fulfill({ status: 500, body: 'Unexpected API request' });
    });
    const page = await context.newPage(); await page.goto('https://dev-null.sh/');
    await expect(page.getByRole('button', { name: 'React with an emoji', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'React with an emoji', exact: true }).first().click();
    await expect(page.getByText('Choose an emoji, then submit it on GitHub.', { exact: false })).toBeVisible();
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(page.getByRole('heading', { name: 'Connect to GitHub' })).toBeVisible();
    await expect(page.getByText('Not connected.', { exact: false })).toBeVisible();
    await page.getByLabel('GitHub personal access token', { exact: true }).fill('test-token-never-a-real-secret');
    await page.getByRole('button', { name: 'Connect GitHub', exact: true }).click();
    await expect(page.getByText('Connected as @octocat.', { exact: false })).toBeVisible();
    await page.goto('https://dev-null.sh/');
    await page.getByRole('button', { name: 'React with an emoji', exact: true }).first().click();
    await page.getByRole('searchbox').fill('❤️');
    await page.getByRole('button', { name: 'red heart', exact: true }).click();
    await expect(page.getByRole('button', { name: /❤️, 1 reaction, yours/ }).first()).toBeVisible();
    expect(submissions).toEqual([{ title: '[reaction:v1]', body: JSON.stringify({ version: 1, commit, emoji: '❤️' }) }]);
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(page.getByText('Not connected.', { exact: false })).toBeVisible();
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
});
