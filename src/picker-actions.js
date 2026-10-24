// One destination selector owns filtering. This helper only renders its catalog
// and the hover/focus description in the search field's space.
export function installPickerActions({ controls, search, grid, makeEmoji, registry, selected, context, currentEmoji = () => null, openSettings }) {
  const node = (tag, className, text) => {
    const el = document.createElement(tag); el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  let hovered = null, focused = null;
  const hint = node('div', 'action-hint'); hint.hidden = true;
  hint.setAttribute('role', 'status'); hint.setAttribute('aria-live', 'polite');
  const heading = node('strong', 'action-hint-heading'), description = node('span', 'action-hint-description');
  hint.append(heading, description); controls.append(hint);
  const describe = action => currentEmoji(action.emoji) === action.emoji ? 'Your current reaction. Click to clear; no action runs.' : action.description || action.name || '';
  const actionFor = emoji => emoji ? registry.action(selected(), emoji, context()) : null;
  function updateHint() {
    const action = actionFor(hovered || focused);
    hint.hidden = !action; search.classList.toggle('search-obscured', Boolean(action));
    if (action) {
      heading.textContent = `Goes to ${registry.get(action.destination).label}`;
      description.textContent = describe(action); description.title = description.textContent;
    }
  }
  const clear = () => { hovered = focused = null; updateHint(); };
  for (const event of ['focus', 'input']) search.addEventListener(event, clear);
  controls.addEventListener('pointerenter', clear);
  return {
    reset: clear,
    decorate(button, item) {
      const action = actionFor(item.emoji);
      if (action) button.setAttribute('aria-description', `Goes to ${registry.get(action.destination).label}. ${describe(action)}`);
      button.addEventListener('pointerenter', () => { hovered = item.emoji; updateHint(); });
      button.addEventListener('pointerleave', () => { hovered = null; updateHint(); });
      button.addEventListener('focus', () => { focused = item.emoji; updateHint(); });
      button.addEventListener('blur', () => { focused = null; updateHint(); });
    },
    render(query, limit) {
      const destination = registry.get(selected());
      grid.classList.toggle('action-grid', destination.catalogOnly);
      if (!destination.catalogOnly) return false;
      clear(); grid.replaceChildren();
      const items = destination.catalog?.(context()) || [];
      const matches = items.filter(item => !query || `${item.name} ${item.description || ''} ${item.emoji}`.toLowerCase().includes(query));
      const section = node('section', 'emoji-section'); section.setAttribute('aria-label', destination.label);
      section.append(node('h3', 'category-heading', destination.label));
      const choices = node('div', 'emoji-choices');
      choices.append(...matches.slice(0, limit).map(makeEmoji)); section.append(choices);
      if (!matches.length) {
        section.append(node('p', 'empty', query ? 'No matching actions. Try another search.' : `No ${destination.label} actions yet. Add an emoji action in Settings.`));
        if (!query) {
          const settings = node('button', 'more', 'Open settings'); settings.type = 'button';
          settings.addEventListener('click', event => { if (event.isTrusted) openSettings(); }); section.append(settings);
        }
      }
      grid.append(section);
      return { remaining: Math.max(0, matches.length - limit) };
    },
  };
}
