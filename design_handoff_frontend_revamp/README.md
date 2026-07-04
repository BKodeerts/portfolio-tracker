# Handoff: Portfolio Tracker Frontend Revamp

## Overview

A revamp of the portfolio-tracker frontend (SvelteKit app at `BKodeerts/portfolio-tracker`). The current UI accumulated inconsistencies after a refactor: a flaky 1D portfolio chart, ticker mini-graphs that differ between list and grid views, position-value shown where market price is expected, and redundant toggles. This revamp simplifies the information architecture, fixes those behaviors, switches the UI to English, and is designed mobile-first.

Three screens are redesigned: **Dashboard**, **Stock Detail**, and **Analysis**. The separate **Intraday** page is removed — its content becomes the dashboard's 1D chart view. The Transactions page is unchanged (only trimmed "Activity" previews link to it).

## About the Design Files

The `.dc.html` files in this bundle are **design references created in HTML** — interactive prototypes showing intended look and behavior, not production code. The task is to **recreate these designs in the existing SvelteKit codebase** (`src/routes`, `src/lib/components`, Svelte 5 runes stores, existing `tokens.css`) using its established patterns. Do not port the HTML/JS directly.

- `Revamp - Dashboard.dc.html` — new home (`/`)
- `Revamp - Stock Detail.dc.html` — new `/stock/[ticker]`
- `Revamp - Analysis.dc.html` — new `/analysis`
- `Current - *.dc.html` — recreations of today's UI, for before/after comparison only. Not to be implemented.
- `mock.js` — the mock data shapes used by the prototypes; mirrors `/api/portfolio` and `/api/intraday`.

## Fidelity

**High-fidelity.** Colors, typography, spacing, and interactions are final intent. Recreate pixel-perfectly, but express values through the existing `tokens.css` design-token system (extend it where noted) rather than hardcoding.

## Product decisions (what changed and why)

1. **1D portfolio chart fixed.** The 1D view must span from **first market open of the day (09:00 CET) to last close (22:00 CET)** — never from the previous evening. No overnight flat shelf. Render: prev-close dashed baseline, line+area for data up to "now", a pulsing dot at the latest point, and x-ticks at 09/12/15/18/21h. Data before markets open = empty chart with baseline only.
2. **One holdings row design.** The table/cards toggle is removed. A single list row design serves both densities. The old `PositionsTable.svelte` / `PositionCards.svelte` pair is replaced by one component.
3. **Market price vs. position value clearly separated.** Every holdings row shows two stacked number pairs, right-aligned: line 1 = market price in native currency + day % (muted color, `#3c414a`); line 2 = your position value in EUR + total P&L % (bold, `#101216`). Never mix these.
4. **One sparkline everywhere.** Every ticker mini-graph — dashboard rows, anywhere else — is the *same* intraday sparkline: % vs prev close, x-axis normalized to that ticker's session (so EU and US stocks each fill their own session width), thin zero line, green/red by day direction. Component: one `IntradaySparkline.svelte` used everywhere. Delete `MiniTrend.svelte` (30D fallback) usage in favor of it.
5. **Removed:** movers strip (redundant with holdings list), "Totaal / Per positie" chart toggle (per-position compare moved to Analysis as horizontal return bars), separate `/intraday` route, currency-only allocation block on dashboard (replaced by per-ticker bar; full allocation with Ticker/Sector/Currency switcher lives in Analysis).
6. **Language: English.** All copy in the prototypes is final English copy.
7. **Nav reduced to 3 tabs:** Portfolio, Analysis, Activity (transactions). Settings/import/bonus move behind a secondary entry point (not designed here; suggest a gear icon on Analysis or a "More" sheet — ask the user).
8. **Chart headline follows selected period.** The hero delta line under the total value shows the P&L for the selected chart period (e.g. "+€312 (+1.25%) today" for 1D, "past 3 months" for 3M).

## Screens

### 1. Dashboard (`/`)

Mobile canvas 390px wide; page padding 20px; background `#fafaf8`; text `#101216`.

**Top bar** — "Portfolio" (15px/700), right side: live status `● LIVE · EUR/USD 1.169` (10px JetBrains Mono, 600, `#8b929c`, green dot `#047857` 6px).

**Hero** — Total value: JetBrains Mono 34px/700, letter-spacing -0.02em, format `€25,240` (en-US grouping). Below (8px gap): period delta `+€312 (+1.25%)` (13px mono 600, green `#047857` / red `#b91c1c`) + muted period label ("today", "past month", …) 13px `#8b929c`.

