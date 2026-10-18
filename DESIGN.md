---
name: reacji-to
description: A compact native reaction interface with sideways-looking eyes on lime.
colors:
  brand-lime: "#d9f66f"
  brand-lime-hover: "#c9e75d"
  brand-ink: "#17230f"
  site-accent: "#335d10"
  page: "#f6f7f8"
  surface: "#fff"
  ink: "#121417"
  muted: "#5b616b"
  site-muted: "#535b65"
  line: "#d3d7dd"
  wash: "#eef0f2"
  settings-action: "#2e5ccb"
  picker-action: "#3b6fe0"
  picker-line: "#e1e4e8"
  dark-page: "#111112"
  dark-surface: "#18181a"
  dark-ink: "#ececec"
  dark-muted: "#a1a1a6"
  dark-line: "#39393e"
  dark-action: "#94b5f9"
  dark-settings-wash: "#232326"
  dark-picker-surface: "#1f1f22"
  dark-picker-wash: "#2c2c30"
typography:
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(28px, 5vw, 40px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-.03em"
  settings-headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-.025em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: 1.6
  settings-body:
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
  picker-emoji:
    fontFamily: "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif"
    fontSize: "24px"
    lineHeight: 1.3
  profile-emoji:
    fontFamily: "'Apple Color Emoji', 'Segoe UI Emoji', sans-serif"
    fontSize: "36px"
    lineHeight: 1.2
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
  button-install:
    backgroundColor: "{colors.brand-lime}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
  button-install-hover:
    backgroundColor: "{colors.brand-lime-hover}"
    textColor: "{colors.brand-ink}"
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
  button-profile:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.page}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  input-profile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  chip-reaction:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "4px 6px"
  filter-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.page}"
    rounded: "{rounded.control}"
    padding: "5px 12px"
  picker:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.picker}"
    width: "min(348px, calc(100vw - 24px))"
---

# Design System: reacji-to

## Overview

**Creative North Star: "A small sideways glance"**

The existing interface is restrained, readable, and close to the host site's native controls. The approved identity adds a compact pair of emoji-inspired, sideways-looking eyes on lime and the reacji-to wordmark. The eyes are the expressive detail; ordinary controls, separators, and type carry the rest of the interface. The app name and wordmark are reacji-to; the public domain remains reacji.to.

This document describes the shipped implementation, including its inherited differences between the embedded picker, connection settings, and public website. The north star is a descriptive shorthand for that implementation, not a new visual direction. Evidence: `src/content.css`, `src/content.js`, `src/options.css`, `src/options.html`, `public/logo.svg`, and `worker/pages.js`; the desktop and mobile profile captures in `.impeccable/review/` and the picker capture in `artifacts/x-picker.png` corroborate the current identity and layouts.

**Key Characteristics:**

- Compact eyes branding with white ovals, dark outlines and pupils, and a lime tile.
- System sans typography, restrained weights, and readable identifiers.
- Flat neutral surfaces with thin separators and gently rounded controls.
- Host-aware picker colors, automatic light/dark settings and public pages.
- Explicit Public / Private state and keyboard-visible controls.

## Colors

Lime identifies the brand and the public site's installation action; neutral surfaces and text provide the structure. Blue remains the inherited action color in settings and the embedded picker.

### Primary

- **Brand lime** fills the eyes logo’s rounded-square tile and public installation CTA; its hover variant appears only on that CTA. In the public dark theme it also supplies link-hover and focus color.
- **Brand ink** supplies the eyes’ outlines and offset pupils, and lime CTA text.
- **Site accent** is the darker green for public-site link hovers, focus outlines, and input caret in the light theme.

### Secondary

- **Settings action** colors connection controls and settings links. **Picker action** is the fallback for selected reactions, picker links, caret, and focus. Both become **dark action** in their explicit dark themes.

### Neutral

