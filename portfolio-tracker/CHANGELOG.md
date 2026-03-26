# Changelog

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
