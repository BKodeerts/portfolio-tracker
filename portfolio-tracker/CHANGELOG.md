# Changelog

## [0.13.11] — 2026-08-13

### Changed

- **A quiet session now looks quiet.** Intraday plots autoscale to the session's own range, which early in the day is a few basis points wide — a portfolio up 0,02% at 09:32 was drawn corner to corner, at full height, reading as a big move. Both the dashboard 1D chart and the holding-card sparklines now hold a minimum axis span: 0,5% of the prev close for value plots, 0,5 percentage points for the ones already drawn in %. Under that floor a move fills only the fraction of the height it is actually worth (0,02% draws as a flat line just off the baseline); at or above it nothing changes, so a normal day still fills the plot exactly as before.

- The 1D chart's high/low tags are dropped when the two would land within 20px of each other. On a floored axis they otherwise stack on top of each other to label a high and a low that are a cent apart.

## [0.13.10] — 2026-08-10

### Added

- **Earnings dates on the dashboard**: a new Earnings column beside Holdings lists who reports next — up to five upcoming reports inside a four-week horizon, across holdings and watchlist, plus at most one recently reported ticker. Each row carries the ticker's color as a square (filled when held, hollow when only watched), the date, whether it is confirmed or an estimated window, and how far away it is. With nothing upcoming inside the horizon the whole column is dropped rather than hidden, so the holdings reflow full width instead of sitting beside a dead track. Below 900px the column moves above the holdings: the timely information leads on mobile.

- **An earnings line on every holding card**: `11 Aug` in full ink within a week, muted further out, `14–18 Aug` with a dashed underline when the date is an unconfirmed window, `reported 6 Aug` once it has passed, and `—` when there is none. The dash is the same degradation as the empty P/E cell, and it has to be: a listing with no earnings and a failed quote produce an identical payload, so the copy cannot claim which of the two it is.

- **A countdown banner on the stock detail price row**: "Reports in 4 days" / "tomorrow" / "today", or "Last reported 4d ago" once the date has passed, with the date and a confirmed/estimated flag alongside. An estimated date puts a dashed border on the banner and shows the window as a range. The sub-line says "no time of day published" outright — Yahoo's timestamp carries a placeholder clock, and leaving that unsaid invites reading it as a before/after-bell indicator. The banner renders only inside its useful window (an upcoming date within the horizon, or a report at most a week old); outside it, and whenever there is no date, the price row renders without it.

- **A marker for the last reported date** on the stock detail price chart: a dashed rule, a dot at that day's close, the date under the axis, and a "last reported" legend item beside the period pills — only when a marker is actually drawn. There is only ever one, because the service returns a single date; a future date gets no line, since the banner already covers it.

- `GET /api/earnings?symbols=…`, serving the same normalized block for a set of tickers. `/api/stats/:symbol` already carried this for one ticker, but it also fetches the chart and the full candle history, which is far too much for one field across a dozen tickers. The disk cache holds the raw quote fields rather than the normalized result, so `upcoming` — which is derived against today's date — cannot go stale across midnight.

### Changed

- The `Earnings` cell is gone from the stock detail key-stats strip. The banner says the same thing louder a few centimetres above it, and the second copy read as noise.

## [0.13.9] — 2026-08-10

### Added

- **Next earnings date on the stock detail page**: the key-stats strip gains an `Earnings` cell showing when the company is next expected to report. The date rides along on the authenticated v7 quote the server already fetches for market cap and P/E, so it costs no extra Yahoo request and degrades identically — when the quote call fails, or the listing simply has no earnings (ETFs, many non-US listings), the cell reads `—` instead of erroring.

  Yahoo's raw fields are not safe to render directly, so `server/domain/earnings.js` normalizes them first. `earningsTimestamp` is the next *or most recent* report, so a past date is normal and `upcoming` has to be derived rather than assumed. An unconfirmed date arrives as a multi-day `earningsTimestampStart`/`End` window, which is itself proof of an estimate even when `isEarningsDateEstimate` is missing. And the timestamp's clock component is a placeholder, so the calendar date is resolved in the exchange's own timezone — an after-hours US report at 21:00 ET is already the next day in UTC, and dating it in UTC would show the wrong day.

  Estimated dates therefore render with a leading `~`, and multi-day windows as a range (`~11–15 Aug`). Showing an estimate as a hard date would be the same false precision the 0.13.7 close-price fixes removed.

