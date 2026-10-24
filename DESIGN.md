---
name: "reacji-to extension"
description: "A compact native reaction picker, page placement toolbar, and connection settings."
colors:
  settings-action: "#2e5ccb"
  picker-action: "#3b6fe0"
  page: "#f6f7f8"
  surface: "#fff"
  ink: "#121417"
  line: "#d3d7dd"
  dark-page: "#111112"
  dark-surface: "#18181a"
  dark-ink: "#ececec"
  dark-muted: "#a1a1a6"
  dark-line: "#39393e"
  muted: "#5b616b"
  wash: "#eef0f2"
  picker-line: "#e1e4e8"
  dark-action: "#94b5f9"
  dark-settings-wash: "#232326"
  dark-picker-surface: "#1f1f22"
  dark-picker-wash: "#2c2c30"
typography:
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-.025em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "15px"
    lineHeight: 1.6
  picker-body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.45
  picker-title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  count:
    fontFamily: "'Geist Mono', ui-monospace, monospace"
    fontSize: "12px"
    lineHeight: 1.4
  emoji:
    fontFamily: "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif"
    fontSize: "24px"
    lineHeight: 1.3
rounded:
  small: "4px"
  control: "6px"
  toast: "8px"
  picker: "12px"
spacing:
  tight: "2px"
  compact: "4px"
  control-gap: "8px"
  small: "12px"
  medium: "16px"
  page-mobile: "20px"
  page: "24px"
  section: "32px"
components:
  button-settings:
    backgroundColor: "{colors.settings-action}"
    textColor: "{colors.page}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  button-secondary:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 10px"
  select-audience:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px"
    width: "100%"
  chip-reaction:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "4px 6px"
  picker:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.picker}"
    width: "min(348px, calc(100vw - 24px))"
  placement-toolbar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "1px"
---

# Design System: reacji-to extension

## Overview

**Creative North Star: "A small sideways glance"**

The extension stays compact, readable, and close to the host site's native controls. Its approved photorealistic eyes provide a small expressive detail: glossy off-white oval eyeballs, vivid blue irises, black pupils, and a sideways gaze on transparency. The reacji-to wordmark accompanies the eyes in settings; the embedded trigger uses the small asset.

This document owns the extension picker, reaction chips, generic webpage placement toolbar, and connection settings. Website composition and public profile styling belong to `reacji-to/reacji-to-web` and its own `DESIGN.md`. This is an extraction of the established implementation, not a new visual direction. Sources are `src/content.css`, `src/content.js`, `src/options.css`, `src/options.html`, `src/options.js`, and `src/brand.js`. Reviewed evidence is `.impeccable/review/settings-desktop.png`, `.impeccable/review/settings-mobile.png`, and `artifacts/web-placement.png`; earlier picker and logo size captures remain in `artifacts/`.

**Key Characteristics:**

- Compact transparent blue-eyed identity.
- Native density, restrained type, neutral surfaces, and blue actions.
- One shared picker palette and automatic light/dark settings.
- Explicit Public / Private state and visible keyboard focus.
- Page placements attached beneath their target with a short stem.

## Colors

Blue marks actions; neutral surfaces, muted text, and fine rules provide structure. The logo's blue irises are raster artwork, not a new interface accent.

### Primary

**Settings action** colors connection controls and settings links. **Picker action** supplies the fallback for selected reactions, links, focus, and caret. Both map to **dark action** in their explicit dark palettes.

### Neutral

**Page**, **surface**, **ink**, **muted**, **line**, and **wash** are the settings palette. The picker uses the documented palette on every platform, independent of host CSS variables. Its dark surface and wash remain distinct from settings. Selected Public / Private segments use the picker action blue with surface-colored text; their surrounding border uses the shared picker line token. Native settings selects retain their `#8885` border.

**The Native Color Rule.** Preserve the picker's shared light/dark palette and existing blue actions; website lime does not recolor extension controls.

## Typography

Geist is requested with system-ui and sans-serif fallbacks; the extension does not bundle or load a webfont. Counts request Geist Mono, then system monospace. Emoji use platform color emoji fonts. The frontmatter records the actual independent settings and picker scales.

