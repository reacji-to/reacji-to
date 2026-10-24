export function initializeBackendOptions(send) {
  const input = document.querySelector('#service-url'), status = document.querySelector('#service-status'), button = document.querySelector('#service-save');
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const result = await send({ type: 'service-save', serviceUrl: input.value });
      input.value = result.serviceUrl;
      status.textContent = 'Worker selected. Connections and saved files on your previous backend stay there. Connect integrations on this instance before using them.';
      dispatchEvent(new Event('reacji-backend-changed'));
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
  send({ type: 'service-get' }).then(result => { input.value = result.serviceUrl; }).catch(error => { status.textContent = error.message; });
}
