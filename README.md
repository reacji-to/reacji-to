# reacji.to

React anywhere on the web with any emoji, using your GitHub identity. Hold **Option** on Mac (**Alt** on Windows/Linux) to turn the pointer into blue eyes, then click page content to open the reaction picker. Release the key or press Escape to cancel. You can also right-click and choose **👀 reacji to this**, or use the eyes picker beside dev-null stars and immediately after the like button on X and LinkedIn.

Choose **Public / Private** in the picker. New reactions remember your last choice across pages and browser restarts; opening an existing reaction chip keeps its visibility. Public reactions appear on the page for other extension users and at `reacji.to/YOUR_GITHUB_HANDLE`. Private reactions live in a private GitHub repository you own. Settings let you see **Everyone** or **People I follow on dev-null**, always including your own reactions.

## Repositories

| Repository | Purpose |
| --- | --- |
| [reacji-to](https://github.com/reacji-to/reacji-to) | Chrome / Helium extension |
| [reacji-to-web](https://github.com/reacji-to/reacji-to-web) | Website and Cloudflare Worker |
| [reacji-to-data](https://github.com/reacji-to/reacji-to-data) | Public reaction files and profile indexes |

All three use the MIT license. The GitHub App gets Contents read/write and mandatory Metadata read on **only the data repository**. Private-mode users separately select their own private repo. No Issues queue, GitHub Pages, or repository-creation permission.

## Install and connect

For a complete walkthrough you can give to your agent, see [Set up reacji.to](SETUP.md).

1. Download and extract [the extension ZIP](https://github.com/reacji-to/reacji-to/releases/latest).
2. Open `chrome://extensions` or `helium://extensions`, enable Developer mode, choose **Load unpacked**, and select the extracted folder. For development, build and select `dist/`.
3. Open the extension settings and **Connect GitHub**. Enter the displayed code on GitHub and authorize **reacji-to**. No personal access token is needed.
4. For Private reactions, choose **Choose repositories on GitHub**, select **Only select repositories**, and install on your private reactions repo. **Create a new private repo** opens GitHub’s own creation form; choose Private, then install the app on it.
5. Refresh the repository list in extension settings, select your private repo, and save.
6. Reload your open webpages. Hold Option/Alt and click a location, select Public or Private, and choose an emoji.

The extension checks for new stable GitHub releases on startup and during use, at most every 12 hours. A toolbar ↑ badge and an **Update available** notice in settings link to the download. You can also use **Check for updates** in settings. Unpacked extensions cannot install updates themselves: replace their files, click Reload on the extensions page, and reload open webpages. Checks use public release metadata without your GitHub token. Browser settings pages, the extension store, and other browser-protected pages cannot host reactions.

## What is saved

- One JSON file per dev-null/X/LinkedIn post.
- One JSON file per webpage URL, identified by a SHA-256 hash. Each placement stores its DOM path, element type, relative position, and up to 160 characters of visible text. Form-field values are never captured.
- Public writes update the post/page and the account’s public profile index in one Git commit. Private writes never touch the public repo or profile.
- URL fragments used as SPA routes are preserved; ordinary section fragments and common tracking parameters are omitted. Meaningful query parameters remain part of the saved URL.

Placements resolve by element path and text. If that path changes, a unique matching excerpt can recover it. Ambiguous or missing targets stay hidden. Canvas internals, closed shadow roots, and content that changes completely cannot reliably be anchored. The extension checks visible pages every 30 seconds; the public dev-null following list is cached for five minutes.

One reaction per account per post or placement **in each visibility mode**. Pick another emoji to replace it, or pick your existing emoji to remove it. Public and Private are independent stores; changing the switch never migrates an existing reaction. Git history preserves removed reactions. The following filter controls what you see, not who can see your public reactions.

## Identity and privacy

OAuth credentials stay in extension-only storage and go only to GitHub and `https://reacji.to`. The Worker independently verifies GitHub identity and uses an installation token narrowed to a single repository for commits. The app private key stays in a Cloudflare secret.

On dev-null, the extension checks the current site session before writes and private reads. The GitHub account must match, using immutable IDs where exposed. The Worker independently verifies the GitHub account; it cannot cryptographically attest to a dev-null browser session without upstream support. No dev-null session cookies are sent to the Worker.

Private data is not persisted in extension storage, is cleared from the page when hidden, and never contributes to public counts. A private repository’s collaborators, GitHub, and the app operator can access it; this is not end-to-end encryption. A private repo made public is rejected for Private mode.

To place and redisplay reactions across the web, this version requests HTTP/HTTPS site access plus Storage and Context Menus. It reads page elements for placement; it does not transmit whole pages or form fields. The Worker never fetches arbitrary page URLs.

## Development

Node 24+:

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run package
```

`src/config.js` contains only public app/repository IDs. Tests use fabricated accounts and mocked writes. X/LinkedIn adapters are covered with synthetic markup; live-site changes may require updates.

The website keeps a versioned snapshot of the shared validation modules. After changes to the contract or branding, export it deliberately from a committed extension checkout:

```sh
node scripts/export-web-core.mjs ../reacji-to-web
```

Then run the website’s tests and deploy from that repository. Its `shared/ORIGIN.json` records the source commit and hashes. See [website setup](https://github.com/reacji-to/reacji-to-web/blob/main/docs/github-app.md).

## Activation status

The organization-owned app is installed on **only reacji-to/reacji-to-data** within the organization, and the Cloudflare secret is configured. Installation scope and token access are verified. Live public and private reaction commits have been verified through Helium, including persistence after reload and no public-data changes from a private save. Private-mode users separately install the app on their selected private reactions repository. The app must not be installed on the extension or website repos.

MIT. Unicode data has its own notice in `THIRD_PARTY_NOTICES.md`. Independent of dev-null, X, LinkedIn, and GitHub.
