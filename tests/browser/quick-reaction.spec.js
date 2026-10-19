import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test.beforeEach(async ({ page }) => {
  await page.route('https://example.test/**', route => route.fulfill({ contentType: 'text/html', body: `
    <style>body{font:20px system-ui;margin:60px}a{display:block;padding:32px;cursor:pointer}input,[contenteditable]{margin:20px;padding:12px}</style>
    <a id="target" href="/destination">A sentence worth reacting to.</a>
    <input aria-label="Text field"><div contenteditable="plaintext-only">Editable text</div>
    <script>window.pageEvents=[];for(const type of ['pointerdown','mousedown','pointerup','mouseup','click'])document.querySelector('a').addEventListener(type,()=>pageEvents.push(type));</script>` }));
  await page.addInitScript(() => {
    window.writes = [];
    window.chrome = { runtime: {
      sendMessage: async message => {
        if (message.type === 'status') return { ok: true, value: { connected: true, actor: { id: 42, login: 'octocat' } } };
        if (message.type === 'react') {
          window.writes.push(message);
          return { ok: true, value: { actor: { id: 42, login: 'octocat' }, document: { placements: { [message.event.placement.id]: { anchor: message.event.placement, users: { 42: { login: 'octocat', emoji: message.event.emoji } } } } } } };
        }
        return { ok: true, value: { users: {}, placements: {} } };
      },
      onMessage: { addListener: listener => { window.fromBackground = listener; } },
    } };
  });
  await page.goto('https://example.test/');
  await page.addScriptTag({ path: 'dist/content.js' });
  await page.locator('#target').hover();
});

const cursor = page => page.locator('#target').evaluate(el => getComputedStyle(el).cursor);

test('Option/Alt shows eyes, intercepts the page click and opens the existing picker', async ({ page }) => {
  await page.keyboard.down('Alt');
  await expect.poll(() => cursor(page)).toContain('data:image/png;base64,');
  await page.locator('#target').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.getByRole('dialog').screenshot({ path: 'artifacts/quick-reaction-picker.png' });
  expect(await page.evaluate(() => window.pageEvents)).toEqual([]);
  expect(page.url()).toBe('https://example.test/');
  await expect.poll(() => cursor(page)).toBe('pointer');
  await page.keyboard.up('Alt');
  await page.getByRole('searchbox').fill('💙');
  await page.getByRole('button', { name: 'blue heart', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.writes.length)).toBe(1);
  expect(await page.evaluate(() => window.writes[0].event.placement.quote)).toBe('A sentence worth reacting to.');
  await expect(page.locator('.pin .chip')).toHaveText('💙');
  await page.screenshot({ path: 'artifacts/quick-reaction.png' });
});

test('release, Escape, blur and other modifiers restore the page cursor', async ({ page }) => {
  await page.keyboard.down('Alt');
  await page.keyboard.up('Alt');
  await expect.poll(() => cursor(page)).toBe('pointer');
  await page.keyboard.down('Alt');
  await page.keyboard.press('Escape');
  await page.locator('#target').hover();
  await expect.poll(() => cursor(page)).toBe('pointer');
  await page.keyboard.up('Alt');
  await page.keyboard.down('Alt');
  await expect.poll(() => cursor(page)).toContain('data:image/png;base64,');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(() => cursor(page)).toBe('pointer');
  await page.keyboard.up('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.down('Alt');
  await expect.poll(() => cursor(page)).toBe('pointer');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Shift');
  await page.locator('#target').click();
  await expect(page).toHaveURL('https://example.test/destination');
});

test('text fields and editable content retain their normal interaction; right-click still opens the picker', async ({ page }) => {
  for (const selector of ['input', '[contenteditable]']) {
    await page.locator(selector).click();
    await page.keyboard.down('Alt');
    await page.locator('#target').hover();
    await expect.poll(() => cursor(page)).toBe('pointer');
    await page.locator(selector).click();
    await expect(page.locator(selector)).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.up('Alt');
  }
  await page.locator('#target').click({ button: 'right' });
  await page.evaluate(() => window.fromBackground({ type: 'place-reaction' }));
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('releasing Alt during a click still consumes that gesture; Escape cancels it', async ({ page }) => {
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.keyboard.up('Alt');
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => window.pageEvents)).toEqual([]);
  await page.keyboard.press('Escape');
  // Closing the picker focuses its trigger; the next shortcut still works.
  await page.locator('#target').hover();
  await page.keyboard.down('Alt');
  await expect.poll(() => cursor(page)).toContain('data:image/png;base64,');
  await page.mouse.down();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(page.url()).toBe('https://example.test/');
  expect(await page.evaluate(() => window.pageEvents)).toEqual([]);
});

test('the installed extension displays the eyes cursor and opens the picker in its isolated world', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'reacji-shortcut-'));
  const extension = path.resolve('dist');
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const page = await context.newPage();
    await page.route('https://example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<p id="target">React with the installed extension.</p>' }));
    await page.goto('https://example.test/');
    await expect(page.locator('reacji-to-reactions')).toHaveCount(1);
    await page.locator('#target').hover();
    await page.keyboard.down('Alt');
    await expect.poll(() => cursor(page)).toContain('data:image/png;base64,');
    await page.locator('#target').click();
    await page.keyboard.up('Alt');
    await expect(page.getByRole('dialog')).toBeVisible();
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
