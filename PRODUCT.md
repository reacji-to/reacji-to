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
