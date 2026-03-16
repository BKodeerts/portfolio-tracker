import { state } from './state.js';
import { FX_SYMBOL, FX_FALLBACK, BENCHMARK_SYM } from './constants.js';
import { fetchBatch, fetchQuotes } from './api.js';
import { toEur } from './utils.js';
import { renderAppHeader } from './components/header.js';

export function buildTickerMeta() {
  state.TICKER_META = {};
  state.RAW_TRANSACTIONS.forEach(t => {
    if (!state.TICKER_META[t.ticker]) {
      state.TICKER_META[t.ticker] = { yahoo: t.yahoo, currency: t.currency, label: t.label };
    }
  });
}

export function computeCurrentTickers() {
  const net = {};
  state.RAW_TRANSACTIONS.forEach(t => { net[t.ticker] = (net[t.ticker] || 0) + t.shares; });
  return Object.keys(net).filter(t => net[t] > 0);
}

export async function loadData(onSuccess) {
  document.getElementById('root').innerHTML = `
    ${renderAppHeader()}
    <div class="loading">
      <div style="color:#94a3b8;font-size:13px;margin-bottom:12px">Koersen laden…</div>
      <div class="progress-bar"><div class="progress-fill" style="width:15%"></div></div>
    </div>`;

  try {
    const uniqueYahoo = {};
    state.RAW_TRANSACTIONS.forEach(t => {
      if (!uniqueYahoo[t.yahoo]) {
        const first = state.RAW_TRANSACTIONS.find(r => r.yahoo === t.yahoo);
        uniqueYahoo[t.yahoo] = { ticker: t.ticker, startDate: first.date };
      }
    });

    const symbols  = Object.keys(uniqueYahoo);
    const froms    = symbols.map(s => uniqueYahoo[s].startDate);
    const earliest = froms.reduce((a, b) => a < b ? a : b, froms[0]);

    const allSymbols = [...symbols];
    const allFroms   = [...froms];
    if (!allSymbols.includes(FX_SYMBOL))     { allSymbols.push(FX_SYMBOL);     allFroms.push(earliest); }
    if (!allSymbols.includes(BENCHMARK_SYM)) { allSymbols.push(BENCHMARK_SYM); allFroms.push(earliest); }

    const json = await fetchBatch(allSymbols, allFroms);
    if (json.status !== 'ok') throw new Error(json.message || 'Server error');

    const priceData = json.data;

    state.fxRateMap = {};
    if (priceData[FX_SYMBOL]) {
      priceData[FX_SYMBOL].forEach(d => { state.fxRateMap[d.date] = d.close; });
      delete priceData[FX_SYMBOL];
    }

    if (Object.values(priceData).filter(Boolean).length === 0) throw new Error('Geen koersdata ontvangen');

    const allDates = new Set();
    Object.values(priceData).forEach(h => { if (h) h.forEach(d => allDates.add(d.date)); });
    state.sortedDates = [...allDates].sort();

    state.priceMaps = {};
    Object.entries(priceData).forEach(([yahoo, history]) => {
      const m = {};
      if (history) history.forEach(d => { m[d.date] = d.close; });
      let last = null;
      state.sortedDates.forEach(date => {
        if (m[date] != null) last = m[date];
        else if (last != null) m[date] = last;
      });
      state.priceMaps[yahoo] = m;
    });

    let lastFx = FX_FALLBACK;
    state.sortedDates.forEach(date => {
      if (state.fxRateMap[date] != null) lastFx = state.fxRateMap[date];
      else state.fxRateMap[date] = lastFx;
    });

    const txByTicker = {};
    state.RAW_TRANSACTIONS.forEach(t => {
      (txByTicker[t.ticker] = txByTicker[t.ticker] || []).push(t);
    });

    const SPLIT_CANDIDATES = [2, 3, 4, 5, 8, 10, 20, 25, 50, 100];
    const splitFactors = {};
    Object.entries(txByTicker).forEach(([ticker, txs]) => {
      const meta = state.TICKER_META[ticker];
      for (const tx of txs.filter(t => t.shares > 0).sort((a, b) => a.date < b.date ? -1 : 1)) {
        const yahooPrice = state.priceMaps[meta.yahoo]?.[tx.date];
        if (!yahooPrice) continue;
        const fx = state.fxRateMap[tx.date] || FX_FALLBACK;
        const txPrice = meta.currency === 'USD' ? (tx.costEur / tx.shares) * fx : tx.costEur / tx.shares;
        const ratio = yahooPrice / txPrice;
        splitFactors[ticker] = ratio > 2
          ? SPLIT_CANDIDATES.reduce((b, f) => Math.abs(f - ratio) < Math.abs(b - ratio) ? f : b, 1)
          : 1;
        break;
      }
      if (splitFactors[ticker] == null) splitFactors[ticker] = 1;
    });

    function adjShares(tx, ticker) {
      const factor = splitFactors[ticker] || 1;
      if (factor === 1) return tx.shares;
      const meta = state.TICKER_META[ticker];
      const yahooPrice = state.priceMaps[meta.yahoo]?.[tx.date];
      if (!yahooPrice) return tx.shares;
      const fx = state.fxRateMap[tx.date] || FX_FALLBACK;
      const txPrice = meta.currency === 'USD'
        ? (Math.abs(tx.costEur) / Math.abs(tx.shares)) * fx
        : Math.abs(tx.costEur) / Math.abs(tx.shares);
      return yahooPrice / txPrice > 2 ? tx.shares / factor : tx.shares;
    }

    function fifoCostBasis(txs, ticker, upToDate) {
      const lots = [];
      for (const tx of txs.filter(t => t.date <= upToDate).sort((a, b) => a.date < b.date ? -1 : 1)) {
        const sh = adjShares(tx, ticker);
        if (tx.shares > 0) {
          lots.push({ shares: sh, costPerShare: tx.costEur / sh });
        } else {
          let toSell = -sh;
          for (const lot of lots) {
            const sold = Math.min(lot.shares, toSell);
            lot.shares -= sold;
            toSell -= sold;
            if (toSell <= 0) break;
          }
        }
      }
      return lots.filter(l => l.shares > 0).reduce((s, l) => s + l.shares * l.costPerShare, 0);
    }

    state.chartData = state.sortedDates.map(date => {
      const row = { date };
      let totalValue = 0, totalCost = 0;

      Object.entries(txByTicker).forEach(([ticker, txs]) => {
        const meta = state.TICKER_META[ticker];
        let sharesHeld = 0;
        txs.forEach(t => { if (t.date <= date) sharesHeld += adjShares(t, ticker); });

        if (sharesHeld > 0 && state.priceMaps[meta.yahoo]?.[date] != null) {
          const value = toEur(sharesHeld * state.priceMaps[meta.yahoo][date], meta.currency, date);
          row[ticker] = Math.round(value);
          row[`${ticker}_shares`] = sharesHeld;
          totalValue += value;

          const cost = fifoCostBasis(txs, ticker, date);
          row[`${ticker}_cost`] = Math.round(cost);
          totalCost += cost;
          if (cost > 0) row[`${ticker}_pct`] = (((value - cost) / cost) * 100).toFixed(1);
        }
      });

      if (totalValue === 0) return null;
      row.total     = Math.round(totalValue);
      row.totalCost = Math.round(totalCost);
      row.profit    = Math.round(totalValue - totalCost);
      row.pctReturn = totalCost > 0 ? (((totalValue - totalCost) / totalCost) * 100).toFixed(1) : '0.0';
      return row;
    }).filter(Boolean);

    state.benchmarkData = [];
    if (state.priceMaps[BENCHMARK_SYM] && state.chartData.length > 0) {
      const basePrice = state.priceMaps[BENCHMARK_SYM][state.chartData[0].date];
      if (basePrice) {
        state.chartData.forEach(row => {
          const p = state.priceMaps[BENCHMARK_SYM][row.date];
          if (p != null) state.benchmarkData.push({ date: row.date, value: parseFloat(((p / basePrice) * 100).toFixed(2)) });
        });
      }
    }

    // Append today from daily quotes
    try {
      const quoteSymbols = [...new Set(Object.values(state.TICKER_META).map(m => m.yahoo)), FX_SYMBOL];
      const qJson = await fetchQuotes(quoteSymbols);
      if (qJson.status === 'ok' && qJson.data) {
        const quotes = qJson.data;
        if (quotes[FX_SYMBOL]?.close) state.fxRateMap[quotes[FX_SYMBOL].date] = quotes[FX_SYMBOL].close;
        const dow = new Date().getDay();
        const todayDate = (dow > 0 && dow < 6) ? new Date().toLocaleDateString('sv-SE') : '';
        if (todayDate && todayDate > (state.chartData[state.chartData.length - 1]?.date || '')) {
          const row = { date: todayDate };
          let tv = 0, tc = 0;
          Object.entries(txByTicker).forEach(([ticker, txs]) => {
            const meta = state.TICKER_META[ticker];
            let sh = 0;
            txs.forEach(t => { if (t.date <= todayDate) sh += adjShares(t, ticker); });
            const q = quotes[meta.yahoo];
            if (sh > 0 && q?.close) {
              const val = toEur(sh * q.close, meta.currency, todayDate);
              row[ticker] = Math.round(val);
              row[`${ticker}_shares`] = sh;
              tv += val;
              const cost = fifoCostBasis(txs, ticker, todayDate);
              row[`${ticker}_cost`] = Math.round(cost);
              tc += cost;
              if (cost > 0) row[`${ticker}_pct`] = (((val - cost) / cost) * 100).toFixed(1);
            }
          });
          if (tv > 0) {
            row.total = Math.round(tv); row.totalCost = Math.round(tc);
            row.profit = Math.round(tv - tc);
            row.pctReturn = tc > 0 ? (((tv - tc) / tc) * 100).toFixed(1) : '0.0';
            state.chartData.push(row);
          }
        }
      }
    } catch (e) { console.warn('Daily quotes failed:', e.message); }

    // Recompute with split-adjusted share counts so fully-sold positions are excluded
    const latestRow = state.chartData[state.chartData.length - 1];
    if (latestRow) {
      state.CURRENT_TICKERS = Object.keys(state.TICKER_META)
        .filter(t => (latestRow[`${t}_shares`] || 0) > 0);
    }

    onSuccess();
  } catch (e) {
    document.getElementById('root').innerHTML = `
      ${renderAppHeader()}
      <div class="error-box">
        <div style="font-size:14px;color:#f87171;margin-bottom:8px;font-weight:600">Laden mislukt</div>
        <div style="font-size:12px;color:#94a3b8;line-height:1.6">${e.message}</div>
        <button class="btn" onclick="window._init()" style="margin-top:16px">Opnieuw proberen</button>
      </div>`;
  }
}
