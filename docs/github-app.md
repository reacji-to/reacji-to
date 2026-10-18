# GitHub App and Cloudflare setup

App: [dev-null reactions](https://github.com/apps/dev-null-reactions), ID `5371073`, public OAuth client ID `Iv23lifzBvEPtqh2a727`.

Registration: public app, device flow enabled, expiring user tokens enabled, webhooks disabled. Only Contents read/write and mandatory Metadata read. No client secret is needed for the device authorization or refresh flow. The app’s RSA private key is required by the Worker to mint installation tokens.

Install on the shared repository `mrjf/dev-null-reactions` using **Only select repositories**. Each user who wants Private reactions separately installs the app on a private repository they personally own and selects it in extension settings. The extension lists only private, owned, writable repos from the user’s app installations. Creating a new repo happens on GitHub; the app does not request repository creation or administration permission.

OAuth user tokens may cover the user’s selected installations because the owner can have both a shared public and a private repo. Each **installation token used for a commit** is further narrowed to a single numeric repository ID and Contents write. An ordinary participant does not gain direct write access to the shared public repo; the Worker performs validated writes as the app.

## Worker

`wrangler.jsonc` targets the existing Cloudflare account and deploys the `reacji` Worker. The final service hostname is `reacji.to`.

```sh
npx wrangler whoami
npx wrangler deploy --dry-run
npx wrangler secret put GITHUB_APP_PRIVATE_KEY < /absolute/path/to/app-private-key.pem
npx wrangler deploy
```

Never commit the PEM or put it in an extension build. `GITHUB_APP_ID` is a public variable. Check `https://reacji.to/health`; `configured: true` means the secret is present, not that a real commit has been verified.

The custom domain must be an active Cloudflare zone before adding `{"pattern":"reacji.to","custom_domain":true}` to Worker routes. Preserve existing DNS records when changing nameservers at Namecheap. Use Cloudflare’s assigned nameservers for this specific zone.

## Runtime

- `/v1/react`: authenticated POST with versioned event, `public`/`private`, platform/post reference, dev-null session username when applicable, selected repo (private only), and a UUID request ID.
- `/v1/private/read`: authenticated POST; checks identity, ownership, privacy, and access each time. No cache.
- `/v1/private/validate`: authenticated POST to validate the selected repo during onboarding.
- `/<github-handle>`: public-only reaction profile, with source filters and pagination.
- `/health`: read-only configuration status.

All repository paths and branches are chosen by server code. Credentials are never logged or returned. The Durable Object stores request timestamps and rate counters, not tokens or reaction documents. Git remains the source of truth.

Public and Private are independent scopes; a switch is not a migration. Moving an already-public reaction cannot erase its Git history. The extension does not imply otherwise.
