import { test, expect, chromium } from '@playwright/test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const commit = '01a14f9d-76a7-72d9-a92d-48ae9ea999cb';
const markup = await readFile('fixtures/feed.html', 'utf8');
async function setup(page, { connected = true, fail = false, readFail = false } = {}) {
  await page.route('https://dev-null.sh/**', route => route.request().headers()['x-inertia'] ? route.fulfill({ json: { props: { auth: { user: { username: 'octocat' } } } } }) : route.fulfill({ body: markup, contentType: 'text/html' }));
  await page.addInitScript(({ commit, connected, fail, readFail }) => {
    window.sent = [];
    const documents = { public: { version: 1, commit, users: { 99: { login: 'friend', emoji: '🔥' } } }, private: { version: 1, commit, users: {} } };
    window.chrome = { runtime: { sendMessage: async message => {
      window.sent.push(message);
      if (message.type === 'status') return { ok: true, value: { connected, actor: connected ? { id: 42, login: 'octocat' } : null } };
      if (message.type === 'read' || message.type === 'private-read') return readFail ? { ok: false, error: 'Reactions are unavailable. Try again shortly.' } : { ok: true, value: structuredClone(documents[message.type === 'read' ? 'public' : 'private']) };
      if (message.type === 'react') {
        if (!connected) return { ok: false, error: 'Connect GitHub in extension settings before reacting.' };
        if (fail) return { ok: false, error: 'GitHub refused this request. Check token permissions or wait for the rate limit to reset.' };
        documents[message.visibility].users[42] = { login: 'octocat', emoji: message.event.emoji };
        return { ok: true, value: { mode: 'committed', document: structuredClone(documents[message.visibility]), actor: { id: 42, login: 'octocat' } } };
      }
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
  await page.getByRole('button', { name: 'Private', exact: true }).evaluate(button => button.click());
  expect(await page.evaluate(() => sent.filter(m => m.type === 'private-read'))).toHaveLength(0);
  await page.getByRole('searchbox').fill('❤️');
  await page.getByRole('button', { name: 'red heart', exact: true }).evaluate(button => button.click());
  expect(await page.evaluate(() => sent.filter(m => m.type === 'react'))).toHaveLength(0);
});
test('disconnected users cannot submit a reaction', async ({ page }) => {
  await setup(page, { connected: false });
  await page.getByRole('button', { name: 'React with an emoji', exact: true }).first().click();
  await page.getByRole('searchbox').fill('❤️');
  await page.getByRole('button', { name: 'red heart', exact: true }).click();
  await expect(page.getByText('Connect GitHub in extension settings before reacting.', { exact: true })).toBeVisible();
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

test('Public / Private picker switcher keeps private emoji out of public counts', async ({ page }) => {
  await setup(page);
  const trigger = page.getByRole('button', { name: 'React with an emoji', exact: true }).first();
  await trigger.click();
  await page.getByRole('button', { name: 'Private', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Private', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('searchbox').fill('🚀'); await page.getByRole('button', { name: 'rocket', exact: true }).click();
  await expect(page.getByRole('button', { name: /Private: 🚀, 1 reaction/ }).first()).toBeVisible();
  await trigger.click();
  await page.getByRole('button', { name: 'Public', exact: true }).click();
  await expect(page.getByRole('button', { name: /Private: 🚀/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /🔥, 1 reaction/ }).first()).toBeVisible();
  expect((await page.evaluate(() => sent.filter(m => m.type === 'react')))[0].visibility).toBe('private');
});
