# /dev/null reactions

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
People reading dev-null.sh in Chrome or Helium who want to react with any emoji.

## Product Purpose
Add a smiley beside each commit's star, open an emoji picker, and share reactions with other extension users.

## Capabilities and Constraints
User requested commit-backed persistence and delegated repository architecture. Upstream posts are database records, not Git commits. The user explicitly rejected Pages: store one file per post in a public repository and fetch the committed data from GitHub.

Confirmed: public emoji reactions beside each post's star, visible to other extension users, with a Git commit for each change. Implementation choices: one reaction per GitHub account per commit; selecting the same emoji removes it; reaction changes are public, including their Git history. UI inherits dev-null's existing light/dark interface. No modification of upstream stars or replies.

## Stack
Delegated implementation: Manifest V3, bundled JavaScript/CSS, Unicode emoji data, GitHub Issues as authenticated event intake, GitHub Actions as the only repository writer, raw GitHub files for reads, a ZIP for installation.

## Authentication
The user requested OAuth via a GitHub App instead of requiring a pasted token. Use GitHub's device authorization flow and automatic refresh, with no embedded client secret and Issues write permission only. The site's own OAuth is not exposed to extensions. App registration is an external prerequisite; manual token and issue submission remain fallbacks.

## Revised architecture and privacy (2026-10-18)

User requires direct commits, no Issues queue. GitHub App Contents write only on selected repositories, mandatory Metadata read. A tiny Cloudflare Worker at reacji.to performs validated commits with installation credentials kept on the server. No local production service.

Picker switch labels must be exactly Public / Private. Public uses the shared repo; Private uses a private, personally owned GitHub repo chosen after OAuth, with an option to create a new repo in GitHub’s own UI. Every write/private read checks current dev-null session username against the OAuth account using numeric GitHub identity. The backend cannot independently attest to the site session without upstream support; do not claim it can.

Public and private records are separate and have separate counts. The picker must explicitly indicate if a separate public reaction remains when switching to Private. Never fall back to public submission on a private error. No raw public URLs or persistent storage for private documents.


## reacji.to expansion
Brand: reacji.to. Add the Public / Private picker under X and LinkedIn posts while retaining dev-null. Identity remains GitHub on every platform; dev-null additionally enforces matching signed-in accounts. Public profile /GITHUB_HANDLE lists current public reactions from all platforms. Private reactions never enter this profile. Preserve the existing restrained native interface; logo is a compact lime smiley with dark ink, readable at 16px. A public write atomically updates the one-per-post data file and one per-user profile index in a single commit.
