import { placementRef } from './web.js';

const excluded = 'input,textarea,select,option,script,style,noscript,[contenteditable="true"],reacji-to-reactions';
const text = el => el.matches('body,html') ? '' : (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0,160);
export function capturePlacement(target, x, y) {
  if (!(target instanceof Element) || !target.isConnected || target.closest(excluded)) throw new Error('Choose page content outside a text field.');
  const parts = [];
  for (let el = target; el; el = el.parentElement) {
    const tag = el.localName;
    if (!/^[a-z][a-z\d-]{0,40}$/.test(tag)) throw new Error('Choose an HTML element on the page.');
    const siblings = el.parentElement ? [...el.parentElement.children].filter(s => s.localName === tag) : [el];
    parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(el)+1})`);
  }
  const box = target.getBoundingClientRect();
  return placementRef({ id: crypto.randomUUID(), selector: parts.join(' > '), tag: target.localName, quote: text(target),
    x: Math.round(Math.max(0, Math.min(1, (x - box.left) / Math.max(1,box.width))) * 1000),
    y: Math.round(Math.max(0, Math.min(1, (y - box.top) / Math.max(1,box.height))) * 1000) });
}
export function resolvePlacement(value) {
  let anchor; try { anchor = placementRef(value); } catch { return null; }
  const matches = el => el && !el.closest(excluded) && el.localName === anchor.tag && (!anchor.quote || text(el) === anchor.quote);
  const exact = document.querySelector(anchor.selector);
  if (matches(exact)) return exact;
  // Structural movement is recoverable only when the visible excerpt is unique.
  if (!anchor.quote) return null;
  const candidates = [...document.getElementsByTagName(anchor.tag)].slice(0,2000).filter(matches);
  return candidates.length === 1 ? candidates[0] : null;
}
