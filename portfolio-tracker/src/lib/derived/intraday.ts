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
  /**
   * Day-change baseline in EUR (the dashed line): previous close for tickers
   * that traded on the drawn day, last known close for tickers that didn't.
   */
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

export interface DisplayDay {
  /** Brussels day index of the day treated as "today" (latest traded day, capped at today). */
  displayIdx: number;
  /** True when displayIdx is an earlier day than the actual today. */
  prevSession: boolean;
  /** Current minutes-of-day CET. */
  nowMin: number;
  /** Today's date (Brussels), YYYY-MM-DD. */
  todayStr: string;
  minuteOf: (ts: number) => number;
  dayIdxOf: (ts: number) => number;
}

/**
 * The day the dashboard treats as "today": the most recent Brussels calendar
 * day any held ticker traded, capped at the actual today (weekends/holidays
 * fall back to the last session). A ticker's intraday move counts toward the
 * day P&L only when its session points fall on this day; tickers whose
 * exchange didn't trade are carried flat at their last close, so a previous
 * session's move never counts as "today's" change. Shared by the 1D chart and
 * the hero live value/day P&L so they can never disagree on the baseline.
 */
export function getDisplayDay(): DisplayDay {
  const now = new Date();
  const offset = brusselsOffsetSecs(now);
  const localNow = Math.floor(now.getTime() / 1000) + offset;
  const todayIdx = Math.floor(localNow / DAY_SECS);
  const nowMin = Math.floor((localNow % DAY_SECS) / 60);
  const todayStr = new Date(localNow * 1000).toISOString().slice(0, 10);

  const minuteOf = (ts: number) => Math.floor(((ts + offset) % DAY_SECS) / 60);
  const dayIdxOf = (ts: number) => Math.floor((ts + offset) / DAY_SECS);

  let latestIdx = -Infinity;
  for (const pos of portfolioStore.positions) {
    if (pos.shares <= 0) continue;
    const yahoo = portfolioStore.tickerMeta[pos.ticker]?.yahoo ?? pos.ticker;
    const last = intradayStore.data[yahoo]?.points?.at(-1);
    if (last) latestIdx = Math.max(latestIdx, dayIdxOf(last.ts));
  }
  const displayIdx = Number.isFinite(latestIdx) ? Math.min(latestIdx, todayIdx) : todayIdx;
  return { displayIdx, prevSession: displayIdx < todayIdx, nowMin, todayStr, minuteOf, dayIdxOf };
}

export function buildPortfolioIntradaySession(): PortfolioIntradaySession | null {
  if (!intradayStore.loaded) return null;
  const held = portfolioStore.positions.filter((p) => p.shares > 0);
  if (held.length === 0) return null;

  const rates = intradayStore.liveRates;
  const { displayIdx, prevSession, nowMin, todayStr, minuteOf, dayIdxOf } = getDisplayDay();

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

    // A ticker with no points on the drawn day (its exchange hasn't traded)
    // is carried flat at its last known close — not at previousClose, which
    // the server may anchor a session earlier and would shift the chart level
    // away from the hero's live total while adding nothing to the day change.
    // A ticker that DID trade on the drawn day anchors to the close before
    // that day (sessionPreviousClose): during pre-market previousClose is the
    // drawn session's own close, which would flatten its move to zero.
    const anchorPrice = pts.length > 0
      ? (intra.sessionPreviousClose ?? prevClose)
      : ((intra.points ?? []).at(-1)?.close ?? prevClose);

    const prevCloseEur = toEur(pos.shares * anchorPrice);
    entries.push({
      prevCloseEur,
      valueAt: (m: number) => {
        // pts is time-ordered; last point at-or-before m, else the anchor.
        let price = anchorPrice;
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
