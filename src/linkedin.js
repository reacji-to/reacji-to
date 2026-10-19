// LinkedIn's SDUI comment-tools key contains a protobuf activity/UGC reference.
// Decode only the observed schemas; UGC IDs need canonical activity resolution.
export function linkedInPostUrn(key) {
  const encoded = key?.match(/^([A-Za-z0-9_+/=-]+)-replaceableCommentTools/)?.[1];
  if (!encoded || encoded.length > 40) return null;
  try {
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    if (![10, 18].includes(bytes[0]) || bytes[1] !== bytes.length - 2 || bytes[2] !== 8 || bytes.length < 4 || bytes.length > 13) return null;
    let value = 0n;
    for (let i = 3; i < bytes.length; i++) {
      const byte = bytes[i];
      if ((i < bytes.length - 1) !== Boolean(byte & 128)) return null;
      value |= BigInt(byte & 127) << BigInt((i - 3) * 7);
    }
    if (value & 1n) return null;
    const id = (value >> 1n).toString();
    return /^[1-9]\d{5,19}$/.test(id) ? `urn:li:${bytes[0] === 10 ? 'activity' : 'ugcPost'}:${id}` : null;
  } catch { return null; }
}

export function createLinkedInResolver(fetcher = fetch) {
  const cache = new Map();
  return async urn => {
    if (!/^urn:li:ugcPost:[1-9]\d{5,19}$/.test(urn || '')) throw new Error('Invalid LinkedIn post.');
    if (cache.get(urn)?.until > Date.now()) return cache.get(urn).promise;
    const entry = { until: Date.now() + 60000 };
    entry.promise = (async () => {
      const response = await fetcher(`https://www.linkedin.com/embed/feed/update/${urn}`, {
        credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('LinkedIn post is unavailable.');
      const html = await response.text();
      // The canonical link identifies the outer post, even when it quotes another.
      const canonical = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i)?.[0];
      const id = canonical?.match(/\bhref=["']https:\/\/www\.linkedin\.com\/feed\/update\/urn:li:activity:([1-9]\d{5,24})\/?["']/)?.[1];
      if (!id) throw new Error('LinkedIn post could not be identified.');
      entry.until = Date.now() + 86400000;
      return { id };
    })();
    cache.set(urn, entry);
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return entry.promise;
  };
}
