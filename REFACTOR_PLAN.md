# Refactor Plan — Portfolio Tracker

**Goal:** a functional, at-a-glance portfolio page (total value, day move, per-position status in one screen) with a deep-dive view per position — built on a single, trustworthy calculation pipeline instead of the current mix of server-computed and client-recomputed numbers.

**Branch strategy:** each phase below is a separate PR on top of the previous one. No phase mixes "move code" with "change behaviour".

---

## 1. Current-state audit (what's actually wrong)

### 1.1 Documentation / meta inconsistencies
- **CLAUDE.md is stale and actively misleading.** It describes a vanilla-JS + Chart.js frontend (`src/main.js`, `src/state.js`, `src/tabs/`, `src/csv.js`, `/api/batch`) that no longer exists — the frontend was rewritten to SvelteKit 5 + TypeScript + ECharts (PR #14). Anyone (human or agent) following it will look for files that aren't there.
- `package.json` version is `0.7.0-redesign.2` while the stated convention is "version lives in `config.yaml` only".
- Repo hygiene: `data/transactions.*.bak.json` backup files are committed; `vstoxx.json` exists in both `server/` and `data/`; a stray `server/package.json` shadows the real one; `.DS_Store` and `.idea/` are checked in at the repo root.

### 1.2 Two calculation engines, two answers
The server (`server/portfolio.js`, ~1200 lines) computes positions, day P&L, FX conversion, TWR/IRR, risk metrics. The frontend then **recomputes** several of the same numbers differently:

- `src/routes/+page.svelte` `liveData` recomputes total value and day P&L from intraday points, overriding the server's `positions[].value`.
- `src/routes/stock/[ticker]/+page.svelte` derives value/cost/shares from magic keys in `chartData` rows (`ticker`, `${ticker}_cost`, `${ticker}_shares`) instead of the server's `positions` object, and reconstructs FX via an "implied rate" (`currentPrice / priceEur`).
- Day-% / day-€ per position exists in three places: server `positions[].dayPl`, dashboard `cards()` (intraday recompute), and the stock page (`dayChangePct`).

Result: header, table, and detail page can disagree, and every bug must be fixed in 2–3 places.

### 1.3 FX bugs in the live layer (highest-impact bug class)
- The server handles 13 currencies via `FX_DEFS` (incl. GBX pence scaling). The **client live layer handles exactly one**: `intradayStore.liveEurUsd`.
- `EU_EXCHANGE_RE = /\.(DE|AS|PA|L|MI|BR|SW|ST|HE|CO|OL)$/` is used to mean "priced in EUR, fx = 1". That is false for `.L` (GBX — off by ~100×), `.SW` (CHF), `.ST` (SEK), `.CO` (DKK), `.OL` (NOK). Any non-EUR, non-USD position gets a wrong live value and wrong day-P&L on the dashboard.
- `FX_DEFS` is hand-duplicated between `server/portfolio.js` and `src/lib/constants.ts` with a "keep in sync" comment instead of a shared source.

### 1.4 Weak typing at the data boundary
- `chartData` rows are `Record<string, unknown>` with per-ticker dynamic keys; `tickerMeta` values are accessed via `meta['yahoo'] as string` casts throughout. The compiler can't catch exactly the class of bug this codebase suffers from.
- The server is untyped CommonJS; the API response shape is only described by hand-written client types that can silently drift.

### 1.5 Oversized, mixed-concern components
- `src/routes/+page.svelte` is 1240 lines: data derivation, hand-built SVG sparkline strings injected via `{@html}`, two chart configs, movers logic, table + cards views, and ~600 lines of CSS in one file.
- Market-hours/market-state/sparkline logic is re-implemented in the dashboard, the intraday page, and the stock page with subtle differences (`utils/exchange.ts` helps but doesn't own the whole concern).
- ECharts option-building (theme colors, tooltip styling, axis config) is copy-pasted per page instead of shared builders.

### 1.6 No safety net
`vitest` is configured but there are **zero tests** — for a codebase whose core is money math (FIFO cost basis, split detection, XIRR, TWR, FX). This is the main reason bugs keep reappearing.

---

## 2. Target architecture

**Principle: the server computes, the client renders.** One pipeline produces every number shown anywhere; the client never derives money values from raw candles except for pure presentation (sparkline shapes, chart scaling).

```
server/
  domain/            # pure, tested functions (no I/O)
    fx.js            # FX_DEFS + toEur — single source of truth
    positions.js     # shares, FIFO cost, realized P&L, splits
    performance.js   # TWR, XIRR, risk metrics, rolling returns
    series.js        # chart/benchmark series building
  data/              # transactions, ticker-meta, settings persistence
  market/            # yahoo.js client + cache.js (unchanged behaviour)
  integrations/      # ha-helper, mqtt-helper, scheduler
  routes/            # thin HTTP layer only
shared/
  fx-defs.json       # consumed by both server and client build
src/
  lib/
    api/             # typed fetchers (as today)
    stores/          # portfolio, intraday, theme (state only, no math)
    market/          # ONE module for market hours / state / session bounds
    charts/          # shared ECharts option builders (theme-aware)
    components/      # Sparkline.svelte (real component, no @html),
                     # PositionRow, StatCard, PeriodSelector, MoversStrip
  routes/
    +page.svelte           # at-a-glance dashboard (thin composition)
    stock/[ticker]/        # deep-dive (thin composition)
```

### The two key pages
**At-a-glance dashboard (`/`)** — one screen, no scrolling needed for the essentials:
1. Hero: total value, day € / day %, total P&L — all served by one endpoint (see 3.2), never client-recomputed.
2. Portfolio chart with period selector (1D intraday ↔ historical, as today, via shared chart builders).
3. Positions list: each row = name, value, day %, total P&L %, 3-month sparkline, live/market-state badge → click-through to deep dive. Movers strip on top.

**Deep dive (`/stock/[ticker]`)** — everything about one position:
price + regular/extended split, position stats (shares, avg cost in native ccy **from the server**, cost basis, day and total P&L), full-period chart, dividends & realized P&L for that ticker, transaction history. All numbers come from `positions[]` / a per-ticker endpoint — no more `chartData` magic-key mining or implied-FX reconstruction.

---

## 3. Phased plan

### Phase 0 — Ground truth & hygiene (small PR, no behaviour change)
- Rewrite **CLAUDE.md** to describe the SvelteKit reality (commands: `dev`, `dev:server`, `check`, `lint`, `test`, `build`).
- Delete committed `*.bak.json`, duplicate `vstoxx.json`, stray `server/package.json`, `.DS_Store`; extend `.gitignore` (`.idea/`, `data/*.bak.json`).
- Decide the version story once (config.yaml stays source of truth; freeze `package.json` version) and document it.

### Phase 1 — Test harness around the money math (the enabler)
- Extract the pure functions already present in `server/portfolio.js` (`toEur`, `fifoCostBasis`, `fifoCostNativeEur`, `computeRealizedPl`, `detectSplitFactors`, `computeXIRR`, `computeServerTWR`, `computeRiskMetrics`, `buildChartData`) into `server/domain/` modules with injected data (no `fs`/network inside).
- Add vitest coverage with fixture transactions: multi-currency (incl. GBX), splits, partial sales, dividends, sold-out positions. **These tests define correct behaviour before anything else moves.**
- `computeFullPortfolio` / `computeCurrentSnapshot` become thin orchestrators.

### Phase 2 — Single source of truth for FX and live values
- Move `FX_DEFS` to one shared definition (`shared/fx-defs.json`, imported by server and bundled into the client) — delete the "keep in sync" convention.
- **Fix the live-value bug:** server's intraday/quotes endpoint returns, per symbol, the trading currency and a live EUR rate for it (it already fetches FX quotes). Client live math becomes `shares * price → toEur(currency)` using server-provided rates; delete `EU_EXCHANGE_RE`-as-FX-proxy (keep it only for market-hours if still needed, inside `lib/market/`).
- Add a `GET /api/portfolio/live` (or extend `/api/quotes`) returning per-position `{ livePrice, dayPl, dayPlPct, valueEur }` so the dashboard hero and rows read server numbers even for the live view. The client no longer sums money.

### Phase 3 — Typed API contract
- Define the response types once (JSON-schema or a `shared/types` package consumed by both sides; minimum: hand-written types + a runtime sanity check in `api/client.ts`).
- Replace wide `chartData` rows with an explicit shape: `{ date, total, cost, perTicker: { [ticker]: { value, cost, shares } } }` — kills the `${ticker}_cost` magic keys and all `as string` casts on `tickerMeta` (give `TickerMeta` real fields: `yahoo`, `label`, `currency`, `manualPrice?`).

### Phase 4 — Frontend decomposition
- Extract from `+page.svelte`: `Sparkline.svelte` (SVG as markup, not `{@html}` strings), `MoversStrip.svelte`, `PositionsTable.svelte` / `PositionCards.svelte`, `HeroSummary.svelte`; move chart option building into `lib/charts/` (one themed base builder + per-chart variants shared with stock/analysis/intraday pages).
- Consolidate market hours / session bounds / market-state normalization into `lib/market/` — one implementation used by dashboard, intraday page, and stock page.
- Stores keep state + fetch only; all `$derived` money math disappears (now served).
- Target: no route file over ~300 lines.

### Phase 5 — Deep-dive page on the new contract
- Rebuild `/stock/[ticker]` on `positions[]` + a per-ticker slice (dividends, realized P&L, native-ccy avg cost — server-computed, replacing implied-FX). Add per-ticker dividend/realized blocks the data already supports (`dividendsPerTicker`, `realizedPlPerTicker`).
- Fold the useful parts of the analysis page (rolling returns, risk) into either the dashboard's secondary section or the deep dive, and evaluate whether the separate intraday tab is still needed once the dashboard's 1D view and deep dive cover it (likely: delete the tab, keep the route as a redirect).

### Phase 6 — Cleanup & guardrails
- `svelte-check` + `eslint` + `vitest` in CI (GitHub Action) so regressions get caught; forbid `{@html}` and `as string` casts on API data via lint rules where practical.
- Server-side: split remaining `portfolio.js` orchestration, review route-level caching (the 5-min in-memory cache + generation counter in `routes/portfolio.js` moves next to the engine).
- Re-verify HA/MQTT integration and the DeGiro import flow end-to-end (they share the engine, so Phases 1–2 changes must be validated against them).

---

## 4. Known bugs to fix along the way (tracked per phase)
| Bug | Where | Phase |
|---|---|---|
| ~~Non-USD foreign positions (GBX/CHF/SEK/DKK/NOK) get fx=1 in live dashboard values~~ **fixed** | `src/lib/fx.ts` + currency-aware live math | 2 ✅ |
| ~~Only EURUSD live rate exists client-side~~ **fixed** — `liveRates` per held currency | `intraday.svelte.ts` | 2 ✅ |
| Stock page derives avg cost via implied FX (wrong when price moved intraday) | `stock/[ticker]/+page.svelte:77-79` | 5 |
| ~~Dashboard total FX inconsistency; SummaryBar duplicated liveData~~ **fixed** — one `getLiveData` | `derived/dashboard.ts` | 2 ✅ |
| ~~FX_DEFS drift risk between server and client~~ **fixed** — `shared/fx-defs.json` | shared JSON | 2 ✅ |
| ~~Stale CLAUDE.md misdirects tooling~~ **fixed** | repo root | 0 ✅ |

## 5. Risks & mitigations
- **Money-math regressions:** Phase 1 tests are written against *current* outputs first (golden-master on a fixture portfolio), then corrected deliberately — so refactors are provably behaviour-preserving.
- **HA add-on breakage:** scheduler/MQTT consume the same engine; keep `computeCurrentSnapshot`'s output shape stable until Phase 6, and smoke-test the Docker build (`docker-compose up --build`) at each phase boundary.
- **Yahoo API fragility:** untouched by this plan (`server/yahoo.js` + cache stay as-is); domain extraction injects candle data, which also makes tests independent of Yahoo.

## 6. Effort estimate
Phases 0–1: ~1–2 days · Phase 2: ~1 day · Phase 3: ~1 day · Phase 4: ~2 days · Phase 5: ~1 day · Phase 6: ~1 day. Each phase leaves the app shippable.
