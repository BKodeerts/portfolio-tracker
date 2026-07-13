import type { Transaction } from '$lib/types/transaction';
import type { ChartMarker } from '$lib/components/shared/PeriodChart.svelte';
import { fmtEur } from './fmt';

export interface TxMarkers {
  /** Dots on the value line, snapped to the nearest chart row. */
  markers: ChartMarker[];
  /** Tooltip lines per snapped data index ("BUY 5 AAPL · €123"). */
  at: Map<number, string[]>;
}

/** Transactions within 4 days of the window edges still snap to the edge row. */
const SNAP_MS = 4 * 864e5;

/**
 * Snap transactions to the nearest chart row and build marker dots plus
 * per-index tooltip lines. Shared by the dashboard and stock detail charts;
 * pure presentation — costEur is echoed, never derived.
 */
export function buildTxMarkers(times: number[], txs: Transaction[]): TxMarkers {
  const markers: ChartMarker[] = [];
  const at = new Map<number, string[]>();
  if (times.length < 2) return { markers, at };
  for (const tx of txs) {
    const tt = new Date(tx.date).getTime();
    if (tt < times[0]! - SNAP_MS || tt > times[times.length - 1]! + SNAP_MS) continue;
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < times.length; i++) {
      const d = Math.abs(times[i]! - tt);
      if (d < bd) { bd = d; bi = i; }
    }
    const kind = tx.shares > 0 ? 'BUY' : tx.shares < 0 ? 'SELL' : 'DIV';
    markers.push({
      i: bi,
      color: kind === 'BUY' ? 'var(--c-pos)' : kind === 'SELL' ? 'var(--c-neg)' : 'var(--c-div)',
    });
    const sh = Math.abs(tx.shares);
    const shStr = sh === 0 ? '' : ` ${Number.isInteger(sh) ? sh : sh.toFixed(2)}`;
    const list = at.get(bi) ?? [];
    list.push(`${kind}${shStr} ${tx.ticker} · ${fmtEur(tx.costEur)}`);
    at.set(bi, list);
  }
  return { markers, at };
}
