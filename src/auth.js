const KEYS = ['token', 'actor', 'authMethod', 'expiresAt', 'refreshToken', 'refreshExpiresAt'];
const DEVICE_URL = 'https://github.com/login/device';
const messages = {
  access_denied: 'GitHub authorization was declined. You can connect again whenever you’re ready.',
  expired_token: 'That code expired. Click Connect GitHub to get a new code.',
  token_expired: 'That code expired. Click Connect GitHub to get a new code.',
  device_flow_disabled: 'Device flow is not enabled for this GitHub App. The app owner needs to enable it.',
  incorrect_client_credentials: 'The GitHub App configuration is invalid. Update the extension and try again.',
  bad_refresh_token: 'Your GitHub connection expired. Connect GitHub again.',
};

export function createAuth({ local, session, clientId, fetcher = fetch, now = Date.now, randomId = () => crypto.randomUUID() }) {
  let queue = Promise.resolve();
  const serial = operation => (...args) => {
    const result = queue.catch(() => {}).then(() => operation(...args));
    queue = result;
    return result;
  };
  const oauth = async (endpoint, body) => {
    const response = await fetcher(`https://github.com/login/${endpoint}`, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(), credentials: 'omit', signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`GitHub sign-in is unavailable (${response.status}). Try again shortly.`);
    return response.json();
  };
  const errorFor = code => new Error(messages[code] || 'GitHub could not complete sign-in. Try connecting again.');
  const clear = async () => { await local.remove(KEYS); await session.remove(KEYS); };
  const credentials = async () => {
    const temporary = await session.get(KEYS);
    if (temporary.token) return { value: temporary, area: session };
    return { value: await local.get(KEYS), area: local };
  };
  const user = async token => {
    const response = await fetcher('https://api.github.com/user', {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('GitHub could not verify your account. Connect again or check your token.');
    const data = await response.json();
    if (!Number.isSafeInteger(data.id) || typeof data.login !== 'string') throw new Error('GitHub returned an invalid account.');
    return { id: data.id, login: data.login };
  };
  const tokenFields = data => {
    if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('GitHub did not return an access token. Try connecting again.');
    return {
      token: data.access_token, authMethod: 'oauth',
      expiresAt: Number.isFinite(data.expires_in) ? now() + data.expires_in * 1000 : null,
      refreshToken: data.refresh_token || null,
      refreshExpiresAt: Number.isFinite(data.refresh_token_expires_in) ? now() + data.refresh_token_expires_in * 1000 : null,
    };
  };
  const accessToken = async () => {
    const { value, area } = await credentials();
    if (!value.token) return null;
    if (!value.expiresAt || value.expiresAt > now() + 60000) return value.token;
    if (!clientId || !value.refreshToken || (value.refreshExpiresAt && value.refreshExpiresAt <= now())) {
      throw new Error('Your GitHub connection expired. Connect GitHub again.');
    }
    const data = await oauth('oauth/access_token', { client_id: clientId, grant_type: 'refresh_token', refresh_token: value.refreshToken });
    if (data.error) throw errorFor(data.error);
    const next = tokenFields(data);
    // Device-flow refreshes require no client secret. Rotate both tokens together.
    await area.set({ ...next, actor: value.actor });
    return next.token;
  };
  const publicPending = pending => pending ? {
    id: pending.id, userCode: pending.userCode, verificationUrl: DEVICE_URL,
    expiresAt: pending.expiresAt, nextPollAt: pending.nextPollAt,
  } : null;
  const pending = async () => {
    const { oauthPending } = await session.get('oauthPending');
    if (oauthPending && oauthPending.expiresAt <= now()) { await session.remove('oauthPending'); return null; }
    return oauthPending || null;
  };
  return {
    accessToken: serial(accessToken),
    status: serial(async () => {
      let authError = null;
      try { await accessToken(); } catch (error) { authError = error.message; }
      const { value } = await credentials();
      return { connected: Boolean(value.token) && !authError, actor: value.actor || null,
        authMethod: value.authMethod || (value.token ? 'pat' : null), authError,
        oauthAvailable: Boolean(clientId), pending: publicPending(await pending()) };
    }),
    start: serial(async remember => {
      if (!clientId) throw new Error('GitHub App setup is not finished. Its public client ID must be configured before sign-in is available.');
      await session.remove('oauthPending');
      const data = await oauth('device/code', { client_id: clientId, scope: 'offline_access' });
      if (data.error) throw errorFor(data.error);
      if (typeof data.device_code !== 'string' || !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(data.user_code) || data.verification_uri !== DEVICE_URL || !(data.expires_in > 0)) {
        throw new Error('GitHub returned an invalid authorization code. Try again.');
      }
      const interval = Math.max(5, Number(data.interval) || 5) * 1000;
      const value = { id: randomId(), deviceCode: data.device_code, userCode: data.user_code,
        expiresAt: now() + data.expires_in * 1000, interval, nextPollAt: now() + interval, remember: Boolean(remember) };
      await session.set({ oauthPending: value });
      return publicPending(value);
    }),
    poll: serial(async id => {
      const value = await pending();
      if (!value || value.id !== id) throw new Error('Sign-in ended or the code expired. Click Connect GitHub to try again.');
      if (value.nextPollAt > now()) return { pending: publicPending(value) };
      // Persist the deadline before the request, including across worker restarts.
      value.nextPollAt = now() + value.interval;
      await session.set({ oauthPending: value });
      const data = await oauth('oauth/access_token', {
        client_id: clientId, device_code: value.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      });
      if (data.error === 'authorization_pending' || data.error === 'slow_down') {
        if (data.error === 'slow_down') value.interval = Math.max(value.interval + 5000, (Number(data.interval) || 0) * 1000);
        value.nextPollAt = now() + value.interval;
        await session.set({ oauthPending: value });
        return { pending: publicPending(value) };
      }
      if (data.error) { await session.remove('oauthPending'); throw errorFor(data.error); }
      const fields = tokenFields(data);
      const actor = await user(fields.token);
      await clear();
      await (value.remember ? local : session).set({ ...fields, actor });
      await session.remove('oauthPending');
      return { connected: true, actor };
    }),
    cancel: serial(async () => { await session.remove('oauthPending'); }),
    disconnect: serial(async () => { await clear(); await session.remove('oauthPending'); }),
  };
}
