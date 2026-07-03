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
npm test             # vitest
docker-compose up --build   # from repo root, runs on port 3069
```

Run both `dev` and `dev:server` simultaneously for local development.

## Architecture

**Monorepo layout:** repo root contains `docker-compose.yml`, `data/` (runtime data), and `portfolio-tracker/` with all application code.

### Backend (`portfolio-tracker/server/`) — CommonJS (see `server/package.json`), untyped JS

- **Express.js** (Node 20+), entry point `server/index.js`, port 3069
- **Routes** (`server/routes/`): each file mounts on `/api` — candles, transactions, portfolio, settings, ha, bonus, cache-routes, ticker-meta
- **`server/portfolio.js`**: Core calculation engine shared by API routes, HA integration, and scheduler. Positions, FIFO cost basis, split detection, P&L, FX conversion, TWR/XIRR, risk metrics, benchmarks
- **`server/yahoo.js`**: Yahoo Finance v8 API client (`query1.finance.yahoo.com`), native `https`, 100ms delay between requests
- **`server/cache.js`**: Disk-based JSON cache in `cache/` — 24h TTL historical candles, 15min quotes, 5min intraday
- **`server/scheduler.js`**: Periodic background tasks (HA sensor push, EOD state writer)
- **`server/mqtt-helper.js` / `server/ha-helper.js`**: Home Assistant MQTT discovery integration
- **`server/routes/portfolio.js`**: 5-min in-memory response cache with generation-based invalidation on transaction writes

### Frontend (`portfolio-tracker/src/`) — SvelteKit 5 (runes) + TypeScript + ECharts

- **Routes** (`src/routes/`): `/` (dashboard), `stock/[ticker]` (position deep dive), analysis, intraday, transactions, import (DeGiro CSV/XLSX), settings, bonus
- **Stores** (`src/lib/stores/`): `portfolio.svelte.ts`, `intraday.svelte.ts`, `theme.svelte.ts` — Svelte 5 rune-based singleton stores
- **API layer** (`src/lib/api/`): typed fetchers; `client.ts` handles the HA ingress base path (`/api/hassio_ingress/<token>/`)
- **Utils** (`src/lib/utils/`): fmt, period, color, exchange (market hours/state), csv (DeGiro parsing)
- **Types** (`src/lib/types/`): hand-written mirrors of API response shapes
- Static build via `@sveltejs/adapter-static`; `npm run build` post-processes `dist/index.html` to relative `_app` paths for HA ingress

### Data Flow

1. Transactions live in `data/transactions.json` (DATA_DIR env-overridable; `/data/` in the HA add-on)
2. Frontend calls `/api/portfolio` (full computed portfolio: positions, chart series, benchmarks, metrics) plus `/api/intraday` and `/api/candles` for charts
3. Server fetches from Yahoo Finance with disk caching; all money math is server-side

## Key Conventions

- **Version bumps**: Edit only `portfolio-tracker/config.yaml` (`version:` field). Do NOT touch `package.json` — config.yaml is the HA add-on version source of truth.
- **Multi-currency**: `FX_DEFS` lives in `portfolio-tracker/shared/fx-defs.json`, consumed by `server/domain/fx.js` and `src/lib/constants.ts` — edit only the JSON
- **Transaction format**: `ticker` (internal name), `yahoo` (Yahoo symbol), `currency` (stock trading currency), `costEur` (absolute EUR cost), `shares` (negative = sale, 0 = dividend)
- **Benchmark**: `VWCE.DE`, indexed to 100 at first portfolio date; S&P 500 (`^GSPC`) secondary
- **DeGiro import**: Dutch number format (`1.234,56`), split-lot aggregation by Order ID + ISIN (`src/lib/utils/csv.ts`)
- **Docker**: Multi-stage build. `run.sh` sets DATA_DIR/CACHE_DIR to `/data/` for the HA add-on environment.
- **Refactor in progress**: see `REFACTOR_PLAN.md` for the phased plan and target architecture.
