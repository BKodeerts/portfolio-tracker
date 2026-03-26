# Portfolio Tracker

Self-hosted stock portfolio tracker with Yahoo Finance data, live intraday charts, and optional Home Assistant integration.

## Features

- **Portfolio tab** — total portfolio value as a line chart + per-position charts (€ and %)
- **Analyse tab** — allocation donut, cost vs. value, drawdown chart, benchmark vs. VWCE, annual P&L breakdown, CSV export
- **Intraday tab** — live intraday chart per position with market-hours awareness and stale-data indicator
- **Transactions tab** — full transaction history
- **Import tab** — DeGiro CSV upload with client-side parsing and ISIN mapping
- **Settings tab** — base currency, watchlist, intraday toggle, push interval, privacy mode
- **Multi-currency** — EUR, USD, GBP, CLP and more; FX rates via Yahoo Finance
- **Disk cache** — historical data cached for 4h, daily quotes for 1h
- **Home Assistant** — optional MQTT discovery with portfolio sensors

## Installation

### Home Assistant Add-on

Add this repository in Home Assistant → Add-on Store, install the add-on and start it.

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
- `shares` — negative for sales

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

- **Server**: Express.js (Node 20+)
- **Frontend**: Vanilla JS + Chart.js
- **Cache**: JSON files in `./cache/`
- **Data**: JSON files in `./data/`
- **Port**: 3069 (configurable via `PORT` env var)
- **Yahoo Finance**: `query1.finance.yahoo.com` v8 API, 1.2s delay between requests
