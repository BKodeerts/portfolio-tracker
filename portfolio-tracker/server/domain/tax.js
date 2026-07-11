/**
 * Belgian capital gains tax domain (meerwaardebelasting, wet van 3 april 2026).
 * 10% flat on realized gains above a yearly exemption, from 1 Jan 2026.
 * Pure module: no fs, no network. All data injected as arguments.
 *
 * Basis rules:
 * - Pre-2026 holdings step up to the 31/12/2025 "foto" value.
 * - Until end 2030 the actual purchase price may be used instead if it was higher.
 * - Losses offset gains within the same year only (no carry-forward).
 * - Costs and transaction taxes are not deductible.
 */

const { isDividend } = require('./positions.js');

const TAX_RATE          = 0.1;
const FIRST_TAX_YEAR    = 2026;
const FOTO_DATE         = '2025-12-31'; // step-up valuation date for pre-2026 holdings
const WITHHOLDING_START = '2026-06-01'; // brokers may withhold 10% at sale from this date
const DUAL_BASIS_END    = '2030-12-31'; // until then: basis = max(foto, actual purchase price)

// Exemption per person per year (indexed). Years beyond the last published
// indexation reuse the last known amount until the next one is announced.
const EXEMPTION_BASE = { 2026: 10000, 2027: 10300, 2028: 10600 };

function round2(v) {
  return Math.round(v * 100) / 100;
}

function exemptionBaseFor(year) {
  if (EXEMPTION_BASE[year]) return EXEMPTION_BASE[year];
  const known = Object.keys(EXEMPTION_BASE).map(Number).sort((a, b) => a - b);
  return year < known[0] ? EXEMPTION_BASE[known[0]] : EXEMPTION_BASE[known.at(-1)];
}

function exemptionFor(year, household) {
  return exemptionBaseFor(year) * (household === 'couple' ? 2 : 1);
}

/**
 * Taxable basis per share for one FIFO lot sold on saleDate.
 * fotoPerShare: EUR price per share on 31/12/2025 (null when unknown).
 */
function lotBasisPerShare(lot, fotoPerShare, saleDate) {
  if (lot.date > FOTO_DATE || fotoPerShare == null) {
    return { basis: lot.costPerShare, fromFoto: false, costAboveFoto: false };
  }
  if (saleDate <= DUAL_BASIS_END && lot.costPerShare > fotoPerShare) {
    return { basis: lot.costPerShare, fromFoto: false, costAboveFoto: true };
  }
  return { basis: fotoPerShare, fromFoto: true, costAboveFoto: false };
}

/** FIFO walk for one ticker: emits taxable sale records and leaves open lots. */
function walkTicker(ticker, txs, adjSharesFn, fotoPerShare) {
  const lots = [];
  const sales = [];
  const sorted = txs.filter(tx => !isDividend(tx)).sort((a, b) => a.date.localeCompare(b.date));
  for (const tx of sorted) {
    const adjSh = adjSharesFn(tx, ticker);
    if (tx.shares > 0) {
      lots.push({ date: tx.date, shares: adjSh, costPerShare: tx.costEur / adjSh });
      continue;
    }
    let toSell = Math.abs(adjSh);
    let basis = 0;
    let fotoShares = 0;
    let soldShares = 0;
    let costAboveFoto = false;
    for (const lot of lots) {
      if (lot.shares <= 0) continue;
      const sold = Math.min(lot.shares, toSell);
      const b = lotBasisPerShare(lot, fotoPerShare, tx.date);
      basis += sold * b.basis;
      if (b.fromFoto) fotoShares += sold;
      if (b.costAboveFoto) costAboveFoto = true;
      lot.shares -= sold;
      toSell -= sold;
      soldShares += sold;
      if (toSell <= 0) break;
    }
    const year = Number(tx.date.slice(0, 4));
    if (year >= FIRST_TAX_YEAR) {
      sales.push({
        date:  tx.date,
        year,
        ticker,
        shares: Math.abs(tx.shares),
        proceeds: round2(tx.costEur),
        basis: round2(basis),
        // Chip shown on the sale row: which basis dominated the sold shares
        basisType: soldShares > 0 && fotoShares >= soldShares / 2 ? 'foto' : 'aankoop',
        costAboveFoto,
        gain: round2(tx.costEur - basis),
      });
    }
  }
  return { sales, openLots: lots.filter(l => l.shares > 0) };
}

