import { createScreenshotCapture } from './screenshot.js';
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
import { archiveTarget } from './archive-target.js';
import { normalizeUsage, recordEmojiUse } from './emoji-frequency.js';
import { serviceOrigin } from './slack.js';
import { createRaycastActions } from './raycast.js';
import { destinations } from './destinations.js';
import { createDestinationDispatcher } from './destination-registry.js';
import { createLocalDestination } from './local-destination.js';
import { reactionPayload } from './reaction-payload.js';
import { validateEmojiAliases } from './emoji-aliases.js';

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
const raycast = createRaycastActions({ storage: chrome.storage.local, launch: url => chrome.tabs.create({ url }) });
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
let slackCache = null, emojiCache = null;
const emojiLoads = new Map();
async function slackState(token, actor, force = false) {
  if (!token || !actor) return { connected: false };
  if (!force && slackCache?.actor === actor.id && slackCache.until > Date.now()) return slackCache.value;
  const value = await service('/v1/slack/status', token, {});
  slackCache = { actor: actor.id, until: Date.now() + 30000, value };
  return value;
}
async function service(path, token, body) {
  const { serviceUrl = SERVICE_URL } = await chrome.storage.local.get('serviceUrl');
  const response = await fetch(`${serviceUrl}${path}`, { method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Reaction service is unavailable. Try again.');
  return result;
}
const pendingScreenshots = new Map();
const captureScreenshot = createScreenshotCapture({ tabs: chrome.tabs, windows: chrome.windows, permissions: chrome.permissions,
  backend: async () => (await chrome.storage.local.get('serviceUrl')).serviceUrl || SERVICE_URL,
  upload: async (origin, body) => {
    pendingScreenshots.set(body.reference.id, { origin, body, expires: Date.now() + 120000 });
    setTimeout(() => pendingScreenshots.delete(body.reference.id), 120000);
    return body.reference;
  },
});
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
const localReactions = createLocalDestination({ id: 'local', storage: chrome.storage.local,
  validate: async () => {}, execute: async () => {}, actor: async () => ({ id: 0, login: 'you' }),
});
async function rememberEmoji(event, trackUsage) {
  if (!event.emoji || event.operation === 'remove' || event.moveFrom || trackUsage === false) return;
  try {
    const { emojiUsage } = await chrome.storage.local.get('emojiUsage');
    await chrome.storage.local.set({ emojiUsage: recordEmojiUse(emojiUsage, event.emoji) });
  } catch { /* Local reactions remain usable when preference storage is unavailable. */ }
}
async function backUpLocalReaction(context) {
  const state = await auth.status();
  if (!state.actor) return null;
  const { privateRepositories = {} } = await chrome.storage.local.get('privateRepositories');
  if (!privateRepositories[state.actor.id]) return null;
  try {
    await remoteDestination('private', 'react', { ...context, backup: true,
      message: { ...context.message, visibility: 'private', trackUsage: false } });
    return { status: 'saved', destination: 'private' };
  } catch {
    return { status: 'failed', destination: 'private', error: 'Reaction saved locally, but its private repository backup failed. Open extension settings to repair the backup.' };
  }
}
const destinationAdapters = {
  local: { read: context => localReactions.read(context), react: async context => {
    const result = await localReactions.react(context);
    await rememberEmoji(context.event, context.message.trackUsage);
    const effects = [];
    const payload = context.message.payload ? { ...context.message.payload,
      reaction: { ...context.message.payload.reaction, destination: 'raycast' } } : context.message.payload;
    const raycastEffect = await raycast.afterReaction(context.event, context.message.trackUsage, payload);
    if (raycastEffect) effects.push({ ...raycastEffect, destination: 'raycast' });
    const backupEffect = await backUpLocalReaction(context);
    if (backupEffect) effects.push(backupEffect);
    return { ...result, effects };
  } },
  private: { read: context => remoteDestination('private', 'read', context), react: context => remoteDestination('private', 'react', context) },
  slack: { read: context => remoteDestination('slack', 'read', context), react: context => remoteDestination('slack', 'react', context) },
  raycast: { afterSave: ({ event, message }) => raycast.afterReaction(event, message.trackUsage, message.payload) },
};
const dispatchDestination = createDestinationDispatcher(destinations, destinationAdapters);
async function remoteDestination(id, operation, context) {
  const { message, post, platform } = context;
  const definition = destinations.get(id);
    const token = await requireToken();
    const actor = await api('/user', token);
    if (platform === 'devnull') {
      if (!/^[a-z\d][a-z\d-]{0,38}$/i.test(message.username || '')) throw new Error('Sign in to dev-null before reacting.');
      const siteUser = await api(`/users/${encodeURIComponent(message.username)}`, token);
      if (actor.id !== siteUser.id || (message.githubId && actor.id !== message.githubId)) throw new Error(`GitHub is @${actor.login}, but dev-null is @${message.username}. Sign in with the same account.`);
    }
    const { privateRepositories = {}, mirrorPublicPreferences = {} } = await chrome.storage.local.get(['privateRepositories', 'mirrorPublicPreferences']);
    const repository = privateRepositories[actor.id];
    if (operation === 'read' && definition.opaqueRead) {
      // Lookup needs an opaque target ID, never the URL or page context.
      const document = await service(definition.remoteRead, token, { post: { platform: post.platform, id: post.id } });
      return { ...document, post };
    }
    if (operation === 'read') return service(definition.remoteRead, token, { username: message.username, githubId: message.githubId, repository, post });
    const event = context.event;
    destinations.get(message.visibility);
    const result = await service('/v1/react', token, { event, visibility: message.visibility, username: message.username, githubId: message.githubId,
      payload: message.payload, context: { title: typeof message.context?.title === 'string' ? message.context.title.slice(0, 200) : '', quote: typeof message.context?.quote === 'string' ? message.context.quote.slice(0, 1500) : '' },
      ...(definition.kind === 'storage' ? { repository } : {}), ...(message.visibility === 'public' ? { mirrorPublic: mirrorPublicPreferences[actor.id] !== false } : {}), requestId: crypto.randomUUID() });
    if (result.mirror) {
      try {
        const { mirrorErrors = {} } = await chrome.storage.local.get('mirrorErrors');
        if (result.mirror.status === 'failed') mirrorErrors[actor.id] = result.mirror.error;
        else delete mirrorErrors[actor.id];
        await chrome.storage.local.set({ mirrorErrors });
      } catch { /* A saved reaction must survive preference-storage errors. */ }
    }
    if (event.emoji && event.operation !== 'remove' && !event.moveFrom && message.trackUsage !== false) {
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
    const document = result.document && message.visibility === 'public' ? await visibleDocument(result.document) : result.document;
    const effects = [];
    if (!context.backup && definition.kind === 'storage' && !result.destination) for (const provider of destinations.entries.filter(item => item.afterSave)) {
      const effect = await destinationAdapters[provider.id]?.afterSave?.(context);
      if (effect) effects.push({ ...effect, destination: provider.id });
    }
    return { ...result, ...(document ? { document } : {}), effects, mode: 'committed' };
}
async function handle(message, sender) {
  await ready;
  const trusted = sender.url === chrome.runtime.getURL('options.html');
  const site = senderPage(sender);
  const platform = site && platformFor(site.hostname);
  const content = Boolean(site && ['https:', 'http:'].includes(site.protocol));
  if (!trusted && !content) throw new Error('Unsupported sender.');
  if (message.type === 'screenshot-prepare' && content) {
    destinations.get(message.destination);
    const token = await requireToken(), owner = await api('/user', token);
    for (const [id, item] of pendingScreenshots) if (item.expires < Date.now()) pendingScreenshots.delete(id);
    if (pendingScreenshots.size >= 4) throw new Error('Finish the pending screenshot first.');
    const reference = await captureScreenshot(sender, site.href, message.destination);
    Object.assign(pendingScreenshots.get(reference.id), { tab: sender.tab.id, frame: sender.frameId, url: site.href, owner: owner.id });
    return { id: reference.id };
  }
  if (message.type.startsWith('attachments-') && trusted) {
    const action = message.type.slice('attachments-'.length);
    if (!['list', 'read', 'delete'].includes(action)) throw new Error('Unsupported attachment operation.');
    return service(`/v1/attachments/${action}`, await requireToken(), { id: message.id });
  }
  if (message.type === 'service-get' && trusted) {
    const { serviceUrl = SERVICE_URL } = await chrome.storage.local.get('serviceUrl');
    return { serviceUrl };
  }
  if (message.type === 'service-save' && trusted) {
    const serviceUrl = serviceOrigin(message.serviceUrl);
    await chrome.storage.local.set({ serviceUrl, lastVisibility: 'local' });
    slackCache = null; emojiCache = null; cache.clear(); return { serviceUrl };
  }
  if (['slack-status', 'slack-connect', 'slack-disconnect', 'slack-settings', 'slack-channels', 'slack-emojis'].includes(message.type)) {
    if (!trusted && message.type !== 'slack-emojis') throw new Error('Open extension settings to manage Slack.');
    const token = await requireToken();
    if (message.type === 'slack-status') return slackState(token, await api('/user', token), true);
    const action = message.type.slice(6);
    if (action === 'emojis') {
      const { actor } = await auth.status();
      const { serviceUrl = SERVICE_URL } = await chrome.storage.local.get('serviceUrl');
      const key = `${serviceUrl}:${actor?.id}`;
      if (!(trusted && message.refresh) && emojiCache?.key === key && emojiCache.until > Date.now()) return emojiCache.result;
      if (!emojiLoads.has(key)) emojiLoads.set(key, service('/v1/slack/emojis', token, {}).then(result => {
        emojiCache = { key, result, until: Date.now() + 300000 }; return result;
      }).finally(() => emojiLoads.delete(key)));
      return emojiLoads.get(key);
    }
    const result = await service(`/v1/slack/${action}`, token, action === 'settings' ? { settings: message.settings } : action === 'connect' ? { returnUrl: chrome.identity.getRedirectURL('slack') } : {});
    if (['connect', 'disconnect', 'settings'].includes(action)) { slackCache = null; emojiCache = null; }
    if (action === 'connect') {
      const url = new URL(result.url);
      if (url.origin !== 'https://slack.com' || url.pathname !== '/oauth/v2/authorize') throw new Error('Invalid Slack authorization URL.');
      const finished = await chrome.identity.launchWebAuthFlow({ url: url.href, interactive: true });
      if (!finished) throw new Error('Slack authorization was cancelled.');
      const redirect = new URL(finished);
      if (`${redirect.origin}${redirect.pathname}` !== chrome.identity.getRedirectURL('slack')) throw new Error('Invalid Slack authorization response.');
      await service('/v1/slack/complete', token, { completion: redirect.searchParams.get('completion') });
      slackCache = null;
      return { connected: true };
    }
    if (action === 'settings') await chrome.storage.local.set({ lastVisibility: 'local' });
    if (action === 'disconnect') await chrome.storage.local.set({ lastVisibility: 'local' });
    return result;
  }
  if (message.type === 'linkedin-resolve' && platform === 'linkedin') return resolveLinkedInPost(message.urn);
  if (message.type === 'emoji-usage-get') {
    const { emojiUsage } = await chrome.storage.local.get('emojiUsage');
    return { usage: normalizeUsage(emojiUsage) };
  }
  if (message.type === 'emoji-alias-list') {
    const { emojiAliases = [] } = await chrome.storage.local.get('emojiAliases');
    return { aliases: validateEmojiAliases(emojiAliases) };
  }
  if (message.type === 'emoji-alias-save' && trusted) {
    const aliases = validateEmojiAliases(message.aliases);
    await chrome.storage.local.set({ emojiAliases: aliases });
    return { aliases };
  }
  if (message.type === 'visibility-get') {
    const { lastVisibility } = await chrome.storage.local.get('lastVisibility');
    return { visibility: destinations.has(lastVisibility) && destinations.get(lastVisibility).selectable ? lastVisibility : 'local' };
  }
  if (message.type === 'visibility-save') {
    destinations.get(message.visibility);
    await chrome.storage.local.set({ lastVisibility: message.visibility });
    return {};
  }
  if (message.type === 'raycast-catalog') return { actions: await raycast.catalog() };
  if (message.type === 'raycast-list' && trusted) return { actions: await raycast.list() };
  if (message.type === 'raycast-save' && trusted) return { actions: await raycast.save(message.actions) };
  if (message.type === 'raycast-test' && trusted) return raycast.test(message.emoji);
  if (message.type === 'updates-status' && trusted) return checkUpdates();
  if (message.type === 'updates-check' && trusted) return checkUpdates(true);
  if (message.type === 'status') {
    checkUpdatesQuietly();
    const state = await auth.status();
    if (!trusted) delete state.pending;
    const { privateRepositories = {}, mirrorPublicPreferences = {}, mirrorErrors = {} } = await chrome.storage.local.get(['privateRepositories', 'mirrorPublicPreferences', 'mirrorErrors']);
    const view = await audienceState();
    let slack;
    try { slack = await slackState(await auth.accessToken(), state.actor); }
    catch (error) { slack = { connected: false, error: error.message }; }
    return { ...state, slack, audience: view.audience, followingError: view.followingError, followingCount: view.following ? view.following.ids.length + view.following.logins.length : null, repository: REPOSITORY, privateRepository: privateRepositories[state.actor?.id] || null,
      mirrorPublic: mirrorPublicPreferences[state.actor?.id] !== false, mirrorError: mirrorErrors[state.actor?.id] || null };
  }
  if (message.type === 'options') { await chrome.tabs.create({ url: 'https://reacji.to/about' }); return {}; }
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
    await auth.disconnect(); cache.clear(); slackCache = null; emojiCache = null; return {};
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
  if (message.type === 'mirror-public-save' && trusted) {
    if (typeof message.enabled !== 'boolean') throw new Error('Choose whether to mirror public reactions.');
    const actor = await api('/user', await requireToken());
    const { mirrorPublicPreferences = {} } = await chrome.storage.local.get('mirrorPublicPreferences');
    mirrorPublicPreferences[actor.id] = message.enabled;
    await chrome.storage.local.set({ mirrorPublicPreferences });
    return { enabled: message.enabled };
  }
  const readDestination = destinations.entries.find(item => destinations.readType(item.id) === message.type);
  if (readDestination || message.type === 'react') {
    const id = readDestination?.id || message.visibility;
    destinations.get(id);
    if (!content) throw new Error('Reactions must come from a supported page.');
    const rawPost = message.type === 'react' ? message.event?.post || message.event?.commit : message.post || message.commit;
    const post = content ? (message.archive ? archiveTarget(rawPost, site, message.archive) : senderPost(rawPost, site, platform)) : postRef(rawPost);
    await verifyPagePost(post);
    const event = message.type === 'react' ? parseReaction(message.event) : null;
    if (event) {
      const attachments = [];
      if (message.screenshotId) {
        const item = pendingScreenshots.get(message.screenshotId);
        if (!item || item.expires < Date.now() || item.tab !== sender.tab.id || item.frame !== sender.frameId || item.url !== site.href
          || item.body.reference.destination !== id || !event.emoji || event.operation === 'remove' || event.moveFrom) throw new Error('Screenshot expired or changed. Reopen the picker to capture it again.');
        const origin = (await chrome.storage.local.get('serviceUrl')).serviceUrl || SERVICE_URL;
        if (origin !== item.origin) throw new Error('The screenshot backend changed. Capture it again.');
        const token = await requireToken();
        if ((await api('/user', token)).id !== item.owner) throw new Error('Your account changed. Capture the screenshot again.');
        if (item.body.data) await service('/v1/attachments/create', token, item.body);
        attachments.push(item.body.reference);
        // Retain only the reference for a delivery retry; never capture again implicitly.
        delete item.body.data;
      }
      message = { ...message, payload: reactionPayload({ url: message.archive ? canonicalUrl(message.archive.url) : site.href, title: message.context?.title, quote: message.context?.quote, event, destination: id, attachments }) };
    }
    return dispatchDestination(id, event ? 'react' : 'read', { post, event, message, platform });
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
