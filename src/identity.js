import { inertiaPage } from './following.js';
// Fetch the current server session, not a profile card or stale SPA DOM props.
export async function currentDevNullUser(fetcher = fetch) {
  let response = await fetcher('https://dev-null.sh/', { credentials: 'same-origin', cache: 'no-store',
    headers: { 'X-Inertia': 'true', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  // An Inertia asset-version change returns 409; read the fresh server page then.
  if (response.status === 409) response = await fetcher('https://dev-null.sh/', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Could not verify your dev-null session. Reload the page and sign in.');
  const json = (response.headers.get('content-type') || '').includes('application/json');
  let data;
  try { data = json ? await response.json() : inertiaPage(await response.text()); }
  catch { throw new Error('Could not verify your dev-null session. Reload the page and sign in.'); }
  const user = data?.props?.auth?.user;
  if (!user || !/^[a-z\d][a-z\d-]{0,38}$/i.test(user.username || '')) throw new Error('Sign in to dev-null before reacting.');
  const avatar = typeof user.avatar_url === 'string' ? user.avatar_url.match(/^https:\/\/avatars\.githubusercontent\.com\/u\/(\d+)(?:[?#]|$)/) : null;
  const githubId = avatar ? Number(avatar[1]) : null;
  return { username: user.username, ...(Number.isSafeInteger(githubId) ? { githubId } : {}) };
}