Settings titles reduce to (28px) on narrow screens. Settings subheadings are (19px), weight (600), introductory copy is (17px), and help copy is (13px). The wordmark is (24px), weight (650), tracking (-.03em). Picker footer text is (12px); scope notes are (11px), line height (1.45), opacity (.75). Counts use tabular numerals. The OAuth code uses system monospace at (26px), weight (600), tracking (.06em).

## Layout

Settings use a centered (650px) maximum-width main with (64px) top margin and (24px) side padding. At (500px) and below, top margin becomes (24px), side padding becomes (20px), and bottom padding becomes (32px). Sections have top rules, (24px) top padding, and (32px) separation. Action rows wrap; status messages and repository identifiers wrap anywhere.

The fixed picker is clamped within (12px) viewport gutters, opening above or below the trigger with a (6px) gap. It scrolls within the dynamic viewport minus (24px). The emoji browser has eight columns, (2px) gaps, and a (270px) scrolling height with sticky section headings at (13px), weight (600). Post reaction bars wrap inline. Toasts sit (16px) from the bottom and right viewport edges.

Generic page pins use absolute positioning centered on the saved click point within the resolved target, including for older saved placements. Pins sit outside the body so its positioning and transforms do not offset them. They follow their target during scrolling and layout changes, with (8px) horizontal viewport gutters. The toolbar caps at (240px) or viewport width minus (16px), with internal reaction scrolling capped at (84px). Unresolvable or zero-size targets hide their pins.

## Elevation & Depth

The interface is predominantly flat. Thin borders, background washes, and the browser popover layer establish hierarchy; picker, toolbar, and toast have no declared drop shadows. The selected Public / Private segment uses a solid blue fill without a shadow.

The picker enters over (.13s) with `cubic-bezier(.16,1,.3,1)`, translating upward from (3px) and fading from (.7) opacity. This runs only when reduced motion is not requested. Other hover treatments are immediate.

## Shapes

Controls and chips use the control radius; the close control and visibility segments use the smaller radius. Picker and toast retain their distinct larger radii. Fields and panel boundaries use (1px) strokes. Settings sections remain open and ruled.

The approved logo remains a transparent PNG with two tall glossy off-white oval eyeballs, vivid blue irises, black pupils, highlights, and a leftward gaze. Settings display it at (36 × 36px); the embedded trigger displays it at (16 × 16px). Preserve the asset's proportions and transparency, using the existing derivatives for small sizes. The trigger image has empty alt text because its button supplies the accessible label.

## Components

### Buttons and links

Settings primary buttons are blue; secondary buttons use wash. Both use the documented padding and reduce brightness to (.93) on hover. Disabled settings and picker buttons use (.55) opacity and a wait cursor. Picker footer actions are unfilled blue links that underline on hover. Focus outlines are (2px), offset (3px) in settings and (2px) in the picker, using the local action color.

### Reaction chips and page toolbar

Post reactions on X, LinkedIn, and dev-null appear in their own wrapping row below the native actions. Each pill combines a platform emoji and a count of distinct people. A blue border, pale blue fill, and darker blue count identify your selected emoji; unselected pills use a neutral fill. Clicking a pill adds or removes only that emoji. A smile-plus button at the end opens the same picker, and the eyes button remains in its (32 × 32px) native-action slot. The row disappears when its current destination has no reactions. Private reactions keep their accessible Private prefix, with no lock icon.

The native action row still divides into equal slots and centers icons independently of native counter widths. Reactions never occupy those slots or change their width. The dedicated row wraps with (6px) gaps, (32px) pill height, and (16px) radius; counts are (13px), weight (600). All three website examples use the same engine and layout.

Generic webpage placements retain a single reaction per person at each point, with their (40 × 40px) controls, editing picker, and drag behavior. Their eyes trigger is replaced by the selected reaction at that point.

### Picker and visibility switch

The picker starts with a compact strip of ten stroke icons: Frequently used followed by nine emoji categories. A blue underline marks the section currently in view; clicking a category scrolls to its heading. Below are the brand, a centered account label, and Settings, followed by exact **Public** / **Private** labels, the current reaction when present, search, and the eight-column emoji browser. Selected visibility is heavier with a solid blue fill; the selected category has a pale blue fill and blue underline. Switching does not move or erase the independent reaction in the other visibility mode. There are no add-emoji or skin-tone controls.

