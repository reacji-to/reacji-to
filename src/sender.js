// MessageSender.url stays at the document's initial URL after pushState/replaceState.
// The tab URL follows navigation, but only identifies the main frame.
export function senderPage(sender) {
  if (!sender.tab || !sender.url) return null;
  const initial = new URL(sender.url);
  if (sender.frameId !== 0 || !sender.tab.url) return initial;
  const current = new URL(sender.tab.url);
  if (current.origin !== initial.origin) throw new Error('Reaction target does not match this page.');
  return current;
}