/**
 * All taxable sales (2026+) across tickers, FIFO, with the Belgian basis rule.
 * fotoPrices: { [ticker]: eurPerShare|null } at 31/12/2025.
 */
function computeTaxSales(txsByTicker, adjSharesFn, fotoPrices = {}) {
  const sales = [];
  for (const [ticker, txs] of Object.entries(txsByTicker)) {
    sales.push(...walkTicker(ticker, txs, adjSharesFn, fotoPrices[ticker] ?? null).sales);
  }
  return sales.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Withholding per sale: since 1 Jun 2026 brokers may withhold 10% at sale.
 * Withholding ignores the exemption and only applies to positive gains.
 */
function applyWithholding(sales, brokerWithholds) {
  return sales.map(s => ({
    ...s,
    withheld: brokerWithholds && s.date >= WITHHOLDING_START && s.gain > 0
      ? round2(s.gain * TAX_RATE)
      : 0,
  }));
}

/**
 * Year totals: losses offset gains within the same year only, exemption
 * applies to the positive net, 10% on the remainder.
 * balance = withheld − tax (>0 reclaim via aangifte, <0 still due).
 */
function summarizeTaxYear(sales, exemption) {
  const gains  = round2(sales.filter(s => s.gain > 0).reduce((a, s) => a + s.gain, 0));
  const losses = round2(sales.filter(s => s.gain < 0).reduce((a, s) => a + s.gain, 0));
  const net    = round2(gains + losses);
  const netPos = Math.max(0, net);
  const used     = round2(Math.min(netPos, exemption));
  const taxable  = round2(Math.max(0, netPos - exemption));
  const tax      = round2(taxable * TAX_RATE);
  const withheld = round2(sales.reduce((a, s) => a + (s.withheld || 0), 0));
  return {
    gains, losses, net, used, taxable, tax, withheld,
    balance:  round2(withheld - tax),
    headroom: round2(Math.max(0, exemption - netPos)),
  };
}

/**
 * Sell-simulator inputs per open position: taxable basis of the open FIFO lots
 * (foto/purchase-price rule as if sold today) and the latent taxable gain.
 * positionValues: { [ticker]: currentValueEur }.
 */
function computeSimPositions(txsByTicker, adjSharesFn, fotoPrices, positionValues, today) {
  const rows = [];
  for (const [ticker, value] of Object.entries(positionValues)) {
    const txs = txsByTicker[ticker];
    if (!txs || !(value > 0)) continue;
    const foto = fotoPrices[ticker] ?? null;
    const { openLots } = walkTicker(ticker, txs, adjSharesFn, foto);
    if (!openLots.length) continue;
    let basis = 0;
    let usesCost = false;
    for (const lot of openLots) {
      const b = lotBasisPerShare(lot, foto, today);
      basis += lot.shares * b.basis;
      if (b.costAboveFoto) usesCost = true;
    }
    rows.push({ ticker, basis: round2(basis), gain: round2(value - basis), usesCost });
  }
  return rows.sort((a, b) => b.gain - a.gain);
}

/**
 * Full tax report for the API: one summary per tax year (2026..currentYear)
 * plus simulator rows for the open positions. Returns null before 2026.
 */
function computeTaxReport({
  txsByTicker,
  adjSharesFn,
  fotoPrices = {},
  positionValues = {},
  household = 'individual',
  brokerWithholds = false,
  currentYear,
  today,
}) {
  if (currentYear < FIRST_TAX_YEAR) return null;
  const allSales = applyWithholding(
    computeTaxSales(txsByTicker, adjSharesFn, fotoPrices),
    brokerWithholds,
  );
  const years = [];
  for (let year = FIRST_TAX_YEAR; year <= currentYear; year++) {
    const sales = allSales.filter(s => s.year === year);
    const exemption = exemptionFor(year, household);
    years.push({ year, exemption, sales, ...summarizeTaxYear(sales, exemption) });
  }
  return {
    rate: TAX_RATE,
    currentYear,
    household,
    brokerWithholds,
    years,
    simPositions: computeSimPositions(
      txsByTicker, adjSharesFn, fotoPrices, positionValues,
      today || `${currentYear}-07-01`,
    ),
  };
}

module.exports = {
  TAX_RATE,
  FIRST_TAX_YEAR,
  FOTO_DATE,
  WITHHOLDING_START,
  DUAL_BASIS_END,
  exemptionBaseFor,
  exemptionFor,
  computeTaxSales,
  applyWithholding,
  summarizeTaxYear,
  computeSimPositions,
  computeTaxReport,
};
