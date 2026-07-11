import { portfolioStore } from '$lib/stores/portfolio.svelte';
import { intradayStore } from '$lib/stores/intraday.svelte';
import { sessionBounds } from '$lib/market';
import { toEurLive, toEurLiveOrFallback } from '$lib/fx';

/**
 * Portfolio-level 1D series in EUR, built from per-ticker intraday sessions.
 * Plain function over the reactive stores — call inside `$derived`.
 *
 * The x-axis spans from the first market open of the day (min over held
 * tickers, typically 09:00 CET) to the last close (max, typically 22:00),
 * in minutes-of-day Europe/Brussels. Points from before the drawn day's first
 * open (i.e. an older session) are dropped — no overnight shelf.
 *
 * On days with no trading at all (weekends, holidays) the chart falls back to
 * the most recent day that has intraday points and draws that full session,
 * flagged via `prevSession`.
 */

export interface PortfolioIntradaySession {
  /** 5-min grid from dayStart to now (clamped to dayEnd); empty before first open. */
  points: { min: number; value: number }[];
  /** Yesterday's closing portfolio value in EUR (the dashed baseline). */
  prevCloseTotal: number;
  /** First market open, minutes-of-day CET. */
  dayStart: number;
  /** Last market close, minutes-of-day CET. */
  dayEnd: number;
  /** Current minutes-of-day CET (may be < dayStart or > dayEnd). */
  nowMin: number;
  /** True when the drawn day is a previous session (no trading today). */
  prevSession: boolean;
}

const GRID_STEP = 5;
const DAY_SECS = 86400;

/** Offset (seconds) to add to a unix ts to get Europe/Brussels wall-clock time. */
function brusselsOffsetSecs(at: Date): number {
  // Truncate to whole seconds first — Intl formats whole seconds only, so
  // leftover milliseconds would skew the offset by up to 1s (e.g. a 09:00
  // session open rendering as 08:59).
  const wholeSecs = Math.floor(at.getTime() / 1000) * 1000;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Brussels', hour12: false, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(wholeSecs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUtc - wholeSecs) / 1000);
}

export function buildPortfolioIntradaySession(): PortfolioIntradaySession | null {
  if (!intradayStore.loaded) return null;
  const held = portfolioStore.positions.filter((p) => p.shares > 0);
  if (held.length === 0) return null;

  const rates = intradayStore.liveRates;
  const now = new Date();
  const offset = brusselsOffsetSecs(now);
  const localNow = Math.floor(now.getTime() / 1000) + offset;
  const todayIdx = Math.floor(localNow / DAY_SECS);
  const nowMin = Math.floor((localNow % DAY_SECS) / 60);
  const todayStr = new Date(localNow * 1000).toISOString().slice(0, 10);

  const minuteOf = (ts: number) => Math.floor(((ts + offset) % DAY_SECS) / 60);
  const dayIdxOf = (ts: number) => Math.floor((ts + offset) / DAY_SECS);

  // Day to draw: today when any held ticker traded today, otherwise the most
  // recent day with intraday points (weekends/holidays show the last session).
  let latestIdx = -Infinity;
  for (const pos of held) {
    const yahoo = portfolioStore.tickerMeta[pos.ticker]?.yahoo ?? pos.ticker;
    const last = intradayStore.data[yahoo]?.points?.at(-1);
    if (last) latestIdx = Math.max(latestIdx, dayIdxOf(last.ts));
  }
  const displayIdx = Number.isFinite(latestIdx) ? Math.min(latestIdx, todayIdx) : todayIdx;
  const prevSession = displayIdx < todayIdx;

  interface Entry {
    /** Position value in EUR at minute m (last price at-or-before m, else prevClose). */
    valueAt: (m: number) => number;
    prevCloseEur: number;
  }
  const entries: Entry[] = [];
  let dayStart = Infinity;
  let dayEnd = -Infinity;

  for (const pos of held) {
    const yahoo = portfolioStore.tickerMeta[pos.ticker]?.yahoo ?? pos.ticker;
    const intra = intradayStore.data[yahoo];
    const prevClose = intra?.previousClose;

    if (!intra || !prevClose) {
      // No intraday data: contribute the server-computed static EUR value to
      // both the baseline and every grid point, so totals stay comparable.
      entries.push({ valueAt: () => pos.value, prevCloseEur: pos.value });
      continue;
    }

    // Session bounds: prefer Yahoo trading periods, fall back to exchange defs.
    const regular = intra.tradingPeriods?.regular;
    const fallback = regular ? null : sessionBounds(yahoo, todayStr);
    const openTs = regular?.start ?? fallback?.open;
    const closeTs = regular?.end ?? fallback?.close;
    if (openTs != null && closeTs != null) {
      dayStart = Math.min(dayStart, minuteOf(openTs));
      dayEnd = Math.max(dayEnd, minuteOf(closeTs));
    }

    // The drawn day's points only (drops older sessions' overnight shelf).
    const pts = (intra.points ?? [])
      .filter((p) => dayIdxOf(p.ts) === displayIdx)
      .map((p) => ({ min: minuteOf(p.ts), close: p.close }));

    const toEur = (native: number) =>
      toEurLive(pos.currency, native, rates) ?? toEurLiveOrFallback(pos.currency, native, rates);

    const prevCloseEur = toEur(pos.shares * prevClose);
    entries.push({
      prevCloseEur,
      valueAt: (m: number) => {
        // pts is time-ordered; last point at-or-before m, else prevClose.
        let price = prevClose;
        for (const p of pts) {
          if (p.min > m) break;
          price = p.close;
        }
        return toEur(pos.shares * price);
      },
    });
  }

  // No session info at all: assume the typical 09:00–22:00 CET span.
  if (!Number.isFinite(dayStart)) dayStart = 9 * 60;
  if (!Number.isFinite(dayEnd)) dayEnd = 22 * 60;

  const prevCloseTotal = entries.reduce((s, e) => s + e.prevCloseEur, 0);

  if (!prevSession && nowMin < dayStart) {
    return { points: [], prevCloseTotal, dayStart, dayEnd, nowMin, prevSession };
  }

  // A previous session is complete — always draw it in full, regardless of now.
  const gridEnd = prevSession ? dayEnd : Math.min(nowMin, dayEnd);
  const minutes: number[] = [];
  for (let m = dayStart; m <= gridEnd; m += GRID_STEP) minutes.push(m);
  if (minutes[minutes.length - 1] !== gridEnd) minutes.push(gridEnd);

  const points = minutes.map((m) => ({
    min: m,
    value: entries.reduce((s, e) => s + e.valueAt(m), 0),
  }));

  return { points, prevCloseTotal, dayStart, dayEnd, nowMin, prevSession };
}
