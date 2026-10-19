import { pickerLogo } from './brand.js';
import { installQuickReaction } from './quick-reaction.js';
import { pagePost, canonicalUrl, placementRef, placementUsers } from './web.js';
import { capturePlacement, resolvePlacement } from './anchors.js';
import { layoutActions, clearActions } from './action-layout.js';
import { discoverPosts, platformFor } from './adapters.js';
import { postKey } from './posts.js';
import css from './content.css';
import { currentDevNullUser } from './identity.js';
import emojis from './emoji.json' with { type: 'json' };
import { emojiValue, summarize, COMMIT_ID } from './protocol.js';
import { frequentEmojis } from './emoji-frequency.js';

// One stroke-icon vocabulary for the compact category strip.
const emojiCategories = [
  ['Frequently used', 'M12 8v4l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
  ['Smileys & Emotion', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M8 14s1 3 4 3 4-3 4-3 M8 9h.01 M16 9h.01'],
  ['People & Body', 'M8 21v-4H6v-5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v5h-2v4 M15 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  ['Animals & Nature', 'M20 4C8 3 3 8 5 15c2 6 13 6 15-11Z M4 21 15 10'],
  ['Food & Drink', 'M4 3v5a3 3 0 0 0 6 0V3 M7 3v18 M17 21V3c-4 3-4 9 0 9h2V3'],
  ['Travel & Places', 'm3 17 3-8h12l3 8v3h-3v-3H6v3H3v-3Z M5 13h14 M7 16h.01 M17 16h.01'],
  ['Activities', 'M8 3h8v6a4 4 0 0 1-8 0V3Z M8 5H4v3a4 4 0 0 0 4 4 M16 5h4v3a4 4 0 0 1-4 4 M12 13v7 M8 21h8'],
  ['Objects', 'M9 18h6 M9 21h6 M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2'],
  ['Symbols', 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9L7.5 14 3 9.6l6.2-.9L12 3Z'],
  ['Flags', 'M5 21V3 M5 4c5-4 9 4 14 0v10c-5 4-9-4-14 0'],
];

export function initializeReactions({ runtime, discover = discoverPosts, beforePlace = () => {} } = {}) {
if (globalThis.__reacjiToContentReady) return;
const sheet = new CSSStyleSheet();
sheet.replaceSync(css);
const records = new Map();
const platform = platformFor(location.hostname);
const linkedInIds = new Map();
let linkedInLoads = 0;
function resolveLinkedIn(urn, article) {
  const cached = linkedInIds.get(urn);
  if (cached?.id) return cached.id;
  const bounds = article.getBoundingClientRect();
  if (document.hidden || bounds.bottom < -100 || bounds.top > innerHeight + 100 || cached?.until > Date.now() || linkedInLoads >= 3) return null;
  const entry = { until: Date.now() + 60000 };
  linkedInIds.set(urn, entry);
  if (linkedInIds.size > 500) linkedInIds.delete(linkedInIds.keys().next().value);
  linkedInLoads++;
  void send({ type: 'linkedin-resolve', urn }).then(value => {
    entry.id = value.id;
  }).catch(() => { /* Unidentified posts stay untouched; retry after a minute. */ })
    .finally(() => { linkedInLoads--; scheduleScan(); });
  return null;
}
const siteIdentity = () => platform === 'devnull' ? currentDevNullUser() : Promise.resolve({});
let actor = null;
let active = null;
let pickerGeneration = 0, lastVisibility = 'public';
let pageIdentity = null, pageLoading = false, pageGeneration = 0, pageHref = location.href;
let pagePublic = null, pagePrivate = null, privateGeneration = 0;
const optimistic = new Map();
const movingRecords = new Set();
let saveQueue = Promise.resolve(), dataRevision = 0;
const mutationKey = (record, visibility) => `${record.mutationId || record.id}:${visibility}`;
const usersFor = (record, privateMode = record.visibility === 'private') => {
  const users = { ...placementUsers(privateMode ? record.privateData : record.data, record.placement) };
  for (const moving of movingRecords) {
    const move = moving.moves?.[privateMode ? 'private' : 'public'];
    if (moving !== record && move?.hiddenIds.has(record.placement?.id)) delete users[actor?.id];
  }
  const pending = optimistic.get(mutationKey(record, privateMode ? 'private' : 'public'));
  if (!pending || (privateMode && (document.hidden || pending.generation !== privateGeneration))) return users;
  const result = { ...users };
  const owner = pending.actor || actor || { id: 0, login: 'you' };
  if (pending.emoji === null) delete result[owner.id];
  else result[owner.id] = { login: owner.login, emoji: pending.emoji };
  return result;
};
const send = async message => {
  const result = await runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || 'Extension updated. Reload this page and try again.');
  return result.value;
};
function rememberVisibility(visibility) {
  lastVisibility = visibility;
  void send({ type: 'visibility-save', visibility }).catch(error => notify(error.message));
}
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
  const root = document.documentElement;
  const background = [document.body, root].map(node => getComputedStyle(node).backgroundColor.match(/[\d.]+/g))
    .find(color => color?.length >= 3 && (color.length < 4 || Number(color[3]) > 0));
  el.toggleAttribute('data-dark', root.classList.contains('dark') || root.dataset.theme === 'dark'
    || Boolean(background && background.slice(0, 3).reduce((sum, value) => sum + Number(value), 0) < 220));
}
const overlay = host();
document.body.append(overlay.el);
const toast = element('div', { class: 'toast', popover: 'manual', role: 'status', 'aria-live': 'polite' });
overlay.shadow.append(toast);
let toastTimer;
function notify(message, url, retry) {
  if (!overlay.el.isConnected) document.body.append(overlay.el);
  toast.replaceChildren(document.createTextNode(message));
  if (url) {
    const link = element('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, ' View commit');
    toast.append(link);
  }
  if (retry) {
    const button = element('button', { type: 'button', class: 'link' }, 'Retry');
    button.addEventListener('click', event => { if (event.isTrusted) { toast.hidePopover(); retry(); } });
    toast.append(document.createTextNode(' '), button);
  }
  toast.showPopover();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.hidePopover(), 9000);
}
function display(record) {
  if (record.dragging) return;
  if (active?.record === record) active.updateRemoval?.();
  const focused = record.el.shadowRoot.activeElement;
  const focusedLabel = focused?.classList.contains('chip') ? focused.getAttribute('aria-label') : null;
  record.el.dataset.visibility = record.visibility || 'public';
  record.chips.replaceChildren();
  record.slot?.querySelectorAll('.chip').forEach(chip => chip.remove());
  for (const group of summarize({ users: usersFor(record) }, actor?.id)) {
    const button = element('button', { type: 'button', class: 'chip', 'aria-pressed': String(group.mine),
      'aria-label': `${record.visibility === 'private' ? 'Private: ' : ''}${group.emoji}, ${group.count} reaction${group.count === 1 ? '' : 's'}${group.mine ? ', yours' : ''}. ${record.placement ? 'Change reaction' : group.mine ? 'Remove reaction' : 'React with this emoji'}`,
      title: `${group.people.slice(0, 12).map(name => `@${name}`).join(', ')}${group.people.length > 12 ? '…' : ''}` });
    button.append(document.createTextNode(group.emoji));
    if (record.placement) { button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', String(active?.record === record)); }

    if (record.placement && group.mine) { button.classList.add('movable'); button.title += ' · Option/Alt-click to clear · Drag to move'; }
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (record.suppressClick) { record.suppressClick = false; return; }
      if (!event.isTrusted) return;
      if (record.placement && group.mine && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.getModifierState?.('AltGraph')) {
        event.preventDefault(); choose(record, null);
      } else record.placement ? openPicker(record, true) : choose(record, group.mine ? null : group.emoji);
    });
    (group.mine && record.slot ? record.slot : record.chips).append(button);
  }
  if (focusedLabel) [...record.el.shadowRoot.querySelectorAll('.chip')].find(button => button.getAttribute('aria-label') === focusedLabel)?.focus({ preventScroll: true });
  record.button.title = 'reacji.to';
  record.el.setAttribute('aria-busy', String(optimistic.has(mutationKey(record, record.visibility || 'public'))));
  record.button.hidden = Boolean(usersFor(record)[actor?.id]?.emoji);
  if (!record.placement) layoutActions(record.anchor, record.el, record.article);
  if (record.placement) {
    record.button.hidden = record.chips.childElementCount > 0;
    const present = Object.values(usersFor(record,false)).some(u=>u.emoji) || Object.values(usersFor(record,true)).some(u=>u.emoji);
    record.el.hidden = !record.pending && !present && active?.record !== record;
  }
}
async function refresh(record) {
  const visibility = record.visibility;
  record.loading ||= new Set();
  if (record.loading.has(visibility)) return;
  record.loading.add(visibility);
  const generation = privateGeneration, revision = dataRevision;
  try {
    if (visibility === 'private') {
      const identity = await siteIdentity();
      const data = await send({ type: 'private-read', post: record.post, ...identity });
      if (document.hidden || generation !== privateGeneration || record.visibility !== visibility || revision !== dataRevision || optimistic.size) return;
      record.privateData = data;
      if (record.placement && pageIdentity?.id === record.post.id) pagePrivate = record.privateData;
    } else {
      const data = await send({ type: 'read', post: record.post });
      if (revision !== dataRevision || optimistic.size) return;
      record.data = data;
    }
    if (record.placement && record.visibility !== 'private' && pageIdentity?.id === record.post.id) pagePublic = record.data;
    record.error = null;
    display(record);
  } catch (error) { if (revision === dataRevision && record.visibility === visibility) { record.error = error.message; display(record); } }
  finally { record.loading.delete(visibility); }
}
function choose(record, emoji, placement = record.placement, { trackUsage = true } = {}) {
  const generation = privateGeneration;
  const visibility = record.visibility || 'public';
  rememberVisibility(visibility);
  const key = mutationKey(record, visibility);
  const move = record.moves?.[visibility];
  const pending = { actor: actor && { ...actor }, emoji, generation };
  if (placement) record.placement = placement;
  optimistic.set(key, pending);
  dataRevision++;
  record.pending = false;
  if (active?.record === record) closePicker();
  const repaint = () => {
    for (const r of records.values()) if (postKey(r.post) === postKey(record.post)) display(r);
    positionPins();
  };
  repaint();
  // Preserve click order without locking the picker or the visible reaction.
  const save = async () => {
    try {
      const identity = await siteIdentity();
      const target = emoji === null && move ? move.committed : placement;
      const moveFrom = move && emoji !== null && move.committed.id !== target.id ? move.committed.id : null;
      const result = await send({ type: 'react', event: { version: 1, commit: record.post.id, post: record.post, ...(target ? { placement: target } : {}), ...(moveFrom ? { moveFrom } : {}), emoji }, visibility, trackUsage, ...identity });
      if (move) move.committed = target;
      actor = result.actor || actor;
      let savedDocument = result.document;
      if (!savedDocument) savedDocument = await send({ type: visibility === 'private' ? 'private-read' : 'read', post: record.post, ...identity });
      const resultDocument = visibility === 'private' && (document.hidden || generation !== privateGeneration) ? null : savedDocument;
      if (record.placement && pageIdentity?.id === record.post.id) {
        if (visibility === 'private') pagePrivate = resultDocument;
        else pagePublic = savedDocument;
      }
      for (const r of records.values()) if (postKey(r.post) === postKey(record.post)) {
        if (visibility === 'private') r.privateData = resultDocument;
        else r.data = savedDocument;
      }
      if (optimistic.get(key) === pending) optimistic.delete(key);
      if (result.mirror?.status === 'failed') notify(result.mirror.error);
    } catch (error) {
      // A failure for an earlier click must never undo a newer choice.
      if (optimistic.get(key) === pending) {
        optimistic.delete(key);
        if (move) record.placement = move.committed;
        notify(`${error.message} Previous reaction restored.`, null, () => {
          record.visibility = visibility;
          choose(record, emoji, placement, { trackUsage });
        });
      }
    } finally {
      if (move && !optimistic.has(key)) move.hiddenIds.clear();
      dataRevision++; repaint(); reconcilePins();
    }
  };
  saveQueue = saveQueue.catch(() => {}).then(save);
  return saveQueue;
}
function closePicker() {
  pickerGeneration++;
  if (!active) return;
  const { panel, record } = active;
  active = null;
  panel.remove();
  record.button.setAttribute('aria-expanded', 'false');
  if (record.placement) { record.pending = false; display(record); }
  if (record.el.isConnected && !record.el.hidden) (record.button.hidden ? record.chips.querySelector('button') : record.button)?.focus({ preventScroll: true });
}
function positionPicker() {
  if (!active) return;
  if (!active.record.el.isConnected) return closePicker();
  const box = (active.record.button.hidden ? active.record.el : active.record.button).getBoundingClientRect();
  const panel = active.panel;
  const width = panel.offsetWidth, height = panel.offsetHeight;
  panel.style.left = `${Math.max(12, Math.min(box.left, innerWidth - width - 12))}px`;
  const below = box.bottom + 6;
  panel.style.top = `${Math.max(12, Math.min(below + height <= innerHeight - 12 ? below : box.top - height - 6, innerHeight - height - 12))}px`;
}
async function openPicker(record, preserveVisibility = false, { focus = true } = {}) {
  if (active?.record === record) return closePicker();
  closePicker();
  const generation = pickerGeneration;
  if (!preserveVisibility) {
    try {
      const preference = await send({ type: 'visibility-get' });
      if (generation !== pickerGeneration || !record.el.isConnected) return;
      if (['public', 'private'].includes(preference.visibility)) lastVisibility = preference.visibility;
      record.visibility = lastVisibility;
      display(record);
    } catch (error) { notify(error.message); return; }
  }
  const panel = element('section', { class: 'panel', popover: 'auto', role: 'dialog', 'aria-label': 'Choose a reaction' });
  const head = element('div', { class: 'head' });
  const identity = element('span', { class: 'identity', title: actor?.login ? `@${actor.login}` : '' }, actor?.login ? `@${actor.login}` : '');
  const title = element('strong', {}, 'reacji.to');
  const controls = element('div', { class: 'controls' });
  const search = element('input', { class: 'search', type: 'search', placeholder: 'Search or paste any emoji', 'aria-label': 'Search or paste any emoji' });
  const categories = element('div', { class: 'categories', role: 'toolbar', 'aria-label': 'Emoji categories' });
  const categoryButtons = emojiCategories.map(([name, path], index) => {
    const button = element('button', { class: 'category', type: 'button', 'aria-label': name, title: name, 'aria-pressed': String(index === 0), tabindex: index === 0 ? '0' : '-1' });
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
    const shape = document.createElementNS(icon.namespaceURI, 'path');
    shape.setAttribute('d', path); icon.append(shape); button.append(icon); categories.append(button);
    return button;
  });
  controls.append(search);
  const grid = element('div', { class: 'grid', 'aria-label': 'Emoji choices' });
  const status = element('p', { class: 'status', role: 'status', 'aria-live': 'polite' }, record.error || '');
  const settings = element('button', { class: 'link', type: 'button' }, 'Settings');
  settings.addEventListener('click', event => { if (event.isTrusted) send({ type: 'options' }).catch(error => { status.textContent = error.message; }); });
  head.append(title, identity, settings);
  const visibility = element('div', { class: 'visibility', role: 'group', 'aria-label': 'Reaction visibility' });
  const publicButton = element('button', { type: 'button', 'aria-pressed': String(record.visibility !== 'private') }, 'Public');
  const privateButton = element('button', { type: 'button', 'aria-pressed': String(record.visibility === 'private') }, 'Private');
  const removal = element('div', { class: 'current-reaction', hidden: '' });
  const currentEmoji = element('span', { class: 'current-emoji', 'aria-hidden': 'true' });
  const currentLabel = element('span', {}, 'Your reaction');
  const removeButton = element('button', { class: 'remove-reaction', type: 'button' }, 'Clear reaction');
  const updateRemoval = () => {
    const mine = usersFor(record)[actor?.id]?.emoji;
    removal.hidden = !mine;
    currentEmoji.textContent = mine || '';
    currentLabel.textContent = record.visibility === 'private' ? 'Your private reaction' : 'Your reaction';
    positionPicker();
  };
  removeButton.addEventListener('click', event => {
    if (event.isTrusted && usersFor(record)[actor?.id]?.emoji) choose(record, null);
  });
  removal.append(currentEmoji, currentLabel, removeButton);
  const updateScope = () => {
    publicButton.setAttribute('aria-pressed', String(record.visibility !== 'private'));
    privateButton.setAttribute('aria-pressed', String(record.visibility === 'private'));
    updateRemoval();
  };
  const switchScope = async value => {
    rememberVisibility(value);
    record.visibility = value; display(record); updateScope();
    status.textContent = 'Loading reactions…';
    await refresh(record);
    if (active?.record === record) { status.textContent = record.error || ''; updateScope(); }
  };
  publicButton.addEventListener('click', event => { if (event.isTrusted) switchScope('public'); });
  privateButton.addEventListener('click', event => { if (event.isTrusted) switchScope('private'); });
  visibility.append(publicButton, privateButton);
  updateScope();
  panel.append(categories, head, visibility, removal, controls, grid, status);
  overlay.shadow.append(panel);
  active = { record, panel, status, updateRemoval };
  record.button.setAttribute('aria-expanded', 'true');
  let limit = 96;
  let usage = [], sections = [];
  const setCategory = index => categoryButtons.forEach((button, at) => {
    button.setAttribute('aria-pressed', String(at === index));
    button.tabIndex = at === index ? 0 : -1;
  });
  const makeEmoji = item => {
    const button = element('button', { class: 'emoji', type: 'button', 'aria-label': item.name, title: item.name }, item.emoji);
    button.addEventListener('click', event => {
      if (!event.isTrusted) return;
      const mine = usersFor(record)[actor?.id]?.emoji;
      choose(record, mine === item.emoji ? null : item.emoji);
    });
    return button;
  };
  const draw = () => {
    const query = search.value.trim().toLowerCase();
    const pasted = emojiValue(query);
    sections = [];
    grid.replaceChildren();
    const addSection = (name, items) => {
      const section = element('section', { class: 'emoji-section', 'aria-label': name });
      section.append(element('h3', { class: 'category-heading' }, name));
      const choices = element('div', { class: 'emoji-choices' });
      choices.append(...items.map(makeEmoji)); section.append(choices); grid.append(section); sections.push(section);
    };
    if (!query) {
      const byEmoji = new Map(emojis.map(item => [item.emoji, item]));
      addSection('Frequently used', frequentEmojis(usage).map(value => byEmoji.get(value)).filter(Boolean));
      for (const [name] of emojiCategories.slice(1)) addSection(name, emojis.filter(item => item.group === name));
      setCategory(0);
    } else {
      const results = emojis.filter(item => pasted ? item.emoji === pasted : `${item.name} ${item.group}`.toLowerCase().includes(query));
      setCategory(-1);
      categoryButtons[0].tabIndex = 0;
      addSection('Search results', results.slice(0, limit));
      if (!results.length) grid.append(element('div', { class: 'empty' }, 'No emoji found. Try “heart”, “flag”, or paste an emoji.'));
      if (results.length > limit) {
        const more = element('button', { class: 'more', type: 'button' }, `Show more · ${results.length - limit} remaining`);
        more.addEventListener('click', () => { const previous = limit; limit += 96; draw(); grid.querySelectorAll('.emoji')[previous]?.focus(); });
        grid.append(more);
      }
    }
    positionPicker();
  };
  categoryButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      if (search.value) { search.value = ''; draw(); }
      grid.scrollTop = sections[index].offsetTop - grid.offsetTop;
      setCategory(index);
    });
  });
  categories.addEventListener('keydown', event => {
    const at = categoryButtons.indexOf(event.target);
    if (at < 0) return;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? categoryButtons.length - 1
      : event.key === 'ArrowRight' ? (at + 1) % categoryButtons.length
      : event.key === 'ArrowLeft' ? (at + categoryButtons.length - 1) % categoryButtons.length : null;
    if (next !== null) { event.preventDefault(); categoryButtons[next].focus(); categoryButtons[next].click(); }
  });
  grid.addEventListener('scroll', () => {
    if (search.value) return;
    let index = 0;
    sections.forEach((section, at) => {
      if (section.offsetTop - grid.offsetTop <= grid.scrollTop + 2) index = at;
    });
    setCategory(index);
  });
  search.addEventListener('input', () => { limit = 96; grid.scrollTop = 0; draw(); });
  void send({ type: 'emoji-usage-get' }).then(result => {
    usage = result.usage || [];
    if (active?.panel === panel && !search.value && grid.scrollTop === 0 && !grid.contains(overlay.shadow.activeElement)) draw();
  }).catch(() => { /* Fall back to common reactions if preferences are unavailable. */ });
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
      const controls = [...panel.querySelectorAll('button:not(:disabled):not([tabindex="-1"]),input,select')].filter(control => control.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && overlay.shadow.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && overlay.shadow.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  panel.addEventListener('toggle', event => { if (event.newState === 'closed' && active?.panel === panel) closePicker(); });
  panel.showPopover(); draw(); positionPicker(); if (focus) search.focus();
  void refresh(record);
  try {
    const state = await send({ type: 'status' });
    actor = state.actor;
    identity.textContent = actor?.login ? `@${actor.login}` : '';
    identity.title = identity.textContent;
    if (active?.panel === panel) status.textContent = state.followingError || (state.connected ? '' : state.authError || 'Connect GitHub in settings before reacting.');
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
  if (!overlay.el.isConnected) document.body.append(overlay.el);
  const posts = discover(document, platform, resolveLinkedIn);
  for (const [el, record] of records) {
    if (record.placement) continue;
    const current = posts.find(p => p.anchor === record.anchor && postKey(p.post) === record.id);
    if (!el.isConnected || !current) { clearActions(record.anchor); observer.unobserve(el); records.delete(el); el.remove(); if (active?.record === record) closePicker(); }
  }
  for (const { article, anchor, post, inline } of posts) {
    if ([...records.values()].some(r => r.anchor === anchor)) continue;
    addRecord({ article, anchor, post, inline });
  }
  positionPins();
  positionActions();
}
function positionActions() {
  for (const record of records.values()) if (!record.placement) layoutActions(record.anchor, record.el, record.article);
}
function addRecord({ article, anchor, post, inline, placement, pending = false }) {
    const { el, shadow } = host();
    if (!inline) { el.style.display = 'block'; el.style.padding = '4px 0 8px'; }
    const bar = element('span', { class: 'bar' });
    const button = element('button', { class: 'trigger', type: 'button', title: 'reacji.to', 'aria-label': 'React with an emoji', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
    button.append(element('img', { src: pickerLogo, width: 16, height: 16, alt: '', 'aria-hidden': 'true' }));
    const chips = element('span', { class: 'bar' });
    const slot = placement ? null : element('span', { class: 'reaction-slot' });
    if (slot) slot.append(button);
    bar.append(slot || button, chips); shadow.append(bar);
    if (placement) { document.documentElement.append(el); el.style.cssText = 'position:absolute;z-index:2147483000;'; bar.classList.add('pin'); }
    else anchor.after(el);
    const record = { id: postKey(post) + (placement ? `:${placement.id}` : ''), post, article, anchor, el, button, chips, slot, placement, pending, data: null, privateData: null, visibility: 'public', visible: false };
    if (placement) { record.mutationId = crypto.randomUUID(); wirePinDrag(record, bar); }
    records.set(el, record);
    bar.addEventListener('click', event => event.stopPropagation());
    button.addEventListener('click', event => { if (event.isTrusted) openPicker(record); });
    observer.observe(el);
    return record;
}

function movePin(record, placement) {
  const visibility = record.visibility || 'public';
  const emoji = usersFor(record)[actor?.id]?.emoji;
  if (!emoji) return;
  record.moves ||= {};
  const move = record.moves[visibility] ||= { committed: record.placement, hiddenIds: new Set() };
  move.hiddenIds.add(record.placement.id);
  movingRecords.add(record);
  choose(record, emoji, placement);
  reconcilePins();
}
function wirePinDrag(record, bar) {
  let drag = null;
  const finish = (event, cancel = false) => {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.id)) return;
    const state = drag; drag = null;
    record.dragging = false; record.el.removeAttribute('data-dragging');
    if (state.capture.hasPointerCapture(state.id)) state.capture.releasePointerCapture(state.id);
    if (!state.moved) return;
    record.suppressClick = true;
    // Pointer-generated click follows pointerup synchronously; don't swallow a later click.
    setTimeout(() => { record.suppressClick = false; }, 0);
    if (!cancel && record.el.isConnected) {
      try {
        const x = state.left + state.width / 2, y = state.top + state.height / 2;
        const target = document.elementsFromPoint(x, y).find(el => !el.closest('reacji-to-reactions,reacji-page-menu,reacji-demo-picker'));
        const placement = capturePlacement(target, x, y);
        movePin(record, placement);
      } catch (error) { notify(error.message); }
    }
    positionPins();
  };
  bar.addEventListener('pointerdown', event => {
    if (!event.isTrusted || event.button !== 0 || !event.isPrimary || !event.target.closest('.movable')) return;
    record.suppressClick = false;
    const box = record.el.getBoundingClientRect();
    drag = { capture: event.target.closest('.movable'), id: event.pointerId, x: event.clientX, y: event.clientY, dx: event.clientX - box.left, dy: event.clientY - box.top, width: box.width, height: box.height, left: box.left, top: box.top, moved: false };
    record.dragging = true;
    drag.capture.setPointerCapture(event.pointerId);
  });
  record.el.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
    if (!drag.moved) { drag.moved = true; closePicker(); record.el.setAttribute('data-dragging', ''); }
    event.preventDefault();
    drag.left = Math.max(8, Math.min(event.clientX - drag.dx, innerWidth - drag.width - 8));
    drag.top = Math.max(8, Math.min(event.clientY - drag.dy, innerHeight - drag.height - 8));
    positionPin(record.el, drag.left, drag.top);
  });
  record.el.addEventListener('pointerup', event => finish(event));
  record.el.addEventListener('pointercancel', event => finish(event, true));
  record.el.addEventListener('lostpointercapture', event => finish(event, true));
  document.addEventListener('keydown', event => { if (drag && event.key === 'Escape') { event.preventDefault(); finish(event, true); } });
}

