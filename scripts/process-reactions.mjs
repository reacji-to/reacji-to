import { parseIssue, applyReaction } from '../src/protocol.js';
import { pathToFileURL } from 'node:url';

export async function processReactions({ repository, token, fetcher = fetch, log = console.log }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !token) throw new Error('GITHUB_REPOSITORY and GH_TOKEN are required.');
  const api = async (path, init = {}) => {
    const response = await fetcher(`https://api.github.com/repos/${repository}${path}`, {
      ...init, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) { const error = new Error(`GitHub ${init.method || 'GET'} failed (${response.status})`); error.status = response.status; throw error; }
    return response.status === 204 ? null : response.json();
  };
  // Snapshot all pages before closing issues, otherwise pagination skips events.
  const issues = [];
  for (let page = 1; ; page++) {
    const batch = await api(`/issues?state=open&sort=created&direction=asc&per_page=100&page=${page}`);
    issues.push(...batch);
    if (batch.length < 100) break;
  }
  let committed = 0;
  for (const issue of issues.sort((a, b) => a.number - b.number)) {
    let event;
    try { event = parseIssue(issue); }
    catch {
      // Invalid reaction submissions are closed without evaluating their contents.
      if (issue.title === '[reaction:v1]' && !issue.pull_request) await api(`/issues/${issue.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' }) });
      log(`Rejected invalid reaction issue #${issue.number}`); continue;
    }
    if (!event) continue;
    const path = `/contents/data/${event.commit}.json`;
    let recorded = false;
    // Contents API's SHA precondition prevents lost updates even if a second writer races us.
    for (let attempt = 0; attempt < 5; attempt++) {
      let current;
      try { current = await api(`${path}?ref=main`); }
      catch (error) { if (error.status !== 404) throw error; }
      const document = current ? JSON.parse(Buffer.from(current.content, 'base64').toString('utf8')) : null;
      const next = applyReaction(document, event);
      if (!next.changed) { recorded = true; break; }
      try {
        await api(path, { method: 'PUT', body: JSON.stringify({
          message: `reaction: ${event.emoji || 'remove'} on ${event.commit} by @${event.actor.login} (#${event.issue})`,
          content: Buffer.from(JSON.stringify(next.document, null, 2) + '\n').toString('base64'),
          ...(current ? { sha: current.sha } : {}), branch: 'main',
        }) });
        recorded = true; committed++; break;
      } catch (error) { if (![409, 422].includes(error.status) || attempt === 4) throw error; }
    }
    // Commit first, close second. A retry after a crash is idempotent.
    if (recorded) await api(`/issues/${issue.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
    log(`Recorded reaction issue #${issue.number}`);
  }
  return { committed };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await processReactions({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GH_TOKEN }));
}