- **Page**, **surface**, **ink**, **muted**, **line**, and **wash** form the settings palette. Public pages use **site muted** for secondary copy.
- The picker starts with the site's `--popover`, `--foreground`, `--muted-foreground`, `--border`, `--accent`, and `--primary` values where available. Its fallback line is **picker line**; its background falls back to **surface**.
- Explicit dark variants distinguish the page background, input surface, picker surface, and contextual washes. Do not collapse these into a single background token.
- Selected visibility uses the existing translucent `#7772` fill; its border uses host `--border` with `#ddd` fallback. Settings select borders use `#8885`. These local treatments are preserved, not promoted to global palette primitives.

**The Native Color Rule.** Preserve the picker's host-token inheritance and existing blue action states; the brand change does not recolor every control lime.

## Typography

Geist is requested with system-ui and sans-serif fallbacks. The implementation does not load a webfont, so the installed font environment determines the rendered face. Emoji use platform color emoji fonts. Reaction counts and code use Geist Mono when available, then system monospace.

The frontmatter records the actual role scales, not a mathematical type scale. Public body text is the largest base; settings and the compact picker each step down. Profile titles use fluid sizing and wrap long handles anywhere. Settings titles reduce to (28px) on narrow screens. Public subheadings are (20px); settings subheadings are (19px), weight (600). Public brand text is (23px), weight (650), tracking (-.03em), reducing to (20px) on mobile; settings brand text is (24px).

Public metadata and footer use (13px); public navigation uses (14px). Picker footer is (12px), and its scope note is (11px) at (1.45) line height and (.75) opacity. Public paragraphs cap at (65ch). Dates and reaction counts use tabular numbers. OAuth codes use a distinct monospace (26px), weight (600), with (.06em) tracking.

## Layout

Public header, main, and footer share a centered (780px) maximum width with (24px) side padding. The header is a flex row with brand and installation link. Main begins with (56px) top padding and a minimum height of (65vh). Reaction rows are ruled horizontal entries, with a (64px) emoji column, a flexible content column, and a date column; row gap is (18px) and vertical padding is (22px).

At a viewport width of (500px) or less, public side padding becomes (20px), main top padding becomes (36px), and rows use a (44px) emoji column plus content. Dates move beneath the content in column two. Emoji reduce to (30px). Filter navigation wraps; identifiers and handles remain wrap-safe. These behaviors are visible in the supplied desktop and mobile captures.

Settings use a centered (650px) maximum-width main with (64px) top margin and (24px) side padding. At the same narrow breakpoint, top margin becomes (24px) and side padding becomes (20px). Sections use top rules, (24px) internal top spacing, and (32px) separation. Action rows wrap.

The picker is a fixed popover clamped within (12px) viewport gutters. Positioning chooses below or above its trigger with a (6px) gap. Its maximum height is the dynamic viewport minus (24px), and the panel scrolls. The emoji grid stays at eight columns with (2px) gaps and a (222px) maximum scrolling height. Reactions beside posts are an inline wrapping bar. Toasts sit (16px) from the lower and right viewport edges.

## Elevation & Depth

The system is predominantly flat. Borders, rules, background changes, and the browser popover layer establish hierarchy. The picker and toast have no declared drop shadow. The selected Public / Private segment alone has a small structural shadow (`0 1px 2px #0001`). Do not infer a broader card-shadow system from that treatment.

The picker enters over (.13s) with `cubic-bezier(.16,1,.3,1)`, moving upward from (3px) and fading from (.7) opacity. This animation runs only when reduced motion is not requested. Other hover treatments change immediately; no site-wide motion vocabulary is implemented.

## Shapes

Small rectangular controls use the control radius; the close control and visibility segments use the smaller radius. The picker and toast use the distinct larger radii recorded above. Inputs and panel boundaries use thin (1px) borders. Profile rows remain open and ruled rather than enclosed in cards.