// Use the actual absolute-position origin, which may differ from the document
// origin on styled pages. Pins live outside body positioning and transforms.
function positionPin(el, left, top) {
  el.style.left = '0px'; el.style.top = '0px';
  const origin = el.getBoundingClientRect();
  el.style.left = `${left - origin.left}px`;
  el.style.top = `${top - origin.top}px`;
}
function positionPins() {
  for (const record of records.values()) if (record.placement) {
    if (record.dragging) continue;
    record.anchor = resolvePlacement(record.placement);
    if (!record.anchor) { record.el.hidden = true; continue; }
    const box = record.anchor.getBoundingClientRect();
    if (!box.width || !box.height) { record.el.hidden = true; continue; }
    display(record);
    const pin = record.el.getBoundingClientRect();
    const point = box.left + box.width * record.placement.x / 1000;
    const left = Math.max(8, Math.min(point - pin.width / 2, innerWidth - pin.width - 8));
    // Legacy placements also captured y; honor that click instead of snapping
    // above or below the entire element (which can be an arbitrarily tall page).
    positionPin(record.el, left, box.top + box.height * record.placement.y / 1000 - pin.height / 2);
  }
}
function reconcilePins() {
  if (!pageIdentity) return;
  // A moved record retains its identity through queued saves. Remove stale render copies
  // when a failed move returns it to an earlier, already-rendered placement.
  for (const moving of movingRecords) for (const [el, record] of records) {
    if (record !== moving && record.placement?.id === moving.placement.id && postKey(record.post) === postKey(moving.post)) {
      observer.unobserve(el); records.delete(el); el.remove();
    }
  }
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
    if (active?.record !== record && !Object.values(usersFor(record,false)).some(u=>u.emoji) && Object.values(usersFor(record,true)).some(u=>u.emoji)) record.visibility = 'private';
    display(record);
  }
  positionPins();
}
async function loadPage() {
  if (pageLoading || document.hidden) return;
  pageLoading = true;
  const generation = pageGeneration, revision = dataRevision;
  try {
    const post = await pagePost(location.href);
    const state = await send({ type: 'status' });
    const data = await send({ type: 'read', post });
    let privateData = null;
    if (state.connected && state.privateRepository) {
      try { privateData = await send({ type: 'private-read', post, ...await siteIdentity() }); } catch { /* Public pins remain available when private access needs reconnecting. */ }
    }
    if (generation !== pageGeneration || document.hidden || revision !== dataRevision || optimistic.size) return;
    pageIdentity = post; pagePublic = data; pagePrivate = privateData; reconcilePins();
  } catch { /* A new page without reaction data needs no interruption. */ }
  finally { pageLoading = false; if (generation !== pageGeneration) loadPage(); }
}
function pageChanged() {
  if (pageHref === location.href) return;
  movingRecords.clear();
  pageHref = location.href; pageGeneration++; pageIdentity = null; pagePublic = null; pagePrivate = null;
  for (const [el,record] of records) if (record.placement) { if (active?.record === record) closePicker(); observer.unobserve(el); el.remove(); records.delete(el); }
  loadPage();
}
async function placeReaction(context, options) {
  beforePlace();
  if (!overlay.el.isConnected) document.body.append(overlay.el);
  pageChanged();
  try {
    const placement = capturePlacement(context.target, context.x, context.y);
    const post = await pagePost(context.href);
    if (context.href !== location.href || !context.target.isConnected) return;
    let record = [...records.values()].find(r=>r.placement && r.anchor === context.target && postKey(r.post) === postKey(post));
    if (options?.toggle && record && usersFor(record)[actor?.id]?.emoji) {
      choose(record, null);
      return record;
    }
    if (!record) record = addRecord({ article: context.target, anchor: context.target, post, inline: true, placement, pending: true });
    record.pending = true; record.el.hidden = false; positionPins();
    // Open immediately; reading existing reactions must not delay the picker.
    await openPicker(record, false, options);
    return record;
  } catch (error) { notify(error.message); }
}
installQuickReaction({ cursor: pickerLogo, enabled: () => !active, place: context => placeReaction(context, { toggle: true }) });
let scheduled = false;
function scheduleScan() {
  if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; pageChanged(); scan(); reconcilePins(); }); }
}
new MutationObserver(mutations => {
  if (mutations.every(mutation => mutation.target.closest?.('reacji-to-reactions'))) return;
  scheduleScan();
}).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'data-urn', 'data-id', 'data-commit', 'componentkey', 'class', 'style'] });
new MutationObserver(() => { theme(overlay.el); for (const record of records.values()) theme(record.el); }).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
addEventListener('resize', () => { positionPins(); positionActions(); positionPicker(); });
addEventListener('scroll', () => { positionPins(); positionPicker(); if (platform === 'linkedin') scheduleScan(); }, { passive: true, capture: true });
setInterval(() => { pageChanged(); if (!document.hidden) { loadPage(); for (const record of records.values()) if (record.visible && !record.placement) refresh(record); } }, 30000);
addEventListener('popstate',pageChanged); addEventListener('hashchange',pageChanged);
document.addEventListener('visibilitychange', () => { if (document.hidden) { privateGeneration++; closePicker(); pagePrivate = null; for (const record of records.values()) { record.privateData = null; display(record); } } else { loadPage(); for (const record of records.values()) if (record.visible && !record.placement) refresh(record); } });
send({ type: 'status' }).then(state => { actor = state.actor; for (const record of records.values()) display(record); }).catch(() => {});
globalThis.__reacjiToContentReady = true;
scan();
loadPage();
return { open: openPicker, close: closePicker, choose, place: placeReaction,
  recordFor: article => [...records.values()].find(record => record.article === article),
  get active() { return active; } };
}
