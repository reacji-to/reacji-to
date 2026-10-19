import { pickerLogo } from './brand.js';
import { installQuickReaction } from './quick-reaction.js';
import { pagePost, canonicalUrl, placementRef, placementUsers } from './web.js';
import { capturePlacement, resolvePlacement } from './anchors.js';
import { discoverPosts, platformFor } from './adapters.js';
import { postKey } from './posts.js';
import css from './content.css';
import { currentDevNullUser } from './identity.js';
import emojis from './emoji.json' with { type: 'json' };
import { emojiValue, summarize, COMMIT_ID } from './protocol.js';

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
let pageIdentity = null, lastContext = null, pageLoading = false, pageGeneration = 0, pageHref = location.href;
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
  el.toggleAttribute('data-dark', document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark' || (platform !== 'devnull' && (() => { const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g); return c && c.length >= 3 && Number(c[0]) + Number(c[1]) + Number(c[2]) < 220; })()));
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
  const social = ['x', 'linkedin'].includes(record.post.platform);
  const focused = record.el.shadowRoot.activeElement;
  const focusedLabel = focused?.classList.contains('chip') ? focused.getAttribute('aria-label') : null;
  record.chips.replaceChildren();
  for (const group of summarize({ users: usersFor(record) }, actor?.id)) {
    const button = element('button', { type: 'button', class: 'chip', 'aria-pressed': String(group.mine),
      'aria-label': `${record.visibility === 'private' ? 'Private: ' : ''}${group.emoji}, ${group.count} reaction${group.count === 1 ? '' : 's'}${group.mine ? ', yours' : ''}. ${record.placement ? 'Change reaction' : group.mine ? 'Remove reaction' : 'React with this emoji'}`,
      title: `${group.people.slice(0, 12).map(name => `@${name}`).join(', ')}${group.people.length > 12 ? '…' : ''}` });
    button.append(document.createTextNode(`${record.visibility === 'private' ? '🔒 ' : ''}${group.emoji}`));
    if (record.placement) { button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', String(active?.record === record)); }

    if (record.placement && group.mine) { button.classList.add('movable'); button.title += ' · Drag to move'; }
    button.addEventListener('click', event => { event.stopPropagation(); if (record.suppressClick) { record.suppressClick = false; return; } if (event.isTrusted) record.placement ? openPicker(record, true) : choose(record, group.mine ? null : group.emoji); });
    record.chips.append(button);
  }
  if (focusedLabel) [...record.chips.children].find(button => button.getAttribute('aria-label') === focusedLabel)?.focus({ preventScroll: true });
  record.button.title = 'reacji.to';
  record.el.setAttribute('aria-busy', String(optimistic.has(mutationKey(record, record.visibility || 'public'))));
  if (social) record.button.hidden = Boolean(usersFor(record)[actor?.id]?.emoji);
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
function choose(record, emoji, placement = record.placement) {
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
      const result = await send({ type: 'react', event: { version: 1, commit: record.post.id, post: record.post, ...(target ? { placement: target } : {}), ...(moveFrom ? { moveFrom } : {}), emoji }, visibility, ...identity });
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
    } catch (error) {
      // A failure for an earlier click must never undo a newer choice.
      if (optimistic.get(key) === pending) {
        optimistic.delete(key);
        if (move) record.placement = move.committed;
        notify(`${error.message} Previous reaction restored.`, null, () => {
          record.visibility = visibility;
          choose(record, emoji, placement);
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
  const identity = element('span', { class: 'identity' }, actor?.login ? ` @${actor.login}` : '');
  const title = element('strong', {}, 'reacji.to');
  title.append(identity);
  const controls = element('div', { class: 'controls' });
  const search = element('input', { class: 'search', type: 'search', placeholder: 'Search or paste any emoji', 'aria-label': 'Search or paste any emoji' });
  const category = element('select', { class: 'category', 'aria-label': 'Emoji category' });
  category.append(element('option', { value: '' }, 'All emoji'));
  for (const group of new Set(emojis.map(item => item.group))) category.append(element('option', { value: group }, group));
  controls.append(search, category);
  const grid = element('div', { class: 'grid', 'aria-label': 'Emoji choices' });
  const status = element('p', { class: 'status', role: 'status', 'aria-live': 'polite' }, record.error || '');
  const settings = element('button', { class: 'link', type: 'button' }, 'Settings');
  settings.addEventListener('click', event => { if (event.isTrusted) send({ type: 'options' }).catch(error => { status.textContent = error.message; }); });
  head.append(title, settings);
  const visibility = element('div', { class: 'visibility', role: 'group', 'aria-label': 'Reaction visibility' });
  const publicButton = element('button', { type: 'button', 'aria-pressed': String(record.visibility !== 'private') }, 'Public');
  const privateButton = element('button', { type: 'button', 'aria-pressed': String(record.visibility === 'private') }, 'Private');
  const updateScope = () => {
    publicButton.setAttribute('aria-pressed', String(record.visibility !== 'private'));
    privateButton.setAttribute('aria-pressed', String(record.visibility === 'private'));

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
  panel.append(head, visibility, controls, grid, status);
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
  panel.showPopover(); draw(); positionPicker(); if (focus) search.focus();
  void refresh(record);
  try {
    const state = await send({ type: 'status' });
    actor = state.actor;
    identity.textContent = actor?.login ? ` @${actor.login}` : '';
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
    const button = element('button', { class: 'trigger', type: 'button', title: 'reacji.to', 'aria-label': 'React with an emoji', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
    button.append(element('img', { src: pickerLogo, width: 16, height: 16, alt: '', 'aria-hidden': 'true' }));
    const chips = element('span', { class: 'bar' });
    bar.append(button, chips); shadow.append(bar);
    if (placement) { document.body.append(el); el.style.cssText = 'position:absolute;z-index:2147483000;'; bar.classList.add('pin'); }
    else anchor.after(el);
    const record = { id: postKey(post) + (placement ? `:${placement.id}` : ''), post, article, anchor, el, button, chips, placement, pending, data: null, privateData: null, visibility: 'public', visible: false };
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
        const placement = { ...capturePlacement(target, x, y), mode: 'point' };
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
    record.el.style.left = `${scrollX + drag.left}px`;
    record.el.style.top = `${scrollY + drag.top}px`;
  });
  record.el.addEventListener('pointerup', event => finish(event));
  record.el.addEventListener('pointercancel', event => finish(event, true));
  record.el.addEventListener('lostpointercapture', event => finish(event, true));
  document.addEventListener('keydown', event => { if (drag && event.key === 'Escape') { event.preventDefault(); finish(event, true); } });
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
    const above = box.bottom + pin.height + 16 > innerHeight && box.top - pin.height - 8 >= 8;
    record.el.toggleAttribute('data-above', above);
    record.el.style.setProperty('--anchor-x', `${Math.max(8, Math.min(point - left, pin.width - 8))}px`);
    record.el.style.left = `${scrollX + left}px`;
    record.el.style.top = `${scrollY + (record.placement.mode === 'point' ? box.top + box.height * record.placement.y / 1000 - pin.height / 2 : above ? box.top - pin.height - 8 : box.bottom + 8)}px`;
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
  pageHref = location.href; pageGeneration++; pageIdentity = null; pagePublic = null; pagePrivate = null; lastContext = null;
  for (const [el,record] of records) if (record.placement) { if (active?.record === record) closePicker(); observer.unobserve(el); el.remove(); records.delete(el); }
  loadPage();
}
document.addEventListener('contextmenu', event => {
  if (event.isTrusted && !event.composedPath().some(el=>el.localName === 'reacji-to-reactions')) {
    pageChanged();
    lastContext = { target: event.target, x: event.clientX, y: event.clientY, href: location.href };
  }
}, true);
async function placeReaction(context, options) {
  beforePlace();
  if (!overlay.el.isConnected) document.body.append(overlay.el);
  pageChanged();
  try {
    const placement = capturePlacement(context.target, context.x, context.y);
    const post = await pagePost(context.href);
    if (context.href !== location.href || !context.target.isConnected) return;
    let record = [...records.values()].find(r=>r.placement && r.anchor === context.target && postKey(r.post) === postKey(post));
    if (!record) record = addRecord({ article: context.target, anchor: context.target, post, inline: true, placement, pending: true });
    record.pending = true; record.el.hidden = false; positionPins();
    // Open immediately; reading existing reactions must not delay the picker.
    await openPicker(record, false, options);
    return record;
  } catch (error) { notify(error.message); }
}
installQuickReaction({ cursor: pickerLogo, enabled: () => !active, place: placeReaction });
runtime.onMessage?.addListener((message, sender, reply) => {
  if (message.type !== 'place-reaction') return;
  reply?.({ handled: true });
  if (!lastContext || lastContext.href !== location.href) {
    notify('Right-click the page content again to choose where to react.');
    return;
  }
  const context = lastContext; lastContext = null;
  void placeReaction(context);
});
let scheduled = false;
function scheduleScan() {
  if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; pageChanged(); scan(); reconcilePins(); }); }
}
new MutationObserver(mutations => {
  if (mutations.every(mutation => mutation.target.closest?.('reacji-to-reactions'))) return;
  scheduleScan();
}).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'data-urn', 'data-id', 'data-commit', 'componentkey', 'class', 'style'] });
new MutationObserver(() => { theme(overlay.el); for (const record of records.values()) theme(record.el); }).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
addEventListener('resize', () => { positionPins(); positionPicker(); });
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
