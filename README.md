# Portfolio Tracker

Self-hosted portfolio tracker met server-side Yahoo Finance data caching.

## Features

- **Server-side Yahoo Finance fetching** — geen CORS issues, geen browser proxy
- **Disk cache** — data wordt 4 uur gecached, daarna auto-refresh
- **Rate limit friendly** — 1.2s delay tussen Yahoo requests
- **Batch endpoint** — alle tickers in één request
- **Geen build step** — plain HTML + Chart.js, geen React build nodig
- **Docker ready** — deploy met `docker compose up`

## Quick Start (lokaal)

```bash
npm install
npm start
# → http://localhost:3069
```

## Docker Deploy (Proxmox)

```bash
# Clone of kopieer naar je server
docker compose up -d

# Of zonder compose:
docker build -t portfolio-tracker .
docker run -d --name portfolio-tracker -p 3069:3069 -v $(pwd)/cache:/app/cache portfolio-tracker
```

## API Endpoints

| Endpoint | Methode | Beschrijving |
|---|---|---|
| `/api/candles/:symbol?from=YYYY-MM-DD` | GET | Enkele ticker ophalen |
| `/api/batch?symbols=ASTS,RKLB&froms=2024-01-01,2024-01-01` | GET | Batch fetch alle tickers |
| `/api/cache/status` | GET | Cache status bekijken |
| `/api/cache/clear` | POST | Cache wissen en opnieuw laden |

## Transacties aanpassen

Edit `public/index.html` en pas de `RAW_TRANSACTIONS` array aan met je DeGiro export data.

## Reverse Proxy (optioneel)

Als je het achter je nginx/caddy wilt zetten:

```nginx
location /portfolio/ {
    proxy_pass http://localhost:3069/;
}
```

## Technische details

- **Server**: Express.js (Node 20+)
- **Frontend**: Vanilla JS + Chart.js (geen React build)
- **Cache**: JSON bestanden in `./cache/` directory
- **Port**: 3069 (configureerbaar via PORT env var)
- **Yahoo rate limit**: 1.2s delay tussen requests, ~100 requests/uur
# portfolio-tracker
