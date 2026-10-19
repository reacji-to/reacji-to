import { emojiValue } from './protocol.js';

const defaults = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '🙌', '💯', '✅', '🚀', '🙏', '💙', '👏', '🤔', '✨', '😊'];

export function normalizeUsage(usage) {
  const seen = new Set();
  return (Array.isArray(usage) ? usage : []).filter(item => {
    if (!item || !emojiValue(item.emoji) || !Number.isSafeInteger(item.count) || item.count < 1 || !Number.isFinite(item.lastUsed) || seen.has(item.emoji)) return false;
    seen.add(item.emoji);
    return true;
  }).sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed).slice(0, 64);
}

export function recordEmojiUse(usage, emoji, now = Date.now()) {
  const items = normalizeUsage(usage);
  if (!emojiValue(emoji)) return items;
  const previous = items.find(item => item.emoji === emoji);
  return normalizeUsage([{ emoji, count: Math.min((previous?.count || 0) + 1, Number.MAX_SAFE_INTEGER), lastUsed: now }, ...items.filter(item => item.emoji !== emoji)]);
}

export function frequentEmojis(usage) {
  return [...new Set([...normalizeUsage(usage).map(item => item.emoji), ...defaults])].slice(0, 16);
}