The approved logo is a (64 × 64) SVG with a lime rounded-square tile and corner radius of (18). Two white oval eyes are centered at (22, 32) and (45, 32), with radii (11 × 17) and dark-ink outlines of width (3). Dark pupils are centered at (19, 34) and (42, 34), with radii (5 × 8); their leftward offset creates the sideways glance. Its public header and settings display size is (36 × 36px). Preserve the source asset’s proportions and legibility at the requested (16px) minimum. The embedded (16px) trigger uses a matching outline-eyes SVG in a (24 × 24) viewBox, with current-color outlines and filled offset pupils, without the lime tile. Non-inline triggers also carry the reacji-to label.

## Components

### Buttons and links

Public install links use lime fill and dark ink. Public profile-submit buttons use ink fill with page-colored text and reduce opacity to (.85) on hover. Settings primary buttons use blue; secondary buttons use wash. Both settings variants darken via `brightness(.93)` on hover; disabled settings and picker buttons use (.55) opacity and a wait cursor. Picker footer actions are unfilled blue text links that underline on hover.

Focus is an explicit (2px) outline: public site uses its green/lime accent with (5px) offset; settings use blue with (3px) offset; the picker uses its inherited action color with (2px) offset. Keep these contextual values visible when reproducing controls.

### Reaction chips

Chips combine emoji and a small tabular count with a minimum (28px) height. Hover adds a wash and stronger ink. The user's selected reaction uses `aria-pressed="true"`, action-colored text, and wash. Private chips include a lock prefix. Accessible labels describe emoji, count, ownership, and removal where applicable.

### Picker and visibility switch

The picker has a title and close control, exact **Public** / **Private** labels, a scope note, search, native category select, eight-column emoji grid, and status/action footer. The selected visibility segment is heavier and lightly filled. Private mode explicitly says when a separate public reaction remains public.

Search accepts words or a pasted emoji. Results initially show up to (96) choices; Show more adds (96). Empty search results have explanatory copy. Arrow keys move through the grid, including vertical moves by eight. Opening focuses search; Escape closes; Tab cycles the enabled controls; closing returns focus to the trigger. Status and toast announcements use polite live regions. Scope-specific errors remain in the status rather than silently changing visibility.

### Fields and connection settings

Public profile fields and settings password fields are thin-bordered neutral surfaces. The public profile form wraps and keeps its label on a full row. The picker search uses a compact (9px 10px) inset. Category and private-repository selectors retain native select behavior. Connection settings reveal the authorization code and private repository setup as their states require; status text is wrap-safe, with settings error text using `light-dark(#b42318,#ff9898)`.

### Profile navigation and feed

Site filters are links labeled All, dev-null, X, and LinkedIn. The active filter uses ink fill, page-colored text, and `aria-current="true"`. Feed rows show emoji, a platform post link, post ID, and UTC-formatted date. They are ordered newest first with (50) items per page, filtered by site, and have Newer / Older pagination when needed. The title is the GitHub handle; the subtitle counts all current public reactions and links to GitHub. Private reactions are absent from this public surface.

Empty, missing-profile, and unavailable states reuse the same header, main, and footer. Empty filtered results point back to All; unavailable state includes a retry link. These are actual implemented states, not extra component variants proposed by this document.

## Do's and Don'ts

### Do:

- **Do** preserve the compact eyes-on-lime asset and reacji-to wordmark.
- **Do** preserve the embedded picker's inherited host colors and native-sized controls.
- **Do** use ruled profile rows, wrapping identifiers, and visible keyboard focus.
- **Do** keep Public / Private labels and their explanatory state text explicit.
- **Do** preserve dark-theme mappings and the reduced-motion condition on picker entry.

### Don't:

- **Don't** spread the lime brand color across the existing blue connection and picker controls.
- **Don't** turn the flat profile feed into shadowed cards or decorate the rows with unrelated imagery.
- **Don't** imply that switching visibility moves or erases the separate reaction in the other mode.
- **Don't** include private reactions or private counts in the public profile.
- **Don't** assume Geist is bundled or replace the platform emoji artwork with a new icon set.
