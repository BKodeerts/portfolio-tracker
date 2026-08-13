import type { EarningsInfo } from '$lib/types/stats';

/**
 * Presentation layer for the server's earnings dates. Pure functions over the
 * `EarningsInfo` shape `server/domain/earnings.js` returns — no money math, no
 * I/O, no stores; the components only render what these return.
 *
 * Three properties of the data shape every rule here:
 *
 *   * There is exactly one date per ticker — the next report *or* the most
 *     recent one — so there is no history, and never more than one row or
 *     chart marker per ticker.
 *   * `endDate` is set only for an unconfirmed multi-day window. Rendering that
 *     as a hard date would be false precision, so it always shows as a range.
 *   * `date: null` covers both "this listing has no earnings" (ETFs, many
 *     non-US listings) and "the quote call failed" — the payload is identical,
 *     so no copy here may claim which of the two it is.
 */

/** How far ahead the dashboard list and the detail banner look. */
export const EARNINGS_HORIZON_DAYS = 28;
export const EARNINGS_HORIZON_LABEL = 'next 4 weeks';
/** How long an already-reported date stays worth showing. */
export const REPORTED_WINDOW_DAYS = 7;
/** Whether the dashboard list covers watchlist tickers too, or holdings only. */
export const SHOW_WATCHLIST_EARNINGS = true;
/** Upcoming rows the list shows before it stops (plus at most one reported). */
export const MAX_UPCOMING_ROWS = 5;
/** Dates this close read as urgent (loud relative label on the list). */
const SOON_DAYS = 3;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** `YYYY-MM-DD` as a UTC instant — these are calendar dates, never moments. */
function d(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Today as `YYYY-MM-DD`, matching how the server dates `upcoming`. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is in the past). */
export function daysBetween(from: string, to: string): number {
  return Math.round((d(to).getTime() - d(from).getTime()) / 86_400_000);
}

/** `11 Aug` */
export function dayMonth(iso: string): string {
  const dt = d(iso);
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
}

/** `TUE 11 AUG` — the list/banner date, in mono. */
export function monoDate(iso: string): string {
  const dt = d(iso);
  return `${DOW[dt.getUTCDay()]} ${String(dt.getUTCDate()).padStart(2, '0')} ${MONTHS[dt.getUTCMonth()]}`.toUpperCase();
}

