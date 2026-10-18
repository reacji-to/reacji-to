import { REPOSITORY } from './config.js';
const status = document.querySelector('#status');
const disconnect = document.querySelector('#disconnect');
const form = document.querySelector('#connect');
const token = document.querySelector('#token');
document.querySelector('#repository').href = `https://github.com/${REPOSITORY}`;
const send = async message => {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || 'Could not reach the extension. Reload and try again.');
  return result.value;
};
function report(message, error = false) { status.textContent = message; status.toggleAttribute('data-error', error); }
async function refresh() {
  try {
    const state = await send({ type: 'status' });
    disconnect.hidden = !state.connected;
    report(state.connected ? `Connected as @${state.actor.login}. Ready for one-click reactions.` : 'Not connected. The token-free GitHub flow is available.');
  } catch (error) { report(error.message, true); }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const save = document.querySelector('#save'); save.disabled = true; report('Checking your GitHub account…');
  try {
    await send({ type: 'connect', token: token.value, remember: document.querySelector('#remember').checked });
    token.value = ''; await refresh();
  } catch (error) { report(error.message, true); }
  finally { save.disabled = false; }
});
disconnect.addEventListener('click', async () => {
  try { await send({ type: 'disconnect' }); token.value = ''; await refresh(); }
  catch (error) { report(error.message, true); }
});
refresh();
