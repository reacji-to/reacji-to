import { test, expect } from '@playwright/test';

async function setup(page, { collision = false, empty = false, initialScope = 'public' } = {}) {
  await page.route('https://dev-null.sh/**', route => route.request().headers()['x-inertia']
    ? route.fulfill({ json: { props: { auth: { user: { username: 'octocat' } } } } })
    : route.fulfill({ path: 'fixtures/feed.html', contentType: 'text/html' }));
  await page.route('https://emoji.slack-edge.com/**', route => route.fulfill({ path: 'public/logo.png', contentType: 'image/png' }));
  await page.addInitScript(({ collision, empty, initialScope }) => {
    window.sent = [];
    const docs = {};
    window.chrome = { runtime: { sendMessage: async message => {
      sent.push(message);
      if (message.type === 'visibility-get') return { ok: true, value: { visibility: initialScope } };
      if (message.type === 'status') return { ok: true, value: { connected: true, actor: { id: 42, login: 'octocat' }, slack: empty ? null : {
        connected: true, team: { id: 'T123', name: 'Example' }, settings: { channel: 'C123', channelName: 'ideas', rules: [{ emoji: '🔥', channel: 'C123' }, ...(collision ? [{ emoji: '🚀', channel: 'C123' }] : [])] },
      } } };
      if (message.type === 'raycast-catalog') return { ok: true, value: { actions: empty ? [] : [{ emoji: '🚀', name: 'Focus timer', description: 'Starts a 25-minute focus timer', destination: 'raycast' }] } };
      if (message.type === 'slack-emojis') return { ok: true, value: { emojis: [{ emoji: 'slack:T123:party', name: ':party:', group: 'Slack', url: 'https://emoji.slack-edge.com/T123/party.png' }] } };
      if (message.type === 'react') {
        docs[message.visibility] = { users: { 42: { login: 'octocat', emoji: message.event.emoji } } };
        return { ok: true, value: { actor: { id: 42, login: 'octocat' }, document: docs[message.visibility] } };
      }
      if (['read', 'private-read', 'slack-read'].includes(message.type)) return { ok: true, value: docs[message.type === 'slack-read' ? 'slack' : message.type === 'private-read' ? 'private' : 'public'] || { users: {} } };
      return { ok: true, value: {} };
    } } };
  }, { collision, empty, initialScope });
  await page.goto('https://dev-null.sh/'); await page.addScriptTag({ path: 'dist/content.js' });
  await page.getByRole('button', { name: 'React with an emoji', exact: true }).first().click();
}
const sections = page => page.getByRole('group', { name: 'Reaction visibility' });
test('top-level action sections show hover/focus destinations without losing search text', async ({ page }) => {
  await setup(page);
  await expect(sections(page).getByRole('button')).toHaveText(['Public', 'Private', 'Slack', 'Raycast']);
  const search = page.getByRole('searchbox');
  await search.fill('rocket');
  const rocket = page.getByRole('button', { name: 'rocket', exact: true });
  await rocket.hover();
  await expect(page.locator('.action-hint')).toContainText('Goes to Raycast');
  await expect(page.locator('.action-hint')).toContainText('Starts a 25-minute focus timer');
  await expect(search).toHaveCSS('opacity', '0');
  await expect(search).toHaveValue('rocket');
  await search.hover();
  await expect(search).toHaveCSS('opacity', '1');
  await expect(search).toHaveValue('rocket');
  await sections(page).getByRole('button', { name: 'Raycast', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByRole('toolbar', { name: 'Emoji categories' })).toBeHidden();
  const focus = page.getByRole('button', { name: 'Focus timer', exact: true });
  await expect(focus).toHaveAttribute('aria-description', /Goes to Raycast/);
  await focus.focus();
  await expect(page.locator('.action-hint')).toContainText('Goes to Raycast');
  await page.getByRole('dialog').screenshot({ path: 'artifacts/picker-raycast.png' });
  await focus.evaluate(button => button.click());
  expect(await page.evaluate(() => sent.filter(message => message.type === 'react'))).toHaveLength(0);
  await focus.click();
  await expect.poll(() => page.evaluate(() => sent.filter(message => message.type === 'react').map(message => [message.event.emoji, message.visibility]))).toEqual([['🚀', 'raycast']]);
});

test('Slack section contains rule emojis and custom images with real routing descriptions', async ({ page }) => {
  await setup(page);
  await sections(page).getByRole('button', { name: 'Slack', exact: true }).click();
  const fire = page.getByRole('button', { name: 'fire', exact: true });
  await fire.hover();
  await expect(page.locator('.action-hint')).toContainText('Goes to Slack');
  await expect(page.locator('.action-hint')).toContainText('Posts this link and context in #ideas');
  const party = page.getByRole('button', { name: ':party:', exact: true });
  await expect(party.locator('img')).toHaveAttribute('src', 'https://emoji.slack-edge.com/T123/party.png');
  await page.setViewportSize({ width: 375, height: 720 });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await party.focus();
  await expect(page.locator('.action-hint')).toContainText('Goes to Slack');
  const box = await page.getByRole('dialog').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.y + box.height).toBeLessThanOrEqual(720);
  await page.getByRole('dialog').screenshot({ path: 'artifacts/picker-slack-mobile.png' });
  await party.click();
  await expect.poll(() => page.evaluate(() => sent.filter(message => message.type === 'react').map(message => ({ emoji: message.event.emoji, visibility: message.visibility })))).toEqual([{ emoji: 'slack:T123:party', visibility: 'slack' }]);
});

