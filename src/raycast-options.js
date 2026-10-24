import { emojiValue } from './protocol.js';
import { validateRaycastActions } from './raycast.js';

export function initializeRaycastOptions(send) {
  const section = document.querySelector('#raycast-section');
  const form = document.querySelector('#raycast-form');
  const list = document.querySelector('#raycast-actions');
  const status = document.querySelector('#raycast-status');
  const fields = Object.fromEntries(['emoji', 'name', 'description', 'deeplink'].map(key => [key, document.querySelector(`#raycast-${key}`)]));
  const cancel = document.querySelector('#raycast-cancel');
  const save = document.querySelector('#raycast-save');
  let actions = [], editing = null, busy = false;
  const report = (message, error = false) => { status.textContent = message; status.toggleAttribute('data-error', error); };
  const lock = value => { busy = value; section.querySelectorAll('button,input').forEach(control => { control.disabled = value; }); };
  const reset = () => { editing = null; form.reset(); cancel.hidden = true; save.textContent = 'Add action'; };
  const persist = async (next, message) => {
    if (busy) return false;
    lock(true); report('Saving…');
    try {
      actions = (await send({ type: 'raycast-save', actions: next })).actions;
      render(); report(message); return true;
    } catch (error) { render(); report(error.message, true); return false; }
    finally { lock(false); }
  };
  const button = (name, action) => {
    const control = document.createElement('button');
    control.type = 'button'; control.className = 'secondary'; control.textContent = name;
    control.addEventListener('click', action);
    return control;
  };
  function render() {
    list.replaceChildren();
    document.querySelector('#raycast-empty').hidden = actions.length > 0;
    for (const action of actions) {
      const row = document.createElement('li');
      const label = document.createElement('label'); label.className = 'checkbox';
      const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = action.enabled;
      enabled.setAttribute('aria-label', `Enable ${action.name}`);
      enabled.addEventListener('change', () => persist(actions.map(item => item === action ? { ...item, enabled: enabled.checked } : item), enabled.checked ? 'Action enabled.' : 'Action paused.'));
      label.append(enabled, document.createTextNode(`${action.emoji} ${action.name}`));
      const link = document.createElement('p'); link.className = 'help'; link.textContent = action.deeplink;
      const controls = document.createElement('div'); controls.className = 'actions';
      controls.append(button('Test action', async () => {
        if (busy) return;
        lock(true); report('Opening Raycast…');
        try { await send({ type: 'raycast-test', emoji: action.emoji }); report('Sent to Raycast. Complete any browser or Raycast prompt to run the command.'); }
        catch (error) { report(error.message, true); }
        finally { lock(false); }
      }), button('Edit', () => {
        editing = action.emoji;
        for (const key of Object.keys(fields)) fields[key].value = action[key] || '';
        cancel.hidden = false; save.textContent = 'Save action'; fields.emoji.focus();
        report(`Editing ${action.name}.`);
      }), button('Remove', async () => {
        if (await persist(actions.filter(item => item !== action), 'Action removed.')) {
          if (editing === action.emoji) reset();
        }
      }));
      row.append(label, link, controls); list.append(row);
    }
    lock(busy);
  }
  cancel.addEventListener('click', () => { reset(); report('Edit canceled.'); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    try {
      const action = { emoji: emojiValue(fields.emoji.value), name: fields.name.value, description: fields.description.value, deeplink: fields.deeplink.value,
        enabled: editing ? actions.find(item => item.emoji === editing)?.enabled ?? true : true };
      const next = editing ? actions.map(item => item.emoji === editing ? action : item) : [...actions, action];
      validateRaycastActions(next);
      if (await persist(next, 'Action saved. React with its emoji to run it.')) reset();
    } catch (error) { report(error.message, true); }
  });
  lock(true);
  send({ type: 'raycast-list' }).then(result => { actions = result.actions; render(); lock(false); })
    .catch(error => report(`${error.message} Reload settings to try again.`, true));
}
