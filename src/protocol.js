import { postRef } from './posts.js';
import { placementRef } from './web.js';
import emojis from './emoji.json' with { type: 'json' };

// Unicode's fully-qualified sequences include flags, ZWJ families, and skin tones.
const normalize = value => value.replaceAll('\uFE0F', '');
const canonical = new Map(emojis.map(item => [normalize(item.emoji), item.emoji]));
export const COMMIT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function emojiValue(value) {
  if (typeof value !== 'string' || value.length > 100) return null;
  return canonical.get(normalize(value.trim())) || null;
}
export function parseReaction(value) {
  if (!value || value.version !== 1) throw new Error('Invalid post reference.');
  const post = postRef(value.post || value.commit);
  if (value.emoji !== null && !emojiValue(value.emoji)) throw new Error('Choose one Unicode emoji.');
  if (value.moveFrom !== undefined && (post.platform !== 'web' || typeof value.moveFrom !== 'string' || !COMMIT_ID.test(value.moveFrom) || value.emoji === null || value.moveFrom === value.placement?.id)) throw new Error('Invalid reaction move.');
  return { ...(value.moveFrom ? { moveFrom: value.moveFrom.toLowerCase() } : {}), version: 1, commit: post.id, ...(value.post ? { post } : {}), ...(post.platform === 'web' ? { placement: placementRef(value.placement) } : {}), emoji: value.emoji === null ? null : emojiValue(value.emoji) };
}
export function summarize(document, actorId) {
  const groups = new Map();
  for (const [id, user] of Object.entries(document?.users || {})) {
    const emoji = emojiValue(user.emoji);
    if (!emoji) continue;
    if (!groups.has(emoji)) groups.set(emoji, { emoji, count: 0, mine: false, people: [] });
    const group = groups.get(emoji);
    group.count++;
    group.mine ||= id === String(actorId);
    if (typeof user.login === 'string') group.people.push(user.login);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}
