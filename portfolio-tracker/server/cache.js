const fs   = require('fs');
const path = require('path');

const CACHE_DIR          = process.env.CACHE_DIR || path.join(__dirname, '..', 'cache');
const CACHE_TTL          = 24 * 60 * 60 * 1000;  // 24h
const QUOTES_CACHE_TTL   = 24 * 60 * 60 * 1000;  // 24h
const INTRADAY_CACHE_TTL =  5 * 60 * 1000;        // 5min

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function getCacheFile(symbol) {
  const safe = symbol.replace(/[^a-zA-Z0-9.-]/g, '_');
  return path.join(CACHE_DIR, `${safe}.json`);
}

function readCache(symbol, ttl) {
  const file   = getCacheFile(symbol);
  const maxAge = ttl || CACHE_TTL;
  try {
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - raw._timestamp > maxAge) return null;
    return raw.data;
  } catch { return null; }
}

function readStaleCache(symbol) {
  const file = getCacheFile(symbol);
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')).data;
  } catch { return null; }
}

function writeCache(symbol, data) {
  try {
    fs.writeFileSync(getCacheFile(symbol), JSON.stringify({ _timestamp: Date.now(), data }));
  } catch (e) {
    console.error(`Cache write failed for ${symbol}:`, e.message);
  }
}

function clearAll() {
  const files = fs.readdirSync(CACHE_DIR);
  files.forEach(f => fs.unlinkSync(path.join(CACHE_DIR, f)));
  return files.length;
}

function status() {
  return fs.readdirSync(CACHE_DIR).map(f => {
    const raw = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
    const age = Date.now() - raw._timestamp;
    return { symbol: f.replace('.json', ''), age_minutes: Math.round(age / 60000), expired: age > CACHE_TTL, points: raw.data?.length || 0 };
  });
}

module.exports = { CACHE_DIR, CACHE_TTL, QUOTES_CACHE_TTL, INTRADAY_CACHE_TTL, readCache, readStaleCache, writeCache, clearAll, status };
