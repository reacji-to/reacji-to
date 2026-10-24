# reacji.to

React anywhere on the web with any emoji, using your GitHub identity. Hold **Option** on Mac (**Alt** on Windows/Linux) to turn the pointer into blue eyes, then click page content to open the reaction picker. Release the key or press Escape to cancel. You can also use the eyes picker beside dev-null stars and immediately after the like button on X and LinkedIn.

Choose **Public / Private / Slack / Raycast** in the picker’s single destination row. New reactions remember your last choice across pages and browser restarts; opening an existing reaction chip keeps its visibility. Public reactions appear on the page for other extension users and at `reacji.to/YOUR_GITHUB_HANDLE`. Private reactions live in a private GitHub repository you own. Settings let you see **Everyone** or **People I follow on dev-null**, always including your own reactions.

## Multiple reactions on posts

On X, LinkedIn, and dev-null, add as many different emoji as you like. Reactions appear in a dedicated row below the native actions, with a count for each emoji and blue highlighting on yours. Click one to toggle only that emoji; use the smile-plus button or the eyes to add another. Public and Private sets stay separate. Webpage point placements keep their existing single-reaction editing and drag behavior.

Deploy the updated website Worker before releasing this extension: post mutations now include explicit `add` or `remove` operations. Existing single-emoji records remain readable, and new records retain the scalar `emoji` field alongside their `emojis` array for older readers.

## Slack destinations

Connect Slack in extension settings to import your workspace’s custom emojis and aliases. Choose a default channel, or add rules such as `:foo:` → `#foobar`. Slack-routed reactions post the link and captured context, then add a real native Slack reaction as your connected Slack user. They bypass GitHub commits and Raycast actions. Existing Slack automations can respond when their filters match.

The picker keeps Slack reactions separate from Public and Private GitHub reactions, shows Slack actions in their own section, and previews the destination on hover or keyboard focus. The shared Cloudflare Worker hosts everyone’s isolated connections by default. A personal Worker is optional; select its HTTPS origin in settings. Each account currently connects one Slack workspace at a time.

