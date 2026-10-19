export async function placeFromMenu(info, tab, api = chrome) {
  if (info.menuItemId !== 'reacji-to-place' || !Number.isInteger(tab?.id)) return;
  try {
    const result = await api.tabs.sendMessage(tab.id, { type: 'place-reaction' }, { frameId: info.frameId || 0 });
    if (result?.handled) return;
  } catch { /* Tabs open before installation or reload have no current listener. */ }
  await api.tabs.create({ url: api.runtime.getURL('placement-help.html') });
}
