# Changelog

## [0.9.0] — 2026-07-07

### Stock Detail v2 & Analysis v2 — responsive desktop layouts (design handoff 3)

- **Stock Detail desktop (≥900px)**: 1160px container with the back-button header (no top nav — it's a drill-in page), 42px price hero, 260px full-width chart that recomputes on resize, period pills capped at 440px, and the position card + history side by side below the pills.
- **Stock Detail market-hours states**: the header chip, price hero, 1D chart and "Today" cell now follow the ticker's own exchange session — pre-open shows the prev close with a dimmed previous-session chart and a dotted extended-hours ghost tail (chip `OPENS HH:MM`); live shows the growing session line with the pulsing now-dot (chip `OPEN`); after close the full session renders without a now-dot (chip `CLOSED`, caption "At close, HH:MM CET"). Reuses the dashboard sparkline phase logic; non-1D periods are unaffected.
- The hero price and day change now come from regular-session ticks only — extended-hours ticks no longer leak into the displayed price or the position card's "Today" P&L.
- **Analysis desktop (≥900px)**: top nav with Analysis active (no live-status chip on this screen), performance row with 30px TWR/IRR numbers and rolling returns beside them, and a two-column section — return-by-position bars at full width with Risk below on the left, Allocation on the right. Mobile keeps the handoff-1 layout and order exactly.

## [0.8.4] — 2026-07-06

### Calculation Fixes

- **Rolling returns (1W/1M/3M/YTD/1Y) are now time-weighted** — deposits and withdrawals inside the window no longer count as portfolio performance. Previously a €1,000 deposit into a €10,000 portfolio showed up as "+10%" in the 1M tile. Benchmarks were already price returns, so portfolio vs benchmark is now a fair comparison on every tile.
- **Risk metrics use flow-adjusted daily returns** — volatility, annualized return, Sharpe and beta no longer treat buy/sell days as price jumps; max drawdown is measured on the return index, so deposits can't mask a crash and withdrawals can't fake one. Annualized return is now TWR-consistent (was: CAGR of the contribution-inflated value series).
- **Sortino ratio is now computed server-side** — the Analysis page row rendered "–" forever because the server never emitted it.
- **HA/MQTT snapshot cost basis fixed** — `cost_basis`, unrealized P&L and P&L % sensors used gross buys (including shares already sold) instead of the FIFO cost basis of open shares, overstating cost after any sale. Now matches the dashboard's FIFO numbers.
- **Dashboard period % uses the period-start value** — the hero delta % for 1M/3M/YTD/1Y/3Y divided by cost basis, roughly doubling the displayed move for a portfolio that has doubled. It now uses the same base convention as the 1D delta (previous close).
- XIRR no longer assumes `transactions.json` is date-sorted; annual dividend totals clamp accidental negative entries the same way the dividend totals do.

### Naming Fixes

- Frontend `RiskMetrics` type now mirrors the server (`maxDrawdownPct`, `annualReturn`, `sortino`; dropped never-emitted `calmar`), removing the runtime field-name workaround on the Analysis page.
- Analysis "Volatility" sub-label said "1Y, annualized" but the metric covers the full history — now "annualized, full history".
- Stock page "Invested" stat renamed to "Cost basis" (it is the FIFO cost of the shares still held, not total deposits).
- Day P&L placeholders: the dashboard no longer shows a fake "+€0 (+0.00%)" day delta while intraday data is still loading — the delta is hidden until real data arrives.

## [0.8.1] — 2026-07-03

### Bug Fixes

- Fixed add-on failing to start after 0.8.0: the Docker image did not include `shared/fx-defs.json`, crashing the server on boot with MODULE_NOT_FOUND.

## [0.8.0] — 2026-07-03

### Major Refactor

- **SvelteKit 5 + TypeScript + ECharts frontend** (from the 0.7.0 beta line) is now the stable UI: at-a-glance dashboard with live hero, movers strip, positions table/cards, and a per-position deep-dive page.
- **Deep-dive page on server data** — native-currency average cost is now computed server-side from FIFO lots; new Dividenden and Gerealiseerde W/V stat cards; Koers/Waarde chart toggle showing the holding's EUR value over time.

### Bug Fixes

- **Multi-currency live values** — positions traded in GBX/CHF/SEK/DKK/NOK were converted with a 1:1 FX rate in live dashboard values (London prices were off by ~100×). All live money math is now keyed on the position's trading currency with a live rate per held currency.
- Fixed FX definition drift risk: one shared `shared/fx-defs.json` is consumed by both server and frontend.

### Internal

- Pure money math (FIFO, splits, XIRR, TWR, risk metrics, FX, chart series) extracted to `server/domain/` with a 44-test vitest suite.
- Typed API contract for chart data and ticker metadata, with a runtime shape check on `/api/portfolio` responses.
- Dashboard decomposed into components; SVG sparklines are a real Svelte component (no more HTML string injection); market-session logic consolidated into one module.
- CI workflow: tests, type check, lint, and build on every PR.

## [0.6.1] — 2026-04-03

### Bug Fixes

- Fixed cache group filters in the Settings page — "Historisch" and "Dagelijkse quotes" always showed 0 entries and clearing them had no effect. The prefix patterns did not match the actual cache filenames on disk.

## [0.6.0] — 2026-04-03

### New Features

- **Settings page** — dedicated settings tab (cogwheel icon) replacing the old inline config. Covers push interval, intraday toggle, base currency, watchlist, and granular per-ticker push-positions control (none / all / manual selection).
- **Cost vs. capital invested** — the Analyse tab now distinguishes between total cost paid and net capital currently deployed (accounting for sales), shown as separate metrics.
- **Privacy mode** — toggle to hide capital invested amounts from the UI.
- **Annual P&L table** — new breakdown table in Analyse showing realised and unrealised P&L by calendar year.
- **CSV export** — export positions and transactions as CSV files directly from the Analyse tab (Excel-compatible BOM included).
- **Currency P&L tile** — position modal now shows a dedicated P&L tile in the stock's native currency alongside the EUR figure.
- **Bonus type selector** — call-options bonus calculator now lets you choose the option type (call/put), with a corrected start-price calculation.
- **Cache management** — new cache clear button in the Settings page with per-group cache status display and selective invalidation.
- **Stale graph indicator** — intraday chart shows a visual warning badge when displayed data is from a previous session (weekend, holiday, or pre-open).

### Improvements

- **Intraday before market open** — the server now serves the previous complete intraday dataset before the market opens, instead of an empty chart.
- **Market closed tooltip** — hovering the market-status badge when the market is closed now shows a tooltip explaining the state.
- **Holiday & weekend awareness** — market state detection correctly identifies weekends and public holidays as dark days (no trading), avoiding stale-data confusion.
- **Graph shrinks during market hours** — the main portfolio graph reduces its height during intraday view to make room for the live intraday chart.
- **1D graph range fix** — the 1-day history range on the portfolio chart now correctly limits data to a single day.
- **Mobile nav & settings polish** — navigation and settings layout improvements for small screens.

### Bug Fixes

- Fixed stale graph visualisation not refreshing correctly after data update.
- Fixed bonus calculation using wrong start price for options.
- Fixed "no data" state incorrectly shown on weekends.
- Fixed cache clear not completing reliably.
- Fixed label display inconsistency in position details.

---

## [0.5.0] — prior release baseline
