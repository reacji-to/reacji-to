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
  { id: 'public', label: 'Public', kind: 'storage', dataField: 'data', readType: 'read', capturesContext: false, catalogOnly: false,
    requiresIdentity: true, loadWhen: () => true, description: 'Saved publicly in GitHub.' },
  { id: 'private', label: 'Private', remoteRead: '/v1/private/read', kind: 'storage', readType: 'private-read', capturesContext: false, catalogOnly: false,
    requiresIdentity: true, loadWhen: state => state.connected && state.privateRepository, description: 'Saved in your private GitHub repository.' },
  { id: 'slack', label: 'Slack', remoteRead: '/v1/slack/read', opaqueRead: true, requiresIdentity: true, catalogMessage: 'slack-emojis', catalogKey: 'emojis',
    loadWhen: state => state.connected && state.slack?.connected,
    matches: (emoji, context) => reactionRoute(context.state.slack?.settings, emoji, 'public').destination === 'slack',
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
  { id: 'raycast', label: 'Raycast', requiresIdentity: false, local: true, afterSave: true,
    catalogMessage: 'raycast-catalog', catalogKey: 'actions', loadWhen: () => true,
    catalog: context => context.catalogs.raycast || [],
    describe: (emoji, context) => (context.catalogs.raycast || []).find(item => item.emoji === emoji) || null,
    description: 'Runs the mapped command on this computer. No GitHub or Slack write.' },
]);
