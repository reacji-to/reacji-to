# reacji-to extension

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Chrome and Helium users who want to react to posts and page content using their GitHub identity.

## Purpose
Hold Option/Alt to turn the pointer into the blue eyes, then click ordinary webpage content to open the reaction picker. Also provide the small eyes picker beside dev-null stars and immediately after the like button on X/LinkedIn.

## Behavior
The picker has exact Public / Private labels. Public reactions are shared and appear at reacji.to/GITHUB_HANDLE. Private reactions live in a personally owned private GitHub repository selected after GitHub device OAuth. Each reaction change is a direct Git commit. Public and Private are independent stores, and removed reactions remain in Git history.

The viewer can choose Everyone or People I follow on dev-null; their own reactions remain visible. This display filter does not make public reactions private.

Webpage reactions save a URL and DOM placement with a short visible excerpt and relative position. Recover moved elements only when a confident match exists. Do not collect form-field values. Pages restricted by the browser are unsupported.

## Identity and architecture
GitHub OAuth identifies the user on every site. dev-null additionally checks the fresh signed-in site account before writes/private reads. A Cloudflare Worker verifies GitHub identity, validates paths, and commits with a token limited to one repo. The app requires Contents write and mandatory Metadata read, no Issues/Admin scopes.

Three MIT repositories: reacji-to/reacji-to contains this extension; reacji-to/reacji-to-web contains the website and Worker; reacji-to/reacji-to-data contains public reaction JSON and profile indexes. GitHub App access is only to the data repository and each user's explicitly selected private repo. No GitHub Pages or local production backend.

## Brand and design
Name: reacji-to. Domain: reacji.to. Logo: photorealistic emoji-shaped eyes looking sideways, vivid blue irises, black pupils, glossy white sclera, transparent background. Preserve the compact native picker and light/dark behavior. The website is maintained separately and uses a larger, playful version of this identity.
