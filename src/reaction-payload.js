import { attachmentRef } from './attachments.js';
import { postRef } from './posts.js';
import { placementRef } from './web.js';

// Provider-neutral wire contract. Screenshot bytes are stored separately; only
// scoped attachment references belong in a delivery payload.
export function reactionPayload({ url, title = '', quote = '', event, destination, attachments = [] }) {
  const source = new URL(url);
  if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password || source.href.length > 8192) throw new Error('Choose an ordinary webpage.');
  if (!/^[a-z][a-z0-9-]*$/.test(destination)) throw new Error('Invalid destination.');
  if (!Array.isArray(attachments) || attachments.length > 1) throw new Error('Attach at most one screenshot.');
  const files = attachments.map(attachmentRef);
  if (files.some(file => file.destination !== destination)) throw new Error('Attachment destination mismatch.');
  const placement = event.placement ? placementRef(event.placement) : null;
  const anchor = placement && (({ selection, ...rest }) => rest)(placement);
  return {
    version: 1, id: crypto.randomUUID(), occurredAt: new Date().toISOString(),
    source: { url: source.href, title: String(title).slice(0, 200) },
    target: { post: postRef(event.post || event.commit), ...(anchor ? { placement: anchor } : {}) },
    reaction: { emoji: event.emoji, destination, operation: event.moveFrom ? 'move' : event.operation || (event.emoji === null ? 'remove' : 'set') },
    context: { quote: String(quote).slice(0, 1500), ...(placement?.selection ? { selection: placement.selection } : {}) },
    attachments: files,
  };
}
