import { postholeOrigin, archiveTarget } from './archive-target.js';
import { postRef } from './posts.js';
import { pagePost, canonicalUrl } from './web.js';

const themed = new Set(['ipod', 'ipod-color', 'tinder', 'netflix', 'terminal']);
const own = (article, selector) => [...article.querySelectorAll(selector)].find(node => node.closest('article') === article);

// Posthole is a renderer of saved posts, never a new reaction destination. Native
// IDs and original URLs deliberately share the identities used on the source site.
export function createPostholeAdapter({ changed, locked }) {
  const webPosts = new Map();
  let bar, anchor, select, label, current, focusedKey, optionsSignature, activeView;
  function original(article) {
    return own(article, '.original-link, .story-meta a, footer.actions a, .hn-age a')?.href
      || [...article.querySelectorAll('a[href]')].find(link => link.querySelector('time') && link.closest('article') === article)?.href;
  }
  function identity(entry, article) {
    const [platform, id] = entry.dataset.key.split(':');
    try {
      if (['x', 'linkedin'].includes(platform)) return archiveTarget(postRef({ platform, id }), new URL(document.location.href), { url: original(article) });
      const url = canonicalUrl(original(article));
      if (!webPosts.has(url)) {
        webPosts.set(url, null);
        void pagePost(url).then(post => { webPosts.set(url, post); changed(); });
      }
      return webPosts.get(url);
    } catch { return null; }
  }
  function makeBar(doc) {
    bar = doc.createElement('reacji-posthole-bar');
    const shadow = bar.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host{display:block;position:sticky;top:0;z-index:30;background:var(--bg,#fff);color:var(--ink,#191919);border-bottom:1px solid var(--line,#ddd);font:13px/1.4 system-ui,sans-serif;color-scheme:inherit}
      :host([hidden]){display:none}
      .row{display:flex;align-items:center;gap:12px;max-width:1120px;margin:auto;padding:6px 20px;min-height:44px;box-sizing:border-box}
      a{color:inherit;text-decoration:none;font-weight:600;flex:none}a:hover{text-decoration:underline}
      select,.label{flex:1;min-width:0;font:inherit;color:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      select{background:var(--bg,#fff);border:1px solid var(--line,#ddd);border-radius:6px;min-height:32px;padding:4px 28px 4px 8px;max-width:100%}
      .reactions{display:flex;align-items:center;flex:none;max-width:45%;overflow-x:auto}
      a:focus-visible,select:focus-visible{outline:2px solid #487de8;outline-offset:2px}
      [hidden]{display:none!important}
      @media(max-width:480px){.row{padding:6px 12px;gap:8px}a{font-size:12px}.reactions{max-width:40%}}
    </style><div class="row" role="region" aria-label="Post reactions"><a href="https://reacji.to/" target="_blank" rel="noopener noreferrer">reacji.to</a><span class="label"></span><select aria-label="Reactions for post"></select><span class="reactions"><span class="anchor"></span></span></div>`;
    anchor = shadow.querySelector('.anchor');
    select = shadow.querySelector('select');
    label = shadow.querySelector('.label');
    select.addEventListener('change', () => { focusedKey = select.value; changed(); });
    // Postpod binds keys at window level. Editing a reaction must not navigate it.
    bar.addEventListener('keydown', event => event.stopPropagation());
  }
  const focusPost = event => {
    if (!bar?.isConnected || locked()) return;
    const target = event.target.closest?.('[data-open-post],.post-entry[data-key]');
    if (target) { focusedKey = target.dataset.openPost || target.dataset.key; changed(); }
  };
  document.addEventListener('focusin', focusPost);
  document.addEventListener('pointerdown', focusPost);
  return {
    discover(doc) {
      const toolbar = doc.querySelector('.interface-toolbar');
      const feed = doc.querySelector('.viewer-layout .feed');
      const view = doc.body.dataset.view;
      if (!postholeOrigin(new URL(doc.location.href)) || !toolbar?.querySelector('#interface-select') || !feed || !view) { bar?.remove(); current = null; return null; }
      if (activeView !== view) { focusedKey = null; current = null; activeView = view; }
      const entries = [...feed.querySelectorAll('.post-entry[data-key]')];
      const dialog = doc.querySelector('.nf-dialog[open]');
      const dialogArticle = dialog?.querySelector('.nf-dialog-content > article');
      const items = entries.flatMap(entry => {
        const article = entry.querySelector(':scope > article') || (dialogArticle?.dataset.readKey === entry.dataset.key ? dialogArticle : null);
        if (!article) return [];
        const post = identity(entry, article);
        return post ? [{ entry, article, post, archive: { url: original(article) }, key: entry.dataset.key,
          title: [entry.dataset.creator, entry.dataset.title || own(article, '.text')?.textContent || article.getAttribute('aria-label')].filter(Boolean).join(' · ').replace(/\s+/g, ' ').slice(0, 180) }] : [];
      });
      if (!themed.has(view)) {
        bar?.remove(); current = null;
        return items.flatMap(item => {
          const actions = own(item.article, 'footer.actions');
          if (actions) {
            const anchor = actions.querySelector('.heart,.li-like') || actions.lastElementChild;
            return anchor ? [{ ...item, anchor, inline: true }] : [];
          }
          const bottom = own(item.article, '.interface-bottom') || item.entry.querySelector(':scope > .archive-tools');
          if (!bottom) return [];
          let anchor = bottom.querySelector(':scope > reacji-posthole-anchor');
          if (!anchor) { anchor = doc.createElement('reacji-posthole-anchor'); bottom.prepend(anchor); }
          return [{ ...item, anchor, inline: true, customLayout: true }];
        });
      }
      if (!items.length) { bar?.remove(); current = null; return []; }
      if (!bar) makeBar(doc);
      let next;
      if (view === 'ipod' || view === 'ipod-color' || view === 'tinder') {
        const menu = doc.querySelector('.ipod-list:not([hidden])');
        const index = menu?.querySelector('[data-post-index][aria-current="true"]')?.dataset.postIndex;
        const topEntries = [...feed.children].filter(node => node.matches('.post-entry'));
        const entry = index !== undefined ? topEntries[Number(index)] : topEntries.find(node => node.classList.contains('is-active'));
        next = items.find(item => item.entry === entry);
        if (!next) { bar.remove(); current = null; return []; }
      } else if (dialogArticle) {
        next = items.find(item => item.article === dialogArticle);
        if (!next) { bar.remove(); current = null; return []; }
      }
      else {
        next = items.find(item => item.key === focusedKey);
        if (!next && view === 'terminal') next = items.find(item => { const rect = item.article.getBoundingClientRect(); return rect.bottom > bar.getBoundingClientRect().bottom && rect.top < innerHeight; });
        if (!next && view === 'netflix') next = items.find(item => item.key === doc.querySelector('.nf-hero [data-open-post]')?.dataset.openPost);
      }
      next ||= items[0];
      // Keep a picker tied to its original post even if a deck auto-advances.
      if (!locked() || !items.some(item => item.key === current?.key)) current = next;
      // A modal makes the rest of the page inert; move the same bar into its top
      // layer, outside the post, and restore it when the modal closes.
      if (dialog) { if (bar.parentElement !== dialog) dialog.prepend(bar); }
      else if (bar.previousElementSibling !== toolbar) toolbar.after(bar);
      const choices = ['netflix', 'terminal'].includes(view) && !dialog;
      select.hidden = !choices; label.hidden = choices;
      const signature = JSON.stringify(items.map(item => [item.key, item.title]));
      if (signature !== optionsSignature) {
        select.replaceChildren(...items.map(item => { const option = doc.createElement('option'); option.value = item.key; option.textContent = item.title; return option; }));
        optionsSignature = signature;
      }
      select.value = current.key;
      if (label.textContent !== current.title) label.textContent = current.title;
      label.title = current.title;
      return [{ ...current, anchor, inline: true, customLayout: true }];
    },
    scrolled(event) {
      if (activeView === 'terminal' && !bar?.contains(event.target)) { focusedKey = null; changed(); }
    },
  };
}
