import { canonicalUrl } from './web.js';
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const numeric = /^[1-9]\d{5,24}$/;
export function postRef(value) {
  if (typeof value === 'string') value = { platform: 'devnull', id: value };
  const { platform, id } = value || {};
  if (platform === 'web') {
    if (!/^[a-f\d]{64}$/.test(id || '')) throw new Error('Invalid page reference.');
    return { platform, id, url: canonicalUrl(value.url) };
  }
  if (typeof id !== 'string' || !(platform === 'devnull' ? UUID.test(id) : ['x', 'linkedin'].includes(platform) && numeric.test(id))) throw new Error('Invalid post reference.');
  return { platform, id: id.toLowerCase(), ...(platform === 'devnull' && /^[a-z\d_][a-z\d_-]{0,60}$/i.test(value.author || '') ? { author: value.author } : {}) };
}
export const postKey = value => { const p = postRef(value); return `${p.platform}:${p.id}`; };
// Retain the original dev-null paths so existing Git data remains readable.
export const postPath = value => { const p = postRef(value); return p.platform === 'devnull' ? `data/${p.id}.json` : `data/${p.platform}/${p.id}.json`; };
export const postUrl = value => { const p = postRef(value); return p.platform === 'web' ? p.url : p.platform === 'devnull' ? `https://dev-null.sh/${p.author ? `@${p.author}/commits/${p.id}` : ''}` : p.platform === 'x' ? `https://x.com/i/status/${p.id}` : `https://www.linkedin.com/feed/update/urn:li:activity:${p.id}/`; };
export function emptyPost(value) { const post = postRef(value); return { version: 1, commit: post.id, post, users: {} }; }
export function validDocument(doc, value) {
  try { return doc?.version === 1 && doc.commit === postRef(value).id && postKey(doc.post || doc.commit) === postKey(value) && (postRef(value).platform !== 'web' || (postUrl(doc.post) === postUrl(value) && (!doc.placements || (typeof doc.placements === 'object' && !Array.isArray(doc.placements))))) && doc.users && typeof doc.users === 'object' && !Array.isArray(doc.users); } catch { return false; }
}
