export function initializeScreenshotOptions(send) {
  const permission = document.querySelector('#screenshot-permission'), status = document.querySelector('#screenshot-status'), list = document.querySelector('#screenshots');
  const refreshPermission = async () => { permission.textContent = await chrome.permissions.contains({ origins: ['<all_urls>'] }) ? 'Turn off screenshot access' : 'Enable screenshot access'; };
  permission.addEventListener('click', async () => {
    try {
      if (await chrome.permissions.contains({ origins: ['<all_urls>'] })) await chrome.permissions.remove({ origins: ['<all_urls>'] });
      else if (!await chrome.permissions.request({ origins: ['<all_urls>'] })) throw new Error('Screenshot access was not granted.');
      await refreshPermission(); status.textContent = 'Screenshot access updated. Each capture still requires selecting Include screenshot in the picker.';
    } catch (error) { status.textContent = error.message; }
  });
  const refresh = async () => {
    status.textContent = 'Loading private screenshots…';
    try {
      const result = await send({ type: 'attachments-list' });
      list.replaceChildren();
      for (const file of result.files.slice().reverse()) {
        const row = document.createElement('li'), name = document.createElement('span');
        name.textContent = `${new Date(file.capturedAt).toLocaleString()} · ${file.destination} · ${file.width} × ${file.height}`;
        const view = document.createElement('button'); view.type = 'button'; view.textContent = 'View'; view.className = 'secondary';
        view.addEventListener('click', async () => {
          view.disabled = true;
          try {
            const { data } = await send({ type: 'attachments-read', id: file.id });
            const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
            const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
            await chrome.tabs.create({ url }); setTimeout(() => URL.revokeObjectURL(url), 60000);
          } catch (error) { status.textContent = error.message; }
          finally { view.disabled = false; }
        });
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete'; remove.className = 'secondary';
        remove.addEventListener('click', async () => {
          remove.disabled = true;
          try { await send({ type: 'attachments-delete', id: file.id }); row.remove(); status.textContent = 'Screenshot deleted. Its old payload reference no longer resolves.'; }
          catch (error) { remove.disabled = false; status.textContent = error.message; }
        });
        row.append(name, view, remove); list.append(row);
      }
      status.textContent = result.files.length ? `${result.files.length} private screenshots.` : 'No saved screenshots on this backend.';
    } catch (error) { status.textContent = error.message; }
  };
  document.querySelector('#screenshots-refresh').addEventListener('click', refresh);
  addEventListener('reacji-backend-changed', () => { list.replaceChildren(); status.textContent = 'Backend changed. Load its screenshots to view them.'; });
  refreshPermission().catch(() => {});
}
