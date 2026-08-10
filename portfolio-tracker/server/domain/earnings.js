// Pure normalization of Yahoo's earnings-date fields — no I/O.
//
// The v7 quote payload carries the next scheduled report as a pair of window
// bounds plus an estimate flag. Three properties of those fields make them
// unsafe to render straight from the payload:
//
//   * `earningsTimestamp` is the next *or most recent* report. A date in the
//     past is normal, so "upcoming" has to be derived, never assumed.
//   * While a date is unconfirmed, `earningsTimestampStart`/`End` bound a
//     window that can span several days. `isEarningsDateEstimate` usually
//     flags the same thing, but a multi-day window is itself proof of an
//     estimate even when the flag is absent.
//   * The clock component is frequently a placeholder. Only the calendar date
//     is trustworthy, and only in the exchange's own timezone — an after-hours
//     US report at 21:00 ET is already the next day in UTC.
//
// Yahoo omits these fields entirely for ETFs and many non-US listings, so
// every field here is nullable by design and an absent block is not an error.

/** Finite positive number, or null. */
function epoch(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/** Epoch seconds → `YYYY-MM-DD` in `timeZone` (en-CA renders as ISO). */
function dateInZone(seconds, timeZone) {
  const d = new Date(seconds * 1000);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  } catch {
    // Unknown/absent timezone name — fall back to UTC rather than throwing.
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Normalize the raw earnings fields of a v7 quote into a renderable shape.
 *
 * @param {object|null} quote raw quote fields (see `fetchQuoteStats`), or null
 *   when the authenticated quote call failed
 * @param {string} today `YYYY-MM-DD` — compared against the window *end*, so a
 *   report scheduled for today still counts as upcoming
 * @returns {{date: string|null, endDate: string|null, estimated: boolean,
 *   upcoming: boolean, timestamp: number|null}}
 *   `date` is the window start (or the single known date); `endDate` is set
 *   only when the window spans more than one day.
 */
function normalizeEarnings(quote, today) {
  const empty = { date: null, endDate: null, estimated: false, upcoming: false, timestamp: null };
  if (!quote || typeof quote !== 'object') return empty;

  const start = epoch(quote.earningsTimestampStart);
  const end   = epoch(quote.earningsTimestampEnd);
  const point = epoch(quote.earningsTimestamp);

  const from = start ?? point;
  if (from == null) return empty;

  const tz      = typeof quote.exchangeTimezoneName === 'string' ? quote.exchangeTimezoneName : 'UTC';
  const date    = dateInZone(from, tz);
  const endDate = dateInZone(end ?? point ?? from, tz);
  if (date == null || endDate == null) return empty;

  const spansDays = endDate > date;

  return {
    date,
    endDate: spansDays ? endDate : null,
    estimated: quote.isEarningsDateEstimate === true || spansDays,
    upcoming: typeof today === 'string' && today.length === 10 ? endDate >= today : false,
    timestamp: point ?? from,
  };
}

module.exports = { normalizeEarnings };
