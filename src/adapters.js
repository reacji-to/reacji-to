import { postRef } from './posts.js';
export const platformFor = host => host === 'dev-null.sh' ? 'devnull' : ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(host) ? 'x' : ['linkedin.com', 'www.linkedin.com'].includes(host) ? 'linkedin' : null;
export function discoverPosts(doc = document, platform = platformFor(location.hostname)) {
  const found = [];
  const add = (article, anchor, id) => {
    try { if (anchor) found.push({ article, anchor, post: postRef({ platform, id }), inline: platform === 'devnull' }); } catch { /* Unrecognized posts are left alone. */ }
  };
  if (platform === 'devnull') {
    for (const anchor of doc.querySelectorAll('[data-test="star-commit-button"], [data-test="star-count-readonly"]')) {
      const article = anchor.closest('[data-reply], [data-commit]');
      // Replies have their own permalink, but no data-commit. Never inherit the parent's ID.
      const permalink = [...article?.querySelectorAll('a[href*="/commits/"]') || []]
        .find(link => link.closest('[data-reply], [data-commit]') === article && (link.querySelector('time') || link.matches('[data-test="commit-permalink"]')));
      const identity = permalink?.getAttribute('href')?.match(/\/@([^/]+)\/commits\/([a-f\d-]+)(?:[/?#]|$)/i);
      const id = article?.hasAttribute('data-reply') ? identity?.[2] : article?.dataset.commit;
      // Insert outside ActionTooltip's wrapper so hovering our eyes does not show "Star".
      const tooltip = anchor.closest('[data-slot="tooltip-trigger"]');
      add(article, tooltip && article?.contains(tooltip) ? tooltip : anchor, id);
      const author = identity?.[1];
      if (found.at(-1)?.article === article && author) found.at(-1).post = postRef({ ...found.at(-1).post, author });
    }
  } else if (platform === 'x') {
    for (const article of doc.querySelectorAll('article[data-testid="tweet"]')) {
      // The post's timestamp is its permalink; quoted posts must not supply identity.
      const timestamp = [...article.querySelectorAll('a[href*="/status/"]')].find(a => a.querySelector('time') && !a.closest('[data-testid="quoteTweet"], [role="link"]'));
      const id = timestamp?.getAttribute('href')?.match(/\/status\/(\d+)(?:[/?#]|$)/)?.[1];
      const anchor = [...article.querySelectorAll('[role="group"]')].find(el => el.querySelector('[data-testid="reply"]'));
      add(article, anchor, id);
    }
  } else if (platform === 'linkedin') {
    for (const article of doc.querySelectorAll('[data-urn^="urn:li:activity:"], [data-id^="urn:li:activity:"]')) {
      const id = (article.getAttribute('data-urn') || article.getAttribute('data-id'))?.match(/^urn:li:activity:(\d+)$/)?.[1];
      const anchor = article.querySelector('.social-details-social-actions, .feed-shared-social-action-bar');
      if (anchor && !found.some(x => x.anchor === anchor)) add(article, anchor, id);
    }
  }
  return found;
}
