export const EXCHANGE_SUFFIXES = {
  XETRA:'.DE', XET:'.DE', GER:'.DE', XAMS:'.AS', AMS:'.AS',
  XPAR:'.PA', EPA:'.PA', XLON:'.L', LSE:'.L', XMIL:'.MI', MIL:'.MI',
  XBRU:'.BR', BRU:'.BR', XSWX:'.SW', SWX:'.SW',
  NSQ:'', NYSE:'', XNAS:'', XNYS:'',
};

export function guessYahooSuffix(beurs) {
  return EXCHANGE_SUFFIXES[beurs.toUpperCase()] ?? '';
}

function parseCSVLine(line) {
  const result = [];
  let cell = '', inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { result.push(cell.trim()); cell = ''; }
    else { cell += ch; }
  }
  result.push(cell.trim());
  return result;
}

function parseEuropeanNumber(s) {
  if (!s) return NaN;
  return parseFloat(s.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
}

export function parseDeGiroCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV te kort of leeg');

  const headers  = parseCSVLine(lines[0]).map(h => h.toLowerCase());
  const iDatum   = headers.indexOf('datum');
  const iProduct = headers.indexOf('product');
  const iISIN    = headers.indexOf('isin');
  const iBeurs   = headers.indexOf('beurs');
  const iAantal  = headers.indexOf('aantal');
  const iWissel  = headers.lastIndexOf('wisselkoers');
  const iTotaal  = headers.findIndex((h, i) => h.includes('totaal') && i > 10);
  const iOrderId = headers.findIndex(h => h.includes('order'));
  const iOrderId2 = iOrderId >= 0 ? iOrderId + 1 : -1;

  if (iDatum < 0 || iAantal < 0) throw new Error('Onverwacht CSV-formaat: kolomkoppen niet herkend');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols     = parseCSVLine(lines[i]);
    const datum    = (cols[iDatum]   || '').trim();
    const product  = (cols[iProduct] || '').trim();
    const isin     = (cols[iISIN]    || '').trim();
    const beurs    = (cols[iBeurs]   || '').trim();
    const aantal   = parseEuropeanNumber(cols[iAantal]);
    const wissel   = iWissel  >= 0 ? parseEuropeanNumber(cols[iWissel])  : NaN;
    const totaal   = iTotaal  >= 0 ? parseEuropeanNumber(cols[iTotaal])  : NaN;
    const orderId1 = iOrderId  >= 0 ? (cols[iOrderId]  || '').trim() : '';
    const orderId2 = iOrderId2 >= 0 ? (cols[iOrderId2] || '').trim() : '';
    const orderId  = orderId1 || orderId2;
    if (!orderId) continue;
    if (!isin || !datum || isNaN(aantal) || aantal === 0) continue;
    const parts = datum.split('-');
    if (parts.length !== 3) continue;
    const date = `${parts[2]}-${parts[1]}-${parts[0]}`;
    const currency = (!isNaN(wissel) && Math.abs(wissel - 1) > 0.01) ? 'USD' : 'EUR';
    rows.push({ date, datum, product, isin, beurs, shares: aantal, wisselkoers: wissel, totaalEur: totaal, orderId, currency });
  }
  return rows;
}

export function aggregateOrders(rows) {
  const map = {};
  rows.forEach(r => {
    const key = r.orderId ? `${r.orderId}|${r.isin}` : `${r.date}|${r.isin}|${r.shares}`;
    if (!map[key]) { map[key] = { ...r }; }
    else { map[key].shares += r.shares; map[key].totaalEur += r.totaalEur; }
  });
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildIsinLookup(rawTransactions) {
  const map = {};
  rawTransactions.forEach(t => {
    if (t.isin && !map[t.isin]) map[t.isin] = { ticker: t.ticker, yahoo: t.yahoo };
  });
  return map;
}
