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
- Host-aware picker colors and automatic light/dark settings.
- Explicit Public / Private state and visible keyboard focus.
- Page placements attached beneath their target with a short stem.

## Colors

Blue marks actions; neutral surfaces, muted text, and fine rules provide structure. The logo's blue irises are raster artwork, not a new interface accent.

### Primary

**Settings action** colors connection controls and settings links. **Picker action** supplies the fallback for selected reactions, links, focus, and caret. Both map to **dark action** in their explicit dark palettes.

### Neutral

**Page**, **surface**, **ink**, **muted**, **line**, and **wash** are the settings palette. The picker inherits host `--popover`, `--foreground`, `--muted-foreground`, `--border`, `--accent`, and `--primary` values when supplied, with the documented picker fallbacks. Its dark surface and wash remain distinct from settings. Selected Public / Private segments use local translucent `#7772` fill; their surrounding border uses host `--border` with `#ddd` fallback. Native settings selects retain their `#8885` border.

**The Native Color Rule.** Preserve the picker's host-token inheritance and existing blue actions; website lime does not recolor extension controls.

## Typography

Geist is requested with system-ui and sans-serif fallbacks; the extension does not bundle or load a webfont. Counts request Geist Mono, then system monospace. Emoji use platform color emoji fonts. The frontmatter records the actual independent settings and picker scales.

Settings titles reduce to (28px) on narrow screens. Settings subheadings are (19px), weight (600), introductory copy is (17px), and help copy is (13px). The wordmark is (24px), weight (650), tracking (-.03em). Picker footer text is (12px); scope notes are (11px), line height (1.45), opacity (.75). Counts use tabular numerals. The OAuth code uses system monospace at (26px), weight (600), tracking (.06em).

## Layout

Settings use a centered (650px) maximum-width main with (64px) top margin and (24px) side padding. At (500px) and below, top margin becomes (24px), side padding becomes (20px), and bottom padding becomes (32px). Sections have top rules, (24px) top padding, and (32px) separation. Action rows wrap; status messages and repository identifiers wrap anywhere.

The fixed picker is clamped within (12px) viewport gutters, opening above or below the trigger with a (6px) gap. It scrolls within the dynamic viewport minus (24px). The emoji grid has eight columns, (2px) gaps, and a (222px) maximum scrolling height. Post reaction bars wrap inline. Toasts sit (16px) from the bottom and right viewport edges.

Generic page pins use an absolute toolbar placed (8px) below the resolved target, centered on the saved horizontal point. The toolbar clamps to (8px) horizontal viewport gutters and flips above the target when the viewport bottom is tight and there is room above. A (7px) line stem points toward the target; its horizontal position follows the saved point within the toolbar. The toolbar caps at (240px) or viewport width minus (16px), with internal reaction scrolling capped at (84px). Unresolvable or zero-size targets hide their pins. This is the reviewed placement behavior, not a full vertical clamping guarantee for every target geometry.

## Elevation & Depth

The interface is predominantly flat. Thin borders, background washes, and the browser popover layer establish hierarchy; picker, toolbar, and toast have no declared drop shadows. Only the selected Public / Private segment has a small structural shadow (`0 1px 2px #0001`).

The picker enters over (.13s) with `cubic-bezier(.16,1,.3,1)`, translating upward from (3px) and fading from (.7) opacity. This runs only when reduced motion is not requested. Other hover treatments are immediate.

## Shapes

Controls and chips use the control radius; the close control and visibility segments use the smaller radius. Picker and toast retain their distinct larger radii. Fields and panel boundaries use (1px) strokes. Settings sections remain open and ruled.

The approved logo remains a transparent PNG with two tall glossy off-white oval eyeballs, vivid blue irises, black pupils, highlights, and a leftward gaze. Settings display it at (36 × 36px); the embedded trigger displays it at (16 × 16px). Preserve the asset's proportions and transparency, using the existing derivatives for small sizes. The trigger image has empty alt text because its button supplies the accessible label.

## Components

### Buttons and links

Settings primary buttons are blue; secondary buttons use wash. Both use the documented padding and reduce brightness to (.93) on hover. Disabled settings and picker buttons use (.55) opacity and a wait cursor. Picker footer actions are unfilled blue links that underline on hover. Focus outlines are (2px), offset (3px) in settings and (2px) in the picker, using the local action color.

### Reaction chips and page toolbar

Chips combine a platform emoji with a small tabular count, minimum height (28px). Hover adds wash and stronger ink. The user's selected reaction uses `aria-pressed="true"`, action-colored text, and wash. Private chips include a lock prefix. The generic page toolbar encloses these same compact controls and the eyes trigger; it is not a large content card. The picker includes a wrap-safe target hostname and excerpt for webpage placements.

### Picker and visibility switch

The picker contains a title and close control, exact **Public** / **Private** labels, a scope note, search, native category select, eight-column emoji grid, and status/action footer. Selected visibility is heavier and lightly filled. Switching does not move or erase the independent reaction in the other visibility mode.

Search accepts words or a pasted emoji. Results initially show up to (96) choices; Show more adds (96). Arrow keys move through the grid, vertically by eight. Opening focuses search; Escape closes; Tab cycles enabled controls; closing returns focus to the trigger. Status and toast announcements use polite live regions. Keep search in the extension picker; the separate homepage's removal of its profile lookup field does not remove this control.

### Audience and connection settings

The native full-width audience select offers exact **Everyone** and **People I follow on dev-null** labels. The adjacent help text states that the user's own reactions remain visible and public reactions remain public. Refresh following list is secondary; saving or refreshing reports status directly beneath the controls.

GitHub connection uses primary blue actions and secondary support actions. Device authorization reveals a selectable monospace code and wrapping action row. Private repository setup reveals only in the applicable connection state and keeps a native selector. Error text uses `light-dark(#b42318,#ff9898)`. Password-field CSS remains in the stylesheet, but no password input is rendered in current settings; do not manufacture one from that legacy rule.

## Do's and Don'ts

### Do:

- **Do** preserve the transparent photorealistic blue-eyed asset and reacji-to wordmark.
- **Do** preserve host color inheritance, native-sized controls, and visible keyboard focus.
- **Do** keep page toolbars outside their target content, with the stem and horizontal viewport clamping.
- **Do** keep Public / Private and audience filtering visibly distinct.
- **Do** preserve dark-theme mappings and the reduced-motion condition on picker entry.

### Don't:

- **Don't** import website lime, oversized hero type, or marketing layouts into the extension.
- **Don't** imply that audience filtering changes a reaction's privacy.
- **Don't** imply that switching visibility moves or erases the other stored reaction.
- **Don't** assume Geist is bundled or replace platform emoji with a new icon set.