- Hover titles on all five key stats, naming each metric in full (Dutch), so the abbreviated labels are unambiguous.

### Note

Stats entries served from a cache written before this version carry no `earnings` block; the page treats that as "no date" and the entry expires within 15 minutes.

## [0.13.8] — 2026-08-05

### Changed

- **Removed the dotted extended-hours tail from every graph**: pre-open, both the stock detail 1D chart and the dashboard holding/watchlist sparklines reserved the right ~15–17% of their width for today's pre-market ticks, drawn as a dotted grey tail, and squeezed the previous session into the width that was left. The two halves ran at different time scales — the session at real session speed, the tail compressed into a sliver — so a single line crossed the plot pretending to be continuous when it was really two sessions bolted together. At 34px tall on a card, that was impossible to see at all. The prices being shown that way are also thin-volume extended-hours quotes that mostly don't survive the open, so the ambiguity bought nothing. Both graphs now draw regular trading hours only, and the previous session spans the full width again.

  The dashed horizontal prev-close baseline is unrelated and unchanged, as are the "Previous session · opens HH:MM" caption, the dimmed pre-open styling, and the live/post states.

### Removed

- Ghost-tail plumbing, now that nothing renders it: the `ghostPoints`/`ghostStart`/`ghostEnd` props on `PeriodChart` and `IntradaySparkline`, the same three fields on `TickerSpark` along with the `allPoints` filtering and weekend guard in `buildTickerSpark`, the 83/85% width split in both components, and the `--spark-ghost` color token in both themes. Extended-hours ticks are still fetched and still exposed server-side as `allPoints` on the intraday payload, so nothing is lost if they are ever wanted again.

## [0.13.7] — 2026-08-03

### Fixed

- **Prices came from 5-minute bars instead of official closes**: a bar's close is not a closing price. The last regular bar spans 15:55–16:00 ET, so it excludes the closing cross that prints at 16:00:01 and lands in the following (post-market) bar. Every session was affected — ASTS on 2026-07-31 closed at **58.98** but its last bar read 58.93, and the day before, 58.44 vs 58.455. The two errors compound in a change %, so the app showed **+0.81%** where Yahoo Finance and NASDAQ both report **+0.92%**. Chart meta already carries the authoritative pair for the session it describes (`regularMarketPrice` = that session's official close, `previousClose` = the close before it); both are now used, guarded by `regularMarketTime` so a meta that has rolled over to the next session can never substitute the wrong day's prices. The drawn session's final chart point is pinned to the official close as well, so the card's number and the sparkline continue to agree by construction.

- **Meta previous-close fallback read a field that never exists**: the fallback chain used `meta.regularMarketPreviousClose`, which is a *quote*-endpoint field and is absent from chart meta — the correct name there is simply `previousClose`. The lookup therefore evaluated to undefined and dropped through to `chartPreviousClose`, the close before the entire fetched range (five sessions stale at `range=5d`, e.g. 58.29 against an actual previous close of 58.44). Both names are now read, correct one first.

## [0.13.6] — 2026-08-01

### Fixed

- **Pre-open card % disagreed with its own sparkline**: the day number on a pre-open holding/watchlist card came from `prevSessionMove`, which measured the drawn session's **open→close** move, while the sparkline beside it drew that session against its previous close. The two therefore reported different moves — a card could read −4.58% while its line sat flat against its baseline, which is the same card-vs-graph mismatch 0.13.4/0.13.5 addressed, just relocated. `prevSessionMove` now measures the session's close against `spark.prevClose` — the exact value `IntradaySparkline` draws its zero line at — so the card and its line agree by construction rather than by coincidence, and follow the standard close-to-close daily-change convention.

## [0.13.5] — 2026-08-01

### Fixed

Follow-up to 0.13.4, which fixed the pre-market baseline in the frontend but left two server-side causes in place — the line still read wrong against live data.

- **Prev-close baseline used extended-hours prices instead of the actual previous close**: `derivePreviousClose` scanned backwards for the last candle before today's pre-market start without filtering to regular trading hours. Candles are fetched with `includePrePost=true`, so that scan landed on the *previous day's post-market* run — a price hours past the closing bell — and used it as the close. This was never pre-market-specific: during live sessions the day-change % was also measured against after-hours drift rather than the official close. All previous-close lookups now share one regular-hours time-of-day filter (`makeInRegularTod`), so a baseline can only come from a real regular-session close.

