// Shared by X, LinkedIn, dev-null and the website examples. Flatten action
// wrappers without moving native controls or changing their handlers.
const css = `
[data-reacji-actions-row]{display:grid!important;grid-template-columns:none!important;grid-auto-flow:column!important;grid-auto-columns:minmax(0,1fr)!important;align-items:center!important;gap:0!important}
[data-reacji-actions-wrapper]{display:contents!important}
[data-reacji-actions-action]{justify-self:center!important;min-width:0!important;width:max-content!important;margin:0!important;position:relative!important;left:var(--reacji-actions-shift,0px)!important}
[data-reacji-actions-row][data-reacji-actions-compact]{align-items:start!important}
[data-reacji-actions-compact] [data-reacji-actions-action]{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:flex-start!important;width:100%!important;max-width:100%!important;padding:0 2px!important;gap:0!important;white-space:normal!important;overflow-wrap:normal;font-size:12px!important;line-height:1.4!important}
[data-reacji-actions-compact] [data-reacji-actions-action] svg{flex:none;margin:6px 0!important}
[data-reacji-actions-compact] [data-reacji-actions-action] span{max-width:100%;min-width:0}
[data-reacji-actions-row] reacji-to-reactions{justify-self:center;min-width:0;position:relative;left:var(--reacji-actions-shift,0px)}
`;
export function layoutActions(anchor, host, article) {
  const row = anchor.parentElement;
  if (!row || row === article || !host.isConnected || !host.getClientRects().length) return;
  if (!document.querySelector('style[data-reacji-actions-styles]')) {
    const sheet = document.createElement('style');
    sheet.setAttribute('data-reacji-actions-styles', ''); sheet.textContent = css;
    document.head.append(sheet);
  }
  // Restore wrapper display before measuring visibility, including responsive hides.
  for (const el of row.querySelectorAll('[data-reacji-actions-wrapper]')) el.removeAttribute('data-reacji-actions-wrapper');
  row.setAttribute('data-reacji-actions-row', '');
  const controls = [...row.querySelectorAll('button,a[href],[role="button"]')]
    .filter(el => !el.parentElement.closest('button,a[href],[role="button"]') && el.getClientRects().length);
  if (!controls.some(control => anchor.contains(control)) && anchor.getClientRects().length) controls.push(anchor);
  for (const control of controls) {
    control.setAttribute('data-reacji-actions-action', '');
    for (let wrapper = control.parentElement; wrapper && wrapper !== row; wrapper = wrapper.parentElement) {
      wrapper.setAttribute('data-reacji-actions-wrapper', '');
    }
  }
  // Labels wrap beneath the icons when equal slots become too narrow.
  const compact = row.getBoundingClientRect().width / (controls.length + 1) < 80;
  row.toggleAttribute('data-reacji-actions-compact', compact);
  host.toggleAttribute('data-compact', compact);
  // Center the icon itself, not the icon-plus-count box. Otherwise unequal
  // counts make an evenly divided row still look uneven.
  for (const control of [...controls, host]) {
    const icon = control === host ? host.shadowRoot.querySelector('.reaction-slot') : control.querySelector('svg');
    const box = control.getBoundingClientRect(), glyph = icon?.getBoundingClientRect();
    const shift = !compact && glyph ? box.width / 2 - (glyph.left + glyph.width / 2 - box.left) : 0;
    const value = `${Math.round(shift * 100) / 100}px`;
    if (control.style.getPropertyValue('--reacji-actions-shift') !== value) control.style.setProperty('--reacji-actions-shift', value);
  }
}
export function clearActions(anchor) {
  const row = anchor.parentElement;
  if (!row) return;
  row.removeAttribute('data-reacji-actions-row');
  row.removeAttribute('data-reacji-actions-compact');
  for (const el of row.querySelectorAll('[data-reacji-actions-wrapper],[data-reacji-actions-action]')) {
    el.removeAttribute('data-reacji-actions-wrapper'); el.removeAttribute('data-reacji-actions-action');
    el.style.removeProperty('--reacji-actions-shift');
  }
}
