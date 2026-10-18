export function inertiaPage(html) {
  const script = html.match(/<script\b[^>]*\bdata-page="app"[^>]*>([\s\S]*?)<\/script>/i);
  if (!script) throw new Error('dev-null’s page format changed. Try again later.');
  return JSON.parse(script[1]);
}
export async function loadFollowing(login, fetcher = fetch) {
  if (!/^[a-z\d][a-z\d-]{0,38}$/i.test(login || '')) throw new Error('Connect GitHub to use your dev-null following list.');
  const path = `/@${login}/following`;
  let url = `https://dev-null.sh${path}`;
  const seen = new Set(), ids = new Set(), logins = new Set();
  while (url) {
    const next = new URL(url);
    if (next.origin !== 'https://dev-null.sh' || next.pathname.toLowerCase() !== path.toLowerCase() || seen.has(next.href) || seen.size >= 100) throw new Error('Could not finish loading your dev-null following list.');
    seen.add(next.href);
    const response = await fetcher(next.href, { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Your dev-null following list is unavailable. Check your GitHub handle has a dev-null profile.');
    const page = inertiaPage(await response.text());
    if (page.component !== 'user/connections' || page.props?.type !== 'following' || page.props?.user?.username?.toLowerCase() !== login.toLowerCase() || !Array.isArray(page.props?.users?.data)) throw new Error('Could not verify your dev-null following list.');
    for (const user of page.props.users.data) {
      const id = user.avatar_url?.match(/^https:\/\/avatars\.githubusercontent\.com\/u\/(\d+)(?:[?#]|$)/)?.[1];
      if (id) ids.add(id);
      else if (/^[a-z\d][a-z\d-]{0,38}$/i.test(user.username || '')) logins.add(user.username.toLowerCase());
    }
    url = page.props.users.next_page_url || null;
  }
  return { ids: [...ids], logins: [...logins] };
}
export function filterReactions(document, actor, audience, following = {}) {
  if (audience !== 'following') return document;
  const ids = new Set(following.ids || []), logins = new Set(following.logins || []);
  const keep = users => Object.fromEntries(Object.entries(users || {}).filter(([id,user]) => id === String(actor?.id) || ids.has(id) || logins.has(user.login?.toLowerCase())));
  return { ...document, users: keep(document.users), ...(document.placements ? { placements: Object.fromEntries(Object.entries(document.placements).map(([id,p]) => [id,{...p,users:keep(p.users)}])) } : {}) };
}
