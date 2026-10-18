import { REPOSITORY, DATA_URL, EVENT_TITLE } from './config.js';
import { parseReaction, COMMIT_ID } from './protocol.js';

// Tokens are never exposed through chrome.storage to content scripts.
const ready = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
]);
const cache = new Map();
const reads = new Map();
let mutation = Promise.resolve();
const api = async (path, token, init = {}) => {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('GitHub connection expired. Reconnect in extension settings.');
    if (response.status === 403 || response.status === 429) throw new Error('GitHub refused this request. Check token permissions or wait for the rate limit to reset.');
    throw new Error(`GitHub request failed (${response.status}). Try again.`);
  }
  return response.json();
};
async function settings() {
  await ready;
  return { ...await chrome.storage.local.get(['token', 'actor']), ...await chrome.storage.session.get(['token', 'actor']) };
}
async function readCommit(id) {
  if (!COMMIT_ID.test(id)) throw new Error('Invalid commit reference.');
  if (cache.get(id)?.until > Date.now()) return cache.get(id).value;
  if (reads.has(id)) return reads.get(id);
  const promise = (async () => {
    const response = await fetch(`${DATA_URL}/${id}.json?t=${Math.floor(Date.now() / 30000)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (response.status !== 404 && !response.ok) throw new Error('Reactions are unavailable. Try again shortly.');
    const value = response.status === 404 ? { version: 1, commit: id, users: {} } : await response.json();
    if (value.version !== 1 || value.commit !== id || !value.users || typeof value.users !== 'object') throw new Error('Reaction data could not be read.');
    cache.set(id, { value, until: Date.now() + 20000 });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return value;
  })().finally(() => reads.delete(id));
  reads.set(id, promise);
  return promise;
}
async function handle(message, sender) {
  await ready;
  const trusted = sender.url === chrome.runtime.getURL('options.html');
  const content = sender.tab && new URL(sender.url).origin === 'https://dev-null.sh';
  if (!trusted && !content) throw new Error('Unsupported sender.');
  if (message.type === 'status') {
    const { token, actor } = await settings();
    return { connected: Boolean(token), actor: actor || null, repository: REPOSITORY };
  }
  if (message.type === 'options') { await chrome.runtime.openOptionsPage(); return {}; }
  if (message.type === 'connect' && trusted) {
    const token = String(message.token || '').trim();
    if (!token || token.length > 300) throw new Error('Enter a GitHub token.');
    const user = await api('/user', token);
    const actor = { id: user.id, login: user.login };
    await chrome.storage.local.remove(['token', 'actor']);
    await chrome.storage.session.remove(['token', 'actor']);
    await (message.remember ? chrome.storage.local : chrome.storage.session).set({ token, actor });
    return { actor };
  }
  if (message.type === 'disconnect' && trusted) {
    await chrome.storage.local.remove(['token', 'actor']);
    await chrome.storage.session.remove(['token', 'actor']);
    return {};
  }
  if (message.type === 'read') return readCommit(String(message.commit));
  if (message.type === 'react') {
    const event = parseReaction(message.event);
    const { token } = await settings();
    if (!token) {
      const url = `https://github.com/${REPOSITORY}/issues/new?title=${encodeURIComponent(EVENT_TITLE)}&body=${encodeURIComponent(JSON.stringify(event))}`;
      await chrome.tabs.create({ url });
      return { mode: 'manual' };
    }
    const issue = await api(`/repos/${REPOSITORY}/issues`, token, {
      method: 'POST', body: JSON.stringify({ title: EVENT_TITLE, body: JSON.stringify(event) }),
      headers: { 'Content-Type': 'application/json' },
    });
    // Use GitHub's authenticated response, never a page-supplied identity.
    const actor = { id: issue.user.id, login: issue.user.login };
    cache.delete(event.commit);
    return { mode: 'queued', issue: issue.number, actor, url: issue.html_url };
  }
  throw new Error('Unsupported request.');
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const run = () => handle(message, sender);
  const pending = message.type === 'react' ? (mutation = mutation.catch(() => {}).then(run)) : run();
  pending.then(value => reply({ ok: true, value }), error => reply({ ok: false, error: error.message }));
  return true;
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
