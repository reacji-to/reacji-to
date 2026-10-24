# reacji.to

React anywhere on the web with one personal emoji. Hold **Option** on macOS or **Alt** on Windows/Linux, click a post or passage, and type immediately to find an emoji. The reaction is private and stored in the browser by default.

## What it does

- Adds a native-looking eyes control to supported feeds and an eyes cursor to ordinary webpages.
- Keeps one local reaction per target and restores it when you return.
- Lets you give emoji personal names such as `design` → 🎨.
- Can attach a Raycast command to a specific emoji without adding a Raycast picker category.
- Can optionally copy local changes to a private GitHub repository.
- Keeps the in-progress Slack integration on its separate development branch until it is ready to ship.

Open extension settings, then copy the **Paste this to your agent** instruction for installation, labels, backup, and actions. The picker’s **?** button opens the same help.

See [SETUP.md](SETUP.md) for the agent-guided setup flow.

## Development

```sh
npm install
npm test
npm run build
npm run test:e2e
```

Load the repository root as an unpacked Chromium extension during development. `npm run build` writes a distributable copy to `dist/`.

The public website lives in the sibling `reacji-to-web` repository. Its demo imports the shared picker from this repository; after picker changes, run the website's `npm run build:page-demo` and commit the regenerated snapshot.

## Privacy

Local reactions, labels, and settings remain in the selected browser profile. An optional private GitHub backup includes the page URL, the selected target, and a short visible excerpt. Raycast and Slack actions send the action payload to the service the user configured.

License: MIT. Emoji data carries its own notices in `THIRD_PARTY_NOTICES.md`.
