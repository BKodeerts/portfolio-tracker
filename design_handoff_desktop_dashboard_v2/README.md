# Handoff: Dashboard v2 — Responsive Desktop Layout + Market-Hours Sparklines

## Overview

Follow-up to the earlier frontend revamp handoff (`design_handoff_frontend_revamp/` in `BKodeerts/portfolio-tracker`). Two problems are fixed:

1. **The desktop version looked mobile.** The revamped dashboard was designed at 390px and simply stretched; wide screens wasted real estate. This design makes the dashboard responsive: the same screen adapts from mobile to a proper ≥900px desktop layout.
2. **Ticker sparklines showed movement while the market was closed.** Pre-open, the intraday mini-graphs rendered FX-driven drift as if the stock were trading. New rule: a ticker's sparkline reflects its own exchange session only, with explicit pre-open / live / closed states.

This handoff covers **Dashboard only**. Stock Detail and Analysis keep the specs from the previous handoff (mobile); their desktop treatments are future work.

## About the Design Files

`Revamp - Dashboard v2.dc.html` is a **design reference created in HTML** — an interactive prototype showing intended look and behavior, not production code. The task is to **recreate this design in the existing SvelteKit codebase** (`portfolio-tracker/src`, Svelte 5 runes stores, `tokens.css`) using its established patterns. Do not port the HTML/JS directly. `mock.js` documents the data shapes; `support.js` is the prototype runtime — ignore it.

The prototype has a "Market simulation" tweak (a `simTime` prop: 07:30 / 10:00 / 17:20 / 22:30) purely to preview the market-state behaviors. In production, use the real clock and per-ticker session data.

## Fidelity

**High-fidelity.** All values below are final intent. Everything not mentioned here is unchanged from the previous revamp handoff (`design_handoff_frontend_revamp/README.md`) — colors, typography, row anatomy, activity/allocation specs, formatting rules all still apply. Express values through `tokens.css` tokens.

## Responsive model

One breakpoint: **900px** (JS-measured in the prototype; use a CSS media query or container query in production).

- **< 900px (mobile)** — identical to the previous handoff's Dashboard: 20px page padding, 34px hero, full-bleed 200px chart, single column (Holdings → Allocation → Activity), fixed bottom tab bar (3 tabs).
- **≥ 900px (desktop)** — described below.

## Desktop layout (≥900px)

Content in a **max-width 1160px** container, centered, 24px horizontal padding. Page background `#fafaf8`, no cards.

**Top nav (replaces bottom tab bar)** — one row, 28px gap, padding `18px 24px 0`:
- "Portfolio" wordmark 15px/700, letter-spacing −0.02em.
- Nav pills (4px gap): active tab = 12.5px/700 `#101216` on `#eceae3`, padding 6px 12px, radius 8px; inactive = 12.5px/500 `#8b929c`, transparent, hover text `#101216`. Tabs: Portfolio, Analysis, Activity.
- Right-aligned (margin-left auto): live status chip, same as mobile — `● LIVE · EUR/USD 1.169`, 10px JetBrains Mono 600 `#8b929c`. Dot 6px: green `#047857` when **any** tracked exchange is open, grey `#b3b8c0` + label "CLOSED" when none are.

**Hero** — same as mobile but value at **42px** mono 700 (mobile 34px). Delta line unchanged (13px).

**Chart** — spans the full 1160px container, **height 260px** (mobile 200px). Inner padding L/R 24px. Same grid/label/baseline/dot treatment as before. All geometry recomputes on resize (the SVG is sized to the container, not stretched via viewBox).

**Period pills** — same component, but constrained to **max-width 440px**, left-aligned (not full-width). Helper caption under them when 1D is selected.

**Two-column section** below the pills (margin-top 26px):
- Wrapping flex row, column gap **56px**. Left (Holdings): `flex: 2 1 520px`. Right (sidebar): `flex: 1 1 300px`. On narrow widths the sidebar wraps under holdings — this is also the mobile order.
- **Holdings** (left): identical row anatomy to previous handoff (`minmax(72px,auto) 1fr auto` grid, 13px row padding, hairline dividers, hover `rgba(16,18,22,0.02)`, whole row → `/stock/[ticker]`). The sparkline column simply gets wider. No extra columns were added — content parity with mobile.
- **Sidebar** (right): Allocation block, then Activity block, stacked with 26px gap. Both identical to the previous handoff's specs.

## Market-hours sparkline behavior (the core product change)

Every holdings-row sparkline is state-driven by **that ticker's own exchange session** (`{open, close, marketState}` from the intraday store; EU 09:00–17:30 CET, US 15:30–22:00 CET). Three states:

1. **Pre-open** (`now < open`):
   - Show **yesterday's full session, dimmed**: line color `#b3b8c0`, whole SVG at opacity 0.75, normalized to the previous session's own range. Prototype occupies the first ~83% of the sparkline width (100 of 120 viewBox units).
   - **Pre/after-market data as a dotted ghost tail**: stroke `#9aa0aa`, width 1.2, dasharray `2 3`, drawn in the remaining ~17% width, continuing from prev close. If no extended-hours data, omit the tail.
   - Hint caption centered under the sparkline: `prev session · opens 15:30` — 9.5px `#b3b8c0`, nowrap.
   - Numbers column: market price shows **prev close**; day-% shows `—` in `#b3b8c0` (never a currency-driven fake %). Position value + total P&L% (line 2) stay live as usual.
2. **Live** (`open ≤ now ≤ close`): unchanged from previous handoff — intraday % vs prev close, session-normalized x-axis (partial fill grows through the day), green `#047857`/red `#b91c1c` by day direction, thin zero line.
3. **Closed, post-session** (`now > close`): full session drawn at normal color/opacity (not dimmed — per previous handoff, last session stays visible), with hint caption `closed 22:00`.

**Portfolio 1D chart** follows the same clock:
- Before the first exchange opens (now < 09:00): empty chart — dashed prev-close baseline at mid-height + centered caption "Markets open at 09:00" (11px `#8b929c`). Hero shows prev value, delta `+€0 (+0.00%)`, label "today · markets closed".
- During the day: series clipped from 09:00 to `now`; pulsing dot at latest point.
- After 22:00: full-day series, **no** now-dot.
- 1D helper caption: "Markets open at 09:00 CET" pre-open, else "Since first market open, 09:00 CET · dot = latest".

## Interactions & Behavior

- Resize: layout switches at 900px; chart re-renders to container width.
- Everything else (period pills, row navigation, hover, formatting) per previous handoff.

## State Management

- Existing stores suffice. `IntradaySparkline.svelte` needs a `marketState`-aware render path (pre / live / post) instead of always drawing whatever points exist — this is the fix for "showing currency movement while market isn't open".
- Derive "any market open" for the nav status chip from the union of tracked tickers' sessions.
- No new persistent state. The prototype's `simTime` prop is design-preview only — do not implement.

## Design Tokens

Unchanged from previous handoff, plus:
- Dimmed sparkline: `#b3b8c0` line @ 0.75 opacity; ghost tail `#9aa0aa` dashed `2 3`.
- Desktop hero 42px; desktop chart height 260px; container max-width 1160px; column gap 56px; nav pill = period-pill styling at 12.5px.

## Assets

None — inline SVG only.

## Files

- `Revamp - Dashboard v2.dc.html` — the responsive design (resize the window to see both layouts; use the Tweaks "Market simulation" control to preview pre-open / live / after-close states).
- `mock.js` — mock data shapes (mirrors `/api/portfolio` and `/api/intraday`).
- `support.js` — prototype runtime; ignore.
