import { createPrivateKey, sign } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { postRef, postKey, postPath, postUrl, emptyPost, validDocument } from '../src/posts.js';
import { parseReaction, COMMIT_ID } from '../src/protocol.js';
import { REPOSITORY, REPOSITORY_ID } from '../src/config.js';

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const loginPattern = /^[a-z\d](?:[a-z\d-]{0,38})$/i;
export const repoPattern = /^[a-z\d-]{1,39}\/[\w.-]{1,100}$/i;
export function createService(env, fetcher = fetch) {
  const api = async (path, token, init = {}) => {
    const response = await fetcher(`https://api.github.com${path}`, {
      ...init, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'reacji-to-worker',
        'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new HttpError(response.status, response.status === 401 ? 'Reconnect GitHub in extension settings.' : `GitHub request failed (${response.status}). Check the selected repository and app installation.`);
    return response.json();
  };
  const jwt = () => {
    if (!env.GITHUB_APP_PRIVATE_KEY) throw new HttpError(503, 'The reaction service is awaiting GitHub App credentials.');
    const now = Math.floor(Date.now() / 1000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const value = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 540, iss: env.GITHUB_APP_ID })}`;
    return `${value}.${sign('RSA-SHA256', Buffer.from(value), createPrivateKey(env.GITHUB_APP_PRIVATE_KEY)).toString('base64url')}`;
  };
  const actor = async token => {
    const user = await api('/user', token);
    if (!Number.isSafeInteger(user.id) || !loginPattern.test(user.login)) throw new HttpError(401, 'GitHub identity could not be verified.');
    return { id: user.id, login: user.login };
  };
  const identity = async (token, username, githubId) => {
    if (!loginPattern.test(username || '')) throw new HttpError(401, 'Sign in to dev-null before reacting.');
    const user = await actor(token);
    const siteUser = await api(`/users/${encodeURIComponent(username)}`, token);
    if (user.id !== siteUser.id || (githubId && user.id !== githubId)) throw new HttpError(403, `GitHub is @${user.login}, but dev-null is @${username}. Sign in with the same account.`);
    return user;
  };
  const target = async (token, user, visibility, selected) => {
    if (!['public', 'private'].includes(visibility)) throw new HttpError(400, 'Choose Public or Private.');
    const name = visibility === 'public' ? REPOSITORY : selected;
    if (!repoPattern.test(name || '')) throw new HttpError(400, 'Choose a private repository in extension settings.');
    const repo = await api(`/repos/${name}`, token);
    if (visibility === 'public' && (repo.id !== REPOSITORY_ID || repo.private)) throw new HttpError(403, 'The public repository does not match the configured repository.');
    if (visibility === 'private' && (!repo.private || repo.owner?.id !== user.id || repo.owner?.type !== 'User' || !repo.permissions?.push)) {
      throw new HttpError(403, 'Private reactions require a private repository owned by your GitHub account, with write access.');
    }
    if (!repoPattern.test(repo.full_name)) throw new HttpError(400, 'Invalid repository.');
    return { id: repo.id, name: repo.full_name, branch: repo.default_branch || 'main', visibility };
  };
  const installationToken = async repo => {
    const appJwt = jwt();
    const installation = await api(`/repos/${repo.name}/installation`, appJwt);
    if (String(installation.app_id) !== String(env.GITHUB_APP_ID) || installation.suspended_at) throw new HttpError(403, 'Install the reaction app on this repository.');
    const result = await api(`/app/installations/${installation.id}/access_tokens`, appJwt, { method: 'POST', body: JSON.stringify({ repository_ids: [repo.id], permissions: { contents: 'write' } }) });
    return result.token;
  };
  const read = async (repo, token, value) => {
    const post = postRef(value);
    let current;
    try { current = await api(`/repos/${repo.name}/contents/${postPath(post)}?ref=${encodeURIComponent(repo.branch)}`, token); }
    catch (error) { if (error.status !== 404) throw error; }
    if (!current) return { document: emptyPost(post) };
    if (current.encoding !== 'base64' || current.size > 900000) throw new HttpError(409, 'Reaction file is too large or has an unsupported format.');
    const document = JSON.parse(Buffer.from(current.content, 'base64').toString('utf8'));
    if (!validDocument(document, post)) throw new HttpError(409, 'Existing reaction file has an unsupported format.');
    return { document, sha: current.sha };
  };
  const write = async (repo, user, input, requestId) => {
    const event = parseReaction(input);
    const post = postRef(event.post || event.commit);
    const token = await installationToken(repo);
    if (repo.visibility === 'public') return writePublic(repo, user, event, post, requestId, token);
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await read(repo, token, post);
      const previous = current.document.users[user.id];
      if (previous?.requestId === requestId || (previous?.emoji ?? null) === event.emoji) return { document: current.document, changed: false, actor: user };
      const document = { ...structuredClone(current.document), post };
      document.users[user.id] = { login: user.login, emoji: event.emoji, requestId, at: new Date().toISOString() };
      try {
        const result = await api(`/repos/${repo.name}/contents/${postPath(post)}`, token, { method: 'PUT', body: JSON.stringify({
          message: `reaction: ${event.emoji || 'remove'} on ${event.commit} by @${user.login}`,
          content: Buffer.from(JSON.stringify(document, null, 2) + '\n').toString('base64'), branch: repo.branch, ...(current.sha ? { sha: current.sha } : {}),
        }) });
        return { document, actor: user, changed: true, sha: result.commit.sha, url: `https://github.com/${repo.name}/commit/${result.commit.sha}` };
      } catch (error) { if (![409, 422].includes(error.status) || attempt === 4) throw error; }
    }
  };
  const writePublic = async (repo, user, event, post, requestId, token) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      // Both documents are read at the same immutable head and published atomically.
      const head = await api(`/repos/${repo.name}/git/ref/heads/${encodeURIComponent(repo.branch)}`, token);
      const base = await api(`/repos/${repo.name}/git/commits/${head.object.sha}`, token);
      const current = await read({ ...repo, branch: head.object.sha }, token, post);
      const previous = current.document.users[user.id];
      if (previous?.requestId === requestId || (previous?.emoji ?? null) === event.emoji) return { document: current.document, changed: false, actor: user };
      let profile = { version: 1, id: user.id, login: user.login, reactions: {} };
      try {
        const file = await api(`/repos/${repo.name}/contents/profiles/${user.id}.json?ref=${head.object.sha}`, token);
        if (file.encoding !== 'base64' || file.size > 5000000) throw new HttpError(409, 'Public profile is too large or invalid.');
        profile = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
        if (profile.version !== 1 || profile.id !== user.id || !profile.reactions || typeof profile.reactions !== 'object' || Array.isArray(profile.reactions)) throw new HttpError(409, 'Invalid public profile.');
      } catch (error) { if (error.status !== 404) throw error; }
      const at = new Date().toISOString();
      const document = { ...structuredClone(current.document), post };
      document.users[user.id] = { login: user.login, emoji: event.emoji, requestId, at };
      profile.login = user.login;
      if (event.emoji) profile.reactions[postKey(post)] = { post, emoji: event.emoji, at, url: postUrl(post) };
      else delete profile.reactions[postKey(post)];
      const tree = await api(`/repos/${repo.name}/git/trees`, token, { method: 'POST', body: JSON.stringify({ base_tree: base.tree.sha, tree: [
        { path: postPath(post), mode: '100644', type: 'blob', content: JSON.stringify(document, null, 2) + '\n' },
        { path: `profiles/${user.id}.json`, mode: '100644', type: 'blob', content: JSON.stringify(profile, null, 2) + '\n' },
      ] }) });
      const commit = await api(`/repos/${repo.name}/git/commits`, token, { method: 'POST', body: JSON.stringify({ message: `reaction: ${event.emoji || 'remove'} on ${postKey(post)} by @${user.login}`, tree: tree.sha, parents: [head.object.sha] }) });
      try {
        await api(`/repos/${repo.name}/git/refs/heads/${encodeURIComponent(repo.branch)}`, token, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
        return { document, actor: user, changed: true, sha: commit.sha, url: `https://github.com/${repo.name}/commit/${commit.sha}` };
      } catch (error) { if (![409, 422].includes(error.status) || attempt === 4) throw error; }
    }
  };
  return { actor, identity, target, read, write };
}
