---
name: verify
description: Build, launch, and drive this app to verify changes end-to-end.
---

# Verifying portfolio-tracker

All commands from `portfolio-tracker/`.

## Build + launch against fixture data (no Yahoo access needed)

Yahoo (`query1.finance.yahoo.com`) is blocked in sandboxes; fetch failures
degrade gracefully. To get real prices without the network, use manual-priced
tickers (`ticker_meta.json` → `manualPriceEur` + `manualPriceAsOf`).

```bash
npm ci && npm run build        # build static frontend to dist/
mkdir -p /tmp/fix/data /tmp/fix/cache
# write /tmp/fix/data/transactions.json  ([{date,ticker,yahoo,currency,shares,costEur},...], shares<0 = sale)
# write /tmp/fix/data/ticker_meta.json   ({TICKER:{manualPriceEur,manualPriceAsOf}})
# optional /tmp/fix/data/settings.json
DATA_DIR=/tmp/fix/data CACHE_DIR=/tmp/fix/cache PORT=3069 npm start &
curl -s http://localhost:3069/api/portfolio   # {status:'ok',data:{...}}
```

## Drive the UI

Playwright: `npm i playwright-core` in a scratch dir, launch with
`executablePath: '/opt/pw-browsers/chromium'`. Pages: `/`, `/analysis`,
`/tax`, `/transactions`, `/settings`. Desktop breakpoint ≥900px; below that
the fixed bottom `.mobile-tab-bar` replaces the top nav. Dark mode: set
`data-theme="dark"` on `<html>`.

## Gotchas

- `/api/portfolio` has a 5-min in-memory cache; POST `/api/settings` or
  `/api/transactions` invalidates it.
- `npm start` serves the built `dist/` — rebuild after frontend changes.
