/* Shared deterministic mock data for the portfolio-tracker recreations & revamp.
   Mirrors the shapes served by /api/portfolio and /api/intraday. */
(function () {
  // seeded RNG
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const COLORS = {
    ASTS: '#6366f1', RKLB: '#06b6d4', LUNR: '#f59e0b', SMR: '#ef4444',
    SXRT: '#10b981', EUDF: '#8b5cf6',
    RDW: '#ec4899', OKLO: '#84cc16', RHM: '#64748b', RBW: '#0ea5e9',
  };

  const POSITIONS = [
    { ticker: 'ASTS', label: 'AST SpaceMobile',      yahoo: 'ASTS',    currency: 'USD', shares: 120,  avgCost: 24.10, avgCostNative: 26.35, costEur: 2892, value: 5872,  price: 53.42,  prevClose: 51.78, sector: 'Communication', geo: 'US' },
    { ticker: 'RKLB', label: 'Rocket Lab',           yahoo: 'RKLB',    currency: 'USD', shares: 210,  avgCost: 11.62, avgCostNative: 12.70, costEur: 2440, value: 4820,  price: 25.06,  prevClose: 25.61, sector: 'Industrials',   geo: 'US' },
    { ticker: 'SXRT', label: 'iShares Core S&P 500', yahoo: 'SXRT.DE', currency: 'EUR', shares: 9,    avgCost: 512.4, avgCostNative: 512.4, costEur: 4612, value: 5310,  price: 590.1,  prevClose: 588.3, sector: 'ETF',           geo: 'Global' },
    { ticker: 'EUDF', label: 'Amundi Defence',       yahoo: 'EUDF.PA', currency: 'EUR', shares: 140,  avgCost: 26.90, avgCostNative: 26.90, costEur: 3766, value: 4480,  price: 32.02,  prevClose: 31.70, sector: 'Industrials',   geo: 'Europe' },
    { ticker: 'LUNR', label: 'Intuitive Machines',   yahoo: 'LUNR',    currency: 'USD', shares: 260,  avgCost: 7.85,  avgCostNative: 8.55,  costEur: 2041, value: 2610,  price: 10.92,  prevClose: 11.24, sector: 'Industrials',   geo: 'US' },
    { ticker: 'SMR',  label: 'NuScale Power',        yahoo: 'SMR',     currency: 'USD', shares: 95,   avgCost: 17.30, avgCostNative: 18.90, costEur: 1644, value: 2148,  price: 24.63,  prevClose: 24.11, sector: 'Energy',        geo: 'US' },
  ];

  // derived P&L per position
  POSITIONS.forEach((p) => {
    p.pl = p.value - p.costEur;
    p.plPct = (p.pl / p.costEur) * 100;
    const nativeDay = (p.price - p.prevClose) * p.shares;
    const fx = p.currency === 'USD' ? 0.855 : 1;
    p.dayPl = Math.round(nativeDay * fx * 100) / 100;
    p.dayPlPct = ((p.price - p.prevClose) / p.prevClose) * 100;
  });

  // ── Watchlist (tracked, not held) ──────────────────────────────────────
  const WATCHLIST = [
    { ticker: 'RDW',  label: 'Redwire',     yahoo: 'RDW',    currency: 'USD', price: 14.87,  prevClose: 14.32 },
    { ticker: 'OKLO', label: 'Oklo',        yahoo: 'OKLO',   currency: 'USD', price: 68.41,  prevClose: 70.02 },
    { ticker: 'RHM',  label: 'Rheinmetall', yahoo: 'RHM.DE', currency: 'EUR', price: 1842.5, prevClose: 1815.0 },
    { ticker: 'RBW',  label: 'Rainbow Rare Earths', yahoo: 'RBW.L', currency: 'GBX', price: 11.86, prevClose: 11.42 },
  ];
  WATCHLIST.forEach((w) => {
    w.dayPlPct = ((w.price - w.prevClose) / w.prevClose) * 100;
    w.dayPl = Math.round((w.price - w.prevClose) * 100) / 100; // native, per share
  });

  const totalValue = POSITIONS.reduce((s, p) => s + p.value, 0);       // 25240
  const totalInvested = POSITIONS.reduce((s, p) => s + p.costEur, 0);  // 17395
  const totalDayPl = POSITIONS.reduce((s, p) => s + p.dayPl, 0);

  // ── Weekly chart data (2023-01 → 2026-07) ──────────────────────────────
  const rng = mulberry32(42);
  const chartData = [];
  const start = new Date('2023-01-06');
  const weeks = 183;
  let drift = 0;
  for (let i = 0; i < weeks; i++) {
    const d = new Date(start.getTime() + i * 7 * 864e5);
    const t = i / (weeks - 1);
    // invested ramps in steps (periodic buys)
    const invested = Math.round(3000 + t * (totalInvested - 3000) + (i % 9 === 0 ? 120 : 0));
    drift += (rng() - 0.46) * 0.035;
    drift = Math.max(-0.25, Math.min(0.75, drift));
    const growth = 1 + t * 0.42 + drift * 0.55 + Math.sin(t * 9.4) * 0.05;
    const value = Math.round(invested * Math.max(0.72, growth));
    chartData.push({ date: d.toISOString().slice(0, 10), value, invested });
  }
  // pin the last point to today's totals
  chartData[chartData.length - 1] = { date: '2026-07-03', value: totalValue, invested: totalInvested };
  chartData[chartData.length - 2].value = Math.round(totalValue - totalDayPl);

  // per-ticker slices of chartData (share of total by final weight, phased in)
  const weights = POSITIONS.map((p) => p.value / totalValue);
  chartData.forEach((row, i) => {
    const t = i / (weeks - 1);
    row.positions = {};
    POSITIONS.forEach((p, k) => {
      const phase = Math.min(1, Math.max(0, (t - k * 0.08) / 0.25));
      row.positions[p.ticker] = {
        value: Math.round(row.value * weights[k] * phase * (0.85 + 0.3 * mulberry32(i * 31 + k)())),
        cost: Math.round(row.invested * (p.costEur / totalInvested) * phase),
        shares: phase > 0 ? p.shares : 0,
      };
    });
  });

  // ── Intraday series per ticker ─────────────────────────────────────────
  // US session 15:30–22:00 CEST, EU session 09:00–17:30 CEST. Now = 17:20 CEST.
  const NOW_MIN = 17 * 60 + 20;
  function session(yahoo) {
    return yahoo.includes('.DE') || yahoo.includes('.PA') || yahoo.includes('.L')
      ? { open: 9 * 60, close: 17.5 * 60 }
      : { open: 15.5 * 60, close: 22 * 60 };
  }
  const intraday = {};
  POSITIONS.concat(WATCHLIST).forEach((p, k) => {
    const s = session(p.yahoo);
    const end = Math.min(NOW_MIN, s.close);
    const r = mulberry32(k * 977 + 13);
    const pts = [];
    let price = p.prevClose;
    for (let m = s.open; m <= end; m += 5) {
      const target = p.prevClose + (p.price - p.prevClose) * ((m - s.open) / (end - s.open || 1));
      price = price + (target - price) * 0.35 + (r() - 0.5) * p.prevClose * 0.006;
      pts.push({ min: m, close: Math.round(price * 100) / 100 });
    }
    if (pts.length) pts[pts.length - 1].close = p.price;
    intraday[p.ticker] = {
      points: pts, prevClose: p.prevClose,
      open: s.open, close: s.close, nowMin: end,
      marketState: NOW_MIN < s.open ? 'CLOSED' : NOW_MIN <= s.close ? 'REGULAR' : 'CLOSED',
    };
  });

  // ── Portfolio-level intraday (EUR) ─────────────────────────────────────
  // Correct version: 09:00 (first market open) → 22:00.
  const dayOpen = 9 * 60, dayClose = 22 * 60;
  const portfolioIntraday = [];
  {
    const r = mulberry32(555);
    let v = totalValue - totalDayPl;
    for (let m = dayOpen; m <= Math.min(NOW_MIN, dayClose); m += 5) {
      const t = (m - dayOpen) / (Math.min(NOW_MIN, dayClose) - dayOpen);
      const target = (totalValue - totalDayPl) + totalDayPl * t;
      v = v + (target - v) * 0.3 + (r() - 0.5) * totalValue * 0.0012;
      portfolioIntraday.push({ min: m, value: Math.round(v) });
    }
    portfolioIntraday[portfolioIntraday.length - 1].value = totalValue;
  }
  // Flaky version: starts 22:00 yesterday (long flat overnight shelf).
  const portfolioIntradayFlaky = [];
  {
    const startPrev = -2 * 60; // 22:00 yesterday, rendered as negative minutes
    const flatV = Math.round(totalValue - totalDayPl);
    for (let m = startPrev; m < dayOpen; m += 15) portfolioIntradayFlaky.push({ min: m, value: flatV });
    portfolioIntraday.forEach((p) => portfolioIntradayFlaky.push(p));
  }

  // ── Transactions ───────────────────────────────────────────────────────
  const transactions = [
    { date: '2026-06-27', ticker: 'EUDF', shares: 20,   costEur: 640.4 },
    { date: '2026-06-14', ticker: 'ASTS', shares: 10,   costEur: 447.1 },
    { date: '2026-05-30', ticker: 'SXRT', shares: 1,    costEur: 581.2 },
    { date: '2026-05-18', ticker: 'RKLB', shares: -30,  costEur: 612.9 },
    { date: '2026-05-02', ticker: 'LUNR', shares: 40,   costEur: 371.5 },
    { date: '2026-04-19', ticker: 'SMR',  shares: 15,   costEur: 309.8 },
    { date: '2026-04-02', ticker: 'ASTS', shares: 0,    costEur: 14.2  },
  ];

  window.PT_MOCK = {
    COLORS, POSITIONS, WATCHLIST, chartData, intraday, portfolioIntraday, portfolioIntradayFlaky,
    transactions,
    totals: {
      value: totalValue, invested: totalInvested,
      pl: totalValue - totalInvested,
      plPct: ((totalValue - totalInvested) / totalInvested) * 100,
      dayPl: totalDayPl,
      dayPlPct: (totalDayPl / (totalValue - totalDayPl)) * 100,
    },
    fx: { eurusd: 1.169 },
    riskMetrics: { sharpe: 1.34, sortino: 1.92, maxDrawdown: -28.4, volatility: 24.6, beta: 1.18, calmar: 0.9 },
    rollingReturns: [
      { period: '1W', portfolio: 1.8 }, { period: '1M', portfolio: 4.2 }, { period: '3M', portfolio: -2.6 },
      { period: 'YTD', portfolio: 12.4 }, { period: '1Y', portfolio: 26.8 }, { period: 'Max', portfolio: 45.1 },
    ],
    currencyExposure: { USD: 15450, EUR: 9790 },
    irrPct: 21.7, twrPct: 45.1, realizedPl: 384,
    dividends: 96.4,
    NOW_MIN,
  };
})();
