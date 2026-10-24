export const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function attachmentRef(value) {
  let backend;
  try { backend = new URL(value?.backend); } catch { throw new Error('Invalid attachment backend.'); }
  if (backend.protocol !== 'https:' || backend.origin !== value.backend || backend.username || backend.password) throw new Error('Invalid attachment backend.');
  if (!uuid.test(value.id || '') || value.kind !== 'screenshot' || value.access !== 'private' || value.mediaType !== 'image/png'
    || !/^[a-z][a-z0-9-]{0,63}$/.test(value.destination || '')
    || !Number.isSafeInteger(value.bytes) || value.bytes < 24 || value.bytes > MAX_SCREENSHOT_BYTES
    || ![value.width, value.height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 16384)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.capturedAt || '') || !Number.isFinite(Date.parse(value.capturedAt))) throw new Error('Invalid private screenshot reference.');
  return { id: value.id, backend: backend.origin, destination: value.destination, kind: 'screenshot', access: 'private', mediaType: 'image/png',
    bytes: value.bytes, width: value.width, height: value.height, capturedAt: value.capturedAt };
}
export function screenshotData(data) {
  if (typeof data !== 'string' || data.length > Math.ceil(MAX_SCREENSHOT_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('Screenshot is too large or invalid.');
  let raw; try { raw = atob(data); } catch { throw new Error('Invalid screenshot encoding.'); }
  const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  if (bytes.length < 24 || bytes.length > MAX_SCREENSHOT_BYTES || ![137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)
    || String.fromCharCode(...bytes.slice(12,16)) !== 'IHDR') throw new Error('Expected a PNG screenshot under 4 MB.');
  const view = new DataView(bytes.buffer), width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width > 16384 || height > 16384) throw new Error('Invalid screenshot dimensions.');
  return { bytes, width, height };
}
