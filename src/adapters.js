import { postRef } from './posts.js';
import { linkedInPostUrn } from './linkedin.js';
export const platformFor = host => host === 'dev-null.sh' ? 'devnull' : ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(host) ? 'x' : ['linkedin.com', 'www.linkedin.com'].includes(host) ? 'linkedin' : null;
function actionAnchor(bar, button) {
  if (!bar || !button || !bar.contains(button)) return null;
  let anchor = button;
  while (anchor.parentElement !== bar) anchor = anchor.parentElement;
  return anchor;
}
export function discoverPosts(doc = document, platform = platformFor(location.hostname), resolveLinkedIn = () => null) {
  const found = [];
  const add = (article, anchor, id) => {
    try { if (anchor) found.push({ article, anchor, post: postRef({ platform, id }), inline: true }); } catch { /* Unrecognized posts are left alone. */ }
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
      const timestamp = [...article.querySelectorAll('a[href*="/status/"]')].find(a => a.querySelector('time') && a.closest('article[data-testid="tweet"]') === article && !a.closest('[data-testid="quoteTweet"]') && !a.parentElement.closest('[role="link"]'));
      const id = timestamp?.getAttribute('href')?.match(/\/status\/(\d+)(?:[/?#]|$)/)?.[1];
      const bar = [...article.querySelectorAll('[role="group"]')].find(el => el.querySelector('[data-testid="reply"]'));
      const anchor = actionAnchor(bar, bar?.querySelector('[data-testid="like"], [data-testid="unlike"]'));
      add(article, anchor, id);
    }
  } else if (platform === 'linkedin') {
    for (const article of doc.querySelectorAll('[data-urn^="urn:li:activity:"], [data-id^="urn:li:activity:"]')) {
      const id = (article.getAttribute('data-urn') || article.getAttribute('data-id'))?.match(/^urn:li:activity:(\d+)$/)?.[1];
      const bar = article.querySelector('.social-details-social-actions, .feed-shared-social-action-bar');
      const anchor = actionAnchor(bar, bar?.querySelector('.react-button__trigger, button'));
      if (anchor && !found.some(x => x.anchor === anchor)) add(article, anchor, id);
    }
    for (const article of doc.querySelectorAll('[role="listitem"][componentkey^="update-card-focus"]')) {
      const owns = el => el.closest('[role="listitem"][componentkey^="update-card-focus"]') === article;
      const references = [...article.querySelectorAll('[componentkey*="-replaceableCommentTools"]')].filter(owns);
      const urns = [...new Set(references.map(el => linkedInPostUrn(el.getAttribute('componentkey'))).filter(Boolean))];
      if (urns.length !== 1) continue;
      const comment = [...article.querySelectorAll('button[aria-label="Comment"]')].find(owns);
      const bar = comment?.parentElement;
      const anchor = actionAnchor(bar, bar?.querySelector('button[aria-label^="Reaction button state:"]'));
      if (!anchor || found.some(x => x.anchor === anchor)) continue;
      const id = urns[0].startsWith('urn:li:activity:') ? urns[0].slice('urn:li:activity:'.length) : resolveLinkedIn(urns[0], article);
      add(article, anchor, id);
    }
  }
  return found;
}
