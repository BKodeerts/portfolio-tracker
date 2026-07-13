# Handoff: Stock Detail v3 — Period Returns, Range Bar & Key Stats

## Overview

Fourth handoff in the series. Builds on:

1. `design_handoff_frontend_revamp/` — mobile-first revamp (row anatomy, tokens, formatting rules).
2. `design_handoff_desktop_dashboard/` — responsive Dashboard (900px breakpoint, 1160px container, desktop top nav, market-hours states). **Assumed implemented.**
3. `design_handoff_desktop_detail_analysis/` — responsive Stock Detail v2 + Analysis v2. **Assumed implemented.**

This handoff is an **incremental update to the Stock Detail screen only** (v2 → v3). It adds three information blocks between the chart area and the position/history columns, and makes the price-hero delta follow the selected period. Everything else on the screen is unchanged from v3 (handoff 3).

## About the Design Files

`Revamp - Stock Detail v3.dc.html` is a **design reference created in HTML** — an interactive prototype showing intended look and behavior, not production code. Recreate it in the SvelteKit codebase (`portfolio-tracker/src`, Svelte 5 runes, `tokens.css`) using its established patterns. `mock.js` documents data shapes; `support.js` is the prototype runtime — ignore it.

The "Market simulation" tweak (`simTime` prop) exists purely for previewing market states; production uses the real clock — do not implement it.

## Fidelity

**High-fidelity.** Only the deltas below are new; all other layout, market-hours behavior, and mobile/desktop responsive rules are identical to handoff 3. Express values through `tokens.css` tokens where they exist.

---

## Delta 1 — Period movement in the price hero

The hero delta (the value beside the big mono price) now reflects the **selected period pill**, not always "today":

- **1D**: unchanged from handoff 3 (today's $ and % change vs prev close; pre-open shows `—`).
- **Any other period** (1M / 3M / YTD / 1Y / 3Y / Max):
  - Delta = `{sign}${abs $ change} ({sign}{abs %}%)` computed from **first close of the period → current market price**. E.g. `+$16.64 (+45.3%)`. Green `#047857` if ≥ 0, red `#b91c1c` if negative. Minus sign is the typographic `−` (U+2212).
  - Caption below the price becomes `{Period label} · ${first} → ${last}`, e.g. `Past 3 months · $36.78 → $53.42`. Period labels: `Past month`, `Past 3 months`, `Year to date`, `Past year`, `Past 3 years`, `All time`.
  - The hero **price itself** always stays the current market price — only delta + caption change.
- The series endpoint must equal the displayed market price (no drift between chart, caption, and hero).

## Delta 2 — Key stats + 52-week range bar

A full-width strip directly **below the period pills** (margin-top 16px), inside the page padding:

- Container: wrapping flex, `align-items: center`, gap `14px 32px`, padding `12px 0`, 1px top **and** bottom border `rgba(16,18,22,0.06)`.
- **Left — 52w range bar** (`flex: 1 1 260px; min-width: 220px`):
  - Header row (`justify-content: space-between`, 10px, `#8b929c`, margin-bottom 5px): low price left (`$17.44`, mono), centered label `52W RANGE` (600, letter-spacing 0.06em, uppercase), high price right (`$58.10`, mono).
  - Track: 4px tall, border-radius 2px, background `rgba(16,18,22,0.08)`.
  - Filled portion from 0 to current-price position: same radius, `rgba(16,18,22,0.25)`.
  - Marker at current-price position: 10px circle, `#101216`, 2px border in page background `#fafaf8`, centered on the track (`translate(-50%,-50%)`).
  - Position = `(price − low52w) / (high52w − low52w)`, clamped 0–1.
- **Right — key stats** (wrapping flex, gap `6px 22px`, 11px `#8b929c`): label + value pairs, value in mono 600 `#3c414a`:
  - `Mkt cap $16.9B` · `Volume 4.2M` · `Avg vol 6.1M` · `P/E —`
  - P/E shows `—` when the company has no earnings. Values come from the ticker's reference data (new fields; see State Management).
- On narrow widths the stats row wraps below the range bar naturally (flex-wrap).

## Delta 3 — Returns card

A card **between the stats strip and the position/history columns** (margin-top 20px), same card chrome as "Your position" (white bg, 1px `rgba(16,18,22,0.07)` border, radius 16px, shadow `0 1px 2px rgba(16,18,22,0.03)`, padding `14px 18px`):

- Title: `Returns`, 13px 600, margin-bottom 10px.
- Body: **5-column grid** (`repeat(5, 1fr)`, gap 6px) of tinted cells — **identical cell anatomy to the Analysis page's "Rolling returns"** (reuse that component/styles):
  - Cell: `text-align: center; padding: 10px 2px; border-radius: 10px`.
  - Background: `rgba(4,120,87,0.07)` if return ≥ 0, `rgba(185,28,28,0.07)` if negative.
  - Value: mono 12px 700, `#047857` / `#b91c1c`, format `+45.3%` / `−12.1%`.
  - Label below: 10px `#8b929c`, margin-top 3px.
- Periods and reference values: `1M +8.2%` · `6M +31.4%` · `1Y +64.9%` · `3Y +148.7%` · `All +96.5%` (price returns of the **stock**, not the user's position; "All" spans the full listing history, so it can be lower than 3Y).

## Interactions & Behavior

- Period pills additionally re-derive the hero delta + caption (Delta 1). Chart behavior unchanged.
- Range-bar marker position and stats are static per ticker refresh (no animation required).
- Returns cells are non-interactive.

## State Management

- No new UI state.
- New per-ticker reference data needed: `low52w`, `high52w`, `mktCap`, `volume`, `avgVolume`, `pe (nullable)`, and price returns for `1M / 6M / 1Y / 3Y / all`. Extend the ticker store/API accordingly.
- Period-change math (Delta 1) derives from the already-loaded period series; no extra fetch.

## Design Tokens

All from the existing system — no new tokens:

- Page bg `#fafaf8` · ink `#101216` · secondary `#3c414a` · muted `#8b929c` · faint `#b3b8c0`
- Positive `#047857` · negative `#b91c1c`
- Tints: `rgba(4,120,87,0.07)` / `rgba(185,28,28,0.07)`
- Hairlines: `rgba(16,18,22,0.06)` (rules) / `rgba(16,18,22,0.07)` (card borders)
- Track: `rgba(16,18,22,0.08)`, fill `rgba(16,18,22,0.25)`
- Fonts: Inter (UI), JetBrains Mono (numerals)

## Assets

None. No imagery or icons added.

## Files

- `Revamp - Stock Detail v3.dc.html` — the design reference (open in a browser; `support.js` + `mock.js` must sit alongside).
- `mock.js` — mock data shapes (intraday points, positions).
- `support.js` — prototype runtime only; ignore for implementation.
