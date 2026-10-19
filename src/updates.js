import { SOURCE_REPOSITORY } from './config.js';

export const RELEASES_URL = `https://github.com/${SOURCE_REPOSITORY}/releases/latest`;
const ENDPOINT = `https://api.github.com/repos/${SOURCE_REPOSITORY}/releases/latest`;
const CACHE_KEY = 'releaseUpdate';
const CHECK_INTERVAL = 12 * 60 * 60 * 1000;
const ERROR_INTERVAL = 60 * 60 * 1000;
const MANUAL_INTERVAL = 60 * 1000;

function versionParts(value) {
  if (typeof value !== 'string' || !/^\d{1,5}(?:\.\d{1,5}){0,3}$/.test(value)) return null;
  const parts = value.split('.').map(Number);
  return parts.every(part => part <= 65535) ? [...parts, ...Array(4 - parts.length).fill(0)] : null;
}
export function isNewerVersion(candidate, installed) {
  const a = versionParts(candidate), b = versionParts(installed);
  if (!a || !b) return false;
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export function createUpdateChecker({ storage, currentVersion, fetchImpl = fetch, now = Date.now, onState = async () => {} }) {
  let pending;
  function state(saved = {}) {
    const latestVersion = versionParts(saved.latestVersion) ? saved.latestVersion : null;
    return { currentVersion, latestVersion, available: isNewerVersion(latestVersion, currentVersion),
      checkedAt: saved.checkedAt || null, lastSuccessAt: saved.lastSuccessAt || null,
      error: saved.error || null, releasesUrl: RELEASES_URL };
  }
  async function run(force) {
    const saved = (await storage.get(CACHE_KEY))[CACHE_KEY] || {};
    const interval = force ? MANUAL_INTERVAL : saved.error ? ERROR_INTERVAL : CHECK_INTERVAL;
    const age = now() - saved.checkedAt;
    if (Number.isFinite(saved.checkedAt) && age >= 0 && age < interval) {
      const result = state(saved); await onState(result); return result;
    }
    let next;
    try {
      // Public release metadata only: never send the user's GitHub token or cookies.
      const response = await fetchImpl(ENDPOINT, { credentials: 'omit', cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Release check failed');
      const release = await response.json();
      const latestVersion = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : '';
      if (release.draft || release.prerelease || !versionParts(latestVersion)) throw new Error('Invalid stable release');
      const checkedAt = now();
      next = { latestVersion, checkedAt, lastSuccessAt: checkedAt, error: null };
    } catch {
      next = { latestVersion: saved.latestVersion, lastSuccessAt: saved.lastSuccessAt,
        checkedAt: now(), error: 'Could not check for updates. Try again later or open the releases page.' };
    }
    await storage.set({ [CACHE_KEY]: next });
    const result = state(next); await onState(result); return result;
  }
  return { check({ force = false } = {}) {
    if (!pending) pending = run(force).finally(() => { pending = null; });
    return pending;
  } };
}
