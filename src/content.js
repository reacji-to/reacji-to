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
  const el = element('devnull-reactions');
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
  const data = record.visibility === 'private' ? record.privateData : record.data;
  record.chips.replaceChildren();
  for (const group of summarize(data, actor?.id)) {
    const button = element('button', { type: 'button', class: 'chip', 'aria-pressed': String(group.mine),
      'aria-label': `${record.visibility === 'private' ? 'Private: ' : ''}${group.emoji}, ${group.count} reaction${group.count === 1 ? '' : 's'}${group.mine ? ', yours. Remove reaction' : '. React with this emoji'}`,
      title: `${group.people.slice(0, 12).map(name => `@${name}`).join(', ')}${group.people.length > 12 ? '…' : ''}` });
    button.append(document.createTextNode(`${record.visibility === 'private' ? '🔒 ' : ''}${group.emoji}`), element('span', {}, String(group.count)));
    button.addEventListener('click', event => { event.stopPropagation(); if (event.isTrusted) choose(record, group.mine ? null : group.emoji); });
    record.chips.append(button);
  }
  record.button.title = record.error || 'React with any emoji';
}
async function refresh(record) {
  if (record.loading) return;
  record.loading = true;
  try {
    if (record.visibility === 'private') {
      const identity = await siteIdentity();
      record.privateData = await send({ type: 'private-read', post: record.post, ...identity });
    } else record.data = await send({ type: 'read', post: record.post });
    record.error = null;
    display(record);
  } catch (error) { record.privateData = null; display(record); record.error = error.message; record.button.title = error.message; }
  finally { record.loading = false; }
}
async function choose(record, emoji) {
  if (record.busy) return;
  record.busy = true;
  record.button.disabled = true;
  if (active?.record === record) {
    active.status.textContent = 'Submitting reaction…';
    active.panel.querySelectorAll('button').forEach(button => { button.disabled = true; });
  }
  try {
    const identity = await siteIdentity();
    const result = await send({ type: 'react', event: { version: 1, commit: record.post.id, post: record.post, emoji }, visibility: record.visibility || 'public', ...identity });
    actor = result.actor;
    if (result.duplicate) { await refresh(record); closePicker(); notify('Reaction already saved.'); return; }
    for (const r of records.values()) if (r.id === record.id) {
      if (record.visibility === 'private') r.privateData = result.document;
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
  head.append(element('strong', {}, 'reacji.to'), close);
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
    const mine = (record.visibility === 'private' ? record.privateData : record.data)?.users?.[actor?.id]?.emoji;
    scopeNote.textContent = record.visibility === 'private'
      ? `Saved only in your private repo.${mine ? ` Your reaction: ${mine}.` : ''}${record.data?.users?.[actor?.id]?.emoji ? ' Your separate public reaction remains public.' : ''}`
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
        const mine = (record.visibility === 'private' ? record.privateData : record.data)?.users?.[actor?.id]?.emoji;
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
    if (active?.panel === panel) status.textContent = state.connected
      ? `Connected as @${actor.login}.${platform === 'devnull' ? ' Your dev-null account is checked before saving.' : ' Reactions use your GitHub identity.'}`
      : state.authError || 'Connect GitHub in settings before reacting.';
    updateScope();
    for (const r of records.values()) display(r);
  } catch (error) { if (active?.panel === panel) status.textContent = error.message; }
}
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const record = records.get(entry.target);
    if (record) { record.visible = entry.isIntersecting; if (record.visible) refresh(record); }
  }
}, { rootMargin: '100px' });
function scan() {
  const posts = discoverPosts();
  for (const [el, record] of records) {
    const current = posts.find(p => p.anchor === record.anchor && postKey(p.post) === record.id);
    if (!el.isConnected || !current) { observer.unobserve(el); records.delete(el); el.remove(); if (active?.record === record) closePicker(); }
  }
  for (const { article, anchor, post, inline } of posts) {
    if ([...records.values()].some(r => r.anchor === anchor)) continue;
    const { el, shadow } = host();
    if (!inline) { el.style.display = 'block'; el.style.padding = '4px 0 8px'; }
    const bar = element('span', { class: 'bar' });
    const button = element('button', { class: 'trigger', type: 'button', 'aria-label': 'React with an emoji', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M8.5 9h.01M15.5 9h.01"/></svg>';
    if (!inline) button.append(document.createTextNode('reacji.to'));
    const chips = element('span', { class: 'bar' });
    bar.append(button, chips); shadow.append(bar); anchor.after(el);
    const record = { id: postKey(post), post, article, anchor, el, button, chips, data: null, privateData: null, visibility: 'public', visible: false };
    records.set(el, record);
    bar.addEventListener('click', event => event.stopPropagation());
    button.addEventListener('click', event => { if (event.isTrusted) openPicker(record); });
    observer.observe(el);
  }
}
let scheduled = false;
new MutationObserver(() => {
  if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; scan(); }); }
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'data-urn', 'data-id', 'data-commit'] });
new MutationObserver(() => { theme(overlay.el); for (const record of records.values()) theme(record.el); }).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
addEventListener('resize', positionPicker);
addEventListener('scroll', positionPicker, { passive: true, capture: true });
setInterval(() => { if (!document.hidden) for (const record of records.values()) if (record.visible) refresh(record); }, 30000);
document.addEventListener('visibilitychange', () => { if (document.hidden) { for (const record of records.values()) { record.privateData = null; display(record); } } if (!document.hidden) for (const record of records.values()) if (record.visible) refresh(record); });
send({ type: 'status' }).then(state => { actor = state.actor; for (const record of records.values()) display(record); }).catch(() => {});
scan();
