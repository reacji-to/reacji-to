import { pickerLogo } from './brand.js';
import { pagePost, canonicalUrl, placementRef, placementUsers } from './web.js';
import { capturePlacement, resolvePlacement } from './anchors.js';
import { discoverPosts, platformFor } from './adapters.js';
import { postKey } from './posts.js';
import css from './content.css';
import { currentDevNullUser } from './identity.js';
import emojis from './emoji.json' with { type: 'json' };
import { emojiValue, summarize, COMMIT_ID } from './protocol.js';

const sheet = new CSSStyleSheet();
sheet.replaceSync(css);
const records = new Map();
const platform = platformFor(location.hostname);
const siteIdentity = () => platform === 'devnull' ? currentDevNullUser() : Promise.resolve({});
let actor = null;
let active = null;
let pageIdentity = null, lastContext = null, pageLoading = false, pageGeneration = 0, pageHref = location.href;
let pagePublic = null, pagePrivate = null, privateGeneration = 0;
const usersFor = (record, privateMode = record.visibility === 'private') => placementUsers(privateMode ? record.privateData : record.data, record.placement);
const send = async message => {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || 'Extension updated. Reload this page and try again.');
  return result.value;
};
const element = (tag, attributes = {}, text) => {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
  if (text !== undefined) el.textContent = text;
  return el;
};
function host() {
  const el = element('reacji-to-reactions');
  const shadow = el.attachShadow({ mode: 'open' });
  shadow.adoptedStyleSheets = [sheet];
  theme(el);
  return { el, shadow };
}
function theme(el) {
  el.toggleAttribute('data-dark', document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark' || (platform !== 'devnull' && (() => { const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g); return c && c.length >= 3 && Number(c[0]) + Number(c[1]) + Number(c[2]) < 220; })()));
}
const overlay = host();
document.body.append(overlay.el);
const toast = element('div', { class: 'toast', popover: 'manual', role: 'status', 'aria-live': 'polite' });
overlay.shadow.append(toast);
let toastTimer;
function notify(message, url) {
  toast.replaceChildren(document.createTextNode(message));
  if (url) {
    const link = element('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, ' View commit');
    toast.append(link);
  }
  toast.showPopover();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.hidePopover(), 9000);
}
function display(record) {
  record.chips.replaceChildren();
  for (const group of summarize({ users: usersFor(record) }, actor?.id)) {
    const button = element('button', { type: 'button', class: 'chip', 'aria-pressed': String(group.mine),
      'aria-label': `${record.visibility === 'private' ? 'Private: ' : ''}${group.emoji}, ${group.count} reaction${group.count === 1 ? '' : 's'}${group.mine ? ', yours. Remove reaction' : '. React with this emoji'}`,
      title: `${group.people.slice(0, 12).map(name => `@${name}`).join(', ')}${group.people.length > 12 ? '…' : ''}` });
    button.append(document.createTextNode(`${record.visibility === 'private' ? '🔒 ' : ''}${group.emoji}`), element('span', {}, String(group.count)));
    button.addEventListener('click', event => { event.stopPropagation(); if (event.isTrusted) choose(record, group.mine ? null : group.emoji); });
    record.chips.append(button);
  }
  record.button.title = record.error || 'React with any emoji';
  if (record.placement) {
    const present = Object.values(usersFor(record,false)).some(u=>u.emoji) || Object.values(usersFor(record,true)).some(u=>u.emoji);
    record.el.hidden = !record.pending && !present && active?.record !== record;
  }
}
async function refresh(record) {
  if (record.loading) return;
  record.loading = true;
  const generation = privateGeneration;
  const visibility = record.visibility;
  try {
    if (visibility === 'private') {
      const identity = await siteIdentity();
      const data = await send({ type: 'private-read', post: record.post, ...identity });
      if (document.hidden || generation !== privateGeneration || record.visibility !== visibility) return;
      record.privateData = data;
      if (record.placement && pageIdentity?.id === record.post.id) pagePrivate = record.privateData;
    } else record.data = await send({ type: 'read', post: record.post });
    if (record.placement && record.visibility !== 'private' && pageIdentity?.id === record.post.id) pagePublic = record.data;
    record.error = null;
    display(record);
  } catch (error) { record.privateData = null; display(record); record.error = error.message; record.button.title = error.message; }
  finally { record.loading = false; }
}
async function choose(record, emoji) {
  if (record.busy) return;
  record.busy = true;
  const generation = privateGeneration;
  record.button.disabled = true;
  if (active?.record === record) {
    active.status.textContent = 'Submitting reaction…';
    active.panel.querySelectorAll('button').forEach(button => { button.disabled = true; });
  }
  try {
    const identity = await siteIdentity();
    const result = await send({ type: 'react', event: { version: 1, commit: record.post.id, post: record.post, ...(record.placement ? { placement: record.placement } : {}), emoji }, visibility: record.visibility || 'public', ...identity });
    actor = result.actor;
    if (result.duplicate) { await refresh(record); closePicker(); notify('Reaction already saved.'); return; }
    record.pending = false;
    const resultDocument = record.visibility === 'private' && (document.hidden || generation !== privateGeneration) ? null : result.document;
    if (record.placement && pageIdentity?.id === record.post.id) {
      if (record.visibility === 'private') pagePrivate = resultDocument;
      else pagePublic = result.document;
    }
    for (const r of records.values()) if (postKey(r.post) === postKey(record.post)) {
      if (record.visibility === 'private') r.privateData = resultDocument;
      else r.data = result.document;
      display(r);
    }
    notify(`${record.visibility === 'private' ? 'Private' : 'Public'} reaction saved.`, result.url);
    closePicker();
  } catch (error) {
    if (active?.record === record) active.status.textContent = error.message;
    else notify(error.message);
  } finally {
    record.busy = false;
    record.button.disabled = false;
    active?.panel.querySelectorAll('button').forEach(button => { button.disabled = false; });
  }
}
function closePicker() {
  if (!active) return;
  const { panel, record } = active;
  active = null;
  panel.remove();
  record.button.setAttribute('aria-expanded', 'false');
  if (record.placement) { record.pending = false; display(record); }
  if (record.button.isConnected) record.button.focus({ preventScroll: true });
}
function positionPicker() {
  if (!active) return;
  if (!active.record.el.isConnected) return closePicker();
  const box = active.record.button.getBoundingClientRect();
  const panel = active.panel;
  const width = panel.offsetWidth, height = panel.offsetHeight;
  panel.style.left = `${Math.max(12, Math.min(box.left, innerWidth - width - 12))}px`;
  const below = box.bottom + 6;
  panel.style.top = `${Math.max(12, Math.min(below + height <= innerHeight - 12 ? below : box.top - height - 6, innerHeight - height - 12))}px`;
}
async function openPicker(record) {
  if (active?.record === record) return closePicker();
  closePicker();
  const panel = element('section', { class: 'panel', popover: 'auto', role: 'dialog', 'aria-label': 'Choose a reaction' });
  const head = element('div', { class: 'head' });
  const close = element('button', { class: 'close', type: 'button', 'aria-label': 'Close reactions' }, '×');
  close.addEventListener('click', closePicker);
  head.append(element('strong', {}, 'reacji-to'), close);
  const controls = element('div', { class: 'controls' });
  const search = element('input', { class: 'search', type: 'search', placeholder: 'Search or paste any emoji', 'aria-label': 'Search or paste any emoji' });
  const category = element('select', { class: 'category', 'aria-label': 'Emoji category' });
  category.append(element('option', { value: '' }, 'All emoji · including skin tones'));
  for (const group of new Set(emojis.map(item => item.group))) category.append(element('option', { value: group }, group));
  controls.append(search, category);
  const grid = element('div', { class: 'grid', 'aria-label': 'Emoji choices' });
  const footer = element('div', { class: 'footer' });
  const status = element('p', { class: 'status', role: 'status', 'aria-live': 'polite' }, record.error || 'Loading connection…');
  const settings = element('button', { class: 'link', type: 'button' }, 'Connection settings');
  settings.addEventListener('click', event => { if (event.isTrusted) send({ type: 'options' }).catch(error => { status.textContent = error.message; }); });
  const remove = element('button', { class: 'link', type: 'button' }, 'Remove my reaction');
  remove.addEventListener('click', event => { if (event.isTrusted) choose(record, null); });
  footer.append(status, settings, document.createTextNode(' · '), remove);
  const visibility = element('div', { class: 'visibility', role: 'group', 'aria-label': 'Reaction visibility' });
  const publicButton = element('button', { type: 'button', 'aria-pressed': String(record.visibility !== 'private') }, 'Public');
  const privateButton = element('button', { type: 'button', 'aria-pressed': String(record.visibility === 'private') }, 'Private');
  const scopeNote = element('p', { class: 'scope-note' });
  const updateScope = () => {
    publicButton.setAttribute('aria-pressed', String(record.visibility !== 'private'));
    privateButton.setAttribute('aria-pressed', String(record.visibility === 'private'));
    const mine = usersFor(record)[actor?.id]?.emoji;
    scopeNote.textContent = record.visibility === 'private'
      ? `Saved only in your private repo.${mine ? ` Your reaction: ${mine}.` : ''}${usersFor(record,false)[actor?.id]?.emoji ? ' Your separate public reaction remains public.' : ''}`
      : `Visible on your public reacji.to profile.${mine ? ` Your reaction: ${mine}.` : ''}`;
  };
  const switchScope = async value => {
    if (record.busy) return;
    record.visibility = value; record.privateData = null; display(record); updateScope();
    status.textContent = 'Loading reactions…';
    await refresh(record);
    if (active?.record === record) { status.textContent = record.error || 'Choose an emoji.'; updateScope(); }
  };
  publicButton.addEventListener('click', event => { if (event.isTrusted) switchScope('public'); });
  privateButton.addEventListener('click', event => { if (event.isTrusted) switchScope('private'); });
  visibility.append(publicButton, privateButton);
  updateScope();
  panel.append(head, visibility, scopeNote, controls, grid, footer);
  if (record.placement) panel.insertBefore(element('p', { class: 'scope-note page-target' }, `${new URL(record.post.url).hostname} · ${record.placement.quote || record.placement.tag}`), controls);
  overlay.shadow.append(panel);
  active = { record, panel, status };
  record.button.setAttribute('aria-expanded', 'true');
  let limit = 96;
  const draw = () => {
    const query = search.value.trim().toLowerCase();
    const pasted = emojiValue(query);
    const results = emojis.filter(item => pasted ? item.emoji === pasted : (!category.value || item.group === category.value) && `${item.name} ${item.group}`.toLowerCase().includes(query));
    grid.replaceChildren();
    for (const item of results.slice(0, limit)) {
      const button = element('button', { class: 'emoji', type: 'button', 'aria-label': item.name, title: item.name }, item.emoji);
      button.addEventListener('click', event => {
        if (!event.isTrusted) return;
        const mine = usersFor(record)[actor?.id]?.emoji;
        choose(record, mine === item.emoji ? null : item.emoji);
      });
      grid.append(button);
    }
    if (!results.length) grid.append(element('div', { class: 'empty' }, 'No emoji found. Try “heart”, “flag”, or paste an emoji.'));
    if (results.length > limit) {
      const more = element('button', { class: 'more', type: 'button' }, `Show more · ${results.length - limit} remaining`);
      more.addEventListener('click', () => { const previous = limit; limit += 96; draw(); grid.querySelectorAll('.emoji')[previous]?.focus(); });
      grid.append(more);
    }
    positionPicker();
  };
  search.addEventListener('input', () => { limit = 96; grid.scrollTop = 0; draw(); });
  category.addEventListener('change', () => { limit = 96; grid.scrollTop = 0; draw(); });
  grid.addEventListener('keydown', event => {
    const buttons = [...grid.querySelectorAll('button')];
    const at = buttons.indexOf(event.target);
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 8, ArrowUp: -8 }[event.key];
    if (delta && at >= 0) { event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, at + delta))]?.focus(); }
  });
  panel.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); closePicker(); }
    if (event.key === 'Tab') {
      const controls = [...panel.querySelectorAll('button:not(:disabled),input,select')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && overlay.shadow.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && overlay.shadow.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  panel.addEventListener('toggle', event => { if (event.newState === 'closed' && active?.panel === panel) closePicker(); });
  panel.showPopover(); draw(); positionPicker(); search.focus();
  try {
    const state = await send({ type: 'status' });
    actor = state.actor;
    if (active?.panel === panel) status.textContent = state.followingError || (state.connected
      ? `Connected as @${actor.login}.${platform === 'devnull' ? ' Your dev-null account is checked before saving.' : ' Reactions use your GitHub identity.'}`
      : state.authError || 'Connect GitHub in settings before reacting.');
    updateScope();
    for (const r of records.values()) display(r);
  } catch (error) { if (active?.panel === panel) status.textContent = error.message; }
}
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const record = records.get(entry.target);
    if (record) { record.visible = entry.isIntersecting; if (record.visible && !record.placement) refresh(record); }
  }
}, { rootMargin: '100px' });
function scan() {
  const posts = discoverPosts();
  for (const [el, record] of records) {
    if (record.placement) continue;
    const current = posts.find(p => p.anchor === record.anchor && postKey(p.post) === record.id);
    if (!el.isConnected || !current) { observer.unobserve(el); records.delete(el); el.remove(); if (active?.record === record) closePicker(); }
  }
  for (const { article, anchor, post, inline } of posts) {
    if ([...records.values()].some(r => r.anchor === anchor)) continue;
    addRecord({ article, anchor, post, inline });
  }
  positionPins();
}
function addRecord({ article, anchor, post, inline, placement, pending = false }) {
    const { el, shadow } = host();
    if (!inline) { el.style.display = 'block'; el.style.padding = '4px 0 8px'; }
    const bar = element('span', { class: 'bar' });
    const button = element('button', { class: 'trigger', type: 'button', 'aria-label': 'React with an emoji', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
    button.append(element('img', { src: pickerLogo, width: 16, height: 16, alt: '', 'aria-hidden': 'true' }));
    if (!inline && !placement) button.append(document.createTextNode('reacji-to'));
    const chips = element('span', { class: 'bar' });
    bar.append(button, chips); shadow.append(bar);
    if (placement) { document.body.append(el); el.style.cssText = 'position:absolute;z-index:2147483000;'; bar.classList.add('pin'); }
    else anchor.after(el);
    const record = { id: postKey(post) + (placement ? `:${placement.id}` : ''), post, article, anchor, el, button, chips, placement, pending, data: null, privateData: null, visibility: 'public', visible: false };
    records.set(el, record);
    bar.addEventListener('click', event => event.stopPropagation());
    button.addEventListener('click', event => { if (event.isTrusted) openPicker(record); });
    observer.observe(el);
    return record;
}
function positionPins() {
  for (const record of records.values()) if (record.placement) {
    record.anchor = resolvePlacement(record.placement);
    if (!record.anchor) { record.el.hidden = true; continue; }
    const box = record.anchor.getBoundingClientRect();
    if (!box.width || !box.height) { record.el.hidden = true; continue; }
    display(record);
    const pin = record.el.getBoundingClientRect();
    const point = box.left + box.width * record.placement.x / 1000;
    const left = Math.max(8, Math.min(point - pin.width / 2, innerWidth - pin.width - 8));
    const above = box.bottom + pin.height + 16 > innerHeight && box.top - pin.height - 8 >= 8;
    record.el.toggleAttribute('data-above', above);
    record.el.style.setProperty('--anchor-x', `${Math.max(8, Math.min(point - left, pin.width - 8))}px`);
    record.el.style.left = `${scrollX + left}px`;
    record.el.style.top = `${scrollY + (above ? box.top - pin.height - 8 : box.bottom + 8)}px`;
  }
}
function reconcilePins() {
  if (!pageIdentity) return;
  const placements = { ...pagePrivate?.placements, ...pagePublic?.placements };
  for (const [id, item] of Object.entries(placements)) {
    let placement; try { placement = placementRef(item.anchor); } catch { continue; }
    if (placement.id !== id) continue;
    let record = [...records.values()].find(r=>r.placement?.id === id);
    if (!record) {
      const anchor = resolvePlacement(placement);
      if (!anchor || (!Object.values(item.users || {}).some(u=>u.emoji) && !Object.values(pagePrivate?.placements?.[id]?.users || {}).some(u=>u.emoji))) continue;
      record = addRecord({ article: anchor, anchor, post: pageIdentity, inline: true, placement });
    }
    record.data = pagePublic; record.privateData = pagePrivate;
    if (!Object.values(usersFor(record,false)).some(u=>u.emoji) && Object.values(usersFor(record,true)).some(u=>u.emoji)) record.visibility = 'private';
    display(record);
  }
  positionPins();
}
async function loadPage() {
  if (pageLoading || document.hidden) return;
  pageLoading = true;
  const generation = pageGeneration;
  try {
    const post = await pagePost(location.href);
    const state = await send({ type: 'status' });
    const data = await send({ type: 'read', post });
    let privateData = null;
    if (state.connected && state.privateRepository) {
      try { privateData = await send({ type: 'private-read', post, ...await siteIdentity() }); } catch { /* Public pins remain available when private access needs reconnecting. */ }
    }
    if (generation !== pageGeneration || document.hidden) return;
    pageIdentity = post; pagePublic = data; pagePrivate = privateData; reconcilePins();
  } catch { /* A new page without reaction data needs no interruption. */ }
  finally { pageLoading = false; if (generation !== pageGeneration) loadPage(); }
}
function pageChanged() {
  if (pageHref === location.href) return;
  pageHref = location.href; pageGeneration++; pageIdentity = null; pagePublic = null; pagePrivate = null; lastContext = null;
  for (const [el,record] of records) if (record.placement) { if (active?.record === record) closePicker(); observer.unobserve(el); el.remove(); records.delete(el); }
  loadPage();
}
document.addEventListener('contextmenu', event => {
  if (event.isTrusted && !event.composedPath().some(el=>el.localName === 'reacji-to-reactions')) lastContext = { target: event.target, x: event.clientX, y: event.clientY, href: location.href };
}, true);
chrome.runtime.onMessage?.addListener(message => {
  if (message.type !== 'place-reaction' || !lastContext || lastContext.href !== location.href) return;
  const context = lastContext; lastContext = null;
  (async () => {
    try {
      const placement = capturePlacement(context.target, context.x, context.y);
      const post = await pagePost(location.href);
      let record = [...records.values()].find(r=>r.placement && r.anchor === context.target && postKey(r.post) === postKey(post));
      if (!record) record = addRecord({ article: context.target, anchor: context.target, post, inline: true, placement, pending: true });
      record.pending = true; record.el.hidden = false; positionPins(); await refresh(record); await openPicker(record);
    } catch (error) { notify(error.message); }
  })();
});
let scheduled = false;
new MutationObserver(mutations => {
  if (mutations.every(mutation => mutation.target.closest?.('reacji-to-reactions'))) return;
  if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; pageChanged(); scan(); reconcilePins(); }); }
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'data-urn', 'data-id', 'data-commit', 'class', 'style'] });
new MutationObserver(() => { theme(overlay.el); for (const record of records.values()) theme(record.el); }).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
addEventListener('resize', () => { positionPins(); positionPicker(); });
addEventListener('scroll', () => { positionPins(); positionPicker(); }, { passive: true, capture: true });
setInterval(() => { pageChanged(); if (!document.hidden) { loadPage(); for (const record of records.values()) if (record.visible && !record.placement) refresh(record); } }, 30000);
addEventListener('popstate',pageChanged); addEventListener('hashchange',pageChanged);
document.addEventListener('visibilitychange', () => { if (document.hidden) { privateGeneration++; closePicker(); pagePrivate = null; for (const record of records.values()) { record.privateData = null; display(record); } } else { loadPage(); for (const record of records.values()) if (record.visible && !record.placement) refresh(record); } });
send({ type: 'status' }).then(state => { actor = state.actor; for (const record of records.values()) display(record); }).catch(() => {});
scan();
loadPage();
