import { caretAt, rangeBetween, captureTextSelection } from './text-selection.js';
// Hold Option/Alt to place a reaction without activating the page underneath.
export function installQuickReaction({ cursor, cursorHighDpi, enabled, place }) {
  const sheet = new CSSStyleSheet();
  // Keep a 32 CSS-pixel cursor, but supply enough pixels for Retina displays.
  const image = cursorHighDpi ? `image-set(url("${cursor}") 1x, url("${cursorHighDpi}") 4x)` : `url("${cursor}")`;
  sheet.replaceSync(`:root, :root * { cursor: ${image} 16 16, crosshair !important; }`);
  let held = false, cancelled = false, showing = false, press = null;
  let hovered = document.body;
  const excluded = el => !(el instanceof Element) || el.isContentEditable ||
    el.closest('input,textarea,select,option,reacji-to-reactions');
  const altOnly = event => event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.getModifierState?.('AltGraph');
  const eligible = target => {
    let focused = document.activeElement;
    while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
    return enabled() && !excluded(target) && !focused?.isContentEditable && !focused?.matches('input,textarea,select,option');
  };
  function show(value) {
    if (showing === value) return;
    showing = value;
    document.adoptedStyleSheets = value ? [...document.adoptedStyleSheets, sheet] : document.adoptedStyleSheets.filter(item => item !== sheet);
  }
  const update = () => show(held && !cancelled && eligible(hovered));
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  function reset() { held = false; cancelled = false; press = null; show(false); }
  addEventListener('keydown', event => {
    if (!event.isTrusted) return;
    if (event.key === 'Alt' && !event.repeat) cancelled = false;
    held = altOnly(event);
    if (event.key === 'Escape' && (showing || press)) { cancelled = true; if (press) press.cancelled = true; stop(event); }
    // Leave Option character entry and browser keyboard shortcuts alone.
    else if (event.key !== 'Alt') cancelled = true;
    update();
  }, true);
  addEventListener('keyup', event => {
    if (!event.isTrusted) return;
    held = altOnly(event);
    if (!event.altKey) cancelled = false;
    update();
  }, true);
  for (const type of ['pointerover', 'pointermove']) addEventListener(type, event => {
    if (!event.isTrusted) return;
    hovered = event.target;
    held = altOnly(event);
    if (press && !press.cancelled && type === 'pointermove' && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) {
      press.dragged = true;
      press.range = rangeBetween(press.start, caretAt(event.clientX, event.clientY));
      if (press.range) { const selection = getSelection(); selection.removeAllRanges(); selection.addRange(press.range); }
    }
    update();
  }, true);
  addEventListener('pointerout', event => { if (!event.relatedTarget) show(false); }, true);
  addEventListener('focusin', update, true);
  addEventListener('focusout', () => queueMicrotask(update), true);
  addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  addEventListener('pointercancel', reset, true);
  addEventListener('pointerdown', event => {
    if (!event.isTrusted || event.button !== 0) return;
    press = null;
    if (!altOnly(event) || cancelled || !eligible(event.target)) return;
    press = { target: event.target, x: event.clientX, y: event.clientY, href: location.href, start: caretAt(event.clientX, event.clientY) };
    stop(event);
  }, true);
  for (const type of ['mousedown', 'pointerup', 'mouseup']) addEventListener(type, event => {
    if (event.isTrusted && event.button === 0 && press) stop(event);
  }, true);
  addEventListener('click', event => {
    if (!event.isTrusted || event.button !== 0 || !press) return;
    const context = press;
    press = null;
    cancelled = event.altKey;
    show(false);
    stop(event);
    if (context.cancelled || context.href !== location.href) return;
    if (context.dragged || Math.hypot(event.clientX - context.x, event.clientY - context.y) > 6) {
      const span = captureTextSelection(context.range);
      if (!span) return;
      const box = context.range.getBoundingClientRect();
      place({ ...context, ...span, x: box.left + box.width / 2, y: box.bottom });
      return;
    }
    place(context);
  }, true);
}