**Chart** — full-bleed (negative margin to screen edges), 390×200 SVG.
- Grid: 3 horizontal lines `rgba(16,18,22,0.05)`, right-aligned €-labels 9px mono `#b3b8c0`.
- Historical periods: value line 2px (green if up over window, red if down), gradient area fill (16% → 0% opacity of line color), invested (cost basis) as dashed `#c9cdd3` 1.3px line.
- 1D: as described in decision #1. Line color = today's direction.
- X labels 9px mono `#b3b8c0`.

**Period pills** — one row, equal flex: `1D 1M 3M YTD 1Y 3Y Max`. Selected: bg `#eceae3`, text `#101216` 700; unselected: transparent, `#8b929c` 500. Height 30px, radius 8px, 12px text. Under 1D, a helper caption: "Since first market open, 09:00 CET · dot = latest" (11px `#8b929c`).

**Holdings** — section header row: "Holdings" (13px/600) left, "market price · your value" (11px `#8b929c`) right.
Each row (grid `minmax(72px,auto) 1fr auto`, gap 12px, padding 13px 0, bottom border `rgba(16,18,22,0.06)`, whole row navigates to stock detail):
- Identity: 6px square dot (radius 2px, ticker color) + ticker 13px/700; below: "120 shares" 10.5px `#8b929c`.
- Middle: intraday sparkline (decision #4), ~30px tall, stretches.
- Right: two stacked pairs per decision #3; prices 12.5px mono, percentages 11px mono 600 with fixed min-width 52px so columns align.
Sorted by position value desc.

**Allocation** — header "Allocation" + right "€17,395 invested" (11px `#8b929c`). One 8px stacked bar (2px gaps, per-ticker colors, share of total value), legend as wrapping chips: dot + ticker + bold % (11px).

**Activity** — header "Activity" + "All →" link. 3 most recent transactions: kind chip (34px wide, 10px/700: BUY green tint `rgba(4,120,87,0.10)`/`#047857`, SELL red tint, DIV indigo tint `rgba(99,102,241,0.10)`/`#6366f1`), ticker 12.5px/600, detail "20 sh · 06-27" 11px `#8b929c`, amount right-aligned 12px mono 600.

**Tab bar** — fixed bottom, `rgba(250,250,248,0.92)` + blur(20px), top border. 3 tabs: Portfolio (chart-line icon), Analysis (clock icon), Activity (list icon). Active: `#101216` 700 + 2.2px stroke icons; inactive `#8b929c` 500 + 1.7px.

### 2. Stock Detail (`/stock/[ticker]`)

**Top bar** — circular back button (36px, bg `rgba(16,18,22,0.05)`), ticker 15px/700 with "AST SpaceMobile · NASDAQ" 11px `#8b929c` under it; right: market state `● OPEN` (10px mono 600 green; grey "CLOSED" when shut).

**Market hero** — THE market price, native currency: `$53.42` 34px mono 700; beside it `+$1.64 (+3.17%)` 14px mono 600 green (day change in native currency). Caption "Market price · today" 11px `#8b929c`.

**Chart** — 390×190 full-bleed SVG, market price only (no value/koers toggle). 1D = intraday vs prev-close baseline with now-dot, session-bounded (15:30–22:00 CET for US, 09:00–17:30 for EU). Other periods = daily closes. Same grid/label treatment as dashboard.

**Period pills** — identical component & set as dashboard (`1D 1M 3M YTD 1Y 3Y Max`).

**"Your position" card** — the ONLY white card on the page: bg `#ffffff`, border `rgba(16,18,22,0.07)`, radius 16px, shadow `0 1px 2px rgba(16,18,22,0.03)`, padding 16px 18px. Header "Your position" 13px/600 + right hint "all in €". Value `€5,872` 26px mono 700 with `+€2,980 (+103.0%)` 13px mono green beside it. Below a divider: 3×2 grid of mini-stats (label 10px uppercase 600 `#8b929c`, value 14px mono 600): Shares, Avg cost (native + € per share as sub-line), Today (colored), Invested, Weight (% of portfolio), Dividends.

**"Your history"** — flat transaction list for this ticker, same row anatomy as dashboard Activity, detail like "10 sh @ $44.71".

### 3. Analysis (`/analysis`)

Flat page, almost no cards — plain sections separated by whitespace (24px).

- **Performance**: 2-col grid. "Total return (TWR)" `+45.1%` and "Annualized (IRR)" `+21.7%` — 24px mono 700 green, labels 10px uppercase `#8b929c`, sub-captions 11px.
- **Return by position** (replaces the dashboard's per-position chart toggle): one row per ticker — dot+ticker (44px col), horizontal bar around a zero axis (range −20%..+120%, 1px zero line `rgba(16,18,22,0.15)`, bar `rgba(4,120,87,0.55)` green / `rgba(185,28,28,0.55)` red, 14px track), right-aligned % 11.5px mono. Sorted by return desc.
- **Rolling returns**: 6 equal tiles (1W 1M 3M YTD 1Y Max), tinted bg `rgba(4,120,87,0.07)` green / red variant, value 12px mono 700 colored, period 10px `#8b929c`.
- **Risk**: plain bordered rows — label 12.5px/500 + explainer sub-line 10.5px `#8b929c` ("worst peak-to-trough", "vs VWCE All-World", …), value right 13px mono 600 (drawdown red). Metrics: Volatility, Max drawdown, Sharpe, Sortino, Beta. Below: amber concentration note (bg `rgba(245,158,11,0.08)`, text `#92600a`, radius 10px): "Concentration: 63% of the portfolio sits in 3 names."
- **Allocation**: header + right-aligned dimension switcher (Ticker / Sector / Currency; same pill styling as period pills, smaller: 4px 10px padding, 11px). One 8px stacked bar + vertical legend rows (dot, name muted, % mono bold).

## Interactions & Behavior

- Period pills: instant chart swap, no animation required; persist last selection per page (localStorage) if cheap.
- Holdings row → `goto('/stock/{ticker}')`; whole row is a hit target (≥44px tall — rows are ~56px).
- Hover (desktop): rows `rgba(16,18,22,0.02)` bg.
- "Now" dot on 1D charts: solid 3.5px dot + 7px halo at 18% opacity; optional slow pulse.
- Market CLOSED state: intraday sparklines stay visible (last session), status chip grey; no dimming to 45% opacity like the old intraday page.
- Loading: keep current skeleton approach; charts render axes first, then line.
- Empty 1D (before any market opens): baseline + "Markets open at 09:00" caption.
- Allocation dimension switcher: swaps bar + legend in place.
- Currency formatting: EUR `€25,240` (no space, en-US grouping); native prices `$53.42` / `€590.10` with 2 decimals.

## State Management

- Existing stores suffice: `portfolioStore` (chart data + positions), `intradayStore` (per-ticker sessions + portfolio intraday).
- **Required store fix**: portfolio intraday series must be clipped/built from `min(firstOpen)` of the day onward — drop any points before today's first market open (the current bug shows a flat line from 22:00 yesterday). Session boundaries per ticker already exist in `mock.js` shape: `{open, close, nowMin, prevClose, marketState}`.
- Dashboard chart state: `period` (`'1d' | '1m' | '3m' | 'ytd' | '1y' | '3y' | 'total'`). The `view: total|per-position` state is deleted.
- Positions view state (`table|cards`) is deleted.
- Analysis: `dim` (`ticker|sector|currency`).

## Design Tokens

Evolved from the existing `tokens.css` (light theme shown; map to dark equivalents):

- Background: `#fafaf8` (page — no card wrappers on dashboard/analysis; the only card is "Your position")
- Card: `#ffffff`, border `rgba(16,18,22,0.07)`, radius 16px, shadow `0 1px 2px rgba(16,18,22,0.03)`
- Text: primary `#101216`, secondary `#3c414a`, muted `#6a6f78`, faint `#8b929c`, axis `#b3b8c0`
- Positive `#047857` (tint `rgba(4,120,87,0.10)`), negative `#b91c1c` (tint `rgba(185,28,28,0.10)`), dividend/accent `#6366f1`
- Selected-pill bg `#eceae3`
- Hairline `rgba(16,18,22,0.06)`; chart grid `rgba(16,18,22,0.05)`
- Ticker colors (existing palette): ASTS `#6366f1`, RKLB `#06b6d4`, LUNR `#f59e0b`, SMR `#ef4444`, SXRT `#10b981`, EUDF `#8b5cf6`
- Type: Inter (UI; letter-spacing −0.005em) + JetBrains Mono (all numbers). Scale: 34 hero / 26 card hero / 24 KPI / 15 page title / 13 section title / 12–12.5 body / 11 captions / 10 labels (uppercase, +0.06em) / 9 axis
- Spacing: 20px page padding, 24–26px between sections, 13px row padding
- Radii: 16 card / 8–10 pills & notes / 5 kind chips / 2 ticker dots

## Assets

None — icons are inline SVG strokes (feather-style, 1.7px/2.2px), charts are inline SVG. No images.

## Files

- `Revamp - Dashboard.dc.html`, `Revamp - Stock Detail.dc.html`, `Revamp - Analysis.dc.html` — the designs
- `Current - Dashboard.dc.html`, `Current - Stock Detail.dc.html`, `Current - Analysis.dc.html`, `Current - Intraday.dc.html` — before-state references (the Current Dashboard has a `flaky1d` toggle demonstrating the 1D bug)
- `mock.js` — shared mock data (positions, weekly chart, per-ticker intraday sessions, correct + flaky portfolio intraday series, transactions, risk metrics)
- `support.js` — prototype runtime; ignore
