import { emptyPost, postKey } from './posts.js';
import { updateReactionUser } from './protocol.js';

// Session-only receipts for a local integration. Moves and clears change the
// receipt without re-running the external action. Payloads never go to a server.
export function createLocalDestination({ id, storage, execute, validate, actor }) {
  const storageKey = `${id}Receipts`;
  const read = async ({ post }) => (await storage.get(storageKey))[storageKey]?.[postKey(post)] || emptyPost(post);
  return { read, async react({ post, event, message }) {
    const owner = await actor();
    if (event.emoji && event.operation !== 'remove' && !event.moveFrom && message.trackUsage !== false) await validate(event.emoji);
    const saved = (await storage.get(storageKey))[storageKey] || {};
    const before = saved[postKey(post)];
    const document = structuredClone(before || emptyPost(post));
    let users = document.users;
    if (event.placement) {
      document.placements ||= {};
      if (event.moveFrom) {
        if (!document.placements[event.moveFrom]?.users?.[owner.id] || document.placements[event.placement.id]) throw new Error('Your reaction changed. Reopen the picker.');
        delete document.placements[event.moveFrom];
      }
      document.placements[event.placement.id] ||= { anchor: event.placement, users: {} };
      users = document.placements[event.placement.id].users;
    }
    const next = updateReactionUser(users[owner.id], event, { login: owner.login });
    if (next) users[owner.id] = next; else delete users[owner.id];
    if (event.placement && !Object.keys(users).length) delete document.placements[event.placement.id];
    saved[postKey(post)] = document;
    // Bound local storage without allowing page data to crowd out preferences.
    while (Object.keys(saved).length > 500) delete saved[Object.keys(saved)[0]];
    await storage.set({ [storageKey]: saved });
    try {
      if (event.emoji && event.operation !== 'remove' && !event.moveFrom && message.trackUsage !== false) await execute(event.emoji, message.payload);
    } catch (error) {
      if (before) saved[postKey(post)] = before; else delete saved[postKey(post)];
      await storage.set({ [storageKey]: saved }); throw error;
    }
    return { actor: owner, document, destination: id, mode: 'local' };
  } };
}
