import { initializeBackendOptions } from './backend-options.js';
import { initializeSlackOptions } from './slack-options.js';
import { initializeRaycastOptions } from './raycast-options.js';
import { initializeEmojiAliasOptions } from './emoji-alias-options.js';
const status = document.querySelector('#status');
const disconnect = document.querySelector('#disconnect');
const connect = document.querySelector('#oauth-connect');
const device = document.querySelector('#device');
const code = document.querySelector('#user-code');
const remember = document.querySelector('#remember');
let timer;
let pendingId = null;
const send = async message => {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || 'Could not reach the extension. Reload and try again.');
  return result.value;
};
initializeEmojiAliasOptions(send);
document.querySelector('#copy-agent-instructions').addEventListener('click', async () => {
  const message = document.querySelector('#agent-instructions').textContent;
  const output = document.querySelector('#agent-copy-status');
  try { await navigator.clipboard.writeText(message); output.textContent = 'Copied. Paste it to your agent.'; }
  catch { output.textContent = 'Select the instructions above and copy them, then paste them to your agent.'; }
});
function report(message, error = false) { status.textContent = message; status.toggleAttribute('data-error', error); }
function stopPolling() { clearTimeout(timer); pendingId = null; device.hidden = true; connect.disabled = false; }
function showPending(pending) {
  clearTimeout(timer); pendingId = pending.id;
  device.hidden = false; code.textContent = pending.userCode; connect.disabled = true;
  report('Waiting for you to approve on GitHub…');
  timer = setTimeout(() => poll(pending.id), Math.max(1000, pending.nextPollAt - Date.now()));
}
async function poll(id) {
  if (pendingId !== id) return;
  try {
    const result = await send({ type: 'oauth-poll', id });
    if (pendingId !== id) return;
    if (result.pending) showPending(result.pending);
    else { stopPolling(); await refresh(); }
  } catch (error) {
    if (pendingId !== id) return;
    report(error.message, true);
    try {
      const state = await send({ type: 'status' });
      if (pendingId !== id) return;
      if (state.pending?.id === id) timer = setTimeout(() => poll(id), Math.max(5000, state.pending.nextPollAt - Date.now()));
      else stopPolling();
    } catch { stopPolling(); }
  }
}
async function refresh() {
  try {
    const state = await send({ type: 'status' });
    document.querySelector('#private-setup').hidden = !state.connected;
    document.querySelector('#private-status').textContent = state.privateRepository ? `Backing up new local changes to ${state.privateRepository}.` : 'Choose a private repository to enable backup.';
    disconnect.hidden = !state.connected && !state.actor;
    connect.textContent = state.connected ? 'Reconnect GitHub' : 'Connect GitHub';
    if (state.pending) return showPending(state.pending);
    stopPolling();
    if (state.authError) return report(state.authError, true);
    report(state.connected ? `Connected as @${state.actor.login}. Private backup and identity-based integrations are available.`
      : state.oauthAvailable ? 'GitHub is optional. Connect it only for private backup or an identity-based integration.'
      : 'GitHub App registration is not finished for this build.');
    connect.disabled = !state.oauthAvailable;
  } catch (error) { report(error.message, true); }
}
connect.addEventListener('click', async () => {
  connect.disabled = true; report('Getting a sign-in code from GitHub…');
  try { showPending(await send({ type: 'oauth-start', remember: remember.checked })); }
  catch (error) { stopPolling(); report(error.message, true); }
});
document.querySelector('#open-github').addEventListener('click', () => send({ type: 'oauth-open' }).catch(error => report(error.message, true)));
document.querySelector('#copy-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(code.textContent); report('Code copied. Continue to GitHub to approve it.'); }
  catch { report('Select and copy the code above, then continue to GitHub.'); }
});
document.querySelector('#cancel').addEventListener('click', async () => {
  stopPolling();
  try { await send({ type: 'oauth-cancel' }); await refresh(); }
  catch (error) { report(error.message, true); }
});
disconnect.addEventListener('click', async () => {
  stopPolling();
  disconnect.hidden = true;
  document.querySelector('#private-setup').hidden = true;
  connect.textContent = 'Connect GitHub';
  report('Disconnecting…');
  try { await send({ type: 'disconnect' }); await refresh(); }
  catch (error) { report(error.message, true); }
});
refresh();

const privateStatus = document.querySelector('#private-status');
const repositorySelect = document.querySelector('#private-repository');
for (const action of ['private-create', 'private-install']) document.querySelector(`#${action}`).addEventListener('click', () => send({ type: action }).catch(error => { privateStatus.textContent = error.message; }));
document.querySelector('#private-refresh').addEventListener('click', async () => {
  privateStatus.textContent = 'Loading repositories…';
  try {
    const result = await send({ type: 'private-list' });
    repositorySelect.replaceChildren(new Option('Choose a repository', ''));
    for (const repo of result.repositories) repositorySelect.append(new Option(repo.name, repo.name));
    privateStatus.textContent = result.repositories.length ? 'Choose your repository and save.' : 'No eligible private repos. Create one or install the app on an existing private repo, then refresh.';
  } catch (error) { privateStatus.textContent = error.message; }
});
let repositoryVersion = 0, repositoryQueue = Promise.resolve();
document.querySelector('#private-save').addEventListener('click', () => {
  const repository = repositorySelect.value, version = ++repositoryVersion;
  if (!repository) { privateStatus.textContent = 'Choose a repository first.'; return; }
  privateStatus.textContent = `Using ${repository}. Checking access…`;
  repositoryQueue = repositoryQueue.catch(() => {}).then(async () => {
    try {
      const result = await send({ type: 'private-save', repository });
      if (version === repositoryVersion) { await refresh(); privateStatus.textContent = `Using ${result.repository}. New local changes will be backed up privately.`; }
    } catch (error) {
      if (version === repositoryVersion) { await refresh(); privateStatus.textContent = error.message; }
    }
  });
});


const updateCheck = document.querySelector('#update-check');
const updateStatus = document.querySelector('#update-status');
async function refreshUpdates(force = false) {
  updateCheck.disabled = true;
  updateStatus.textContent = 'Checking for updates…';
  try {
    const state = await send({ type: force ? 'updates-check' : 'updates-status' });
    document.querySelector('#update-version').textContent = `Installed version ${state.currentVersion}`;
    document.querySelector('#update-available').hidden = !state.available;
    document.querySelector('.updates-section').toggleAttribute('data-available', state.available);
    document.querySelector('#update-heading').textContent = `Update available · ${state.latestVersion}`;
    document.querySelector('#update-download').textContent = state.available ? `Download ${state.latestVersion} ↗` : 'View releases ↗';
    updateStatus.textContent = state.error || (state.available ? 'This unpacked extension needs a manual update.' : 'You’re up to date.');
  } catch {
    updateStatus.textContent = 'Could not check for updates. Try again later or open the releases page.';
  } finally { updateCheck.disabled = false; }
}
updateCheck.addEventListener('click', () => refreshUpdates(true));
refreshUpdates();

initializeRaycastOptions(send);

initializeSlackOptions(send);

initializeBackendOptions(send);
