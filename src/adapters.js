import { postRef } from './posts.js';
export const platformFor = host => host === 'dev-null.sh' ? 'devnull' : ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(host) ? 'x' : ['linkedin.com', 'www.linkedin.com'].includes(host) ? 'linkedin' : null;
export function discoverPosts(doc = document, platform = platformFor(location.hostname)) {
  const found = [];
  const add = (article, anchor, id) => {
    try { if (anchor) found.push({ article, anchor, post: postRef({ platform, id }), inline: platform === 'devnull' }); } catch { /* Unrecognized posts are left alone. */ }
  };
  if (platform === 'devnull') {
    for (const anchor of doc.querySelectorAll('[data-test="star-commit-button"], [data-test="star-count-readonly"]')) {
      const article = anchor.closest('[data-commit]'); add(article, anchor, article?.dataset.commit);
      const author = article?.querySelector('a[href*="/commits/"]')?.getAttribute('href')?.match(/@([^/]+)\/commits\//)?.[1];
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
