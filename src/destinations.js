import { createDestinationRegistry } from './destination-registry.js';
import { reactionRoute, slackName } from './slack.js';

const slackAction = (emoji, context) => {
  const settings = context.state.slack?.settings;
  const route = reactionRoute(settings, emoji, 'slack');
  const rule = settings?.rules?.find(item => item.emoji === emoji);
  const name = rule?.channelName || (route.channel === settings?.channel ? settings?.channelName : '');
  const channel = name ? `#${name}` : route.channel;
  return { emoji, destination: 'slack', name: context.emojiName(emoji), description: context.state.slack?.connected && channel
    ? `Posts this emoji, link and context in ${channel}.` : 'Connect Slack and choose a destination channel in Settings.' };
};

// Provider-specific contracts live here. Adding an integration means registering
// a descriptor and its runtime adapter, not editing the shared picker/controller.
export const destinations = createDestinationRegistry([
  { id: 'local', label: 'Local', kind: 'storage', dataField: 'localData', readType: 'local-read', capturesContext: true, catalogOnly: false,
    requiresIdentity: false, loadWhen: () => true, description: '' },
  // Private GitHub storage is an optional backup target. It is deliberately not
  // exposed as a picker mode: local storage remains authoritative and usable
  // without an account or network connection.
  { id: 'private', label: 'Private backup', remoteRead: '/v1/private/read', kind: 'storage', readType: 'private-read', capturesContext: true,
    requiresIdentity: true, selectable: false, readable: false, loadWhen: () => false, description: 'Backed up to your private GitHub repository.' },
  { id: 'slack', label: 'Slack', remoteRead: '/v1/slack/read', opaqueRead: true, requiresIdentity: true, selectable: false,
    catalogMessage: 'slack-emojis', catalogKey: 'emojis',
    loadWhen: state => state.connected && state.slack?.connected,
    matches: (emoji, context) => reactionRoute(context.state.slack?.settings, emoji, 'local').destination === 'slack',
    describe: slackAction,
    catalog: context => {
      if (!context.state.slack?.connected) return [];
      const catalog = context.catalogs.slack || [];
      const values = new Set([...(context.state.slack?.settings?.rules || []).map(rule => rule.emoji), ...catalog.map(item => item.emoji), ...context.unicode.map(item => item.emoji)]);
      return [...values].map(emoji => ({ ...slackAction(emoji, context), ...catalog.find(item => item.emoji === emoji) }));
    },
    emojiName: value => slackName(value) ? `:${slackName(value)}:` : null,
    imageOrigins: ['https://emoji.slack-edge.com', 'https://a.slack-edge.com'],
    description: 'Posts to your authorized Slack channel. Clearing a marker leaves the Slack message in place.' },
  { id: 'raycast', label: 'Raycast', requiresIdentity: false, local: true, afterSave: true, selectable: false, readable: false,
    catalogMessage: 'raycast-catalog', catalogKey: 'actions', loadWhen: () => true,
    catalog: context => context.catalogs.raycast || [],
    describe: (emoji, context) => (context.catalogs.raycast || []).find(item => item.emoji === emoji) || null,
    description: 'Runs the mapped command on this computer. No GitHub or Slack write.' },
]);
