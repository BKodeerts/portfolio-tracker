// VSTOXX (V2TX) data fetcher — not integrated yet
// Source: https://stoxx.com/index/v2tx/
// API key is public (embedded in stoxx.com page HTML)

const https = require('https');

const VSTOXX_API_URL = 'https://quotes.stoxx.com/api/v2/quote/delayed/series?isin=DE000A0C3QF1';
const VSTOXX_API_KEY = '1388a22f-b1d4-4804-9a17-a59827c90e86';

/**
 * Fetches the full VSTOXX daily close series from stoxx.com.
 * Returns an array of { date: 'YYYY-MM-DD', close: number } objects.
 */
function fetchVstoxx() {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { Authorization: `Bearer ${VSTOXX_API_KEY}` },
    };
    https.get(VSTOXX_API_URL, options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`VSTOXX API returned ${res.statusCode}: ${raw}`));
        }
        try {
          const data = JSON.parse(raw);
          const result = data.map((d) => ({
            date: d.t.slice(0, 10), // "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DD"
            close: d.close,
          }));
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

module.exports = { fetchVstoxx };