See [Slack app setup, tenant isolation, and personal deployment](https://github.com/reacji-to/reacji-to-web/blob/main/docs/slack.md). Slack and the chosen Worker operator can access delivered content; this is not end-to-end encryption. Existing messages and automation effects remain when you clear a reaction or disconnect. Live use requires Slack app credentials and deployment of the updated Worker.

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
6. **Mirror my public reactions to this private repo** is on by default. Public saves also copy your public reactions for that post/page to `public/data/` in the selected repo, separate from private reactions in `data/`. You can turn mirroring off in settings.
7. Reload your open webpages. Hold Option/Alt and click a location, select Public or Private, and choose an emoji.

The extension checks for new stable GitHub releases on startup and during use, at most every 12 hours. A toolbar ↑ badge and an **Update available** notice in settings link to the download. You can also use **Check for updates** in settings. Unpacked extensions cannot install updates themselves: replace their files, click Reload on the extensions page, and reload open webpages. Checks use public release metadata without your GitHub token. Browser settings pages, the extension store, and other browser-protected pages cannot host reactions.

## Raycast actions

In extension settings, add a **Raycast action** with an emoji, a name, and a command’s **Copy Deeplink** URL from Raycast’s action panel. Choose **Raycast** and react with that emoji to run locally without a GitHub or Slack write. Without a screenshot, local execution does not require sign-in. Mapped emojis also request the command after a Public or Private reaction saves successfully. This works for Public and Private reactions, including changing to a mapped emoji. Removing, dragging, loading, or receiving someone else’s reaction never runs a command.

The picker has one **Public / Private / Slack / Raycast** row, with no extra top-level menu. Hover or keyboard-focus a mapped emoji to replace the search field with **Goes to Raycast** or **Goes to Slack** and its description. The search text returns unchanged when you leave. Add an optional description in Raycast settings; Slack descriptions show the destination channel and the known posting behavior. Explicit Slack or Raycast selection wins over automatic routing. In Public and Private, Slack rules route matched emojis before any after-save Raycast action.

Use **Test action** to launch the saved command directly, **Edit** to change it, or uncheck its enabled box to pause automatic launches. Each emoji maps to one command. Mappings stay in this browser’s extension storage and are not published or sent to GitHub. Deeplink arguments are preserved; the command receives the versioned URL, text-selection, and optional attachment payload in `LaunchContext.reacji`. The website’s local demo does not launch commands.

Raycast and the target command must be installed and enabled. The browser or Raycast may require confirmation. Sending a deeplink cannot confirm whether the command ran; rejected launches do not undo your saved reaction and are not automatically retried. Command and script-command deeplinks are supported. See [Raycast’s deeplink documentation](https://developers.raycast.com/information/lifecycle/deeplinks).

## URL, selection, and screenshots

Hold Option/Alt and drag the eyes across text to select and highlight a passage. The picker previews the selected text. Each integration receives the exact current URL, title, reaction destination, and selected span when present.

Select **Include screenshot** to save the visible viewport privately in your selected backend and include a file reference in the payload. Enable screenshot access in Settings first. Screenshots require a connected account even for local Raycast actions; they never go into public GitHub data or Slack messages. Settings lets you view and delete saved screenshots. Saving requires deployment of the updated Worker and its attachment binding.

See [the versioned payload and generic integration contract](PAYLOAD.md) for the schema, backend API, access rules, and adapter boundaries.

## What is saved

- One JSON file per dev-null/X/LinkedIn post.
- One JSON file per webpage URL, identified by a SHA-256 hash. Each placement stores its DOM path, element type, relative position, and up to 160 characters of visible text. Text extraction excludes form-field values. Eyes-drag selections also save the exact span and surrounding text; an optional screenshot captures all visible pixels, including visible form fields.
- Public writes update the post/page and the account’s public profile index in one Git commit. Private writes never touch the public repo or profile.
- With mirroring enabled and a private repo selected, a separate commit copies only your public reactions into `public/`. Edits, moves, and removals reconcile that post/page; a failed copy leaves the public save intact and shows an error. Check repository/app access, then make a public save on that post/page to retry. There is no background retry or historical backfill, and disabling mirroring leaves existing copies in place.
- URL fragments used as SPA routes are preserved; ordinary section fragments and common tracking parameters are omitted. Meaningful query parameters remain part of the saved URL.

Placements resolve by element path and text. If that path changes, a unique matching excerpt can recover it. Ambiguous or missing targets stay hidden. Canvas internals, closed shadow roots, and content that changes completely cannot reliably be anchored. The extension checks visible pages every 30 seconds; the public dev-null following list is cached for five minutes.

One reaction per account per post or placement **in each visibility mode**. Pick another emoji to replace it. To clear a webpage reaction, Option/Alt-click your emoji again, or open it and choose **Clear reaction**. Option/Alt-clicking the same page target also clears your existing reaction. Picking your existing emoji still removes it. Public and Private are independent stores; clearing affects only the selected mode, and changing the switch never migrates an existing reaction. Git history preserves removed reactions. The following filter controls what you see, not who can see your public reactions.

## Identity and privacy

For automation setup and the JSON layout, see the [agent setup walkthrough](SETUP.md#7-offer-automations-with-github-actions). Watch `data/**` for private reactions and `public/data/**` for your mirrored public reactions in your own repository.

GitHub OAuth credentials stay in extension-only storage and go only to GitHub and the Worker origin selected in settings (by default `https://reacji.to`). Slack credentials stay encrypted on that Worker and never enter content scripts. The Worker independently verifies GitHub identity and uses an installation token narrowed to a single repository for commits. The app private key stays in a Cloudflare secret.

On dev-null, the extension checks the current site session before writes and private reads. The GitHub account must match, using immutable IDs where exposed. The Worker independently verifies the GitHub account; it cannot cryptographically attest to a dev-null browser session without upstream support. No dev-null session cookies are sent to the Worker.

Private data is not persisted in extension storage, is cleared from the page when hidden, and never contributes to public counts. A private repository’s collaborators, GitHub, and the app operator can access it; this is not end-to-end encryption. A private repo made public is rejected for Private mode.

To place and redisplay reactions across the web, this version requests HTTP/HTTPS site access, Storage, and Identity for the Slack authorization window. The legacy Context Menus permission is retained only to remove the old menu from existing installations. It reads page elements for placement; text extraction does not transmit whole pages or form fields. Optional screenshot access is requested separately and captures visible pixels only when selected for a reaction. The Worker never fetches arbitrary page URLs.

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
