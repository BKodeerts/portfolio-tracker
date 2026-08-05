# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Self-hosted stock portfolio tracker with Yahoo Finance data, deployed as a Home Assistant add-on. Dutch UI, English code.

## Development Commands

```bash
# All commands run from portfolio-tracker/
cd portfolio-tracker

npm run dev          # Frontend dev server (Vite/SvelteKit, proxies /api to :3069)
npm run dev:server   # Backend server (Express, port 3069)
npm run build        # Build frontend to dist/ (static adapter, relative paths)
npm start            # Production: serves built frontend + API
npm run check        # svelte-check (TypeScript)
npm run lint         # eslint
npm test             # vitest (domain, server and frontend suites)
npm run test:watch   # vitest watch mode
docker-compose up --build   # from repo root, runs on port 3069
```

Run both `dev` and `dev:server` simultaneously for local development.

CI (`.github/workflows/ci.yml`) runs on every PR: `npm test`, `npm run check`, `npm run lint`, `npm run build`, and a server module-load smoke check. All must pass.

## Live market data: you cannot reach Yahoo

**Never try to call the Yahoo Finance API yourself.** There is no network egress to `query1.finance.yahoo.com` from the Claude Code environment — attempts fail with `403 Host not in allowlist`. Do not try to verify a market-data assumption by fetching it.

When you need real data, **ask the user to run a curl and paste the output.** Give one self-contained command, piped through `jq` so it prints only the fields in question rather than a raw dump:

```bash
curl -s -A 'Mozilla/5.0' \
  'https://query1.finance.yahoo.com/v8/finance/chart/SYMBOL?interval=5m&range=5d&includePrePost=true' \
| jq '.chart.result[0].meta'
```

Ask early. Reasoning from the code alone once shipped a release (0.13.4) whose fix could not work, because the assumed data simply wasn't in the payload.

Payload facts that took several release cycles to establish:

- **A 5-minute bar's close is not a closing price.** The last regular bar ends at 15:55 ET; the official close prints at 16:00:01, inside the following (post-market) bar. Use `meta.regularMarketPrice` (the session's official close, or the live price) and `meta.previousClose` (the close before it), trusting them only when `meta.regularMarketTime` dates them to the session you mean.
- **`meta.regularMarketPreviousClose` does not exist in chart meta** — it is a quote-endpoint field. The chart-meta name is plain `previousClose`.
- **`includePrePost=true` interleaves extended-hours candles.** Any "previous close" scan must filter to regular trading hours, or it lands on the prior day's post-market price.
- **`range` must span more than the sessions you need.** At `range=2d` the payload holds only `[previous session, today]`, which is too short to find the close *before* the previous session during pre-market.

## Architecture

**Monorepo layout:** repo root contains `docker-compose.yml`, `data/` (runtime data), and `portfolio-tracker/` with all application code.

**Core principle: the server computes, the client renders.** All persisted money math (positions, P&L, FX, performance) lives server-side in pure, tested functions; the frontend never derives money values from raw candles except for pure presentation (sparkline shapes, chart scaling). The one exception is the live-intraday layer (`src/lib/fx.ts` + `src/lib/derived/`), which converts live prices using server-provided per-currency rates.

### Backend (`portfolio-tracker/server/`) — CommonJS (see `server/package.json`), untyped JS

- **Express.js** (Node 20+), entry point `server/index.js`, port 3069
- **`server/domain/`**: pure functions, no I/O — the tested core:
  - `fx.js` — FX conversion (`toEur`), loads `shared/fx-defs.json` (incl. GBX pence scaling)
  - `positions.js` — shares, FIFO cost basis, native-currency avg cost, realized P&L, split detection
  - `performance.js` — TWR, XIRR, risk metrics, rolling returns
  - `series.js` — chart/benchmark series building
  - `stats.js` — per-ticker price returns (1M/6M/1Y/3Y/all) for the stock detail Returns card
- **`server/portfolio.js`**: thin orchestrator over `domain/` (`computeFullPortfolio` / `computeCurrentSnapshot`), shared by API routes, HA integration, and scheduler
- **Routes** (`server/routes/`): thin HTTP layer, each file mounts on `/api` — candles (`/candles/:symbol`, `/batch`, `/quotes`, `/intraday`, `/lookup`), transactions, portfolio, settings, ha, bonus, cache-routes, ticker-meta, stats (`/stats/:symbol` — 52w range, mkt cap, volumes, P/E, price returns)
- **`server/routes/portfolio.js`**: 5-min in-memory response cache with generation-based invalidation on transaction writes; concurrent requests share one in-flight computation (60s timeout)
- **`server/yahoo.js`**: Yahoo Finance v8 API client (`query1.finance.yahoo.com`), native `https`, 100ms delay between requests, 3 retries with 2s/4s/8s backoff
- **`server/cache.js`**: disk-based JSON cache in `cache/` — 24h TTL historical candles, 15min quotes, 5min intraday
- **`server/scheduler.js`**: periodic background tasks (HA sensor push, EOD state writer)
- **`server/mqtt-helper.js` / `server/ha-helper.js`**: Home Assistant MQTT discovery integration

### Frontend (`portfolio-tracker/src/`) — SvelteKit 5 (runes) + TypeScript + ECharts