- **Intraday fetch range widened 2d → 5d**: with `range=2d` the payload held exactly `[previous session, today]`. During pre-market the drawn session *is* the previous session, so its baseline — the close before it — was two sessions back and simply absent from the data. The lookup found nothing and fell through to Yahoo's `meta.regularMarketPreviousClose`, which during pre-market is the drawn session's own close, silently reproducing the flat/inverted line that 0.13.4 set out to fix. (Weekends looked correct only because a Saturday's 2-day window happens to span both Thursday and Friday.) 5d also covers long weekends and holidays. Where the lookup still can't be satisfied, the baseline now degrades to the drawn session's own open — showing that session's real move, matching the "prev session" card label — instead of collapsing onto its own close and reading 0%.

### Fixed

- **Prev-close line wrong during pre-market**: once a ticker's pre-market opened, the dashed prev-close baseline in the ticker sparklines, the stock detail 1D chart, and the dashboard 1D chart jumped to the *drawn* (previous) session's own close, so a clearly negative day (e.g. ASTS −4.58%) rendered as a line ending exactly on the baseline and read as positive. The server's pre-market `previousClose` is deliberately the last session's close (it anchors the pre-open market price and day change), but that made it the wrong baseline for drawing that same session. `/api/intraday` now also returns `sessionPreviousClose` — the close before the day the session points belong to (equal to `previousClose` in every other market state) — and all pre-open drawing paths (ticker sparkline incl. its ghost-tail anchor, stock detail 1D chart, dashboard 1D chart, hero day-change baseline) measure the drawn session against it. During pre-market the previous session now reads with its true sign and magnitude, consistent with weekend behaviour.

## [0.13.3] — 2026-07-14

### Fixed

- **Dashboard hero vs 1D chart mismatch**: the hero total/day-change and the 1D chart could disagree (e.g. hero "+€935 (+0.92%)" while the chart's latest point read "+€173 (+0.17%)"). Both sides valued tickers whose exchange hadn't traded on the drawn day differently: the hero used the ticker's last (stale-session) close against a `previousClose` the server may anchor a session earlier — silently counting a *previous* session's move as "today" — while the chart pinned those tickers at that older `previousClose`, deflating its level. The hero (`getLiveData`/`getDay1Pl`) and the 1D chart (`buildPortfolioIntradaySession`) now share one display-day rule (`getDisplayDay`): a ticker's move only counts toward the day change when its session points fall on the drawn day; otherwise the position is carried flat at its last known close in both the line and the baseline. Header value, day P&L, and the chart's latest point now always agree.

## [0.13.2] — 2026-07-13

### Fixed

- **Tax page mobile header**: the settings gear sat on a wrapped line because the long "meerwaardebelasting · 10% on realized gains" subtitle forced the header row to wrap. The gear now stays pinned top-right next to the title on mobile, with the subtitle and year chips wrapping onto their own lines below.

## [0.13.1] — 2026-07-13

### Changed

- **Stock detail desktop header** (complete handoff bundle, late change 3): the stock detail page now shows the standard desktop top nav (wordmark, Portfolio/Analysis/Tax/Activity tabs with Portfolio active, settings gear) above its back-button header. The nav carries no live-status chip here — the page's own topbar already shows the per-ticker market-state chip — and no "← Portfolio" back link, since the page keeps its own circular back button. Mobile (<900px) is unchanged: back-button-only header plus the bottom tab bar.

## [0.13.0] — 2026-07-13

### Added

- **Activity screen** (design handoff 5): the Dashboard's "Activity → All" link now lands on a full transaction history instead of the old raw transactions editor. Year summary strip (net invested, realized P&L, and dividends for the current year — realized P&L and dividends from the server's per-year `annualPl`), All/Buys/Sells/Dividends filter chips, and a month-grouped list with cash-flow month nets, BUY/SELL/DIV kind chips, per-share sub-lines (`≈€` for non-EUR tickers, since stored costs are EUR-converted), and amounts colored by kind. Rows link to the stock detail page. Adding transactions still works via CSV import (`/import`).

### Changed

- **Global nav update** (ships with the Activity screen): the settings gear now appears on every screen — a shared 30×30 icon button at the right end of the desktop top nav (replacing the old boxed toggle) and in each mobile title bar (Portfolio, Analysis, Tax, Activity). Mobile bottom-tab items use 12px horizontal padding so 4 tabs fit a 360px viewport, and `scrollbar-gutter: stable` removes the layout shift when switching between short and long tabs.

### Removed

- The inline transaction editor (add/delete/save, search, Dutch UI) that previously lived at `/transactions` — replaced by the read-only Activity screen per the design handoff.

## [0.12.2] — 2026-07-13

### Fixed

- **US sparklines no longer vanish mid-morning**: once US pre-market candles started arriving (~10:00 Brussels, while EU markets are open), the server's session fallback keyed "yesterday's session" on the last raw candle date — which by then was *today*, with no regular-hours data yet — so it returned an empty session and every US ticker's "prev session" graph disappeared until the US open. The fallback now targets the last calendar day that actually has regular-hours candles.

## [0.12.1] — 2026-07-13

### Fixed

- **Stock detail page for watchlist tickers**: clicking a watchlist card no longer dead-ends on "Unknown ticker". The page now renders everything that doesn't depend on ownership — market price hero, 1D and history charts, 52-week range, key stats, and the Returns card — with the trading currency taken from the live quote instead of defaulting to €. The "Your position" card is replaced by an "On your watchlist" note, and "Your history" / transaction markers stay hidden. Owned tickers are unchanged, and unknown symbols still get the empty state. (Watchlist-only setups with zero positions render without live intraday — the intraday batch still requires at least one held position.)

## [0.12.0] — 2026-07-13

### Added

- **Stock Detail v3** (design handoff 4): three new information blocks between the chart and the position/history columns.
  - The hero delta now follows the selected period pill: 1D keeps today's change vs prev close, other periods show the $ and % move from the first close of the period to the current market price, with a `Past 3 months · $36.78 → $53.42` caption. The history series' final point is patched to the live market price so chart, caption, and hero never drift.
  - Key-stats strip below the period pills: a 52-week range bar (low/high labels, filled track, current-price marker) plus Mkt cap / Volume / Avg vol / P/E reference stats.
  - "Returns" card with the stock's own price returns over 1M / 6M / 1Y / 3Y / All, using the same tinted-cell anatomy as the Analysis page's rolling returns.
- New `/api/stats/:symbol` endpoint (15-min cache): 52w range and volumes from Yahoo's chart API, market cap / trailing P/E via Yahoo's authenticated quote endpoint (best-effort, `—` when unavailable), and price returns computed server-side in the new tested `server/domain/stats.js`.

## [0.11.4] — 2026-07-13

### Added

- **Stock page chart feature parity**: the stock detail page's big graph now has the same features as the dashboard chart — high/low value tags, buy/sell/dividend transaction markers on the history chart, and a crosshair hover tooltip (date/time, native price, change over the period or vs prev close, and any transactions on that day). The transaction-marker snapping logic moved from the dashboard page into shared `$lib/utils/tx-markers.ts` so both pages use one implementation.

## [0.11.3] — 2026-07-11

### Fixed

- **"prev close" chart caption removed**: 0.11.2 fixed its collision with the high/low tags by shifting the tag sideways, which left the number floating far from its data point. The caption is gone entirely instead — the dashed baseline is self-explanatory and the tooltip carries the delta vs prev close — so high/low tags always sit at their points.
- **No stray dotted ghost tail on weekends**: ticker sparklines drew the drawn session's *own* pre-market as a dotted "upcoming pre-market" tail on weekends (Yahoo's trading periods still describe Friday's finished session), and reserved the tail width even without ghost data. The ghost now only appears when its window genuinely follows the drawn session, and the session line uses the full width otherwise.

## [0.11.2] — 2026-07-11

### Fixed

- **Chart label collision**: the "prev close" caption and a high/low value tag overlapped into garbled text when the session opened at its high or low near the prev-close line — the tag now shifts right, clear of the caption.
- **Weekend "opens" hints carry the day**: sparkline hints and the stock-page chip/captions said "opens 15:30" on Saturdays, implying today. The next open is now computed by rolling forward past the weekend and labeled with the day when it isn't today ("opens Mon 15:30"). New `nextSessionOpen` / `fmtOpenAt` helpers in `$lib/market`, with tests.

## [0.11.1] — 2026-07-11

### Fixed

- **Weekend dashboard no longer blank**: on Saturdays/Sundays every ticker sparkline was empty and the 1D portfolio chart drew a flat green 0-line on its baseline. Two causes: the server's stale-session guard discarded Friday's candles when Yahoo still reported Friday's (finished) session as the current trading period, returning zero intraday points all weekend; and the 1D portfolio series only kept points from today's calendar day, collapsing to the prev-close baseline on non-trading days. The dashboard now always shows the **last trading session** when no market trades today — the full Friday session in the chart (labeled "last session · markets closed", no live dot), sparklines in their dimmed prev-session state, and the hero delta showing Friday's move vs Thursday's close.
- The intraday store no longer schedules a pointless "stale data" force-refresh on weekends, when a previous-day session date is the expected state.

## [0.11.0] — 2026-07-11

### Capital gains tax screen — meerwaardebelasting (design handoff)

- **New Tax tab** (Portfolio / Analysis / **Tax** / Activity, desktop nav + mobile tab bar): a full overview of the Belgian capital gains tax (wet van 3 april 2026) — 10% flat on realized gains above the yearly exemption.
- **Server-computed tax report** (`server/domain/tax.js`, pure + tested, exposed via `/api/portfolio`): per tax year (2026 →) the realized sales with the Belgian basis rule — pre-2026 lots step up to the 31/12/2025 "foto" value (derived from cached candles + FX at that date), actual purchase price when higher (until end 2030) — FIFO across lots, same-year loss offsetting, indexed exemption (€10,000 / €10,300 / €10,600, ×2 for couples), 10% above the exemption, broker withholding since 1 Jun 2026 and the resulting reclaim/pay balance.
- **The screen**: year chips, four hero cards (net realized gain, exemption used with progress bar, tax due, context-dependent balance card), realized-sales list with basis chips and withholding notes, full calculation table, tax-free headroom with a **sell simulator** (tap positions to see the tax impact of selling), the rules that apply to you, and a settlement-status card for closed years.
- **New settings** (Algemeen): household (individueel/koppel) and whether your broker withholds 10% at sale.

## [0.10.1] — 2026-07-10

### Fixed

- **Main chart % mode uses TWR again**: the € | % toggle re-based raw portfolio value against the window's first value, so every deposit counted as return — on Max the tiny day-one base inflated the line into absurd percentages (e.g. 51000% instead of the actual ~269%). The server now emits a flow-adjusted return index per chart row (`returnIndex`, base 100 at inception, same math as the TWR/rolling-return tiles) and the chart re-bases that index to the selected window, so deposits and withdrawals never move the % line and the Max endpoint matches the inception TWR.

## [0.10.0] — 2026-07-10

### Dashboard v3 — holdings cards, watchlist, chart features (design handoff 4)

- **Holdings rows → cards**: the dashboard holdings list is now a card grid (`minmax(150px,1fr)`, ~3-up in the desktop holdings column, 2-up on mobile) with a radically decluttered hierarchy — color dot + ticker and the native market price up top, a full-width session sparkline (same pre/live/post market-hours states), and a footer where your EUR value stays muted and the **day change is the only loud number**.
- **Day-change toggle (Apple Stocks-style)**: tapping any card's day number — or the "today · %" label above the grid — flips *all* cards between day-% and the position's day-€ impact. The choice is persisted. Pre-open cards show the previous session's move in washed-out green/red with the prev close as price; the toggle then switches between % and the native per-share change.
- **Watchlist**: tickers from Settings → Watchlist now render below Holdings as visually distinct cards — dashed border, transparent background, hollow color dot, company name in the footer. Day-€ mode shows the native per-share change (no position exists), including GBX pence (`+0.44p`). Cards link to the stock detail page.
- **GBX formatting**: pence-quoted LSE tickers format as `11.86p` — no fake £ conversion.
- **Main chart features** (portfolio chart):
  - **Crosshair + tooltip** — hover or touch-drag snaps to the nearest point: time (1D) or date title, the value, day delta vs prev close (1D) or invested + P&L lines (periods), the S&P 500 when the overlay is on, and any transactions at that point.
  - **€ | % toggle** — a segmented control next to the period pills; % re-bases 1D vs prev close and longer periods vs the window start. In % the invested overlay and gain fill are hidden.
  - **"vs S&P 500" chip** — overlays the real S&P 500 benchmark series (indigo), re-based to the window's first portfolio value (€) or 0% (%). Inactive on 1D.
  - **Gain/loss fill** — in € mode the region between the value line and the dashed invested line fills green above / red below, split at crossings (replaces the plain gradient there).
  - **Transaction markers** — buy/sell/dividend dots on the value line; details surface in the tooltip.
  - **Session shading (1D)** — EU / EU+US / US bands with small uppercase labels.
  - **High/low tags** — the period max/min get small dots with value labels (omitted when flat).

## [0.9.1] — 2026-07-07

### Calculation Fixes

- **Dashboard period % is now the time-weighted return (TWR)** — the hero delta % for 1M/3M/YTD/1Y/3Y/Max now uses the same server-computed rolling TWR as the Analysis tiles. Previously it divided the period's P&L by the portfolio value at the period start, which exploded on Max: the start value is the tiny day-one portfolio, so every deposit since then made the % absurd. The EUR amount next to it is unchanged (change in unrealized P&L — deposits still don't count).
- **Server rolling returns gained a `3y` window** so the dashboard's 3Y pill has a real TWR. When no TWR exists for a period yet (e.g. not enough history), the % is hidden instead of showing a misleading number.

