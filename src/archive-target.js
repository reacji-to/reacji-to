import { postRef } from './posts.js';
import { canonicalUrl } from './web.js';

export function postholeOrigin(site) {
  return ['http:', 'https:'].includes(site.protocol) && !site.username && !site.password
    && (['localhost', '127.0.0.1', '[::1]'].includes(site.hostname)
      || (site.protocol === 'https:' && ['posthole.ink', 'www.posthole.ink'].includes(site.hostname)));
}

// Only the archive's trusted origin may address a saved post from another site.
// The original permalink must agree with the requested identity, not just the
// page's data-key. Web identities are additionally hashed by verifyPagePost.
export function archiveTarget(value, site, archive) {
  if (!postholeOrigin(site)) throw new Error('Saved-post reactions must come from Posthole.');
  const post = postRef(value);
  const url = new URL(canonicalUrl(archive?.url));
  const id = post.platform === 'x' && ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname)
    ? url.pathname.match(/^\/(?:[^/]+|i)\/status\/(\d+)\/?$/)?.[1]
    : post.platform === 'linkedin' && ['linkedin.com', 'www.linkedin.com'].includes(url.hostname)
      ? url.pathname.match(/(?:urn:li:activity:|activity-)(\d+)(?:[-/]|$)/)?.[1] : null;
  if (post.platform === 'web' ? post.url !== url.href : post.id !== id) throw new Error('Saved-post URL does not match its identity.');
  return post;
}
