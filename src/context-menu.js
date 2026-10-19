export async function placeFromMenu(info, tab, api = chrome) {
  if (info.menuItemId !== 'reacji-to-place' || !Number.isInteger(tab?.id)) return;
  const frameId = info.frameId || 0;
  const place = () => api.tabs.sendMessage(tab.id, { type: 'place-reaction' }, { frameId });
  try {
    const result = await place();
    if (result?.handled) return;
  } catch { /* Tabs open before installation or reload have no current listener. */ }
  try {
    // Repair only the clicked frame. The content script guards against duplicate
    // initialization if its normal document_idle injection raced this request.
    await api.scripting.executeScript({ target: { tabId: tab.id, frameIds: [frameId] }, files: ['content.js'] });
    if ((await place())?.handled) return;
  } catch { /* Restricted pages and withheld site access still need guidance. */ }
  await api.tabs.create({ url: api.runtime.getURL('placement-help.html') });
}
