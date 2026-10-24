import { emojiValue } from './protocol.js';

export const EMOJI_ALIAS_LIMIT = 64;

export function normalizeEmojiAliasName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ').toLowerCase();
  return /^[a-z0-9][a-z0-9 _-]{0,39}$/.test(name) ? name : null;
}

export function validateEmojiAliases(value) {
  if (!Array.isArray(value) || value.length > EMOJI_ALIAS_LIMIT) throw new Error(`Save up to ${EMOJI_ALIAS_LIMIT} emoji names.`);
  const names = new Set();
  return value.map(item => {
    const name = normalizeEmojiAliasName(item?.name);
    if (!name) throw new Error('Use 1–40 letters, numbers, spaces, hyphens, or underscores for each emoji name.');
    if (names.has(name)) throw new Error(`“${name}” is already assigned.`);
    names.add(name);
    const emoji = emojiValue(item?.emoji);
    if (!emoji || emoji.startsWith('slack:')) throw new Error('Choose one Unicode emoji for each name.');
    return { name, emoji };
  });
}

export function aliasesByEmoji(value) {
  const aliases = validateEmojiAliases(value);
  const result = new Map();
  for (const { name, emoji } of aliases) result.set(emoji, [...(result.get(emoji) || []), name]);
  return result;
}

export function emojiSearchResults(items, aliases, query) {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) return items;
  const byEmoji = aliasesByEmoji(aliases);
  return items.map((item, index) => {
    const names = byEmoji.get(item.emoji) || [];
    const exact = names.indexOf(normalized);
    const prefix = names.findIndex(name => name.startsWith(normalized));
    const alias = exact >= 0 ? names[exact] : prefix >= 0 ? names[prefix] : names.find(name => name.includes(normalized));
    const native = `${item.name} ${item.group || ''}`.toLowerCase().includes(normalized);
    if (!alias && !native) return null;
    return { ...item, ...(alias ? { alias } : {}), rank: exact >= 0 ? 0 : prefix >= 0 ? 1 : alias ? 2 : 3, index };
  }).filter(Boolean).sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ rank, index, ...item }) => item);
}
