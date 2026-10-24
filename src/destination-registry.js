// The picker and runtime dispatch depend on capabilities, never provider names.
export function createDestinationRegistry(definitions) {
  const entries = definitions.map(item => Object.freeze({ kind: 'integration', capturesContext: true, catalogOnly: true, ...item }));
  const byId = new Map();
  for (const entry of entries) {
    if (!/^[a-z][a-z0-9-]*$/.test(entry.id) || !entry.label || byId.has(entry.id)) throw new Error('Invalid or duplicate destination.');
    byId.set(entry.id, entry);
  }
  const get = id => { if (!byId.has(id)) throw new Error('Choose a supported reaction destination.'); return byId.get(id); };
  const resolve = (id, emoji, context) => {
    const selected = get(id);
    if (selected.kind === 'integration' || !emoji) return id;
    return entries.find(item => item.matches?.(emoji, context))?.id || id;
  };
  return Object.freeze({ entries, get, has: id => byId.has(id), resolve,
    dataField: id => get(id).dataField || `${id}Data`,
    readType: id => get(id).readType || `${id}-read`,
    action(id, emoji, context) {
      const resolved = get(resolve(id, emoji, context));
      if (resolved.kind === 'integration') return resolved.describe?.(emoji, context) || { emoji, destination: resolved.id, name: resolved.label, description: resolved.description || '' };
      return entries.map(item => item.afterSave && item.describe?.(emoji, context)).find(Boolean) || null;
    },
  });
}

export function createDestinationDispatcher(registry, adapters) {
  return async (id, operation, context) => {
    registry.get(id);
    const handler = adapters[id]?.[operation];
    if (!handler) throw new Error(`${registry.get(id).label} does not support this action.`);
    return handler(context);
  };
}
