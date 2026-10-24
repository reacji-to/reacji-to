import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';

async function setup(page) {
  await page.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Selected article</title><style>p{font:20px/1.5 Arial;margin:60px;width:650px}</style><p id="passage">Before this <strong>important selected passage</strong> after this.</p><input value="private value">' }));
  await page.addInitScript(() => {
    window.sent = []; const docs = {};
    window.chrome = { runtime: { sendMessage: async message => {
      sent.push(message);
      if (message.type === 'status') return { ok: true, value: { connected: true, actor: { id: 42, login: 'octocat' } } };
      if (message.type === 'emoji-alias-list') return { ok: true, value: { aliases: [{ name: 'design', emoji: '🎨' }] } };
      if (message.type === 'react') {
        docs[message.event.post.id] = { placements: { [message.event.placement.id]: { anchor: message.event.placement, users: { 42: { login: 'octocat', emoji: message.event.emoji } } } } };
        return { ok: true, value: { actor: { id: 42, login: 'octocat' }, document: docs[message.event.post.id] } };
      }
      return { ok: true, value: message.type === 'read' ? docs[message.post.id] || { users: {} } : {} };
    } } };
  });
  await page.goto('https://example.com/article'); await page.addScriptTag({ path: 'dist/content.js' });
}
test('opening from the eyes focuses search and Return chooses a named emoji', async ({ page }) => {
  await setup(page);
  await page.keyboard.down('Alt'); await page.locator('#passage').click(); await page.keyboard.up('Alt');
  const search = page.getByRole('searchbox');
  await expect(search).toBeFocused();
  await search.fill('design');
  await expect(page.getByRole('button', { name: 'design — artist palette', exact: true })).toBeVisible();
  await search.press('Enter');
  await expect.poll(() => page.evaluate(() => sent.find(message => message.type === 'react')?.event.emoji)).toBe('🎨');
});
test('eyes drag selects a text span, previews it and saves a restorable highlight', async ({ page }) => {
  await setup(page);
  const points = await page.locator('strong').evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    const box = range.getBoundingClientRect(); return { x: box.left + 1, end: box.right - 1, y: box.top + box.height / 2 };
  });
  await page.keyboard.down('Alt');
  await page.mouse.move(points.x, points.y); await page.mouse.down();
  await page.mouse.move(points.end, points.y, { steps: 12 }); await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.selected-text')).toContainText('important selected passage');
  await page.getByRole('searchbox').fill('rocket');
  await page.getByRole('button', { name: 'rocket', exact: true }).click();
  await expect.poll(() => page.evaluate(() => sent.find(m => m.type === 'react')?.event.placement.selection.exact)).toBe('important selected passage');
  expect(await page.evaluate(() => [...CSS.highlights.get('reacji-text')].map(range => range.toString()))).toEqual(['important selected passage']);
  await page.screenshot({ path: 'artifacts/selected-passage.png' });
});

test('a new integration descriptor renders in the one selector and dispatches without picker-specific code', async ({ page }) => {
  await page.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>A note target.</p>' }));
  await page.addInitScript(() => {
    window.sent = [];
    window.chrome = { runtime: { sendMessage: async message => {
      sent.push(message);
      return { ok: true, value: message.type === 'status' ? { connected: true, actor: { id: 42, login: 'octocat' } } : message.type === 'react' ? { document: { users: {} } } : {} };
    } } };
  });
  await page.goto('https://example.com/');
  const built = await build({ stdin: { contents: `import {initializeReactions} from './src/reaction-app.js'; import {destinations} from './src/destinations.js'; import {createDestinationRegistry} from './src/destination-registry.js'; initializeReactions({runtime:chrome.runtime,destinations:createDestinationRegistry([...destinations.entries,{id:'notes',label:'Notes',catalog:()=>[{emoji:'📝',name:'Save note'}],describe:emoji=>({emoji,destination:'notes',description:'Saves a note'}),loadWhen:()=>true}])});`, resolveDir: path.resolve('.') }, bundle: true, write: false, loader: { '.css': 'text' } });
  await page.addScriptTag({ content: built.outputFiles[0].text });
  await page.keyboard.down('Alt'); await page.locator('p').click(); await page.keyboard.up('Alt');
  await page.getByRole('group', { name: 'Reaction storage' }).getByRole('button', { name: 'Notes' }).click();
  const action = page.getByRole('button', { name: 'Save note' }); await action.hover();
  await expect(page.locator('.action-hint')).toContainText('Goes to Notes');
  await action.click();
  await expect.poll(() => page.evaluate(() => sent.find(m => m.type === 'react')?.visibility)).toBe('notes');
  await expect(page.getByRole('toolbar', { name: 'Reaction sections' })).toHaveCount(0);
});
