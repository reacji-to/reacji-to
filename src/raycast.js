import { emojiValue } from './protocol.js';

const storageKey = 'raycastActions';
export function raycastDeeplink(value) {
  const invalid = () => { throw new Error('Paste a Raycast command deeplink from Raycast’s Copy Deeplink action.'); };
  if (typeof value !== 'string' || value.length > 8192 || /[\u0000-\u0020\u007f]/.test(value.trim())) return invalid();
  let url;
  try { url = new URL(value.trim()); } catch { return invalid(); }
  if (url.protocol !== 'raycast:' || url.username || url.password || url.port || url.hash) return invalid();
  const parts = url.pathname.split('/').slice(1);
  if (!['extensions', 'script-commands'].includes(url.hostname)
    || parts.length !== (url.hostname === 'extensions' ? 3 : 1)
    || parts.some(part => !part || !/^[a-zA-Z0-9._~%+-]+$/.test(part))) return invalid();
  return url.href;
}

export function validateRaycastActions(value) {
  if (!Array.isArray(value) || value.length > 32) throw new Error('Save up to 32 Raycast actions.');
  const seen = new Set();
  return value.map(action => {
    const emoji = emojiValue(action?.emoji);
    if (!emoji || emoji.startsWith('slack:')) throw new Error('Choose one Unicode emoji for each Raycast action.');
    if (seen.has(emoji)) throw new Error('Use each emoji only once. Edit its existing action to change the command.');
    seen.add(emoji);
    if (typeof action.name !== 'string' || !action.name.trim() || action.name.trim().length > 80) throw new Error('Name each Raycast action using 1–80 characters.');
    if (typeof action.enabled !== 'boolean') throw new Error('Choose whether each Raycast action is enabled.');
    if (action.description !== undefined && (typeof action.description !== 'string' || action.description.length > 180)) throw new Error('Keep the action description under 180 characters.');
    return { emoji, name: action.name.trim(), description: (action.description || '').trim(), deeplink: raycastDeeplink(action.deeplink), enabled: action.enabled };
  });
}

export function createRaycastActions({ storage, launch }) {
  const list = async () => validateRaycastActions((await storage.get(storageKey))[storageKey] ?? []);
  return {
    list,
    async validate(emoji) {
      const action = (await list()).find(item => item.enabled && item.emoji === emoji);
      if (!action) throw new Error('Map this emoji to an enabled Raycast action in Settings first.');
      return action;
    },
    async run(emoji, payload) {
      const action = await this.validate(emoji);
      const url = new URL(action.deeplink);
      // Raycast commands that consume LaunchContext receive the same versioned
      // payload as other integrations. Preserve existing command context.
      if (payload) {
        let context = {};
        try { context = JSON.parse(url.searchParams.get('context') || '{}'); } catch {}
        url.searchParams.set('context', JSON.stringify({ ...context, reacji: payload }));
      }
      await launch(url.href);
    },
    async catalog() {
      return (await list()).filter(action => action.enabled).map(({ emoji, name, description }) => ({ emoji, name, description, destination: 'raycast' }));
    },
    async save(actions) {
      const value = validateRaycastActions(actions);
      await storage.set({ [storageKey]: value });
      return value;
    },
    async test(emoji) {
      const action = (await list()).find(item => item.emoji === emojiValue(emoji));
      if (!action) throw new Error('Save this Raycast action before testing it.');
      await launch(action.deeplink);
      return {};
    },
    // Called only after a committed reaction. Never retry a command automatically.
    async afterReaction(event, trackUsage, payload) {
      if (!event.emoji || event.operation === 'remove' || event.moveFrom || trackUsage === false) return null;
      try {
        const action = (await list()).find(item => item.enabled && item.emoji === event.emoji);
        if (!action) return null;
        await this.run(event.emoji, payload);
        return { status: 'requested', name: action.name };
      } catch {
        return { status: 'failed', error: 'Reaction saved, but Raycast could not be opened. Check the action in extension settings.' };
      }
    },
  };
}
