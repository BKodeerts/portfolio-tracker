# Handoff: Stock Detail v2 + Analysis v2 — Responsive Desktop Layouts

## Overview

Third handoff in the series. Builds on:

1. `design_handoff_frontend_revamp/` — the mobile-first revamp (row anatomy, tokens, formatting rules).
2. `design_handoff_desktop_dashboard/` — the responsive Dashboard (900px breakpoint, 1160px container, desktop top nav, market-hours sparkline states). **Assumed already implemented.**

This handoff extends the same responsive system to the remaining two screens: **Stock Detail** and **Analysis**.

## About the Design Files

`Revamp - Stock Detail v2.dc.html` and `Revamp - Analysis v2.dc.html` are **design references created in HTML** — interactive prototypes showing intended look and behavior, not production code. Recreate them in the SvelteKit codebase (`portfolio-tracker/src`, Svelte 5 runes, `tokens.css`) using its established patterns. `mock.js` documents data shapes; `support.js` is the prototype runtime — ignore it.

Stock Detail v2 has a "Market simulation" tweak (`simTime` prop) purely for previewing market states. Production uses the real clock and per-ticker session data — do not implement the tweak.

## Fidelity

**High-fidelity.** Everything not mentioned here is unchanged from the two previous handoffs — mobile layouts (<900px) are pixel-identical to the first handoff's specs; the responsive framework (900px breakpoint, 1160px max-width container centered with 24px padding, desktop top nav, resize-reactive chart width) is identical to the Dashboard handoff. Express values through `tokens.css` tokens.

---

## Stock Detail v2

### Desktop layout (≥900px)

No top nav on this screen — it's a drill-in page; the existing back-button header stays (same anatomy as mobile: 36px circular back button + ticker/name block + market-state chip right-aligned), inside the 1160px container.

- **Price hero**: 42px mono 700 (mobile 34px); delta and caption unchanged.
- **Chart**: full container width, **height 260px** (mobile 190px), inner padding L/R 24px. Recomputes on resize.
- **Period pills**: max-width 440px, left-aligned (same as Dashboard desktop).
- **Below the pills** (margin-top 24px): wrapping flex row, gap `26px 56px`. "Your position" card `flex: 1 1 340px` left, "Your history" `flex: 1 1 340px` right. Card and history internals are unchanged from handoff 1. On narrow widths they stack (mobile order preserved).

### Market-hours behavior (per this ticker's own exchange session)

ASTS = NASDAQ, 15:30–22:00 CET. Three states driven by `{open, close, marketState}` from the intraday store:

1. **Pre-open** (`now < open`):
   - **Header chip**: grey `#b3b8c0`, label `OPENS 15:30`.
   - **Price hero**: shows **prev close**; delta = `—` in `#b3b8c0`; caption "Prev close · market opens 15:30 CET".
   - **1D chart**: yesterday's full session, dimmed — line `#b3b8c0` @ 0.85 opacity, **no gradient fill**, spanning the full chart width. Dashed prev-close baseline as usual. Centered caption near the top: "Previous session · opens 15:30" (10px `#8b929c`). No now-dot, no x-tick labels.
     - *Superseded in 0.13.8*: this chart originally reserved the last ~15% of its width for a dotted extended-hours ghost tail (`#9aa0aa`, width 1.5, dasharray `2 4`). It was dropped — two sessions on one axis at two different time scales read as a single continuous line, and thin-volume pre-market quotes aren't worth that ambiguity. Do not reintroduce it here. The dashboard holding-card sparklines keep their tail.
   - **Position card "Today" cell**: `—` in `#b3b8c0` (never a currency-driven number).
2. **Live** (`open ≤ now ≤ close`): chip green `OPEN`; series clipped to `now` (partial fill grows through the session); pulsing now-dot; caption "Market price · today".
3. **Closed, post-session** (`now > close`): chip grey `CLOSED`; full session at normal color, **no** now-dot; caption "At close, 22:00 CET".

Non-1D periods (1M…Max) are unaffected by market state.

### Interactions

Unchanged: period pills, back navigation. Resize switches layout at 900px.

---

## Analysis v2

### Desktop layout (≥900px)

- **Top nav** replaces the bottom tab bar — identical spec to the Dashboard handoff, with **Analysis** as the active pill. (No live-status chip on this screen.) Mobile keeps the "Analysis" page title + bottom tab bar.
- **Performance row** (margin-bottom 30px): wrapping flex, gap `24px 56px`, items aligned to baseline/flex-end.
  - Left `flex: 0 1 340px`: the TWR + IRR pair (2-col grid). Big numbers scale up to **30px** mono 700 on desktop (mobile 24px).
  - Right `flex: 1 1 420px`: **Rolling returns** moves up here (6-cell grid, unchanged internals).
- **Two-column section** below: wrapping flex, gap `24px 56px`.
  - Left `flex: 2 1 480px`: **Return by position** (bars gain real width here — this is the main desktop win), row padding bumps 6px→8px; then **Risk** below it (margin-top 28px), including the concentration warning banner.
  - Right `flex: 1 1 300px`: **Allocation** with its Ticker/Sector/Currency dimension switcher.
- All block internals (bars, risk rows, warning banner, allocation stack) are unchanged from handoff 1.

### Mobile (<900px)

Identical to handoff 1: title, Performance pair, Return by position, Rolling returns, Risk, Allocation, bottom tab bar. Note the section order differs slightly from desktop (rolling returns sits after position bars on mobile) — the flex-wrap fallback in the prototype places rolling returns second; matching handoff 1's mobile order exactly is acceptable and preferred.

---

## State Management

- No new stores. Stock Detail's chart/header/position-card need the same `marketState`-aware render path already built for Dashboard sparklines (pre / live / post).
- Analysis is purely presentational; only the existing `dim` (allocation dimension) UI state.

## Design Tokens

Per previous handoffs, plus:
- Detail pre-open chart: dimmed line `#b3b8c0` @ 0.85, no area fill. (Ghost tail dropped in 0.13.8 — see above.)
- Desktop: price hero 42px; detail chart 260px; Analysis big numbers 30px; column gaps 56px.

## Assets

None — inline SVG only.

## Files

- `Revamp - Stock Detail v2.dc.html` — responsive design; Tweaks "Market simulation" previews pre-open / live / after-close.
- `Revamp - Analysis v2.dc.html` — responsive design; resize to see both layouts.
- `mock.js` — mock data shapes.
- `support.js` — prototype runtime; ignore.
