// Social action icons use the host's icon family; the photorealistic eyes remain
// the product mark and the page-placement cursor.
const profiles = {
  x: { size: 20, weight: 2, rendering: 'path' },
  linkedin: { size: 16, weight: 2.25, rendering: 'path' },
  devnull: { size: 16, weight: 2, rendering: 'stroke' },
};
const ns = 'http://www.w3.org/2000/svg';
// Match the approved eyes emoji artwork's 232:180 silhouette, not a square glyph.
const iconWidth = 24 * 232 / 180;
const eyeRadius = 7.25, eyeHeight = 11.8;
function svgNode(tag, attributes) {
  const node = document.createElementNS(ns, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}
const oval = (cx, rx, ry) => `M${cx-rx} 12a${rx} ${ry} 0 1 0 ${rx*2} 0a${rx} ${ry} 0 1 0 ${-rx*2} 0Z`;
function draw(icon, rendering, weight, solid = false) {
  const signature = `${rendering}:${weight}:${solid}`;
  if (icon.dataset.geometry === signature) return;
  icon.dataset.geometry = signature;
  icon.replaceChildren();
  for (const cx of [7.45, iconWidth - 7.45]) {
    if (solid) {
      icon.append(svgNode('path', { d: oval(cx, eyeRadius, eyeHeight) + oval(cx-1, 2.1, 2.8), fill: 'currentColor', 'fill-rule': 'evenodd' }));
    } else if (rendering === 'stroke') {
      icon.append(svgNode('ellipse', { cx, cy: 12, rx: eyeRadius-weight/2, ry: eyeHeight-weight/2, fill: 'none', stroke: 'currentColor', 'stroke-width': weight }));
    } else {
      icon.append(svgNode('path', { d: oval(cx, eyeRadius, eyeHeight) + oval(cx, eyeRadius-weight, eyeHeight-weight), fill: 'currentColor', 'fill-rule': 'evenodd' }));
    }
    if (!solid) icon.append(svgNode('ellipse', { cx: cx-1, cy: 12, rx: 2, ry: 2.8, fill: 'currentColor' }));
  }
}
export function nativeEyes(platform) {
  const profile = profiles[platform];
  if (!profile) return null;
  const icon = svgNode('svg', { class: 'native-eyes', viewBox: `0 0 ${iconWidth} 24`, 'aria-hidden': 'true', focusable: 'false', 'data-platform': platform });
  icon.style.setProperty('--rx-native-size', `${profile.size}px`);
  draw(icon, profile.rendering, profile.weight);
  return icon;
}
export function syncNativeEyes(host, controls, anchor) {
  const icon = host.shadowRoot.querySelector('.native-eyes');
  if (!icon) return;
  // Prefer an unselected sibling (reply/comment) over a liked heart or starred
  // post, whose active color and fill belong to a different action.
  const candidates = [...controls.filter(control => !anchor.contains(control)), ...controls];
  const reference = candidates.flatMap(control => [...control.querySelectorAll('svg')])
    .find(svg => svg.getBoundingClientRect().height >= 10);
  if (!reference) return;
  const profile = profiles[icon.dataset.platform];
  const shape = reference.querySelector('path,circle,ellipse,rect,polygon,use') || reference;
  const style = getComputedStyle(shape), box = reference.getBoundingClientRect();
  const painted = value => value && value !== 'none' && value !== 'rgba(0, 0, 0, 0)';
  const stroked = painted(style.stroke) && parseFloat(style.strokeWidth) > 0;
  const color = stroked ? style.stroke : painted(style.fill) ? style.fill : getComputedStyle(reference).color;
  const size = Math.max(12, Math.min(32, box.height));
  for (const [name, value] of [['--rx-native-size', `${size}px`], ['--rx-native-color', color], ['--rx-native-opacity', stroked ? style.strokeOpacity : style.fillOpacity]]) {
    if (icon.style.getPropertyValue(name) !== value) icon.style.setProperty(name, value);
  }
  const viewHeight = reference.viewBox.baseVal.height || 24;
  const weight = stroked ? Math.max(1, Math.min(3, parseFloat(style.strokeWidth) * 24 / viewHeight)) : profile.weight;
  // Filled stroke icons (e.g. a solid host icon family) get knocked-out pupils.
  // Filled SVG paths on X/LinkedIn encode outlines, so they retain open whites.
  draw(icon, stroked ? 'stroke' : profile.rendering, weight, stroked && painted(style.fill));
}
