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

// Serve built frontend
const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')));

const { CACHE_DIR, CACHE_TTL } = require('./cache.js');
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Portfolio Tracker running at http://0.0.0.0:${PORT}`);
  console.log(`   Cache dir: ${CACHE_DIR}`);
  console.log(`   Cache TTL: ${CACHE_TTL / 3600000}h\n`);
  require('./scheduler').start();
});
