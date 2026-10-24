// DOM work stays out of the shared payload validator.
const excluded = 'input,textarea,select,option,script,style,noscript,[contenteditable],reacji-to-reactions';
function textNodes(root) {
  const nodes = [], walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement?.closest(excluded) || !node.parentElement?.getClientRects().length ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}
export function caretAt(x, y) {
  const range = document.caretRangeFromPoint?.(x, y);
  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE || range.startContainer.parentElement?.closest(excluded)) return null;
  return { node: range.startContainer, offset: range.startOffset };
}
export function rangeBetween(start, end) {
  if (!start || !end || !start.node.isConnected || !end.node.isConnected) return null;
  const first = document.createRange(), second = document.createRange();
  first.setStart(start.node, start.offset); first.collapse(true);
  second.setStart(end.node, end.offset); second.collapse(true);
  const range = document.createRange();
  const forward = first.compareBoundaryPoints(Range.START_TO_START, second) <= 0;
  range.setStart(forward ? start.node : end.node, forward ? start.offset : end.offset);
  range.setEnd(forward ? end.node : start.node, forward ? end.offset : start.offset);
  return range;
}
export function captureTextSelection(range) {
  if (!range || range.collapsed) return null;
  const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer.parentElement : range.commonAncestorContainer;
  if (!(root instanceof Element) || root.closest(excluded)) return null;
  const nodes = textNodes(root);
  if (!nodes.includes(range.startContainer) || !nodes.includes(range.endContainer)) return null;
  // Reject spans crossing protected controls rather than silently joining around them.
  if ([...root.querySelectorAll(excluded)].some(el => range.intersectsNode(el))) return null;
  let cursor = 0, start = -1, end = -1;
  for (const node of nodes) {
    if (node === range.startContainer) start = cursor + range.startOffset;
    if (node === range.endContainer) end = cursor + range.endOffset;
    cursor += node.textContent.length;
  }
  const text = nodes.map(node => node.textContent).join('');
  const exact = text.slice(start, end);
  if (!exact.trim() || exact.length > 4000) return null;
  return { target: root, selection: { exact, prefix: text.slice(Math.max(0, start - 64), start), suffix: text.slice(end, end + 64), start, end } };
}
export function resolveTextSelection(root, value) {
  if (!root || !value) return null;
  const nodes = textNodes(root), text = nodes.map(node => node.textContent).join('');
  let start = value.start, end = value.end;
  if (text.slice(start, end) !== value.exact) {
    const candidates = [];
    for (let at = text.indexOf(value.exact); at >= 0; at = text.indexOf(value.exact, at + 1)) {
      if (text.slice(Math.max(0, at - value.prefix.length), at) === value.prefix && text.slice(at + value.exact.length, at + value.exact.length + value.suffix.length) === value.suffix) candidates.push(at);
    }
    if (candidates.length !== 1) return null;
    start = candidates[0]; end = start + value.exact.length;
  }
  let offset = 0, first, last;
  for (const node of nodes) {
    if (!first && start >= offset && start < offset + node.length) first = { node, offset: start - offset };
    if (end > offset && end <= offset + node.length) last = { node, offset: end - offset };
    offset += node.length;
  }
  return rangeBetween(first, last);
}
