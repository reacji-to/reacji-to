# /dev/null reactions

A Chrome / Helium extension that puts a smiley next to the star on [dev-null.sh](https://dev-null.sh/). Search or paste any of the 3,944 Unicode 17 emoji, including skin tones, flags, and families. One reaction per GitHub account per post; choose a different emoji to replace it, or choose yours again to remove it.

Reactions are shared with other extension users. Each change becomes a Git commit. **No GitHub Pages, hosted database, or shared write token.**

## Install

1. Download `dev-null-reactions.zip` from [Releases](https://github.com/mrjf/dev-null-reactions/releases/latest), and extract it into a permanent folder.
2. Open `chrome://extensions` in Chrome, or `helium://extensions` in Helium.
3. Enable **Developer mode**, choose **Load unpacked**, and select the extracted folder containing `manifest.json`.
4. Reload dev-null.sh. The outlined smiley appears immediately after every star, including read-only star counts on your own posts.

For a local build, use the `dist/` folder instead. An unpacked extension does not auto-update: replace its files with a newer release and click **Reload** on the extensions page. Chrome Web Store publication would provide automatic updates; this project is not listed there.

## React

**Without a token:** pick an emoji, then click **Submit new issue** in the GitHub tab that opens. GitHub sign-in is required. The reaction is not submitted until that final click. Use **Remove my reaction** in the picker to submit a removal the same way.

**One-click reactions:** click the extension toolbar button, then connect a GitHub personal access token. For public participation in this shared repository, a classic token needs `public_repo`. This is a broad scope that also covers your other public repositories; the token-free flow is available if you prefer not to grant it. A fine-grained token works only when it can grant **Issues: write** for this repository (typically the owner/collaborators). No repository Contents permission is needed by extension users.

Tokens stay in extension-only session storage by default. The optional remember setting uses extension-only local storage. They are sent only to `api.github.com`; the website and content scripts cannot read them. Disconnect removes the saved token; revoke it in GitHub settings if you want to invalidate it there too.

## How the Git storage works

```text
smiley → emoji → authenticated GitHub issue
                        ↓
                 GitHub Actions
                        ↓
          commit data/<post-uuid>.json
                        ↓
           extension fetches raw file
```

An issue with the exact title `[reaction:v1]` contains a small versioned event:

```json
{"version":1,"commit":"01a14f9d-76a7-72d9-a92d-48ae9ea999cb","emoji":"👩🏾‍💻"}
```

Use `"emoji":null` to remove a reaction. The writer derives identity from **GitHub's issue author**, never from JSON supplied by the client. Stable numeric account IDs prevent a rename from creating a second vote. The commit is made by the workflow's GitHub identity; its message credits the submitting account and links the issue by number.

Each post that receives a reaction has exactly one data file:

```json
{
  "version": 1,
  "commit": "01a14f9d-76a7-72d9-a92d-48ae9ea999cb",
  "users": {
    "42": {
      "login": "example",
      "emoji": "👩🏾‍💻",
      "issue": 123,
      "at": "2026-10-18T20:00:00Z"
    }
  }
}
```

Removed reactions remain as `emoji: null` tombstones so retries and older events cannot bring them back. Different emoji are aggregated by the extension; no separate counter files are required.

The extension fetches `https://raw.githubusercontent.com/mrjf/dev-null-reactions/main/data/<post-uuid>.json` for visible posts, refreshing every 30 seconds while the tab is visible. It does not clone the repository or execute Git. You can also `git clone` or `git pull` the repository normally to inspect the same data locally.

The writer drains **all open submissions in issue order**, then closes each only after its commit succeeds. This handles GitHub's concurrency queue replacing a pending run without losing that run's reaction. A periodic recovery run catches stranded issues. SHA-conditional writes retry conflicts; repeated issue processing is idempotent. A reaction uses one Contents API write and therefore one Git commit.

## Limits and privacy

- GitHub Actions startup and GitHub's raw-file caches delay shared counts, often a minute or two and sometimes longer. A successful one-click submission is shown locally as queued; that is not confirmation that the writer has run. Its issue link is available in the notification.
- Reactions, GitHub account IDs, usernames, issues, and historical changes are public. Removal changes the current counts; it does not erase Git history or the submission issue.
- This extension's reactions are separate from dev-null's native stars and notifications. People without the extension will not see them. Authentication is through GitHub, so it does not require access to the site's cookies or login session.
- Unicode 17 is bundled, so the picker works without a CDN; glyph support depends on the operating system. Future Unicode additions require an extension update.
- GitHub API/Actions limits apply. Issue-per-change is intended for a small community, not a high-throughput service. Repository maintainers can moderate abusive submissions and restore files using Git. The writer validates UUID/emoji/actor format, but does not check whether a UUID is a real public dev-null post.
- DOM integration uses upstream's `data-commit`, `star-commit-button`, and `star-count-readonly` attributes. If the site changes these, the adapter may need updating. Inspected upstream commit: `00793d4ec8d945b27bfc5bd0db59647415280b0c`.

## Develop

Requires Node 24+ and npm.

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run package
```

`dist/` is loadable as an unpacked extension; `artifacts/dev-null-reactions.zip` is the distributable. Browser tests include the actual MV3 service worker, plus search, complex emoji, changes/removals, API errors, token-free submission, dynamic feed insertion, keyboard behavior, and a narrow dark viewport. Protocol/writer tests cover identity spoofing, idempotency, pagination, SHA conflicts, and crash recovery. Tests use fabricated accounts and make no public reaction submissions.

## Run your own repository

1. Create a public repository on a `main` branch with Issues and Actions enabled, and push this source.
2. Set `REPOSITORY` and `DATA_URL` in `src/config.js` to your repository. Rebuild and distribute that extension. All users of a build read/write the same configured repository.
3. Enable the **Record reactions** workflow. It uses the built-in `GITHUB_TOKEN` with Contents and Issues write permissions; no external secret is required. No Pages setup is involved.
4. Run **Record reactions → Run workflow** once to check installation. Subsequent reaction issues trigger it automatically. If an organization restricts workflow write permissions, allow these permissions before accepting submissions.

Deploy on a dedicated repository: public issue bodies are untrusted input, and the writer deliberately never executes them. The workflow always checks out trusted `main`, not submitted code, and never interpolates issue text into shell commands. Keep workflow changes restricted to maintainers.

## Reference

- [dev-null source](https://github.com/nunomaduro/dev-null.sh) — native “commits” are database posts; this extension supplies separate Git-backed reaction storage.
- [GitHub Issues API](https://docs.github.com/en/rest/issues/issues#create-an-issue)
- [GitHub Contents API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)
- [Chrome extension cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Helium Chromium-extension support](https://helium.computer/)

Independent project, not affiliated with /dev/null or GitHub. MIT; Unicode data has its own license in `THIRD_PARTY_NOTICES.md`.
