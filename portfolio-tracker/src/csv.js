import * as XLSX from 'xlsx';

// Bolero "Markt" codes mapped to exchange keys used by EXCHANGE_SUFFIXES
const BOLERO_MARKET_MAP = {
  USA: 'NYSE', BEL: 'XBRU', GER: 'GER', NED: 'XAMS',
  FRA: 'XPAR', UK:  'XLON', ITA: 'XMIL', SWI: 'XSWX',
};

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

export function parseBoleroXLSX(arrayBuffer) {
  const wb   = XLSX.read(arrayBuffer, { type: 'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Row 2, col 3 contains the print date as an Excel serial number
  const serial    = rows[2]?.[3];
  const printDate = serial
    ? new Date(Math.round((serial - 25569) * 86400000)).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const result = [];
  for (let i = 9; i < rows.length; i++) {
    const r    = rows[i];
    const type = r[1];
    if (!type || type === '') break;
    if (type !== 'Aandelen') continue;

    const currency           = String(r[3] || 'EUR').trim();
    const shares             = Number(r[5])  || 0;
    const product            = String(r[9]  || '').trim();
    const totaleAankoopwaarde = Number(r[17]) || 0;
    const huidigeWaarde      = Number(r[25]) || 0;
    const waardeInEUR        = Number(r[27]) || 0;
    const markt              = String(r[31] || '').trim().toUpperCase();
    const isin               = String(r[35] || '').trim();

    if (!isin || shares <= 0) continue;

    // Convert purchase cost to EUR using the current FX rate embedded in the snapshot
    let totaalEur;
    if (currency === 'EUR') {
      totaalEur = totaleAankoopwaarde;
    } else if (huidigeWaarde > 0 && waardeInEUR > 0) {
      totaalEur = totaleAankoopwaarde * (waardeInEUR / huidigeWaarde);
    } else {
      totaalEur = totaleAankoopwaarde / 1.09; // fallback
    }

    const beurs = BOLERO_MARKET_MAP[markt] || markt;
    result.push({ date: printDate, product, isin, beurs, shares, totaalEur, currency });
  }
  return result;
}
