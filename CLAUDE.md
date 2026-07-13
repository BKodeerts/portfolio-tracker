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
npm test             # vitest (tests/domain/ — money-math suite)
npm run test:watch   # vitest watch mode
docker-compose up --build   # from repo root, runs on port 3069
```

Run both `dev` and `dev:server` simultaneously for local development.

CI (`.github/workflows/ci.yml`) runs on every PR: `npm test`, `npm run check`, `npm run lint`, `npm run build`, and a server module-load smoke check. All must pass.

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

- **Routes** (`src/routes/`): `/` (at-a-glance dashboard: live hero, movers strip, positions table/cards), `stock/[ticker]` (position deep dive — all numbers from server `positions[]`), `analysis`, `transactions`, `import` (DeGiro CSV/XLSX), `settings`, `bonus`. Nav tabs: Portfolio / Analysis / Activity. There is no separate intraday tab — live intraday lives in the dashboard and deep dive.
- **Stores** (`src/lib/stores/`): `portfolio.svelte.ts`, `intraday.svelte.ts`, `theme.svelte.ts` — Svelte 5 rune-based singleton stores; state + fetch only, no money math
- **Derived** (`src/lib/derived/`): `dashboard.ts` (`getLiveData` — the single source for live dashboard values), `intraday.ts`
- **Live FX** (`src/lib/fx.ts`): `liveRateFor` / `toEurLive` — live conversion keyed on each position's trading currency using rates from the intraday store; never assume fx=1 from an exchange suffix
- **Market** (`src/lib/market/`): the one module for market hours, session bounds, and market-state normalization — do not re-implement this per page
- **Charts** (`src/lib/charts/`): shared theme-aware ECharts option builders (`base.ts`, `dashboard.ts`)
- **Components** (`src/lib/components/`): `Sparkline.svelte`, `SummaryBar.svelte`, `Nav.svelte`, `PrivacyValue.svelte`, plus `dashboard/` (HeroSummary, MoversStrip, PositionsTable, PositionCards, …) and `shared/` (PeriodChart, PeriodPills, …)
- **API layer** (`src/lib/api/`): typed fetchers; `client.ts` handles the HA ingress base path (`/api/hassio_ingress/<token>/`); `portfolio.ts` runtime-checks the `/api/portfolio` response shape
- **Utils** (`src/lib/utils/`): fmt, period, color, csv (DeGiro parsing)
- **Types** (`src/lib/types/`): hand-written mirrors of API response shapes
- Static build via `@sveltejs/adapter-static`; `npm run build` post-processes `dist/index.html` to relative `_app` paths for HA ingress

### Tests (`portfolio-tracker/tests/domain/`)

Vitest suite over the pure domain modules (fx, positions, performance, series) with fixture transactions covering multi-currency (incl. GBX), splits, partial sales, dividends, and sold-out positions. These tests define correct money-math behaviour — extend them when touching anything in `server/domain/`.

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
- **Refactor history**: `REFACTOR_PLAN.md` documents the completed 2026 refactor (phases 0–6) and its remaining follow-ups — useful context for why the architecture looks the way it does.
