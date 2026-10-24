import { emojiValue } from './protocol.js';
import { validateEmojiAliases } from './emoji-aliases.js';

export function initializeEmojiAliasOptions(send) {
  const section = document.querySelector('#emoji-alias-section');
  const form = document.querySelector('#emoji-alias-form');
  const list = document.querySelector('#emoji-aliases');
  const empty = document.querySelector('#emoji-alias-empty');
  const status = document.querySelector('#emoji-alias-status');
  const name = document.querySelector('#emoji-alias-name');
  const emoji = document.querySelector('#emoji-alias-emoji');
  const save = document.querySelector('#emoji-alias-save');
  const cancel = document.querySelector('#emoji-alias-cancel');
  let aliases = [], editing = null, busy = false;
  const report = (message, error = false) => { status.textContent = message; status.toggleAttribute('data-error', error); };
  const lock = value => { busy = value; section.querySelectorAll('button,input').forEach(control => { control.disabled = value; }); };
  const reset = () => { editing = null; form.reset(); save.textContent = 'Add name'; cancel.hidden = true; };
  const control = (label, action) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'secondary'; button.textContent = label;
    button.addEventListener('click', action); return button;
  };
  async function persist(next, message) {
    if (busy) return false;
    lock(true); report('Saving…');
    try { aliases = (await send({ type: 'emoji-alias-save', aliases: next })).aliases; render(); report(message); return true; }
    catch (error) { render(); report(error.message, true); return false; }
    finally { lock(false); }
  }
  function render() {
    list.replaceChildren(); empty.hidden = aliases.length > 0;
    for (const alias of aliases) {
      const row = document.createElement('li');
      const value = document.createElement('span'); value.textContent = `${alias.emoji} ${alias.name}`;
      const actions = document.createElement('div'); actions.className = 'actions';
      actions.append(control('Edit', () => {
        editing = alias.name; name.value = alias.name; emoji.value = alias.emoji;
        save.textContent = 'Save name'; cancel.hidden = false; name.focus(); report(`Editing ${alias.name}.`);
      }), control('Remove', async () => {
        if (await persist(aliases.filter(item => item !== alias), 'Emoji name removed.') && editing === alias.name) reset();
      }));
      row.append(value, actions); list.append(row);
    }
    lock(busy);
  }
  cancel.addEventListener('click', () => { reset(); report('Edit canceled.'); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    try {
      const alias = { name: name.value, emoji: emojiValue(emoji.value) };
      const next = editing ? aliases.map(item => item.name === editing ? alias : item) : [...aliases, alias];
      validateEmojiAliases(next);
      if (await persist(next, 'Emoji name saved. Type it as soon as the picker opens.')) reset();
    } catch (error) { report(error.message, true); }
  });
  lock(true);
  send({ type: 'emoji-alias-list' }).then(result => { aliases = result.aliases || []; render(); lock(false); })
    .catch(error => { lock(false); report(`${error.message} Reload settings to try again.`, true); });
}
