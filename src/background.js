import { REPOSITORY, DATA_URL, GITHUB_APP_CLIENT_ID, SERVICE_URL, APP_INSTALL_URL } from './config.js';
import { postRef, postKey, postPath, emptyPost, validDocument } from './posts.js';
import { platformFor } from './adapters.js';
import { createLinkedInResolver } from './linkedin.js';
import { parseReaction, COMMIT_ID } from './protocol.js';
import { createAuth } from './auth.js';
import { canonicalUrl, verifyPagePost } from './web.js';
import { loadFollowing, filterReactions } from './following.js';
import { createUpdateChecker } from './updates.js';
import { senderPage } from './sender.js';
import { normalizeUsage, recordEmojiUse } from './emoji-frequency.js';

// Tokens are never exposed through chrome.storage to content scripts.
const ready = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
]);
const updates = createUpdateChecker({ storage: chrome.storage.local, currentVersion: chrome.runtime.getManifest().version,
  onState: async state => {
    await chrome.action.setBadgeText({ text: state.available ? '↑' : '' });
    if (state.available) await chrome.action.setBadgeBackgroundColor({ color: '#2e5ccb' });
    await chrome.action.setTitle({ title: state.available ? `reacji.to · Update available (${state.latestVersion})` : 'reacji.to · settings' });
  },
});
const checkUpdates = async (force = false) => { await ready; return updates.check({ force }); };
const checkUpdatesQuietly = () => { void checkUpdates().catch(() => {}); };
const cache = new Map();
const reads = new Map();
const resolveLinkedInPost = createLinkedInResolver();
const auth = createAuth({ local: chrome.storage.local, session: chrome.storage.session, clientId: GITHUB_APP_CLIENT_ID });
let mutation = Promise.resolve();
let visibilityQueue = Promise.resolve();
const followingLoads = new Map();
async function audienceState(force = false) {
  const { audience = 'everyone', followingCache = {} } = await chrome.storage.local.get(['audience', 'followingCache']);
  const { actor } = await auth.status();
  if (audience !== 'following' && !force) return { audience, actor };
  if (!actor) return { audience, actor, followingError: 'Connect GitHub to show people you follow on dev-null.' };
  let following = followingCache[actor.id];
  if (force || !following || following.until < Date.now() || following.login !== actor.login) {
    try {
      if (!followingLoads.has(actor.id)) followingLoads.set(actor.id, loadFollowing(actor.login).then(async data => {
        const value = { ...data, login: actor.login, until: Date.now() + 300000 };
        // Only the active account's public following list is cached.
        await chrome.storage.local.set({ followingCache: { [actor.id]: value } }); return value;
      }).finally(() => followingLoads.delete(actor.id)));
      following = await followingLoads.get(actor.id);
    } catch (error) { return { audience, actor, followingError: error.message }; }
  }
  return { audience, actor, following };
}
async function visibleDocument(document) {
  const state = await audienceState();
  return filterReactions(document, state.actor, state.audience, state.following);
}
function senderPost(value, site, platform) {
  const post = postRef(value);
  if (post.platform === 'web' ? canonicalUrl(site.href) !== post.url : post.platform !== platform) throw new Error('Reaction target does not match this page.');
  return post;
}
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
async function requireToken() {
  const token = await auth.accessToken();
  if (!token) throw new Error('Connect GitHub in extension settings before reacting.');
  return token;
}
async function service(path, token, body) {
  const response = await fetch(`${SERVICE_URL}${path}`, { method: 'POST', credentials: 'omit', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Reaction service is unavailable. Try again.');
  return result;
}
async function readCommit(value) {
  const post = postRef(value), id = postKey(post);
  if (cache.get(id)?.until > Date.now()) return cache.get(id).value;
  if (reads.has(id)) return reads.get(id);
  const promise = (async () => {
    const response = await fetch(`${DATA_URL.replace(/\/data$/, '')}/${postPath(post)}?t=${Math.floor(Date.now() / 30000)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (response.status !== 404 && !response.ok) throw new Error('Reactions are unavailable. Try again shortly.');
    const value = response.status === 404 ? emptyPost(post) : await response.json();
    if (!validDocument(value, post)) throw new Error('Reaction data could not be read.');
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
  const site = senderPage(sender);
  const platform = site && platformFor(site.hostname);
  const content = Boolean(site && ['https:', 'http:'].includes(site.protocol));
  if (!trusted && !content) throw new Error('Unsupported sender.');
  if (message.type === 'linkedin-resolve' && platform === 'linkedin') return resolveLinkedInPost(message.urn);
  if (message.type === 'emoji-usage-get') {
    const { emojiUsage } = await chrome.storage.local.get('emojiUsage');
    return { usage: normalizeUsage(emojiUsage) };
  }
  if (message.type === 'visibility-get') {
    const { lastVisibility } = await chrome.storage.local.get('lastVisibility');
    return { visibility: lastVisibility === 'private' ? 'private' : 'public' };
  }
  if (message.type === 'visibility-save') {
    if (!['public', 'private'].includes(message.visibility)) throw new Error('Choose Public or Private.');
    await chrome.storage.local.set({ lastVisibility: message.visibility });
    return {};
  }
  if (message.type === 'updates-status' && trusted) return checkUpdates();
  if (message.type === 'updates-check' && trusted) return checkUpdates(true);
  if (message.type === 'status') {
    checkUpdatesQuietly();
    const state = await auth.status();
    if (!trusted) delete state.pending;
    const { privateRepositories = {} } = await chrome.storage.local.get('privateRepositories');
    const view = await audienceState();
    return { ...state, audience: view.audience, followingError: view.followingError, followingCount: view.following ? view.following.ids.length + view.following.logins.length : null, repository: REPOSITORY, privateRepository: privateRepositories[state.actor?.id] || null };
  }
  if (message.type === 'options') { await chrome.runtime.openOptionsPage(); return {}; }
  if (message.type === 'audience-save' && trusted) {
    if (!['everyone', 'following'].includes(message.audience)) throw new Error('Choose Everyone or Following on dev-null.');
    await chrome.storage.local.set({ audience: message.audience });
    const state = await audienceState();
    return { audience: state.audience, error: state.followingError };
  }
  if (message.type === 'following-refresh' && trusted) {
    const state = await audienceState(true);
    if (state.followingError) throw new Error(state.followingError);
    return { count: state.following.ids.length + state.following.logins.length };
  }
  if (message.type === 'oauth-start' && trusted) return auth.start(message.remember);
  if (message.type === 'oauth-poll' && trusted) return auth.poll(message.id);
  if (message.type === 'oauth-cancel' && trusted) { await auth.cancel(); return {}; }
  if (message.type === 'oauth-open' && trusted) { await chrome.tabs.create({ url: 'https://github.com/login/device' }); return {}; }
  if (message.type === 'disconnect' && trusted) {
    await auth.disconnect(); cache.clear(); return {};
  }
  if (message.type === 'private-create' && trusted) {
    await chrome.tabs.create({ url: 'https://github.com/new?name=reacji-to-private&description=Private+reactions+from+reacji.to&visibility=private' }); return {};
  }
  if (message.type === 'private-install' && trusted) {
    await chrome.tabs.create({ url: APP_INSTALL_URL }); return {};
  }
  if (message.type === 'private-list' && trusted) {
    const token = await requireToken(); const user = await api('/user', token);
    const repositories = new Map();
    for (let p = 1; ; p++) {
      const installations = (await api(`/user/installations?per_page=100&page=${p}`, token)).installations;
      for (const installation of installations) {
        for (let page = 1; ; page++) {
          const batch = (await api(`/user/installations/${installation.id}/repositories?per_page=100&page=${page}`, token)).repositories;
          for (const repo of batch) if (repo.private && repo.owner?.id === user.id && repo.permissions?.push) repositories.set(repo.id, { id: repo.id, name: repo.full_name });
          if (batch.length < 100) break;
        }
      }
      if (installations.length < 100) break;
    }
    return { repositories: [...repositories.values()] };
  }
  if (message.type === 'private-save' && trusted) {
    const token = await requireToken();
    const result = await service('/v1/private/validate', token, { repository: message.repository });
    const { privateRepositories = {} } = await chrome.storage.local.get('privateRepositories');
    privateRepositories[result.actor.id] = result.repository.name;
    await chrome.storage.local.set({ privateRepositories });
    return { repository: result.repository.name };
  }
  if (message.type === 'read') {
    const post = content ? senderPost(message.post || message.commit, site, platform) : postRef(message.post || message.commit);
    await verifyPagePost(post);
    return visibleDocument(await readCommit(post));
  }
  if (message.type === 'private-read' || message.type === 'react') {
    if (!content) throw new Error('Reactions must come from a supported post.');
    const post = senderPost(message.type === 'react' ? message.event?.post || message.event?.commit : message.post || message.commit, site, platform);
    await verifyPagePost(post);
    const token = await requireToken();
    const actor = await api('/user', token);
    if (platform === 'devnull') {
      if (!/^[a-z\d][a-z\d-]{0,38}$/i.test(message.username || '')) throw new Error('Sign in to dev-null before reacting.');
      const siteUser = await api(`/users/${encodeURIComponent(message.username)}`, token);
      if (actor.id !== siteUser.id || (message.githubId && actor.id !== message.githubId)) throw new Error(`GitHub is @${actor.login}, but dev-null is @${message.username}. Sign in with the same account.`);
    }
    const { privateRepositories = {} } = await chrome.storage.local.get('privateRepositories');
    const repository = privateRepositories[actor.id];
    if (message.type === 'private-read') return service('/v1/private/read', token, { username: message.username, githubId: message.githubId, repository, post });
    const event = parseReaction(message.event);
    if (!['public', 'private'].includes(message.visibility)) throw new Error('Choose Public or Private.');
    const result = await service('/v1/react', token, { event, visibility: message.visibility, username: message.username, githubId: message.githubId,
      ...(message.visibility === 'private' ? { repository } : {}), requestId: crypto.randomUUID() });
    if (event.emoji && !event.moveFrom && message.trackUsage !== false) {
      // A preference-storage failure must never roll back a committed reaction.
      try {
        const { emojiUsage } = await chrome.storage.local.get('emojiUsage');
        await chrome.storage.local.set({ emojiUsage: recordEmojiUse(emojiUsage, event.emoji) });
      } catch { /* Reactions remain usable when preference storage is unavailable. */ }
    }
    if (message.visibility === 'public') {
      cache.delete(postKey(post));
      if (result.document) cache.set(postKey(post), { value: result.document, until: Date.now() + 30000 });
    }
    return { ...result, ...(result.document && message.visibility === 'public' ? { document: await visibleDocument(result.document) } : {}), mode: 'committed' };
  }
  throw new Error('Unsupported request.');
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const run = () => handle(message, sender);
  const pending = ['visibility-get', 'visibility-save'].includes(message.type) ? (visibilityQueue = visibilityQueue.catch(() => {}).then(run))
    : message.type === 'react' ? (mutation = mutation.catch(() => {}).then(run)) : run();
  pending.then(value => reply({ ok: true, value }), error => reply({ ok: false, error: error.message }));
  return true;
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
// Remove the legacy menu on upgrade/startup. Never register a reaction context menu.
const removeLegacyMenu = () => { void chrome.contextMenus.removeAll().catch(() => {}); };
chrome.runtime.onInstalled.addListener(() => { removeLegacyMenu(); checkUpdatesQuietly(); });
chrome.runtime.onStartup.addListener(() => { removeLegacyMenu(); checkUpdatesQuietly(); });
