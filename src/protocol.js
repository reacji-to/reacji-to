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
  if (!value || value.version !== 1 || !COMMIT_ID.test(value.commit)) throw new Error('Invalid commit reference.');
  if (value.emoji !== null && !emojiValue(value.emoji)) throw new Error('Choose one Unicode emoji.');
  return { version: 1, commit: value.commit.toLowerCase(), emoji: value.emoji === null ? null : emojiValue(value.emoji) };
}
export function parseIssue(issue) {
  if (issue.pull_request || issue.title !== '[reaction:v1]' || typeof issue.body !== 'string' || issue.body.length > 1000) return null;
  const reaction = parseReaction(JSON.parse(issue.body));
  if (!Number.isSafeInteger(issue.number) || !Number.isSafeInteger(issue.user?.id) || !/^[a-z\d-]{1,39}$/i.test(issue.user?.login)) throw new Error('Invalid GitHub actor.');
  return { ...reaction, issue: issue.number, actor: { id: issue.user.id, login: issue.user.login }, at: issue.created_at };
}
export function applyReaction(document, event) {
  const next = structuredClone(document || { version: 1, commit: event.commit, users: {} });
  const key = String(event.actor.id);
  if ((next.users[key]?.issue || 0) >= event.issue) return { document: next, changed: false };
  next.users[key] = { login: event.actor.login, emoji: event.emoji, issue: event.issue, at: event.at };
  return { document: next, changed: true };
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
