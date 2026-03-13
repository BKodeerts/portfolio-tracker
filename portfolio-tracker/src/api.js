import { SERVER_BASE } from './constants.js';

export async function fetchTransactions() {
  const res = await fetch(`${SERVER_BASE}/api/transactions`);
  return res.json();
}

export async function saveTransactions(mode, transactions) {
  const res = await fetch(`${SERVER_BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, transactions }),
  });
  return res.json();
}

export async function fetchBatch(symbols, froms) {
  const res = await fetch(`${SERVER_BASE}/api/batch?symbols=${symbols.join(',')}&froms=${froms.join(',')}`);
  return res.json();
}

export async function fetchQuotes(symbols) {
  const res = await fetch(`${SERVER_BASE}/api/quotes?symbols=${symbols.join(',')}`);
  return res.json();
}

export async function fetchIntraday(symbols, force = false) {
  const url = `${SERVER_BASE}/api/intraday?symbols=${symbols.join(',')}${force ? '&force=1' : ''}`;
  const res = await fetch(url);
  return res.json();
}

export async function lookupIsin(isin, exchange) {
  const res = await fetch(`${SERVER_BASE}/api/lookup?isin=${encodeURIComponent(isin)}&exchange=${encodeURIComponent(exchange)}`);
  return res.json();
}

export async function clearCacheApi() {
  return fetch(`${SERVER_BASE}/api/cache/clear`, { method: 'POST' });
}

export async function fetchCacheStatus() {
  const res = await fetch(`${SERVER_BASE}/api/cache/status`);
  return res.json();
}

export async function clearCacheGroup(group) {
  const res = await fetch(`${SERVER_BASE}/api/cache/clear?group=${group}`, { method: 'POST' });
  return res.json();
}

export async function fetchPortfolio() {
  const res = await fetch(`${SERVER_BASE}/api/portfolio`);
  return res.json();
}

export async function pushToHaApi() {
  const res = await fetch(`${SERVER_BASE}/api/ha/push`, { method: 'POST' });
  return res.json();
}

export async function fetchTickerMeta() {
  const res = await fetch(`${SERVER_BASE}/api/ticker-meta`);
  return res.json();
}

export async function fetchBonus() {
  const res = await fetch(`${SERVER_BASE}/api/bonus`);
  return res.json();
}

export async function saveBonus(entry) {
  const res = await fetch(`${SERVER_BASE}/api/bonus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  return res.json();
}

export async function deleteBonus(id) {
  return fetch(`${SERVER_BASE}/api/bonus/${id}`, { method: 'DELETE' });
}

export async function fetchSettings() {
  const res = await fetch(`${SERVER_BASE}/api/settings`);
  return res.json();
}

export async function saveSettings(settings) {
  const res = await fetch(`${SERVER_BASE}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function saveTickerMeta(meta) {
  const res = await fetch(`${SERVER_BASE}/api/ticker-meta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  return res.json();
}
