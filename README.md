# Portfolio Tracker

Self-hosted stock portfolio tracker with Yahoo Finance data, live intraday charts, and optional Home Assistant integration.

## Features

- **Portfolio tab** — at-a-glance dashboard: total value, day move, live intraday hero chart, movers strip, and per-position rows with sparklines and market-state badges
- **Position deep dive** — click any position for its full history: price/value chart, shares, average cost in native currency, cost basis, dividends, realized P&L, and transactions
- **Analysis tab** — allocation donut, cost vs. value, drawdown chart, benchmark vs. VWCE, annual P&L breakdown, CSV export
- **Activity tab** — full transaction history
- **Import tab** — DeGiro CSV/XLSX upload with client-side parsing and ISIN mapping
- **Settings tab** — base currency, watchlist, intraday toggle, push interval, privacy mode
- **Multi-currency** — EUR, USD, GBP/GBX, CHF, SEK, DKK, NOK, CLP and more; FX rates via Yahoo Finance
- **Disk cache** — historical candles cached for 24h, daily quotes for 15min, intraday for 5min
- **Home Assistant** — optional MQTT discovery with portfolio sensors

## Installation

### Home Assistant Add-on

Add this repository in Home Assistant → Add-on Store, install the add-on and start it.

### Docker

```bash
docker-compose up --build   # from the repo root, serves on port 3069
```

## Development

```bash
cd portfolio-tracker
npm install
npm run dev:server   # Express API on port 3069
npm run dev          # Vite dev server, proxies /api to :3069
```

Quality checks: `npm test` (vitest), `npm run check` (svelte-check), `npm run lint` (eslint). All of these plus the build run in CI on every pull request.

## Transactions

Transactions are stored in `data/transactions.json`. You can manage them via the **Import** tab (DeGiro CSV upload) or by editing the file directly.

### Transaction format

```json
{
  "date": "YYYY-MM-DD",
  "ticker": "ASTS",
  "yahoo": "ASTS",
  "isin": "US00217E...",
  "shares": 64,
  "costEur": 1107.66,
  "currency": "USD",
  "label": "AST SpaceMobile"
}
```

- `ticker` — internal short name
- `yahoo` — Yahoo Finance symbol (may differ, e.g. `VWCE.DE`)
- `currency` — trading currency of the stock (not the export currency)
- `costEur` — absolute value of the DeGiro "Totaal EUR" column
- `shares` — negative for sales, `0` for dividends

## Settings

The **Settings** tab (cogwheel icon) exposes the following options:

| Option         | Description                              |
| -------------- | ---------------------------------------- |
| Base currency  | Portfolio base currency (default EUR)    |
| Intraday chart | Show intraday chart during market hours  |
| Push interval  | Interval (minutes) for HA sensor updates |
| Watchlist      | Additional Yahoo symbols to track        |
| Privacy mode   | Hide invested capital amounts            |
| Push positions | Which positions to push to HA            |

Settings are persisted in `data/settings.json`.

## Home Assistant Integration

The add-on supports optional MQTT integration. Enable it in the add-on **Configuration** tab, then restart. Once enabled, portfolio sensors are automatically registered via MQTT discovery and appear as entities in Home Assistant, grouped under a single "Portfolio Tracker" device.

## Technical details

- **Server**: Express.js (Node 20+), CommonJS; pure money math (FIFO cost basis, splits, TWR/XIRR, FX) in `server/domain/` with a vitest suite
- **Frontend**: SvelteKit 5 (runes) + TypeScript + ECharts, built as a static bundle
- **Cache**: JSON files in `./cache/` (24h historical / 15min quotes / 5min intraday)
- **Data**: JSON files in `./data/`
- **Port**: 3069 (configurable via `PORT` env var)
- **Yahoo Finance**: `query1.finance.yahoo.com` v8 API, 100ms delay between requests with retry/backoff
