import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from '../src/auth.js';
function storage() {
  const data = {};
  return { data,
    async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in data).map(key => [key, structuredClone(data[key])])); },
    async set(value) { Object.assign(data, structuredClone(value)); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; },
  };
}
function fixture() {
  let time = 1000000;
  const local = storage(), session = storage(), requests = [], responses = [];
  const deps = { local, session, clientId: 'Iv1.test-client', now: () => time, randomId: () => 'flow-1',
    fetcher: async (url, options) => { requests.push({ url, ...options }); const data = responses.shift(); if (data instanceof Error) throw data; return Response.json(data); } };
  const auth = createAuth(deps);
  return { auth, deps, local, session, requests, responses, advance(ms) { time += ms; } };
}
const device = { device_code: 'private-device-code', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 };
const token = { access_token: 'ghu_fake', expires_in: 28800, refresh_token: 'ghr_fake', refresh_token_expires_in: 15897600 };
test('device flow exposes only user-facing fields and does not poll too soon', async () => {
  const f = fixture(); f.responses.push(device);
  const pending = await f.auth.start(true);
  assert.equal(pending.userCode, 'ABCD-EFGH'); assert.equal(pending.deviceCode, undefined);
  await f.auth.poll(pending.id); assert.equal(f.requests.length, 1);
  f.advance(5000); f.responses.push({ error: 'authorization_pending' });
  await f.auth.poll(pending.id); assert.equal(f.requests.length, 2);
  assert.equal(new URLSearchParams(f.requests[1].body).has('repository_id'), false); // Selected installations support public and the user’s private repo.
  assert.equal(new URLSearchParams(f.requests[0].body).get('scope'), 'offline_access');
});
test('slow_down increases the polling interval and survives a worker restart', async () => {
  const f = fixture(); f.responses.push(device); const pending = await f.auth.start(false);
  f.advance(5000); f.responses.push({ error: 'slow_down', interval: 10 }); await f.auth.poll(pending.id);
  const restarted = createAuth(f.deps);
  f.advance(5000); await restarted.poll(pending.id); assert.equal(f.requests.length, 2);
  f.advance(5000); f.responses.push(token, { id: 42, login: 'octocat' });
  assert.deepEqual(await restarted.poll(pending.id), { connected: true, actor: { id: 42, login: 'octocat' } });
  assert.equal(f.session.data.token, 'ghu_fake'); assert.equal(f.local.data.token, undefined);
});
test('successful OAuth persists only when requested; status never returns credentials', async () => {
  const f = fixture(); f.responses.push(device); const pending = await f.auth.start(true);
  f.advance(5000); f.responses.push(token, { id: 42, login: 'octocat' }); await f.auth.poll(pending.id);
  assert.equal(f.local.data.token, 'ghu_fake'); assert.equal(f.local.data.refreshToken, 'ghr_fake');
  assert.equal(f.session.data.oauthPending, undefined);
  const state = await f.auth.status(); assert.equal(state.connected, true);
  assert.equal(state.token, undefined); assert.equal(state.refreshToken, undefined);
});
test('refresh rotates tokens without a client secret and concurrent requests refresh once', async () => {
  const f = fixture(); await f.local.set({ token: 'old', actor: { id: 42, login: 'octocat' }, expiresAt: 1000001, refreshToken: 'old-refresh', refreshExpiresAt: 99999999 });
  f.responses.push(token);
  assert.deepEqual(await Promise.all([f.auth.accessToken(), f.auth.accessToken()]), ['ghu_fake', 'ghu_fake']);
  assert.equal(f.requests.length, 1);
  const form = new URLSearchParams(f.requests[0].body);
  assert.equal(form.get('client_secret'), null); assert.equal(form.get('grant_type'), 'refresh_token');
  assert.equal(f.local.data.refreshToken, 'ghr_fake');
});
test('cancellation clears the device code and stale polls cannot reconnect', async () => {
  const f = fixture(); f.responses.push(device); const pending = await f.auth.start(false);
  await f.auth.cancel(); await assert.rejects(f.auth.poll(pending.id), /ended or the code expired/);
  assert.equal(f.requests.length, 1); assert.equal(f.session.data.oauthPending, undefined);
});
test('denial and expiration clear pending state', async () => {
  const f = fixture(); f.responses.push(device); const pending = await f.auth.start(false);
  f.advance(5000); f.responses.push({ error: 'access_denied' });
  await assert.rejects(f.auth.poll(pending.id), /declined/); assert.equal(f.session.data.oauthPending, undefined);
  f.responses.push(device); await f.auth.start(false); f.advance(901000);
  await assert.rejects(f.auth.poll(pending.id), /expired/); assert.equal(f.session.data.oauthPending, undefined);
});
test('transient network failure preserves the flow and its poll deadline', async () => {
  const f = fixture(); f.responses.push(device); const pending = await f.auth.start(false);
  f.advance(5000); f.responses.push(new Error('offline'));
  await assert.rejects(f.auth.poll(pending.id), /offline/);
  await f.auth.poll(pending.id); assert.equal(f.requests.length, 2); assert.ok(f.session.data.oauthPending);
});
test('disconnect clears remembered, session, refresh, and pending credentials', async () => {
  const f = fixture(); await f.local.set({ token: 'old', refreshToken: 'old-refresh', actor: { id: 1 } });
  await f.session.set({ token: 'another', oauthPending: { deviceCode: 'secret' } });
  await f.auth.disconnect(); assert.deepEqual(f.local.data, {}); assert.deepEqual(f.session.data, {});
});
test('invalid refresh requests a new sign-in instead of silently posting anonymously', async () => {
  const f = fixture(); await f.local.set({ token: 'expired', expiresAt: 1, refreshToken: 'revoked', actor: { id: 42 } });
  f.responses.push({ error: 'bad_refresh_token' }); await assert.rejects(f.auth.accessToken(), /Connect GitHub again/);
});
test('a mismatched verification site is rejected', async () => {
  const f = fixture(); f.responses.push({ ...device, verification_uri: 'https://example.com/phishing' });
  await assert.rejects(f.auth.start(true), /invalid authorization/); assert.deepEqual(f.session.data, {});
});
