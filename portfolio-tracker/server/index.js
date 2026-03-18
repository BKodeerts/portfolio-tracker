const express = require('express');
const path    = require('path');

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3069;

app.use('/api', require('./routes/candles.js'));
app.use('/api', require('./routes/transactions.js'));
app.use('/api', require('./routes/cache-routes.js'));
app.use('/api', require('./routes/ha.js'));
app.use('/api', require('./routes/portfolio.js'));
app.use('/api/ticker-meta', require('./routes/ticker-meta.js'));

// Serve built frontend
const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')));

const fs = require('node:fs');

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
  require('./scheduler').start();
});
