import test from 'node:test';
import assert from 'node:assert/strict';
import { processReactions } from '../scripts/process-reactions.mjs';
const commit = '01a14f9d-76a7-72d9-a92d-48ae9ea999cb';
const issue = (number, emoji = '🔥') => ({ number, title: '[reaction:v1]', body: JSON.stringify({ version: 1, commit, emoji }), user: { id: 42, login: 'octocat' }, created_at: '2026-10-18T20:00:00Z' });
function mock(initial, { conflict = false, failWrite = false, failClose = false } = {}) {
  const issues = structuredClone(initial); let document = null; let sha = null; let writes = 0; const calls = [];
  const fetcher = async (url, init) => {
    const path = new URL(url).pathname; const method = init.method || 'GET'; calls.push({ method, path });
    if (path.endsWith('/issues') && method === 'GET') {
      const page = Number(new URL(url).searchParams.get('page'));
      return Response.json(issues.filter(i => i.state !== 'closed').slice((page - 1) * 100, page * 100));
    }
    if (path.includes('/contents/')) {
      if (method === 'GET') return document ? Response.json({ content: Buffer.from(JSON.stringify(document)).toString('base64'), sha }) : new Response('', { status: 404 });
      if (failWrite) return new Response('', { status: 403 });
      if (conflict) { conflict = false; return new Response('', { status: 409 }); }
      const body = JSON.parse(init.body); assert.equal(body.sha || null, sha);
      document = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')); sha = `sha-${++writes}`;
      return Response.json({ commit: { sha } });
    }
    if (method === 'PATCH') {
      if (failClose) { failClose = false; return new Response('', { status: 500 }); }
      Object.assign(issues.find(i => i.number === Number(path.split('/').at(-1))), JSON.parse(init.body));
      return Response.json({});
    }
    throw new Error(`Unexpected ${method} ${path}`);
  };
  return { fetcher, issues, calls, get document() { return document; }, get writes() { return writes; } };
}
const run = state => processReactions({ repository: 'owner/repo', token: 'test-token', fetcher: state.fetcher, log: () => {} });
test('records each change as a separate commit, then closes intake issues', async () => {
  const state = mock([issue(1), issue(2, '❤️'), issue(3, null)]);
  assert.deepEqual(await run(state), { committed: 3 });
  assert.equal(state.document.users['42'].emoji, null);
  assert.equal(state.document.users['42'].issue, 3);
  assert.ok(state.issues.every(i => i.state === 'closed'));
});
test('loads all pages before mutating issues, so a burst does not lose events', async () => {
  const state = mock(Array.from({ length: 101 }, (_, i) => issue(i + 1)));
  assert.deepEqual(await run(state), { committed: 101 });
  assert.equal(state.document.users['42'].issue, 101);
});
test('retries SHA conflicts without overwriting concurrent data', async () => {
  const state = mock([issue(1)], { conflict: true });
  assert.deepEqual(await run(state), { committed: 1 });
  assert.equal(state.calls.filter(c => c.method === 'PUT').length, 2);
});
test('write failure leaves submission open for recovery', async () => {
  const state = mock([issue(1)], { failWrite: true });
  await assert.rejects(run(state), /403/);
  assert.notEqual(state.issues[0].state, 'closed');
});
test('crash after committing is recoverable without duplicate commits', async () => {
  const state = mock([issue(1)], { failClose: true });
  await assert.rejects(run(state), /500/);
  await run(state);
  assert.equal(state.writes, 1);
  assert.equal(state.issues[0].state, 'closed');
});
test('malformed reaction is rejected, unrelated issues remain open', async () => {
  const state = mock([{ ...issue(1), body: '{broken' }, { ...issue(2), title: 'A bug report' }]);
  await run(state);
  assert.equal(state.writes, 0);
  assert.equal(state.issues[0].state_reason, 'not_planned');
  assert.equal(state.issues[1].state, undefined);
});
