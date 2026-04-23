import * as XLSX from 'xlsx';
import type { Transaction } from '$lib/types/transaction';

// Bolero "Markt" codes → exchange keys used by EXCHANGE_SUFFIXES
const BOLERO_MARKET_MAP: Record<string, string> = {
  USA: 'NYSE', BEL: 'XBRU', GER: 'GER', NED: 'XAMS',
  FRA: 'XPAR', UK: 'XLON', ITA: 'XMIL', SWI: 'XSWX',
};

export const EXCHANGE_SUFFIXES: Record<string, string> = {
  XETRA: '.DE', XET: '.DE', GER: '.DE', XAMS: '.AS', AMS: '.AS',
  XPAR: '.PA', EPA: '.PA', XLON: '.L', LSE: '.L', XMIL: '.MI', MIL: '.MI',
  XBRU: '.BR', BRU: '.BR', XSWX: '.SW', SWX: '.SW',
  XSTO: '.ST', STO: '.ST', XCSE: '.CO', CSE: '.CO', XHEL: '.HE', XOSL: '.OL',
  XSGO: '.CL', SCL: '.CL',
  XTSE: '.TO', TSE: '.TO',
  XASX: '.AX', ASX: '.AX',
  XTKS: '.T',  TKS: '.T',
  XMEX: '.MX', BMV: '.MX',
  XBOM: '.BO', BSE: '.BO',
  XNSE: '.NS', NSE: '.NS',
  NSQ: '', NYSE: '', XNAS: '', XNYS: '',
};

export function guessYahooSuffix(exchange: string): string {
  return EXCHANGE_SUFFIXES[exchange.toUpperCase()] ?? '';
}

export interface ParsedRow {
  date: string;
  rawDate: string;       // original DD-MM-YYYY as in the CSV
  product: string;
  isin: string;
  exchange: string;
  shares: number;
  fxRate: number;
  costEur: number;
  orderId: string;
  currency: string;
}

export interface BoleroRow {
  date: string;
  product: string;
  isin: string;
  exchange: string;  // exchange key, e.g. 'XETRA'
  shares: number;
  totaalEur: number;
  currency: string;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cell = '', inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { result.push(cell.trim()); cell = ''; }
    else { cell += ch; }
  }
  result.push(cell.trim());
  return result;
}

function parseEuropeanNumber(s: string | undefined): number {
  if (!s) return NaN;
  return parseFloat(s.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
}

export function parseDeGiroCSV(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV te kort of leeg');

  const headers  = parseCSVLine(lines[0]!).map((h) => h.toLowerCase());
  const iDate      = headers.indexOf('datum');
  const iProduct   = headers.indexOf('product');
  const iISIN      = headers.indexOf('isin');
  const iExchange  = headers.indexOf('beurs');
  const iQty       = headers.indexOf('aantal');
  const iFxRate    = headers.lastIndexOf('wisselkoers');
  const iTotal     = headers.findIndex((h, i) => h.includes('totaal') && i > 10);
  const iOrderId   = headers.findIndex((h) => h.includes('order'));
  const iOrderId2  = iOrderId >= 0 ? iOrderId + 1 : -1;
  const iPrice     = headers.indexOf('koers');
  const iPriceCcy  = iPrice >= 0 ? iPrice + 1 : -1;

  if (iDate < 0 || iQty < 0) throw new Error('Onverwacht CSV-formaat: kolomkoppen niet herkend');

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.trim()) continue;
    const cols       = parseCSVLine(line);
    const rawDate    = (cols[iDate]     ?? '').trim();
    const product    = (cols[iProduct]  ?? '').trim();
    const isin       = (cols[iISIN]     ?? '').trim();
    const exchange   = (cols[iExchange] ?? '').trim();
    const quantity   = parseEuropeanNumber(cols[iQty]);
    const fxRate     = iFxRate  >= 0 ? parseEuropeanNumber(cols[iFxRate])  : NaN;
    const totalEur   = iTotal   >= 0 ? parseEuropeanNumber(cols[iTotal])   : NaN;
    const orderId1   = iOrderId  >= 0 ? (cols[iOrderId]  ?? '').trim() : '';
    const orderId2   = iOrderId2 >= 0 ? (cols[iOrderId2] ?? '').trim() : '';
    const orderId    = orderId1 || orderId2;
    if (!orderId) continue;
    if (!isin || !rawDate || isNaN(quantity) || quantity === 0) continue;
    const parts = rawDate.split('-');
    if (parts.length !== 3) continue;
    const date = `${parts[2]}-${parts[1]}-${parts[0]}`;
    const rawCcy   = iPriceCcy >= 0 ? (cols[iPriceCcy] ?? '').trim().toUpperCase() : '';
    const currency = rawCcy || ((!isNaN(fxRate) && Math.abs(fxRate - 1) > 0.01) ? 'USD' : 'EUR');
    rows.push({ date, rawDate, product, isin, exchange, shares: quantity, fxRate, costEur: Math.abs(totalEur), orderId, currency });
  }
  return rows;
}

export function aggregateOrders(rows: ParsedRow[]): ParsedRow[] {
  const map: Record<string, ParsedRow> = {};
  for (const r of rows) {
    const key = r.orderId ? `${r.orderId}|${r.isin}` : `${r.date}|${r.isin}|${r.shares}`;
    if (!map[key]) { map[key] = { ...r }; }
    else { map[key]!.shares += r.shares; map[key]!.costEur += r.costEur; }
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildIsinLookup(rawTransactions: Transaction[]): Record<string, { ticker: string; yahoo: string }> {
  const map: Record<string, { ticker: string; yahoo: string }> = {};
  for (const t of rawTransactions) {
    if (t.isin && !map[t.isin]) map[t.isin] = { ticker: t.ticker, yahoo: t.yahoo ?? t.ticker };
  }
  return map;
}

export function parseBoleroXLSX(arrayBuffer: ArrayBuffer): BoleroRow[] {
  const wb   = XLSX.read(arrayBuffer, { type: 'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]!];
  if (!ws) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const serial    = rows[2]?.[3];
  const printDate = serial
    ? new Date(Math.round((serial - 25569) * 86400000)).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const result: BoleroRow[] = [];
  for (let i = 9; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const type = r[1];
    if (!type || type === '' || type !== 'Aandelen') continue;

    const currency         = String(r[3] || 'EUR').trim();
    const shares           = Number(r[5])  || 0;
    const product          = String(r[9]  || '').trim();
    const purchaseCost     = Number(r[17]) || 0;
    const currentValue     = Number(r[25]) || 0;
    const currentValueEur  = Number(r[27]) || 0;
    const market           = String(r[31] || '').trim().toUpperCase();
    const isin             = String(r[35] || '').trim();

    if (!isin || shares <= 0) continue;

    let costEur: number;
    if (currency === 'EUR') {
      costEur = purchaseCost;
    } else if (currentValue > 0 && currentValueEur > 0) {
      costEur = purchaseCost * (currentValueEur / currentValue);
    } else {
      costEur = purchaseCost / 1.09;
    }

    const exchange = BOLERO_MARKET_MAP[market] ?? market;
    result.push({ date: printDate, product, isin, exchange, shares, totaalEur: costEur, currency });
  }
  return result;
}
