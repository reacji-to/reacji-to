import { DurableObject } from 'cloudflare:workers';
import { createService, HttpError } from './service.js';
import { postRef } from '../src/posts.js';
import { publicPage } from './pages.js';
import { parseReaction, COMMIT_ID } from '../src/protocol.js';

// One serial writer per repository. Receipts contain no tokens or reaction bodies.
export class RepositoryWriter extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.queue = Promise.resolve(); }
  write(repo, actor, event, requestId) {
    const run = this.queue.catch(() => {}).then(async () => {
      const key = `request:${actor.id}:${requestId}`;
      if (await this.ctx.storage.get(key)) return { changed: false, actor, duplicate: true };
      const rateKey = `rate:${actor.id}`;
      const rate = await this.ctx.storage.get(rateKey) || { start: 0, count: 0 };
      if (Date.now() - rate.start > 60000) { rate.start = Date.now(); rate.count = 0; }
      if (++rate.count > 30) throw new HttpError(429, 'Too many reactions. Try again in a minute.');
      await this.ctx.storage.put(rateKey, rate);
      const result = await createService(this.env).write(repo, actor, event, requestId);
      await this.ctx.storage.put(key, Date.now());
      if (!await this.ctx.storage.getAlarm()) await this.ctx.storage.setAlarm(Date.now() + 86400000);
      return result;
    });
    this.queue = run;
    return run.catch(error => ({ failure: { status: error instanceof HttpError ? error.status : 503, message: error instanceof HttpError ? error.message : 'Reaction service is unavailable. Please try again.' } }));
  }
  async alarm() {
    const receipts = await this.ctx.storage.list({ prefix: 'request:' });
    for (const [key, at] of receipts) if (at < Date.now() - 86400000) await this.ctx.storage.delete(key);
    const rates = await this.ctx.storage.list({ prefix: 'rate:' });
    for (const [key, rate] of rates) if (rate.start < Date.now() - 86400000) await this.ctx.storage.delete(key);
    if ((await this.ctx.storage.list({ limit: 1 })).size) await this.ctx.storage.setAlarm(Date.now() + 86400000);
  }
}
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
    const cors = allowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } : {};
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return json({ service: 'reacji', configured: Boolean(env.GITHUB_APP_PRIVATE_KEY) });
    if (request.method === 'GET') return publicPage(url, env);
    if (origin && !allowed) return json({ error: 'Unsupported origin.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST' || !['/v1/react', '/v1/private/read', '/v1/private/validate'].includes(url.pathname)) return json({ error: 'Not found.' }, 404, cors);
    try {
      const authorization = request.headers.get('Authorization');
      if (!/^Bearer [^\s]{1,300}$/.test(authorization || '')) throw new HttpError(401, 'Connect GitHub in extension settings.');
      if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw new HttpError(415, 'JSON required.');
      if (!request.body) throw new HttpError(400, 'JSON body required.');
      const reader = request.body.getReader(); let size = 0; const chunks = [];
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2048) { await reader.cancel(); throw new HttpError(413, 'Request too large.'); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body; try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, 'Invalid JSON.'); }
      const service = createService(env), token = authorization.slice(7);
      let post;
      if (url.pathname !== '/v1/private/validate') { try { post = postRef(body.event?.post || body.event?.commit || body.post || body.commit); } catch (error) { throw new HttpError(400, error.message); } }
      const actor = post?.platform === 'devnull' ? await service.identity(token, body.username, body.githubId) : await service.actor(token);
      const visibility = url.pathname === '/v1/react' ? body.visibility : 'private';
      const repo = await service.target(token, actor, visibility, body.repository);
      if (url.pathname === '/v1/private/validate') return json({ repository: repo, actor }, 200, cors);
      if (url.pathname === '/v1/private/read') return json((await service.read(repo, token, post)).document, 200, cors);
      let event; try { event = parseReaction(body.event); } catch (error) { throw new HttpError(400, error.message); }
      if (!COMMIT_ID.test(body.requestId || '')) throw new HttpError(400, 'Invalid request ID.');
      const result = await env.WRITERS.getByName(String(repo.id)).write(repo, actor, event, body.requestId);
      if (result.failure) throw new HttpError(result.failure.status, result.failure.message);
      return json(result, 200, cors);
    } catch (error) {
      // Never serialize upstream response bodies, credentials, or stack traces.
      const status = error.status >= 400 && error.status < 500 ? error.status : 503;
      return json({ error: error instanceof HttpError ? error.message : 'Reaction service is unavailable. Please try again.' }, status, cors);
    }
  },
};
