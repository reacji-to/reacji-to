# Keep the website and extension reaction UI in sync

`src/reaction-app.js` is the single implementation of the picker, reaction chips, page placement, drag behavior, and keyboard shortcut. `src/content.js` initializes it with the extension runtime. The reacji.to website at `../reacji-to-web` bundles this same engine with its browser-local runtime adapter.

For changes to reaction UI or any of its imports:

1. Change the shared engine here, never create a parallel website implementation.
2. In the website checkout run `npm run build:page-demo`, then `npm run check:shared` and the relevant browser tests. Refresh its tracked source snapshot and generated bundle in the same work session.
3. Run the extension build and relevant extension tests too. Do not report the work complete with only one surface updated.

Use the website's `npm run preview` for a live loopback preview; it watches this extension import graph. Its `AGENTS.md` documents the adapter boundaries and consistency checks. If the website checkout is unavailable, report the sync as incomplete rather than implying both surfaces are updated.

Page placement uses hold-down Option (Alt on Windows/Linux) plus click on both surfaces. Do not reintroduce a reaction context menu. Existing eyes buttons beside posts stay available.