Frequently used opens first with sixteen choices, ranked by successful reaction count and then recency, with common emoji filling unused slots. Counts stay in extension-local storage or the website's browser-local adapter. Removing or moving a reaction does not increase its count. Browsing shows all labeled categories continuously. Search accepts words or a pasted emoji across every category; results initially show up to (96) choices and Show more adds (96). Arrow keys move through the grid, vertically by eight; Left/Right and Home/End navigate the category strip. Opening focuses search; Escape closes; Tab cycles enabled controls; closing returns focus to the trigger. Status and toast announcements use polite live regions.

### Audience and connection settings

The native full-width audience select offers exact **Everyone** and **People I follow on dev-null** labels. The adjacent help text states that the user's own reactions remain visible and public reactions remain public. Refresh following list is secondary; saving or refreshing reports status directly beneath the controls.

GitHub connection uses primary blue actions and secondary support actions. Device authorization reveals a selectable monospace code and wrapping action row. Private repository setup reveals only in the applicable connection state and keeps a native selector. Error text uses `light-dark(#b42318,#ff9898)`. Password-field CSS remains in the stylesheet, but no password input is rendered in current settings; do not manufacture one from that legacy rule.

### Slack workspace and picker destinations

Slack settings extend the same ruled sections, native full-width selectors, wrapping action rows, and light/dark palette. Connected state reveals the workspace, imported emoji count, default destination, and emoji rules. Rule rows pair a wrapping emoji-to-channel label with a secondary Remove button; additions and removals require Save Slack settings. Channel labels identify private and externally shared channels, and an unavailable saved destination remains visible. The optional Worker origin field sits inside a disclosure.

The picker has one **Public / Private / Slack / Raycast** destination row beneath the brand header. There is no separate Emoji/integration toolbar. All destinations come from a shared registry; integrations show their catalog and storage destinations show the standard emoji categories. Destination help wraps beneath that switch. Routed emoji carry a small blue dot; hover or keyboard focus reveals a **Goes to Slack** or **Goes to Raycast** explanation in the search area. Explicit integration selection takes precedence; Slack rules can redirect emojis chosen in Public or Private. Custom emoji images fit within (24 × 24px) in the picker and (18 × 18px) in reaction chips.

Evidence checked for this extension: `artifacts/slack-settings-1280.png`, `artifacts/slack-settings-390.png`, `artifacts/slack-settings-dark.png`, `artifacts/picker-slack-mobile.png`, and `artifacts/picker-raycast.png`, against `src/options.html`, `src/options.css`, `src/slack-options.js`, `src/reaction-app.js`, `src/content.css`, and `src/picker-actions.js`.

## Do's and Don'ts

### Do:

- **Do** preserve the transparent photorealistic blue-eyed asset and reacji-to wordmark.
- **Do** preserve the shared palette, native-sized controls, and visible keyboard focus.
- **Do** center page reactions on the clicked point within their target content, with horizontal viewport clamping.
- **Do** keep Public / Private and audience filtering visibly distinct.
- **Do** preserve dark-theme mappings and the reduced-motion condition on picker entry.

### Don't:

- **Don't** import website lime, oversized hero type, or marketing layouts into the extension.
- **Don't** imply that audience filtering changes a reaction's privacy.
- **Don't** imply that switching visibility moves or erases the other stored reaction.
- **Don't** assume Geist is bundled or replace platform emoji with a new icon set.


Eyes-drag selections appear as a short, scrollable quote in the picker and a yellow highlight on the saved page span. An unchecked **Include screenshot · saved privately** control sits below the destination explanation in the extension. Its spacing follows the 14px picker gutter. Screenshot capture is a per-reaction choice; the website trial omits this privileged capability. Backend selection is a separate Settings section shared by integrations and private attachments.

## Native social reaction eyes

Social action triggers use monochrome vector eyes, sized and colored from an unselected neighboring native icon. X uses a 20px filled-path outline (18px in its narrow website demo), LinkedIn a 16px filled-path outline with its heavier 1.5px optical weight, and dev-null a 16px round-stroked outline. Stroke-based host icons supply their stroke weight; filled stroke families use solid eyes with negative-space pupils. The 32px action slot stays fixed when a selected emoji replaces the eyes. Product branding and the placement cursor retain the photorealistic blue eyes.
