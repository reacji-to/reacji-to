import { test, expect, chromium } from '@playwright/test';
import { build } from 'esbuild';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('real extension completes device OAuth, resumes after reload, and submits with its user token', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'devnull-oauth-'));
  const extension = path.join(root, 'extension');
  await cp('dist', extension, { recursive: true });
  // Use a fake public client ID only in the isolated test build. Network calls are mocked below.
  await build({ entryPoints: ['src/background.js'], bundle: true, outfile: path.join(extension, 'background.js'), format: 'esm', target: 'chrome120', plugins: [{ name: 'test-client-id', setup(builder) {
    builder.onLoad({ filter: /src\/config\.js$/ }, async args => ({ contents: (await readFile(args.path, 'utf8')).replace(/export const GITHUB_APP_CLIENT_ID = .*;/, "export const GITHUB_APP_CLIENT_ID = 'Iv1.test-client';"), loader: 'js' }));
  } }] });
  const context = await chromium.launchPersistentContext(path.join(root, 'profile'), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const oauthRequests = [], submissions = [];
  let siteUsername = 'octocat';
  let approved = false;
  let mirrorFails = false;
  try {
    await context.route('https://github.com/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/login/device') return route.fulfill({ body: '<h1>GitHub authorization fixture</h1>', contentType: 'text/html' });
      if (!['/login/device/code', '/login/oauth/access_token'].includes(url.pathname)) return route.fulfill({ status: 404, body: '' });
      const params = new URLSearchParams(route.request().postData());
      expect(params.get('client_id')).toBe('Iv1.test-client'); expect(params.has('client_secret')).toBe(false);
      oauthRequests.push(url.pathname);
      if (url.pathname === '/login/device/code') return route.fulfill({ json: { device_code: 'private-code', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: 900 } });
      expect(params.has('repository_id')).toBe(false);
      if (url.pathname === '/login/oauth/access_token') return route.fulfill({ json: approved
        ? { access_token: 'ghu_test-oauth', expires_in: 28800, refresh_token: 'ghr_test-refresh', refresh_token_expires_in: 15897600 }
        : { error: 'authorization_pending' } });
      return route.fulfill({ status: 500, body: 'Unexpected OAuth request' });
    });
    await context.route('https://api.github.com/**', route => {
      if (new URL(route.request().url()).pathname === '/repos/reacji-to/reacji-to/releases/latest') return route.fulfill({ json: { tag_name: 'v0.3.1', draft: false, prerelease: false } });
      if (new URL(route.request().url()).pathname.startsWith('/_private/')) return route.fulfill({ status: 204, body: '' });
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-github-api-version', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
      expect(route.request().headers().authorization, route.request().method() + ' ' + route.request().url()).toBe('Bearer ghu_test-oauth');
      if (['/user', '/users/octocat'].includes(new URL(route.request().url()).pathname)) return route.fulfill({ json: { id: 42, login: 'octocat' } });
      if (new URL(route.request().url()).pathname === '/users/other') return route.fulfill({ json: { id: 99, login: 'other' } });
      if (new URL(route.request().url()).pathname === '/user/installations') return route.fulfill({ json: { installations: [{ id: 55 }] } });
      if (new URL(route.request().url()).pathname === '/user/installations/55/repositories') return route.fulfill({ json: { repositories: [
        { id: 77, full_name: 'octocat/reacji-to-private', private: true, owner: { id: 42 }, permissions: { push: true } },
        { id: 78, full_name: 'octocat/public', private: false, owner: { id: 42 }, permissions: { push: true } },
        { id: 79, full_name: 'friend/private', private: true, owner: { id: 99 }, permissions: { push: true } },
      ] } });
      return route.fulfill({ status: 500, body: 'Unexpected GitHub request' });
    });
    await context.route('https://reacji.to/**', route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
      expect(route.request().headers().authorization).toBe('Bearer ghu_test-oauth');
      const body = route.request().postDataJSON(), path = new URL(route.request().url()).pathname;
      if (path === '/v1/slack/status') return route.fulfill({ json: { connected: false, settings: { channel: '', rules: [] } } });
      if (path === '/v1/private/validate') return route.fulfill({ json: { actor: { id: 42, login: 'octocat' }, repository: { name: body.repository } } });
      if (path === '/v1/private/read') return route.fulfill({ json: { version: 1, commit: body.commit, users: {} } });
      submissions.push(body);
      return route.fulfill({ json: { actor: { id: 42, login: 'octocat' }, document: { version: 1, commit: body.event.commit, users: { 42: { login: 'octocat', emoji: body.event.emoji } } },
        ...(mirrorFails && body.visibility === 'public' && body.mirrorPublic ? { mirror: { status: 'failed', error: 'Public reaction saved, but its private-repo copy failed. Check settings.' } } : {}) } });
    });
    await context.route('https://raw.githubusercontent.com/**', route => route.fulfill({ status: 404, body: '' }));
    await context.route('https://dev-null.sh/**', route => new URL(route.request().url()).pathname === '/@octocat/following' ? route.fulfill({contentType:'text/html',body:`<script data-page="app" type="application/json">${JSON.stringify({component:'user/connections',props:{type:'following',user:{username:'octocat'},users:{data:[{username:'friend',avatar_url:'https://avatars.githubusercontent.com/u/99?v=4'}],next_page_url:null}}})}</script>`}) : route.request().headers()['x-inertia'] ? route.fulfill({ json: { props: { auth: { user: siteUsername ? { username: siteUsername } : null } } } }) : route.fulfill({ path: 'fixtures/feed.html', contentType: 'text/html' }));
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    // Chrome-created tabs can navigate before Playwright attaches routing. Keep this test offline.
    await worker.evaluate(() => {
      const createTab = chrome.tabs.create.bind(chrome.tabs);
      globalThis.openedUrls = [];
      chrome.tabs.create = options => { globalThis.openedUrls.push(options.url); return createTab({ url: 'about:blank' }); };
    });
    const url = `chrome-extension://${new URL(worker.url()).host}/options.html`;
    const page = await context.newPage(); await page.goto(url);
    await page.getByRole('button', { name: 'Connect GitHub', exact: true }).click();
    await expect(page.getByLabel('GitHub authorization code')).toHaveText('ABCD-EFGH');
    const authTabPromise = context.waitForEvent('page');
    await page.getByRole('button', { name: 'Continue to GitHub ↗' }).click();
    const authTab = await authTabPromise;
    expect(await worker.evaluate(() => globalThis.openedUrls)).toEqual(['https://github.com/login/device']);
    await authTab.close();
    await page.reload();
    await expect(page.getByLabel('GitHub authorization code')).toHaveText('ABCD-EFGH');
    await page.screenshot({ path: 'artifacts/oauth-device-code.png', animations: 'disabled' });
    approved = true;
    await expect(page.getByText('Connected as @octocat.', { exact: false })).toBeVisible({ timeout: 12000 });
    await expect(page.getByLabel('GitHub authorization code')).toBeHidden();
    await page.getByLabel('Public reactions',{exact:true}).selectOption('following');
    await expect(page.locator('#audience-status')).toContainText('Saved.');
    await page.reload();
    await expect(page.getByLabel('Public reactions',{exact:true})).toHaveValue('following');
    await expect(page.locator('#audience-status')).toContainText('1 people you follow');
    await page.getByRole('button',{name:'Refresh following list',exact:true}).click();
    await expect(page.locator('#audience-status')).toContainText('Loaded 1 people');
    await page.screenshot({path:'.impeccable/review/settings-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({path:'.impeccable/review/settings-mobile.png',fullPage:true});
    await page.setViewportSize({width:1280,height:900});
    await page.getByLabel('Public reactions',{exact:true}).selectOption('everyone');

    await page.evaluate(async () => {
      await chrome.runtime.sendMessage({ type: 'raycast-save', actions: [{ emoji: '🚀', name: 'Search', description: 'Opens search', enabled: true, deeplink: 'raycast://extensions/raycast/raycast/search' }] });
    });
    await page.goto('https://dev-null.sh/');
    await page.getByRole('button', { name: 'React with an emoji', exact: true }).first().click();
    await page.getByRole('searchbox').fill('🚀'); await page.getByRole('button', { name: 'rocket', exact: true }).click();
    await expect(page.getByRole('button', { name: /🚀, 1 reaction, yours/ }).first()).toBeVisible();
    await expect.poll(()=>submissions.length).toBe(1);
    await expect.poll(() => worker.evaluate(() => globalThis.openedUrls.filter(url => url.startsWith('raycast:')).length)).toBe(1);
    await expect.poll(() => worker.evaluate(async () => (await chrome.storage.local.get('emojiUsage')).emojiUsage?.[0]?.emoji)).toBe('🚀');
    await page.reload();
    // The first post's eyes become its saved rocket when cached data arrives.
    // Use the unreacted post so the click cannot race that replacement.
    const unreactedPost = page.locator('article[data-commit="01a14e59-d9f2-72dd-ab12-e92f460253cd"]');
    await unreactedPost.getByRole('button', { name: 'React with an emoji', exact: true }).click();
    await expect(page.locator('.emoji-section').first().locator('.emoji').first()).toHaveText('🚀');
    await page.getByRole('searchbox').press('Escape');
    expect(submissions[0].event.emoji).toBe('🚀');
    expect(submissions[0].visibility).toBe('public');
    expect(submissions[0].mirrorPublic).toBe(true);
    expect(submissions[0].repository).toBeUndefined();
    expect(oauthRequests.filter(value => value === '/login/device/code')).toHaveLength(1);
    // Site sign-out and account changes must be checked again immediately before every mutation.
    siteUsername = 'other';
    await unreactedPost.getByRole('button', { name: 'React with an emoji', exact: true }).click();
    await page.getByRole('searchbox').fill('❤️'); await page.getByRole('button', { name: 'red heart', exact: true }).click();
    await expect(page.getByText('Sign in with the same account.', { exact: false })).toBeVisible();
    await expect.poll(()=>submissions.length).toBe(1);
    siteUsername = null;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByText('Sign in to dev-null before reacting.', { exact: false })).toBeVisible();
    await expect.poll(()=>submissions.length).toBe(1);
    expect(await worker.evaluate(() => globalThis.openedUrls.filter(url => url.startsWith('raycast:')).length)).toBe(1);
    siteUsername = 'octocat';
    await page.goto(url);
    await page.getByRole('button', { name: 'Refresh repositories', exact: true }).click();
    await expect(page.getByLabel('Private repository').locator('option')).toHaveCount(2);
    await page.getByLabel('Private repository').selectOption('octocat/reacji-to-private');
    await page.getByRole('button', { name: 'Use this repository', exact: true }).click();
    await expect(page.getByText('Private reactions are ready.', { exact: false })).toBeVisible();
    await expect(page.locator('#mirror-public')).toBeChecked();
    await expect(page.locator('#mirror-status')).toContainText('public/');
    await page.locator('#private-setup').screenshot({ path: '.impeccable/review/mirror-settings-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.locator('#private-setup').screenshot({ path: '.impeccable/review/mirror-settings-mobile.png' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://dev-null.sh/');
    await unreactedPost.getByRole('button', { name: 'React with an emoji', exact: true }).click();
    await page.getByRole('button', { name: 'Private', exact: true }).click();
    await page.getByRole('searchbox').fill('❤️'); await page.getByRole('button', { name: 'red heart', exact: true }).click();
    await expect(page.getByRole('button', { name: /Private: ❤️, 1 reaction/ }).first()).toBeVisible();
    await expect.poll(()=>submissions.length).toBe(2);
    expect(submissions[1].repository).toBe('octocat/reacji-to-private');
    expect(submissions[1].visibility).toBe('private');
    expect(submissions[1].mirrorPublic).toBeUndefined();
    await context.route('https://x.com/**', route => route.fulfill({ contentType: 'text/html', body: '<meta charset="utf-8"><article data-testid="tweet"><a href="/person/status/123456789"><time>Today</time></a><div role="group"><button data-testid="reply">Reply</button><button data-testid="like">Like</button></div></article>' }));
    siteUsername = null; // X reactions must not require a dev-null session.
    mirrorFails = true;
    await worker.evaluate(() => {
      const create = chrome.tabs.create.bind(chrome.tabs);
      chrome.tabs.create = options => { if (options.url.startsWith('raycast:')) throw new Error('No Raycast handler'); return create(options); };
    });
    await page.goto('https://x.com/home');
    await page.getByRole('button', { name: 'React with an emoji', exact: true }).click();
    await page.getByRole('button', { name: 'Public', exact: true }).click();
    await page.getByRole('searchbox').fill('🚀'); await page.getByRole('button', { name: 'rocket', exact: true }).click();
    await expect(page.getByRole('button', { name: /🚀, 1 reaction, yours/ })).toBeVisible();
    await expect.poll(()=>submissions.length).toBe(3);
    expect(submissions[2].event.post).toEqual({ platform: 'x', id: '123456789' });
    expect(submissions[2].username).toBeUndefined();
    expect(submissions[2].repository).toBe('octocat/reacji-to-private');
    expect(submissions[2].mirrorPublic).toBe(true);
    await expect(page.getByText('Reaction saved, but Raycast could not be opened. Check the action in extension settings.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /🚀, 1 reaction, yours/ })).toBeVisible();
    await page.goto(url);
    await expect(page.locator('#mirror-status')).toContainText('private-repo copy failed');
    await page.locator('#mirror-public').uncheck();
    await expect(page.locator('#mirror-status')).toContainText('Mirroring is off');
    await page.reload();
    await expect(page.locator('#mirror-public')).not.toBeChecked();
    await page.goto('https://x.com/home');
    await page.getByRole('button', { name: /🚀, 1 reaction, yours/ }).click();
    await expect.poll(() => submissions.length).toBe(4);
    expect(submissions[3].mirrorPublic).toBe(false);
    expect(submissions[3].event.emoji).toBeNull();
    expect(await worker.evaluate(async () => (await chrome.storage.local.get('mirrorPublicPreferences')).mirrorPublicPreferences)).toEqual({ 42: false });
    await page.goto(url); await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(page.getByText('Not connected.', { exact: false })).toBeVisible();
  } finally { await context.close(); await rm(root, { recursive: true, force: true }); }
});
