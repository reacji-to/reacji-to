import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('Slack settings import emoji and lock all routing to the authorized channel', async ({ page }) => {
  await page.route('https://settings.test/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    return route.fulfill({ path: `dist/${pathname === '/' ? 'options.html' : pathname.slice(1)}` });
  });
  await page.addInitScript(() => {
    window.sent = [];
    const settings = { defaultDestination: 'slack', channel: 'CGENERAL', rules: [{ emoji: 'slack:TDEMO:foo', channel: 'CGENERAL', channelName: 'general' }] };
    window.chrome = { runtime: { sendMessage: async message => {
      sent.push(message);
      let value = {};
      if (message.type === 'status') value = { connected: true, oauthAvailable: true, actor: { id: 42, login: 'octocat' } };
      if (message.type === 'updates-status') value = { currentVersion: '0.4.3', latestVersion: '0.4.3' };
      if (message.type === 'raycast-list') value = { actions: [] };
      if (message.type === 'service-get' || message.type === 'service-save') value = { serviceUrl: message.serviceUrl || 'https://reacji.to' };
      if (message.type === 'slack-status') value = { connected: true, available: true, team: { id: 'TDEMO', name: 'Example workspace' }, settings };
      if (message.type === 'slack-channels') value = { channels: [{ id: 'CGENERAL', name: 'general' }] };
      if (message.type === 'slack-emojis') value = { emojis: [{ emoji: 'slack:TDEMO:foo', name: ':foo:' }, { emoji: 'slack:TDEMO:alias', name: ':alias:' }] };
      if (message.type === 'slack-settings') { Object.assign(settings, message.settings); value = { settings }; }
      return { ok: true, value };
    } } };
  });
  await page.goto('https://settings.test/');
  await expect(page.locator('#slack-workspace')).toContainText('2 custom emojis imported');
  await expect(page.locator('#slack-channel')).toBeDisabled();
  await expect(page.locator('#slack-channel option')).toHaveText(['#general']);
  await expect(page.locator('#slack-rule-channel')).toBeDisabled();
  await page.getByLabel('When I use this emoji').fill(':alias:');
  await page.getByRole('button', { name: 'Add rule', exact: true }).click();
  await page.getByRole('button', { name: 'Save Slack settings' }).click();
  await expect(page.locator('#slack-status')).toContainText('Saved.');
  expect(await page.evaluate(() => sent.find(m => m.type === 'slack-settings').settings.rules.at(-1))).toEqual({ emoji: 'slack:TDEMO:alias', channel: 'CGENERAL' });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.locator('#slack-section').screenshot({ path: `artifacts/slack-settings-${width}.png` });
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.locator('#slack-section').screenshot({ path: 'artifacts/slack-settings-dark.png' });
  await page.getByText('Use your own Cloudflare Worker', { exact: true }).click();
  await page.getByLabel('Worker origin').fill('https://personal.workers.dev');
  await page.getByRole('button', { name: 'Use this Worker', exact: true }).click();
  await expect(page.locator('#service-status')).toContainText('Worker selected');
  expect(await page.evaluate(() => sent.find(m => m.type === 'service-save').serviceUrl)).toBe('https://personal.workers.dev');
});

test('real extension finishes Slack OAuth in its identity window; Slack delivery excludes GitHub and Raycast', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'reacji-slack-'));
  const extension = path.resolve('dist');
  const context = await chromium.launchPersistentContext(root, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const writes = [], github = [], lookups = [];
  let connected = false;
  const settings = { defaultDestination: 'slack', channel: 'CDEST', channelName: 'destination', rules: [{ emoji: '🔥', channel: 'CRULE', channelName: 'triage' }] };
  try {
    await context.route('https://api.github.com/**', route => {
      const pathname = new URL(route.request().url()).pathname; github.push(pathname);
      if (pathname === '/user') return route.fulfill({ json: { id: 42, login: 'octocat' } });
      if (pathname.endsWith('/releases/latest')) return route.fulfill({ json: { tag_name: 'v0.4.3' } });
      return route.fulfill({ status: 404, body: '' });
    });
    await context.route('https://raw.githubusercontent.com/**', route => route.fulfill({ status: 404, body: '' }));
    await context.route('https://reacji.to/**', route => {
      const endpoint = new URL(route.request().url()).pathname;
      const body = route.request().postDataJSON();
      let value = {};
      if (endpoint === '/v1/slack/status') value = { connected, available: true, team: { id: 'TDEMO', name: 'Workspace' }, settings };
      if (endpoint === '/v1/slack/connect') { expect(body.returnUrl).toMatch(/^https:\/\/[a-p]{32}\.chromiumapp\.org\/slack$/); value = { url: 'https://slack.com/oauth/v2/authorize?state=fixture' }; }
      if (endpoint === '/v1/slack/complete') { expect(body.completion).toBe('browser-only-completion'); connected = true; value = { connected: true }; }
      if (endpoint === '/v1/slack/emojis') value = { emojis: [{ emoji: 'slack:TDEMO:foo', name: ':foo:', group: 'Slack' }] };
      if (endpoint === '/v1/slack/channels') value = { channels: [{ id: 'CDEST', name: 'destination' }, { id: 'CRULE', name: 'triage' }] };
      if (endpoint === '/v1/slack/settings') value = { settings: body.settings };
      if (endpoint === '/v1/slack/read') { lookups.push(body); value = { version: 1, commit: body.post.id, users: {} }; }
      if (endpoint === '/v1/react') { writes.push(body); value = { destination: 'slack', actor: { id: 42, login: 'octocat' }, document: { version: 1, commit: body.event.post.id, post: body.event.post, users: { 42: { login: 'octocat', emoji: body.event.emoji } } } }; }
      return route.fulfill({ json: value });
    });
    await context.route('https://x.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Post title</title><article data-testid="tweet"><a href="/person/status/123456789"><time>Today</time></a><p>Visible context</p><input value="secret form value"><div role="group"><button data-testid="reply">Reply</button><button data-testid="like">Like</button></div></article>' }));
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ token: 'ghu_test', actor: { id: 42, login: 'octocat' }, expiresAt: Date.now() + 3600000, lastVisibility: 'slack', raycastActions: [{ emoji: '🔥', name: 'Never launch', description: 'Test', enabled: true, deeplink: 'raycast://extensions/raycast/raycast/search' }] });
      globalThis.launches = [];
      chrome.tabs.create = async options => { launches.push(options.url); return {}; };
      chrome.identity.launchWebAuthFlow = async options => { globalThis.identityFlow = options; return chrome.identity.getRedirectURL('slack') + '?completion=browser-only-completion'; };
    });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
    await page.getByRole('button', { name: 'Connect Slack', exact: true }).click();
    await expect(page.locator('#slack-workspace')).toContainText('1 custom emojis imported');
    expect(await worker.evaluate(() => identityFlow.interactive)).toBe(true);
    await page.goto('https://x.com/home');
    await page.getByRole('button', { name: 'React with an emoji', exact: true }).click();
    await page.getByRole('searchbox').fill('🔥');
    await page.getByRole('button', { name: 'fire', exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].visibility).toBe('slack');
    expect(writes[0].mirrorPublic).toBeUndefined();
    expect(writes[0].context.quote).toContain('Visible context');
    expect(writes[0].context.quote).not.toContain('secret form value');
    expect(github.every(path => path === '/user' || path.endsWith('/releases/latest'))).toBe(true);
    expect(await worker.evaluate(() => launches)).toEqual([]);
    expect(lookups.every(body => !body.post.url && !body.context)).toBe(true);
  } finally { await context.close(); await rm(root, { recursive: true, force: true }); }
});