/** `Tue 11 aug` — the banner's sub-line, which reads as a sentence. */
export function sentenceDate(iso: string): string {
  const s = monoDate(iso).toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** `14–18 Aug` — an estimated window, never two hard dates. */
export function rangeLabel(startIso: string, endIso: string): string {
  return `${d(startIso).getUTCDate()}–${dayMonth(endIso)}`;
}

/** `today` / `tomorrow` / `in 4d` / `yesterday` / `3d ago` */
export function relLabel(today: string, iso: string): string {
  const n = daysBetween(today, iso);
  if (n < 0) return n === -1 ? 'yesterday' : `${Math.abs(n)}d ago`;
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n}d`;
}

/* ── Dashboard list ─────────────────────────────────────────────────────── */

/** One ticker the dashboard can list, with whatever the server knows about it. */
export interface EarningsEntry {
  ticker: string;
  /** Ticker color (filled square when held, hollow when watchlist-only). */
  color: string;
  held: boolean;
  href: string;
  info: EarningsInfo | null | undefined;
}

export interface EarningsRow {
  ticker: string;
  color: string;
  held: boolean;
  href: string;
  /** `TUE 11 AUG`, or `14–18 AUG` for an estimated window. */
  dateStr: string;
  /** "Confirmed date" / "Estimated window" / "Already reported" (+ watchlist). */
  statusStr: string;
  rel: string;
  upcoming: boolean;
  /** Within a few days — the relative label carries full ink. */
  soon: boolean;
}

export interface EarningsList {
  /** Reports inside the horizon, soonest first, capped. */
  upcoming: EarningsRow[];
  /** The most recent report, when it is recent enough to still be interesting. */
  reported: EarningsRow | null;
}

interface ListOptions {
  horizonDays?: number;
  reportedWindowDays?: number;
  maxUpcoming?: number;
  showWatchlist?: boolean;
}

function toRow(entry: EarningsEntry, e: EarningsInfo, today: string): EarningsRow {
  const status = e.upcoming ? (e.estimated ? 'Estimated window' : 'Confirmed date') : 'Already reported';
  return {
    ticker: entry.ticker,
    color: entry.color,
    held: entry.held,
    href: entry.href,
    dateStr: e.endDate && e.date ? rangeLabel(e.date, e.endDate).toUpperCase() : monoDate(e.date!),
    statusStr: entry.held ? status : `${status} · watchlist`,
    rel: relLabel(today, e.date!),
    upcoming: e.upcoming,
    soon: e.upcoming && daysBetween(today, e.date!) <= SOON_DAYS,
  };
}

/**
 * The dashboard's earnings list: upcoming reports inside the horizon plus, at
 * most, the single most recent one.
 *
 * The reported row is bounded to the same window as the detail banner. Yahoo
 * keeps returning the last report until the next date is scheduled, so without
 * a bound a quiet ticker would sit in the list for a whole quarter announcing
 * news that stopped being news.
 */
export function buildEarningsList(
  entries: EarningsEntry[],
  today: string,
  opts: ListOptions = {},
): EarningsList {
  const {
    horizonDays = EARNINGS_HORIZON_DAYS,
    reportedWindowDays = REPORTED_WINDOW_DAYS,
    maxUpcoming = MAX_UPCOMING_ROWS,
    showWatchlist = SHOW_WATCHLIST_EARNINGS,
  } = opts;

  const dated = entries
    .filter((entry) => (showWatchlist || entry.held) && entry.info?.date)
    .map((entry) => ({ entry, e: entry.info! }))
    .sort((a, b) => a.e.date!.localeCompare(b.e.date!));

  const upcoming = dated
    .filter(({ e }) => e.upcoming && daysBetween(today, e.date!) <= horizonDays)
    .slice(0, maxUpcoming)
    .map(({ entry, e }) => toRow(entry, e, today));

  // Most recent first — "recently reported" means the latest one, not the
  // oldest still inside the window.
  const reportedSrc = dated
    .filter(({ e }) => !e.upcoming && daysBetween(today, e.date!) >= -reportedWindowDays)
    .at(-1);

  return {
    upcoming,
    reported: reportedSrc ? toRow(reportedSrc.entry, reportedSrc.e, today) : null,
  };
}

/* ── Stock detail banner ────────────────────────────────────────────────── */

export interface EarningsBannerInfo {
  title: string;
  sub: string;
  /** `TUE 11 AUG` / `14–18 AUG`. */
  dateStr: string;
  /** "confirmed" / "estimated". */
  flag: string;
  estimated: boolean;
  upcoming: boolean;
}

/**
 * The countdown banner, or null when there is nothing timely to say: no date
 * at all, an upcoming date past the horizon, or a report old enough that Yahoo
 * has usually rolled over to the next quarter anyway. The price row then
 * renders without it rather than showing an empty shell.
 */
export function earningsBanner(
  e: EarningsInfo | null | undefined,
  today: string,
  horizonDays: number = EARNINGS_HORIZON_DAYS,
  reportedWindowDays: number = REPORTED_WINDOW_DAYS,
): EarningsBannerInfo | null {
  if (!e?.date) return null;
  const n = daysBetween(today, e.date);
  if (e.upcoming ? n > horizonDays : n < -reportedWindowDays) return null;

  const title = !e.upcoming
    ? `Last reported ${relLabel(today, e.date)}`
    : n <= 0 ? 'Reports today' : n === 1 ? 'Reports tomorrow' : `Reports in ${n} days`;

  const sub = e.estimated && e.endDate
    ? `Estimated window · ${dayMonth(e.date)} – ${dayMonth(e.endDate)} · not confirmed by the company`
    : e.upcoming
      // Yahoo publishes no clock time, only a calendar date — saying nothing
      // about the hour would invite reading the placeholder as before/after bell.
      ? `${sentenceDate(e.date)} · no time of day published`
      : `${sentenceDate(e.date)} · next date not published yet`;

  return {
    title,
    sub,
    dateStr: e.endDate ? rangeLabel(e.date, e.endDate).toUpperCase() : monoDate(e.date),
    flag: e.estimated ? 'estimated' : 'confirmed',
    estimated: e.estimated,
    upcoming: e.upcoming,
  };
}
