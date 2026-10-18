# reacji.to

A Chrome / Helium extension that adds a smiley beside the star on [dev-null.sh](https://dev-null.sh/) and under posts on X and LinkedIn. Search or paste any of 3,944 Unicode 17 emoji, including skin tones, flags, and families.

The picker has a **Public / Private** switcher. Public reactions live in `mrjf/dev-null-reactions`. Private reactions live in a private repository you own and choose after GitHub sign-in. Each post has one JSON file per repository: `data/<uuid>.json` for dev-null, `data/x/<id>.json` for X, and `data/linkedin/<activity-id>.json` for LinkedIn. Every change creates a Git commit directly; there are no reaction issues, GitHub Actions queues, or GitHub Pages.

## Deployment status

The Worker and public profile pages are deployed on reacji.to. Reaction writes still require the owner to install the GitHub App on the shared repo and supply its private key as a Worker secret. `/health` reports whether that key is present. The new extension is packaged locally; v0.1.0 is the older issue-queue release.

## Install and connect

1. Download and extract the extension ZIP from [Releases](https://github.com/mrjf/dev-null-reactions/releases).
2. Open `chrome://extensions` or `helium://extensions`, enable Developer mode, choose Load unpacked, and select the extracted folder. For local development, select `dist/` after building.
3. Open the extension settings and click **Connect GitHub**. Enter the displayed code at GitHub and authorize **dev-null reactions**.
4. For Private mode, choose **Choose repositories on GitHub** and install the app using **Only select repositories**. Select your private reactions repository. Alternatively, **Create a new private repo** opens GitHub’s repository form; select Private, create it, then install the app on that repo.
5. Return to extension settings, refresh the repository list, choose your private repo, and save. Only private repos personally owned by the connected GitHub account and available to the app are listed.
6. Reload dev-null, X, or LinkedIn. Open the smiley, select **Public** or **Private**, and choose an emoji.

All three sites use your GitHub identity. On dev-null, the extension checks the currently signed-in dev-null account before every write and private read. GitHub must be connected as the same account. Signed-out or mismatched accounts are blocked. Public counts can be read without connecting.

One reaction per account per post **in each mode**. Pick another emoji to replace it, or pick your current emoji again to remove it. Public and Private are separate stores: switching the picker does not move or erase an existing public reaction. The picker tells you when a separate public reaction remains. Git history preserves removed reactions.

Unpacked extensions do not auto-update. Replace the extension files and click Reload on the extensions page when installing a new release.

## How it works

```text
picker → fresh dev-null session check → GitHub identity comparison
                                      ↓
                         reacji.to Cloudflare Worker
                                      ↓
                    GitHub App installation token
                    restricted to one selected repo
                                      ↓
                 commit data/<post-uuid>.json directly
```

Public profiles at `https://reacji.to/YOUR_GITHUB_HANDLE` show current public reactions across all three sites, with platform filters and pagination. Profiles are keyed internally by numeric GitHub ID, so handle changes do not lose reactions. Public writes update both the post file and `profiles/<github-id>.json` in one atomic Git commit. Removal also removes the reaction from the current profile. Private writes never touch a public profile.

The Worker verifies the OAuth token against GitHub `/user`, resolves the dev-null username through GitHub, and compares stable numeric account IDs. It derives the stored actor from GitHub, never from an actor field in a submitted event. The shared repository is pinned by numeric repository ID. Private targets must be private, personally owned by that actor, and writable through the user’s GitHub App token. The same checks run on each request, so making a private repo public disables Private mode for that repo.

The GitHub App requests **Contents: read and write** and GitHub’s mandatory **Metadata: read**. It requests no Issues, Actions, Administration, or account permissions. Install it only on the reaction repositories you select. GitHub cannot restrict Contents permission to a folder or to commits alone: the Worker restricts all data writes to validated platform/post paths and the authenticated user’s public profile index. It never accepts an arbitrary path, branch, or commit author from a caller.

OAuth credentials represent the user; commits use a short-lived installation token restricted to exactly one repository and Contents write. The app’s private key is stored only as a Cloudflare Worker secret. It is never included in the extension. The Worker serializes changes per repository, uses SHA-conditional writes for private files and non-forced Git ref updates for atomic public post/profile changes, with bounded retries, and remembers completed request IDs for at least 24 hours. Same-value requests are no-ops. Rate limiting allows 30 writes per actor per repo per minute. Requests are not logged, and reaction data is stored in Git, not a separate database. The Durable Object stores only request timestamps and rate counters.

Public files are fetched directly from GitHub’s raw endpoint for visible posts, every 30 seconds while the tab is visible. Private files are read through the Worker with OAuth authorization and `no-store`; they never use the public raw endpoint or public counts. Private data is not persisted in extension storage and is cleared from the page when the tab is hidden. Ordinary `git clone` / `git pull` works for both repos with the appropriate GitHub credentials.

## Identity and privacy boundaries

- dev-null hides its numeric GitHub ID, so the extension reads the current session’s username from a fresh Inertia response and resolves that username through GitHub. When the session exposes a GitHub avatar URL, its embedded numeric ID must also match, preventing username reassignment from substituting an account. A GitHub rename not yet reflected by dev-null can block the check until dev-null syncs it.
- dev-null does not expose an authentication delegation API. The extension enforces the current site-session check; a separate backend cannot cryptographically prove that a supplied username came from that browser session. The Worker always independently verifies GitHub identity. No dev-null cookies or session credentials are sent to the Worker.
- OAuth tokens stay in extension-only storage, either for the session or across restarts if selected. They are sent only to GitHub and `https://reacji.to`. Disconnect clears local credentials; revoke the app authorization on GitHub to revoke them there too.
- Private means stored in a private GitHub repository. Repository collaborators, GitHub, and the app operator can access that repo; this is not end-to-end encryption. Private reactions are displayed only in the connected owner’s extension and never added to public counts.
- The app has no repository-creation permission. Creating a private repo uses GitHub’s own UI, followed by installing the app on that repo. Do not choose All repositories.
- Existing v0.1 releases used the retired issue queue. Use the new release once the Worker and app credentials are configured.

## Develop and deploy

Requires Node 24+ and npm.

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run package
npx wrangler deploy --dry-run
```

See [GitHub App and Worker setup](docs/github-app.md) for deployment. `src/config.js` contains public IDs and the service URL; no secrets belong in source. `wrangler.jsonc` configures the Worker and a SQLite Durable Object used to serialize commits. Private keys and `.dev.vars` are ignored by Git.

Tests mock external writes and use fabricated accounts. They cover OAuth polling/refresh, actual MV3 injection, session changes, mismatched accounts, private repository filtering, public/private separation, path restrictions, permission narrowing, conflict recovery, emoji search, keyboard behavior, and mobile layout. Tests use synthetic X/LinkedIn markup; those sites can change their DOM and may require adapter updates. No test submits a reaction on a real social post.

Independent project, not affiliated with dev-null, X, LinkedIn, or GitHub. MIT; Unicode data is covered by `THIRD_PARTY_NOTICES.md`.