- **Routes** (`src/routes/`): `/` (at-a-glance dashboard: live hero, period chart, holding + watchlist cards, allocation, recent activity), `stock/[ticker]` (position deep dive — all numbers from server `positions[]`), `analysis`, `transactions`, `import` (DeGiro CSV/XLSX), `settings`, `bonus`. Nav tabs: Portfolio / Analysis / Activity. There is no separate intraday tab — live intraday lives in the dashboard and deep dive.
- **Stores** (`src/lib/stores/`): `portfolio.svelte.ts`, `intraday.svelte.ts`, `theme.svelte.ts` — Svelte 5 rune-based singleton stores; state + fetch only, no money math
- **Derived** (`src/lib/derived/`): `dashboard.ts` (`getLiveData` — the single source for live dashboard values), `intraday.ts`
- **Live FX** (`src/lib/fx.ts`): `liveRateFor` / `toEurLive` — live conversion keyed on each position's trading currency using rates from the intraday store; never assume fx=1 from an exchange suffix
- **Market** (`src/lib/market/`): the one module for market hours, session bounds, and market-state normalization — do not re-implement this per page
- **Charts** (`src/lib/charts/`): shared theme-aware ECharts option builders (`base.ts`, `dashboard.ts`)
- **Components** (`src/lib/components/`): `Nav.svelte`, `PrivacyValue.svelte`, plus `dashboard/HoldingCard.svelte` (the dashboard's only mounted card) and `shared/` (PeriodChart, PeriodPills, IntradaySparkline, AllocationBar, ActivityList, …)
  - **Unmounted, pending removal:** `dashboard/` ChartCard, HeroSummary, IntradayCards, PositionCards, PositionsTable, MoversStrip, MiniTrend, plus `Sparkline.svelte` and `SummaryBar.svelte`. Nothing imports them, and some still contain superseded logic (`charts/dashboard.ts`'s `build1DOption` reads a raw `previousClose` baseline that was corrected elsewhere). Do not copy patterns from these files or count them as live behaviour.
- **API layer** (`src/lib/api/`): typed fetchers; `client.ts` handles the HA ingress base path (`/api/hassio_ingress/<token>/`); `portfolio.ts` runtime-checks the `/api/portfolio` response shape
- **Utils** (`src/lib/utils/`): fmt, period, color, csv (DeGiro parsing)
- **Types** (`src/lib/types/`): hand-written mirrors of API response shapes
- Static build via `@sveltejs/adapter-static`; `npm run build` post-processes `dist/index.html` to relative `_app` paths for HA ingress

### Tests (`portfolio-tracker/tests/`)

- **`tests/domain/`** — pure domain modules (fx, positions, performance, series, stats, tax) with fixture transactions covering multi-currency (incl. GBX), splits, partial sales, dividends, and sold-out positions. These define correct money-math behaviour; extend them when touching anything in `server/domain/`.
- **`tests/server/`** — session and price derivation in `server/yahoo.js`: which session gets drawn, and which close it is measured against. Built from real captured payloads. Extend when touching `deriveSession` / `applyOfficialCloses`.
- **`tests/frontend/`** — pure helpers only (market hours, `prevSessionMove`). No component rendering.

A test that passes against the pre-fix code is worthless. When fixing a bug, confirm the new test fails first (`git stash` the source change, run, restore).

### Data Flow

1. Transactions live in `data/transactions.json` (DATA_DIR env-overridable; `/data/` in the HA add-on)
2. Frontend calls `/api/portfolio` (full computed portfolio: positions, chart series, benchmarks, metrics) plus `/api/intraday` and `/api/candles` for charts
3. Server fetches from Yahoo Finance with disk caching; all persisted money math is server-side

## Key Conventions

- **Version bumps**: Edit only `portfolio-tracker/config.yaml` (`version:` field). Do NOT touch `package.json` — config.yaml is the HA add-on version source of truth. Add a matching entry to `portfolio-tracker/CHANGELOG.md`.
- **Multi-currency**: FX definitions live in `portfolio-tracker/shared/fx-defs.json` — the single source of truth, consumed by `server/domain/fx.js` and `src/lib/constants.ts`. Edit only the JSON. GBX (London pence) has `scale: 100`.
- **Transaction format**: `ticker` (internal name), `yahoo` (Yahoo symbol), `currency` (stock trading currency), `costEur` (absolute EUR cost), `shares` (negative = sale, 0 = dividend)
- **Benchmark**: `VWCE.DE`, indexed to 100 at first portfolio date; S&P 500 (`^GSPC`) secondary
- **DeGiro import**: Dutch number format (`1.234,56`), split-lot aggregation by Order ID + ISIN (`src/lib/utils/csv.ts`)
- **Docker**: Multi-stage build. `run.sh` sets DATA_DIR/CACHE_DIR to `/data/` for the HA add-on environment. The Docker image must include `shared/` (a past release broke because `fx-defs.json` was missing from the image).
- **No client money recomputation**: when a number looks wrong on a page, fix it in `server/domain/` (with a test), not by deriving it in a Svelte component. Anti-patterns that were deliberately removed and must not return: `{@html}` SVG strings, `${ticker}_cost`-style magic keys in chart rows, `as string` casts on ticker metadata, exchange-suffix regexes used as FX proxies.
- **Graphs draw regular trading hours only** (0.13.8): no chart or sparkline renders pre/post-market ticks. Both the stock detail 1D chart and the dashboard card sparklines used to squeeze the drawn session into ~85% of the width and put a dotted extended-hours tail in the remainder — two time scales on one axis, reading as one continuous line, for thin-volume quotes that rarely survive the open. One x-scale per plot, regular hours, full width. The server still returns extended-hours ticks as `allPoints` on `/api/intraday`; nothing in the UI consumes them, and re-adding a tail is a product decision, not a bug fix. (This is separate from the *dashed horizontal prev-close baseline*, which is a different feature and stays.)
- **Refactor history**: `REFACTOR_PLAN.md` documents the completed 2026 refactor (phases 0–6) and its remaining follow-ups — useful context for why the architecture looks the way it does.
