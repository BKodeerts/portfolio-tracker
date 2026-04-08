# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Self-hosted stock portfolio tracker with Yahoo Finance data, deployed as a Home Assistant add-on. Dutch UI, English code.

## Development Commands

```bash
# Frontend dev server (Vite, proxies /api to :3069)
cd portfolio-tracker && npm run dev

# Backend server
cd portfolio-tracker && npm run dev:server

# Build frontend (outputs to portfolio-tracker/dist/)
cd portfolio-tracker && npm run build

# Production start (serves built frontend + API)
cd portfolio-tracker && npm start

# Docker
docker-compose up --build    # runs on port 3069
```

Run both `dev` and `dev:server` simultaneously for local development. There are no tests or linting configured.

## Architecture

**Monorepo layout:** The root contains `docker-compose.yml`, `data/transactions.json`, and a `portfolio-tracker/` subdirectory with all application code.

### Backend (`portfolio-tracker/server/`)

- **Express.js** (Node 20+), entry point `server/index.js`, port 3069
- **Routes** (`server/routes/`): each file mounts on `/api` — candles, transactions, portfolio, settings, ha, bonus, cache-routes, ticker-meta
- **`server/portfolio.js`**: Core calculation engine shared by API routes, HA integration, and scheduler. Handles position building, P&L, FX conversion, benchmarks
- **`server/yahoo.js`**: Yahoo Finance v8 API client (`query1.finance.yahoo.com`). Uses native `https`, 100ms delay between requests
- **`server/cache.js`**: Disk-based JSON cache in `cache/` dir — 24h TTL for historical candles, 15min for quotes, 5min for intraday
- **`server/scheduler.js`**: Periodic background tasks (HA sensor push, EOD state writer)
- **`server/mqtt-helper.js` / `server/ha-helper.js`**: Home Assistant MQTT discovery integration

### Frontend (`portfolio-tracker/src/`)

- **Vanilla JS** + Chart.js, bundled by Vite. No framework.
- **Entry**: `src/main.js` → init() fetches transactions, builds state, renders tabs
- **State**: `src/state.js` — single mutable state object (RAW_TRANSACTIONS, TICKER_META, priceMaps, etc.)
- **Tabs** (`src/tabs/`): portfolio, analyse, intraday, transacties (transaction history), import (DeGiro CSV), settings
- **Components** (`src/components/`): header, donut
- **Constants** (`src/constants.js`): FX_DEFS, color palette, benchmark symbol

### Data Flow

1. Transactions loaded from `data/transactions.json`
2. Frontend calls `/api/batch` (historical candles) and `/api/quotes` (latest prices)
3. Server fetches from Yahoo Finance with disk caching
4. Frontend computes portfolio values, charts, benchmarks client-side

## Key Conventions

- **Version bumps**: Edit only `portfolio-tracker/config.yaml` (`version:` field). Do NOT touch `package.json` — config.yaml is the HA add-on version source of truth.
- **Multi-currency**: FX_DEFS must be kept in sync between `server/portfolio.js` and `src/constants.js`. Exchange suffixes live in `src/csv.js`, market hours in `src/tabs/intraday.js`.
- **Transaction format**: `ticker` (internal name), `yahoo` (Yahoo symbol), `currency` (stock trading currency), `costEur` (absolute EUR cost), `shares` (negative = sale)
- **Benchmark**: Always uses `VWCE.DE`, indexed to 100 at first portfolio date
- **DeGiro CSV**: Dutch number format (`1.234,56`), split-lot aggregation by Order ID + ISIN
- **Translations**: `portfolio-tracker/translations/en.yaml`
- **Docker**: Multi-stage build. `run.sh` sets DATA_DIR/CACHE_DIR to `/data/` for HA add-on environment.
