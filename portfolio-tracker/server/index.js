const express = require('express');
const path    = require('node:path');

const app = express();

// CORS: allow same-origin requests and explicit localhost/LAN origins for dev.
// The frontend is served by this same Express process in production, so browsers
// will never send a cross-origin header for normal usage.  We only need to allow
// the Vite dev proxy (localhost:5173) and any HA ingress proxy.
// Set CORS_ORIGIN env var (comma-separated) to allow additional origins (e.g. Nabu Casa URL).
const _extraOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
  : [];
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3069',
  'http://localhost:5173',
  'http://127.0.0.1:3069',
  ..._extraOrigins,
]);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) {
    // Same-origin or non-browser request — always allow
    return next();
  }
  if (ALLOWED_ORIGINS.has(origin) || origin.startsWith('http://homeassistant')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '10mb' }));

// ── Startup environment validation ────────────────────────────────────────────
const DATA_DIR  = process.env.DATA_DIR;
const CACHE_DIR = process.env.CACHE_DIR;
if (!DATA_DIR)  console.warn('[Startup] DATA_DIR not set — using default ./data (OK for local dev)');
if (!CACHE_DIR) console.warn('[Startup] CACHE_DIR not set — using default ./cache (OK for local dev)');

const PORT = process.env.PORT || 3069;

// ── Optional API token auth ───────────────────────────────────────────────────
// Set API_TOKEN env var to require a token on all state-mutating endpoints.
// The frontend sends it via the X-API-Token header; it is never exposed to other origins.
const API_TOKEN = process.env.API_TOKEN || null;
if (API_TOKEN) {
  console.log('[Auth] API_TOKEN is set — mutating endpoints require X-API-Token header');
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const provided = req.headers['x-api-token'] || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    if (provided !== API_TOKEN) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    next();
  });
}

app.use('/api', require('./routes/bonus.js'));
app.use('/api', require('./routes/candles.js'));
app.use('/api', require('./routes/transactions.js'));
app.use('/api', require('./routes/cache-routes.js'));
app.use('/api', require('./routes/ha.js'));
app.use('/api', require('./routes/portfolio.js'));
app.use('/api', require('./routes/settings.js'));
app.use('/api/ticker-meta', require('./routes/ticker-meta.js'));

// ── Health check ──────────────────────────────────────────────────────────────
const fs = require('node:fs');
app.get('/health', (req, res) => {
  const { CACHE_DIR: cDir } = require('./cache.js');
  const cacheWritable = (() => { try { fs.accessSync(cDir, fs.constants.W_OK); return true; } catch { return false; } })();
  const status = cacheWritable ? 'ok' : 'degraded';
  res.status(cacheWritable ? 200 : 503).json({ status, cache_dir: cDir, cache_writable: cacheWritable });
});

// Serve built frontend
const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')));

// Copy Lovelace card to /config/www/ so it's accessible via /local/ (works with Nabu Casa)
try {
  const wwwDir  = '/config/www/portfolio-tracker';
  const cardSrc = path.join(__dirname, '..', 'dist', 'portfolio-card.js');
  const cardDst = path.join(wwwDir, 'portfolio-card.js');
  if (!fs.existsSync(wwwDir)) fs.mkdirSync(wwwDir, { recursive: true });
  fs.copyFileSync(cardSrc, cardDst);
  console.log('[HA] Lovelace card copied to /config/www/portfolio-card.js');
} catch (e) {
  console.warn('[HA] Could not copy Lovelace card:', e.message);
}

const { CACHE_DIR, CACHE_TTL } = require('./cache.js');
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Portfolio Tracker running at http://0.0.0.0:${PORT}`);
  console.log(`   Cache dir: ${CACHE_DIR}`);
  console.log(`   Cache TTL: ${CACHE_TTL / 3600000}h\n`);
  const scheduler = require('./scheduler');
  scheduler.start();
  scheduler.startEodWriter();
});