## [0.9.0] — 2026-07-07

### Stock Detail v2 & Analysis v2 — responsive desktop layouts (design handoff 3)

- **Stock Detail desktop (≥900px)**: 1160px container with the back-button header (no top nav — it's a drill-in page), 42px price hero, 260px full-width chart that recomputes on resize, period pills capped at 440px, and the position card + history side by side below the pills.
- **Stock Detail market-hours states**: the header chip, price hero, 1D chart and "Today" cell now follow the ticker's own exchange session — pre-open shows the prev close with a dimmed previous-session chart and a dotted extended-hours ghost tail (chip `OPENS HH:MM`); live shows the growing session line with the pulsing now-dot (chip `OPEN`); after close the full session renders without a now-dot (chip `CLOSED`, caption "At close, HH:MM CET"). Reuses the dashboard sparkline phase logic; non-1D periods are unaffected.
- The hero price and day change now come from regular-session ticks only — extended-hours ticks no longer leak into the displayed price or the position card's "Today" P&L.
- **Analysis desktop (≥900px)**: top nav with Analysis active (no live-status chip on this screen), performance row with 30px TWR/IRR numbers and rolling returns beside them, and a two-column section — return-by-position bars at full width with Risk below on the left, Allocation on the right. Mobile keeps the handoff-1 layout and order exactly.

## [0.8.4] — 2026-07-06

### Calculation Fixes

- **Rolling returns (1W/1M/3M/YTD/1Y) are now time-weighted** — deposits and withdrawals inside the window no longer count as portfolio performance. Previously a €1,000 deposit into a €10,000 portfolio showed up as "+10%" in the 1M tile. Benchmarks were already price returns, so portfolio vs benchmark is now a fair comparison on every tile.
- **Risk metrics use flow-adjusted daily returns** — volatility, annualized return, Sharpe and beta no longer treat buy/sell days as price jumps; max drawdown is measured on the return index, so deposits can't mask a crash and withdrawals can't fake one. Annualized return is now TWR-consistent (was: CAGR of the contribution-inflated value series).
- **Sortino ratio is now computed server-side** — the Analysis page row rendered "–" forever because the server never emitted it.
- **HA/MQTT snapshot cost basis fixed** — `cost_basis`, unrealized P&L and P&L % sensors used gross buys (including shares already sold) instead of the FIFO cost basis of open shares, overstating cost after any sale. Now matches the dashboard's FIFO numbers.
- **Dashboard period % uses the period-start value** — the hero delta % for 1M/3M/YTD/1Y/3Y divided by cost basis, roughly doubling the displayed move for a portfolio that has doubled. It now uses the same base convention as the 1D delta (previous close).
- XIRR no longer assumes `transactions.json` is date-sorted; annual dividend totals clamp accidental negative entries the same way the dividend totals do.

### Naming Fixes

- Frontend `RiskMetrics` type now mirrors the server (`maxDrawdownPct`, `annualReturn`, `sortino`; dropped never-emitted `calmar`), removing the runtime field-name workaround on the Analysis page.
- Analysis "Volatility" sub-label said "1Y, annualized" but the metric covers the full history — now "annualized, full history".
- Stock page "Invested" stat renamed to "Cost basis" (it is the FIFO cost of the shares still held, not total deposits).
- Day P&L placeholders: the dashboard no longer shows a fake "+€0 (+0.00%)" day delta while intraday data is still loading — the delta is hidden until real data arrives.

## [0.8.1] — 2026-07-03

### Bug Fixes

- Fixed add-on failing to start after 0.8.0: the Docker image did not include `shared/fx-defs.json`, crashing the server on boot with MODULE_NOT_FOUND.

## [0.8.0] — 2026-07-03

### Major Refactor

- **SvelteKit 5 + TypeScript + ECharts frontend** (from the 0.7.0 beta line) is now the stable UI: at-a-glance dashboard with live hero, movers strip, positions table/cards, and a per-position deep-dive page.
- **Deep-dive page on server data** — native-currency average cost is now computed server-side from FIFO lots; new Dividenden and Gerealiseerde W/V stat cards; Koers/Waarde chart toggle showing the holding's EUR value over time.

### Bug Fixes

- **Multi-currency live values** — positions traded in GBX/CHF/SEK/DKK/NOK were converted with a 1:1 FX rate in live dashboard values (London prices were off by ~100×). All live money math is now keyed on the position's trading currency with a live rate per held currency.
- Fixed FX definition drift risk: one shared `shared/fx-defs.json` is consumed by both server and frontend.

### Internal

- Pure money math (FIFO, splits, XIRR, TWR, risk metrics, FX, chart series) extracted to `server/domain/` with a 44-test vitest suite.
- Typed API contract for chart data and ticker metadata, with a runtime shape check on `/api/portfolio` responses.
- Dashboard decomposed into components; SVG sparklines are a real Svelte component (no more HTML string injection); market-session logic consolidated into one module.
- CI workflow: tests, type check, lint, and build on every PR.

## [0.6.1] — 2026-04-03

### Bug Fixes

- Fixed cache group filters in the Settings page — "Historisch" and "Dagelijkse quotes" always showed 0 entries and clearing them had no effect. The prefix patterns did not match the actual cache filenames on disk.

## [0.6.0] — 2026-04-03

### New Features

- **Settings page** — dedicated settings tab (cogwheel icon) replacing the old inline config. Covers push interval, intraday toggle, base currency, watchlist, and granular per-ticker push-positions control (none / all / manual selection).
- **Cost vs. capital invested** — the Analyse tab now distinguishes between total cost paid and net capital currently deployed (accounting for sales), shown as separate metrics.
- **Privacy mode** — toggle to hide capital invested amounts from the UI.
- **Annual P&L table** — new breakdown table in Analyse showing realised and unrealised P&L by calendar year.
- **CSV export** — export positions and transactions as CSV files directly from the Analyse tab (Excel-compatible BOM included).
- **Currency P&L tile** — position modal now shows a dedicated P&L tile in the stock's native currency alongside the EUR figure.
- **Bonus type selector** — call-options bonus calculator now lets you choose the option type (call/put), with a corrected start-price calculation.
- **Cache management** — new cache clear button in the Settings page with per-group cache status display and selective invalidation.
- **Stale graph indicator** — intraday chart shows a visual warning badge when displayed data is from a previous session (weekend, holiday, or pre-open).

### Improvements

- **Intraday before market open** — the server now serves the previous complete intraday dataset before the market opens, instead of an empty chart.
- **Market closed tooltip** — hovering the market-status badge when the market is closed now shows a tooltip explaining the state.
- **Holiday & weekend awareness** — market state detection correctly identifies weekends and public holidays as dark days (no trading), avoiding stale-data confusion.
- **Graph shrinks during market hours** — the main portfolio graph reduces its height during intraday view to make room for the live intraday chart.
- **1D graph range fix** — the 1-day history range on the portfolio chart now correctly limits data to a single day.
- **Mobile nav & settings polish** — navigation and settings layout improvements for small screens.

### Bug Fixes

- Fixed stale graph visualisation not refreshing correctly after data update.
- Fixed bonus calculation using wrong start price for options.
- Fixed "no data" state incorrectly shown on weekends.
- Fixed cache clear not completing reliably.
- Fixed label display inconsistency in position details.

---

## [0.5.0] — prior release baseline