test('an explicit destination takes precedence over an automatic emoji rule', async ({ page }) => {
  await setup(page, { collision: true });
  await sections(page).getByRole('button', { name: 'Raycast', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Focus timer', exact: true })).toBeVisible();
  await sections(page).getByRole('button', { name: 'Slack', exact: true }).click();
  const rocket = page.getByRole('button', { name: 'rocket', exact: true });
  await rocket.hover();
  await expect(page.locator('.action-hint')).toContainText('Goes to Slack');
  await expect(page.locator('.action-hint')).not.toContainText('Raycast');
});

test('empty action sections offer settings and ordinary emojis keep the search visible', async ({ page }) => {
  await setup(page, { empty: true });
  await sections(page).getByRole('button', { name: 'Slack', exact: true }).click();
  await expect(page.getByText('No Slack actions yet.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await expect.poll(() => page.evaluate(() => sent.filter(message => message.type === 'options').length)).toBe(1);
  await sections(page).getByRole('button', { name: 'Public', exact: true }).click();
  await page.getByRole('searchbox').fill('rocket');
  await page.getByRole('button', { name: 'rocket', exact: true }).hover();
  await expect(page.locator('.action-hint')).toBeHidden();
  await expect(page.getByRole('searchbox')).toHaveCSS('opacity', '1');
});

test('destination hints and clicks follow the latest visibility choice', async ({ page }) => {
  await setup(page, { initialScope: 'slack' });
  await page.getByRole('searchbox').fill('rocket');
  const rocket = page.getByRole('button', { name: 'rocket', exact: true });
  await rocket.hover();
  await expect(page.locator('.action-hint')).toContainText('Goes to Slack');
  await page.getByRole('group', { name: 'Reaction visibility' }).getByRole('button', { name: 'Public', exact: true }).click();
  await page.getByRole('searchbox').fill('rocket');
  await rocket.hover();
  await expect(page.locator('.action-hint')).toContainText('Goes to Raycast');
  await rocket.click();
  await expect.poll(() => page.evaluate(() => sent.filter(message => message.type === 'react').map(message => message.visibility))).toEqual(['public']);
});


test('a Slack routing rule does not change the default destination for unrelated reactions', async ({ page }) => {
  await setup(page);
  await page.getByRole('searchbox').fill('fire');
  await page.getByRole('button', { name: 'fire', exact: true }).click();
  await expect.poll(() => page.evaluate(() => sent.filter(message => message.type === 'react').map(message => message.visibility))).toEqual(['slack']);
  expect(await page.evaluate(() => sent.filter(message => message.type === 'visibility-save' && message.visibility === 'slack'))).toEqual([]);
});
