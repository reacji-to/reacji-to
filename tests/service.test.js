import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createService } from '../worker/service.js';
import { currentDevNullUser } from '../src/identity.js';
const commit = '01a14f9d-76a7-72d9-a92d-48ae9ea999cb';
const user = { id: 42, login: 'octocat' };
const repo = { id: 77, name: 'octocat/private', branch: 'main', visibility: 'private' };
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
function fixture(handler) {
  const calls = [];
  return { calls, service: createService({ GITHUB_APP_PRIVATE_KEY: privateKey, GITHUB_APP_ID: '123' }, async (url, init) => {
    const path = new URL(url).pathname, body = init.body && JSON.parse(init.body); calls.push({ path, body, init });
    if (path.endsWith('/installation')) return Response.json({ id: 55, app_id: 123 });
    if (path.endsWith('/access_tokens')) return Response.json({ token: 'installation-token' });
    return handler(path, init, body);
  }) };
}
test('fresh dev-null session is used; signed-out and non-Inertia responses fail closed', async () => {
  let options;
  const u = await currentDevNullUser(async (_, init) => { options = init; return Response.json({ props: { auth: { user: { id: 'internal-uuid', username: 'octocat' } } } }); });
  assert.deepEqual(u, { username: 'octocat' }); assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'same-origin');
  await assert.rejects(currentDevNullUser(async () => Response.json({ props: { auth: { user: null } } })), /Sign in/);
  await assert.rejects(currentDevNullUser(async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } })), /verify/);
});
test('identity comparison uses numeric GitHub IDs, rejecting a different account', async () => {
  const f = fixture(path => Response.json(path === '/user' ? user : { id: 99, login: 'other' }));
  await assert.rejects(f.service.identity('user-token', 'other'), /same account/);
  assert.equal(f.calls.length, 2);
});
test('private target must remain private and personally owned with write access', async () => {
  for (const bad of [{ private: false }, { owner: { id: 99, type: 'User' } }, { permissions: { push: false } }, { owner: { id: 42, type: 'Organization' } }]) {
    const f = fixture(() => Response.json({ id: 77, full_name: repo.name, private: true, owner: { id: 42, type: 'User' }, permissions: { push: true }, ...bad }));
    await assert.rejects(f.service.target('token', user, 'private', repo.name), /Private reactions require/);
  }
});
test('public target is pinned by numeric repository ID', async () => {
  const f = fixture(() => Response.json({ id: 123, private: false, full_name: 'attacker/repo' }));
  await assert.rejects(f.service.target('token', user, 'public', 'attacker/repo'), /configured repository/);
  assert.equal(f.calls[0].path, '/repos/reacji-to/reacji-to');
});
test('direct commit limits installation token to one repo and writes only the post file', async () => {
  const f = fixture((path, init) => init.method === 'PUT' ? Response.json({ commit: { sha: 'abc123' } }) : new Response('', { status: 404 }));
  const result = await f.service.write(repo, user, { version: 1, commit, emoji: '🚀', actor: { id: 99 } }, crypto.randomUUID());
  assert.equal(result.document.users[42].emoji, '🚀'); assert.equal(result.document.users[99], undefined);
  assert.deepEqual(f.calls.find(c => c.path.endsWith('access_tokens')).body, { repository_ids: [77], permissions: { contents: 'write' } });
  const put = f.calls.find(c => c.init.method === 'PUT');
  assert.equal(put.path, `/repos/octocat/private/contents/data/${commit}.json`);
  assert.equal(put.init.headers.Authorization, 'Bearer installation-token');
  assert.equal(f.calls.some(c => c.path.includes('/issues')), false);
});
test('SHA conflict rereads and preserves another account’s reaction', async () => {
  let reads = 0, writes = 0;
  const f = fixture((path, init) => {
    if (init.method === 'PUT') return ++writes === 1 ? new Response('', { status: 409 }) : Response.json({ commit: { sha: 'saved' } });
    const document = { version: 1, commit, users: ++reads === 1 ? {} : { 99: { login: 'friend', emoji: '🔥' } } };
    return Response.json({ encoding: 'base64', size: 100, sha: `sha-${reads}`, content: Buffer.from(JSON.stringify(document)).toString('base64') });
  });
  const result = await f.service.write(repo, user, { version: 1, commit, emoji: '❤️' }, crypto.randomUUID());
  assert.equal(result.document.users[99].emoji, '🔥'); assert.equal(writes, 2);
  assert.equal(f.calls.filter(c => c.init.method === 'PUT')[1].body.sha, 'sha-2');
});
test('retrying the same request does not create another commit; removal is a tombstone', async () => {
  const requestId = crypto.randomUUID(); let document = { version: 1, commit, users: { 42: { emoji: '🔥', requestId } } };
  const f = fixture((path, init, body) => {
    if (init.method === 'PUT') { document = JSON.parse(Buffer.from(body.content, 'base64')); return Response.json({ commit: { sha: 'saved' } }); }
    return Response.json({ encoding: 'base64', size: 100, sha: 'old', content: Buffer.from(JSON.stringify(document)).toString('base64') });
  });
  assert.equal((await f.service.write(repo, user, { version: 1, commit, emoji: '🔥' }, requestId)).changed, false);
  assert.equal(f.calls.filter(c => c.init.method === 'PUT').length, 0);
  await f.service.write(repo, user, { version: 1, commit, emoji: null }, crypto.randomUUID());
  assert.equal(document.users[42].emoji, null);
});
test('path traversal and invalid emoji fail before requesting app credentials', async () => {
  const f = fixture(() => { throw new Error('Should not fetch'); });
  await assert.rejects(f.service.write(repo, user, { version: 1, commit: '../../secret', emoji: '🔥' }, 'x'), /Invalid post/);
  await assert.rejects(f.service.write(repo, user, { version: 1, commit, emoji: 'text' }, 'x'), /Unicode/);
  assert.equal(f.calls.length, 0);
});
test('public post and profile publish atomically, and a head conflict merges both again', async () => {
  let attempt = 0;
  const f = fixture((path, init, body) => {
    if (path.includes('/git/ref/heads/')) { attempt++; return Response.json({ object: { sha: `head${attempt}` } }); }
    if (path.includes('/git/commits/head')) return Response.json({ tree: { sha: `base${attempt}` } });
    if (path.includes('/contents/data/')) return Response.json({ encoding: 'base64', content: Buffer.from(JSON.stringify({ version: 1, commit: '123456789', post: { platform: 'x', id: '123456789' }, users: attempt === 1 ? {} : { 99: { emoji: '🔥' } } })).toString('base64') });
    if (path.includes('/contents/profiles/')) return Response.json({ encoding: 'base64', content: Buffer.from(JSON.stringify({ version: 1, id: 42, reactions: attempt === 1 ? {} : { 'linkedin:987654321': { post: { platform: 'linkedin', id: '987654321' }, emoji: '❤️' } } })).toString('base64') });
    if (path.endsWith('/git/trees')) return Response.json({ sha: 'tree' });
    if (path.endsWith('/git/commits')) return Response.json({ sha: `commit${attempt}` });
    if (path.includes('/git/refs/heads/')) { assert.equal(body.force, false); return attempt === 1 ? new Response('', { status: 422 }) : Response.json({}); }
    throw new Error(path);
  });
  const result = await f.service.write({ ...repo, visibility: 'public' }, user, { version: 1, post: { platform: 'x', id: '123456789' }, emoji: '🚀' }, crypto.randomUUID());
  assert.equal(attempt, 2); assert.equal(result.document.users[99].emoji, '🔥');
  const tree = f.calls.filter(c => c.path.endsWith('/git/trees')).at(-1).body;
  assert.equal(tree.base_tree, 'base2'); assert.deepEqual(tree.tree.map(f => f.path), ['data/x/123456789.json','profiles/42.json']);
  assert.equal(JSON.parse(tree.tree[1].content).reactions['linkedin:987654321'].emoji, '❤️');
  assert.equal(JSON.parse(tree.tree[1].content).reactions['x:123456789'].url, 'https://x.com/i/status/123456789');
});
test('a renamed dev-null account cannot substitute a different immutable avatar ID', async () => {
  const f = fixture(() => Response.json(user));
  await assert.rejects(f.service.identity('token', 'octocat', 99), /same account/);
});
