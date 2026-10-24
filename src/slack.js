// Workspace-qualified identifiers prevent two workspaces' :foo: from colliding.
export const slackEmoji = value => typeof value === 'string' && /^slack:T[A-Z0-9]+:[a-zA-Z0-9_+\-]{1,100}$/.test(value) ? value : null;
export const slackName = value => slackEmoji(value)?.split(':')[2] || null;
export const channelId = value => typeof value === 'string' && /^[CG][A-Z0-9]{1,30}$/.test(value);
export function reactionRoute(settings, emoji, visibility = 'public') {
  const rule = settings?.rules?.find(rule => rule.emoji === emoji);
  if (rule) return { destination: 'slack', channel: rule.channel };
  if (visibility === 'slack' || slackEmoji(emoji)) return { destination: 'slack', channel: settings?.channel || '' };
  return { destination: 'github' };
}
export function serviceOrigin(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Use an HTTPS Worker origin, or HTTP on localhost.');
  }
  return url.origin;
}
