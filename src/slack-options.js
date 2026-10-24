import { emojiValue } from './protocol.js';
import { slackName } from './slack.js';

export function initializeSlackOptions(send) {
  const $ = id => document.getElementById(id);
  let state = null, channels = [], emojis = [], rules = [];
  const report = (message, error = false) => { $('slack-status').textContent = message; $('slack-status').toggleAttribute('data-error', error); };
  const channelLabel = id => { const item = channels.find(c => c.id === id); return item ? `#${item.name}${item.private ? ' · private' : ''}${item.shared ? ' · shared externally' : ''}` : id; };
  function renderRules() {
    $('slack-rules').replaceChildren();
    $('slack-rules-empty').hidden = rules.length > 0;
    for (const [index, rule] of rules.entries()) {
      const row = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${slackName(rule.emoji) ? ':' + slackName(rule.emoji) + ':' : rule.emoji} → ${channelLabel(rule.channel)}`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary'; remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove rule ${label.textContent}`);
      remove.addEventListener('click', () => { rules.splice(index, 1); renderRules(); report('Rule removed. Save Slack settings to apply.'); });
      row.append(label, remove); $('slack-rules').append(row);
    }
  }
  function fillChannels() {
    for (const id of ['slack-channel', 'slack-rule-channel']) {
      $(id).replaceChildren();
      for (const channel of channels) $(id).append(new Option(channelLabel(channel.id), channel.id));
      $(id).disabled = true;
    }
    // Keep deleted/inaccessible destinations visible until the user repairs them.
    if (state.settings.channel && !channels.some(c => c.id === state.settings.channel)) $('slack-channel').append(new Option(`${state.settings.channel} · unavailable`, state.settings.channel));
    $('slack-channel').value = state.settings.channel || '';
  }
  async function busy(button, fn) {
    button.disabled = true;
    try { await fn(); } catch (error) { report(error.message, true); }
    finally { button.disabled = false; }
  }
  async function refresh() {
    report('Loading Slack connection…');
    state = await send({ type: 'slack-status' });
    $('slack-setup').hidden = !state.connected;
    $('slack-disconnect').hidden = !state.connected;
    $('slack-connect').textContent = state.connected ? 'Reconnect Slack' : 'Connect Slack';
    if (!state.connected) { report(state.available === false ? 'This Worker needs Slack app credentials. See the Slack setup guide.' : 'Connect Slack to import its emojis and authorize one posting channel.'); return; }
    const [catalog, list] = await Promise.all([send({ type: 'slack-emojis', refresh: true }), send({ type: 'slack-channels' })]);
    emojis = catalog.emojis; channels = list.channels;
    rules = state.settings.rules.map(rule => ({ ...rule }));
    fillChannels(); renderRules();
    $('slack-emoji-names').replaceChildren(...emojis.map(item => new Option(item.name, item.name)));
    $('slack-workspace').textContent = `${state.team.name} · ${emojis.length} custom emojis imported`;
    report('Connected. Posting is limited to the one channel authorized in Slack. Reconnect to change it.');
  }
  $('slack-connect').addEventListener('click', event => busy(event.currentTarget, async () => {
    report('Approve the connection in the Slack authorization window…');
    await send({ type: 'slack-connect' }); await refresh();
  }));
  $('slack-refresh').addEventListener('click', event => busy(event.currentTarget, refresh));
  $('slack-disconnect').addEventListener('click', event => busy(event.currentTarget, async () => {
    await send({ type: 'slack-disconnect' }); await refresh();
    report('Disconnected. Credentials, rules, and delivery records were deleted from this Worker. Existing Slack messages remain.');
  }));
  $('slack-rule-add').addEventListener('click', () => {
    const value = $('slack-rule-emoji').value.trim();
    const emoji = emojis.find(item => item.name === value || item.name === `:${value}:`)?.emoji || emojiValue(value);
    const channel = $('slack-rule-channel').value;
    if (!emoji || !channel) return report('Choose one emoji and a destination channel for the rule.', true);
    if (rules.some(rule => rule.emoji === emoji)) return report('Remove the existing rule for this emoji before adding a new one.', true);
    if (rules.length >= 100) return report('You can save up to 100 rules.', true);
    rules.push({ emoji, channel }); renderRules(); $('slack-rule-emoji').value = '';
    report('Rule added. Save Slack settings to apply.');
  });
  $('slack-save').addEventListener('click', event => busy(event.currentTarget, async () => {
    report('Saving…');
    const result = await send({ type: 'slack-settings', settings: { defaultDestination: 'github', channel: $('slack-channel').value, rules } });
    state.settings = result.settings; rules = result.settings.rules; renderRules();
    report('Saved. Reopen the picker on your page to load the new destinations.');
  }));
  addEventListener('reacji-backend-changed', () => {
    state = null; emojis = []; rules = []; $('slack-setup').hidden = true;
    refresh().catch(error => report(error.message, true));
  });
  refresh().catch(error => report(error.message, true));
}
