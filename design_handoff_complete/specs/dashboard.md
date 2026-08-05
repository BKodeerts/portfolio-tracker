# Handoff: Dashboard v3 — Holdings Cards, Watchlist, Chart Features

## Overview

Fourth handoff. Builds on (all assumed implemented):

1. `design_handoff_frontend_revamp/` — mobile-first revamp (tokens, formatting rules).
2. `design_handoff_desktop_dashboard/` — responsive Dashboard, 900px breakpoint, desktop top nav, market-hours sparkline states.
3. `design_handoff_desktop_detail_analysis/` — Stock Detail + Analysis desktop.

This handoff **supersedes the Dashboard's holdings-section and main-chart specs** from handoff 2. Everything else (hero, nav, allocation, activity, responsive framework, market-hours model) is unchanged. Four changes:

1. **Holdings rows → cards** with a radically decluttered number hierarchy.
2. **Watchlist** — tracked-but-not-held tickers as visually distinct cards.
3. **Multi-currency incl. GBX** (pence-quoted LSE tickers).
4. **Main chart features**: crosshair/tooltip, gain-loss fill, benchmark overlay, transaction markers, €/% axis toggle, session shading, high/low tags.

## About the Design File

`Revamp - Dashboard v2.dc.html` is a **design reference in HTML** — recreate it in the SvelteKit codebase using its patterns; do not port the code. `mock.js` documents data shapes (now including `WATCHLIST`); `support.js` is prototype runtime — ignore. Prototype-only tweaks (`simTime` market simulation, `holdingsLayout` cards/rows comparison): do not implement. **Production is cards**; the rows variant is exploration history.

## Fidelity

High-fidelity; express values through `tokens.css`.

---

## 1. Holdings cards

Replaces the holdings list. Grid: `repeat(auto-fill, minmax(150px, 1fr))`, gap 10px — ~3-up in the desktop holdings column, 2-up on mobile.

**Card** (held): bg `#ffffff`, border 1px `rgba(16,18,22,0.07)`, radius 14px, padding 12px 14px, shadow `0 1px 2px rgba(16,18,22,0.03)`, hover border `rgba(16,18,22,0.18)`. Whole card → `/stock/[ticker]`.

Anatomy, top to bottom:
- **Header row**: 6px color dot (square, 2px radius) + ticker 13px/700 left; market price 10px mono `#8b929c` right (native currency).
- **Sparkline**: full card width, 34px tall, margins 10px 0 8px. Same market-state rules as handoff 2 (pre = dimmed prev session `#b3b8c0` @ 0.75, full width — the dotted ghost tail was dropped in 0.13.9; live = green/red partial session; post = full session + "closed 22:00" hint). Hint caption 9.5px `#b3b8c0` centered under the graph.
- **Footer row**: your value 10.5px mono `#8b929c` left; **day change 15px mono 700 green `#047857`/red `#b91c1c` right** — the only loud number.

**Day-change toggle (Apple Stocks-style)**: tapping the day number (or the "today · %" header label above the grid) flips **all** cards between day-% and day-€ (your position's € impact). Persist the choice.

**Pre-open cards**: the big number shows the **previous session's move** in washed-out green/red (`rgba(4,120,87,0.55)` / `rgba(185,28,28,0.55)`), matching the dimmed graph; price shows prev close. Toggle still works (% or native per-share change).

**Section header**: "Holdings" 13px/600 left; right label "today · %" (or "· €") 11px `#8b929c`, clickable, hover `#101216`.

## 2. Watchlist

Section below Holdings (28px top margin): header "Watchlist" + right label "not held". Same card grid and anatomy, but visually distinct:
- **Dashed border** `1px dashed rgba(16,18,22,0.14)`, **transparent bg**, no shadow; hover border `rgba(16,18,22,0.30)`.
- **Hollow color dot** (1.5px ring, no fill) instead of solid.
- Footer-left shows the **company name** (10.5px `#8b929c`, ellipsized) instead of a value.
- Day toggle: € mode shows **native per-share change** (`+$0.55`, `-€1.61p`… no position exists). Same market-hours states.
- Card → stock detail (read-only position card there is future work).

Data: `WATCHLIST` in mock.js — `{ticker,label,yahoo,currency,price,prevClose}` + same intraday shape as positions.

## 3. Currency formatting (GBX)

`fmtNative`: USD → `$53.42`, EUR → `€32.02`, **GBX → `11.86p`** (pence suffix, no fake £ conversion). Day-€ toggle for GBX watch tickers: `+0.44p`. LSE (`.L`) session = 09:00–17:30 CET, same bucket as EU exchanges.

## 4. Main chart features

All on the portfolio chart. Controls sit right of the period pills (wraps below on mobile): a **€|%** segmented control and a **"vs S&P 500"** chip (with a 10×2px indigo dash glyph; 0.4 opacity/no-op while 1D is active). Chip/segment styling matches period pills (active `#eceae3` + 700).

1. **Crosshair + tooltip** — mousemove/touch-drag snaps to nearest data point: dashed vertical line `rgba(16,18,22,0.25)` + 3.5px dot with `#fafaf8` stroke. Tooltip: fixed-top card (190px, white 0.97, radius 10px, shadow `0 4px 14px rgba(16,18,22,0.08)`), flips side near the right edge, pointer-events none. Content — title 10px mono `#8b929c` (time on 1D, "8 Mar 25" else); value 14px/700 dark; then 11px/600 lines: 1D → delta vs prev close (colored); periods → "invested €X" muted, "+€Y P&L" colored, "S&P 500 …" indigo when benchmark on, and any transactions at that point.
2. **Gain/loss fill** — 1M–Max in € mode: region between value line and dashed invested line fills `rgba(4,120,87,0.09)` above / `rgba(185,28,28,0.09)` below, split at crossings. The plain gradient area is dropped in this mode (kept for 1D and % mode).
3. **Benchmark overlay** — indigo `#6366f1` 1.5px line @ 0.85, the index re-based to the window's first portfolio value (€ mode) or 0% (% mode). Not drawn on 1D. Production: real index total-return series, not the mock's synth.
4. **Transaction markers** — 3px dots on the value line at buy/sell/dividend dates (green/red/indigo, 1.5px `#fafaf8` stroke); details surface in the crosshair tooltip.
5. **€ / % toggle** — % re-bases: 1D vs prev close, longer periods vs window start. In % the invested overlay + gain fill are hidden (benchmark comparison is the point). Grid labels `+12.4%` style.
6. **Session shading (1D)** — bands EU 09:00–15:30 / EU+US 15:30–17:30 / US 17:30–22:00 at `rgba(16,18,22,0.018)` (overlap 0.045), 8px uppercase labels top-center of each band, `#c6cad1`.
7. **High/low tags** — 2px dark dots at period max/min with 9px mono `#6a6f78` value labels (above max, below min, x-clamped to chart bounds). Omitted when flat.

## State Management

- New UI state: `dayMode` (% | €, persisted), `yMode` (€ | %), `showBench` (bool), hover index (ephemeral). No new stores.
- Watchlist: extend the intraday store to fetch quotes/sessions for non-held tickers.

## Design Tokens

Per previous handoffs, plus: card radius 14px; watch dashed border; day-change 15px mono 700; washed pre-open colors at 0.55 alpha; benchmark `#6366f1`; fill alphas 0.09; band alphas 0.018/0.045.

## Files

- `Revamp - Dashboard v2.dc.html` — the design (resize for mobile/desktop; Tweaks: market simulation states; try 1Y + vs S&P 500 + %).
- `mock.js` — data shapes incl. `WATCHLIST` and GBX.
- `support.js` — prototype runtime; ignore.
