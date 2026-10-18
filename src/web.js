// Stable page identity; fragments that identify an SPA route remain significant.
export function canonicalUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Page URL is too long or invalid.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Reactions require an ordinary web page URL.');
  if (!/^#[!/]/.test(url.hash)) url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_.+|fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  return url.href;
}
export async function pagePost(value) {
  const url = canonicalUrl(value);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  return { platform: 'web', id: [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join(''), url };
}
export async function verifyPagePost(post) {
  if (post.platform === 'web' && (await pagePost(post.url)).id !== post.id) throw new Error('Page URL does not match its saved identity.');
}
export function placementRef(value) {
  if (!value || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value.id || '') || typeof value.selector !== 'string' || value.selector.length > 1800
    || !/^[a-z][a-z\d-]*:nth-of-type\([1-9]\d{0,4}\)(?: > [a-z][a-z\d-]*:nth-of-type\([1-9]\d{0,4}\)){0,39}$/.test(value.selector)
    || !/^[a-z][a-z\d-]{0,40}$/.test(value.tag || '') || typeof value.quote !== 'string' || value.quote.length > 160
    || ![value.x, value.y].every(n => Number.isInteger(n) && n >= 0 && n <= 1000)) throw new Error('Invalid page placement.');
  return { id: value.id.toLowerCase(), selector: value.selector, tag: value.tag, quote: value.quote, x: value.x, y: value.y };
}
export const placementUsers = (doc, placement) => placement ? doc?.placements?.[placement.id]?.users || {} : doc?.users || {};
