# Set up reacji.to with your agent

reacji.to puts one personal emoji reaction on any post or passage. Reactions are saved in the browser first. They are private and local by default.

Paste this to your agent:

> Use https://github.com/reacji-to/reacji-to/blob/main/SETUP.md to install or update reacji.to, set up my emoji labels, and configure any private backup or emoji actions I ask for. Reuse my current setup, make the changes for me where possible, and verify them in my browser.

## Agent instructions

Complete the requested setup. Inspect the current extension and settings before changing anything. Let the user handle passwords, two-factor authentication, and authorization screens that require their interaction. Never ask them to paste credentials into chat.

### Install or update the extension

1. Reuse a working reacji.to installation in the user's normal Chrome or Helium profile. Do not install a duplicate.
2. If it is missing, download `reacji-to.zip` from the [latest release](https://github.com/reacji-to/reacji-to/releases/latest), extract it into a permanent folder, and load that folder from the browser's extensions page with Developer mode enabled.
3. Reload pages that were open before installation.
4. Verify that holding **Option** on macOS or **Alt** on Windows/Linux shows the eyes cursor. Clicking a post or passage must open a focused emoji search field.

### Create useful emoji labels

The user can type a familiar label such as `design` and choose its designated emoji. Labels stay in browser storage with the rest of the local configuration.

When the user asks for a new label or category:

1. Ask what the label should mean only when the intended workflow is unclear.
2. Choose or confirm one canonical emoji for it. Examples: `design` → 🎨, `read` → 📚, `question` → ❓, `ship` → 🚀.
3. Open **Settings → Emoji labels** and save the label with that emoji. Add a small number of useful synonyms only when they refer to the same concept.
4. Keep one emoji consistent across the user's related category and automation. If `design` is 🎨, use 🎨 for its Raycast or other action too.
5. Verify the result: open the eyes picker, type the label immediately, confirm the autocomplete result, press Return, and check that the reaction appears.

Do not create a separate Raycast category. Raycast is an optional action attached to a specific emoji under **Settings → Raycast emoji actions**. When asked to add one, obtain the command deeplink, attach it to the user's chosen emoji, and verify both the local reaction and the command launch.

### Optional private backup

Local storage is the source of truth. A browser profile can be lost, so encourage the user to back up reactions to a dedicated private GitHub repository if they want durable history across machines.

Recommended setup:

1. Create or reuse a dedicated private repository such as `USER/reacji-to-backup`. Do not repurpose an unrelated repository.
2. Connect GitHub in extension settings.
3. Give the existing reacji.to GitHub App access to only that repository. It needs repository contents read/write and GitHub's required metadata read permission.
4. Select the repository under **Private backup** and save it.
5. Add and remove a test reaction, then verify the corresponding private repository updates.

A backup failure must not remove the local reaction. Fix access and retry with another local change. The backup contains page URLs, target locations, and short visible excerpts, so keep the repository private.

### Optional emoji actions

An emoji can trigger a local Raycast command or a configured Slack action. Configure actions on the specific emoji the user already recognizes; do not turn the service name into a picker category. Test the action from the picker and confirm that the local reaction still saves.

Slack support is experimental and is not part of the public extension release yet.

## Using reacji.to

- Hold **Option** or **Alt** and click page content, or click the eyes icon next to a supported post.
- Start typing as soon as the picker opens. Search accepts emoji, Unicode names, and personal labels.
- Choose a different emoji to replace the reaction. Choose the current emoji again to remove it.
- Click **?** in the picker to open the agent instructions in settings.

Each browser profile keeps its own local reactions and labels. Use a private backup when the user wants recovery or multiple-machine history.
