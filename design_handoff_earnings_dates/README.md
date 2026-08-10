# Handoff: Earnings dates on dashboard & stock detail

## Overview
The last release added an earnings-dates service (`server/domain/earnings.js`, surfaced through
`stats.ts` as `EarningsInfo`). Nothing in the UI used it yet. This design puts it in two places:

1. **Dashboard** — an "Earnings" column beside Holdings listing the next reports, plus a small
   earnings line on each holding card.
2. **Stock detail** — a countdown banner on the price row, and a marker on the price chart at the
   last reported date.

## About the design files
`Earnings Dates.dc.html` is a **design reference written in HTML** — a prototype of the intended
look and behaviour, not production code to lift. Recreate it inside the existing SvelteKit app
using the current components, stores and styling approach. Both screens in the file are mock-ups of
screens that already exist in the app; only the earnings pieces described below are new. Everything
else in the file (portfolio chart, holdings cards, key-stat strip, period pills) is there for
placement context and should be left as the app already has it.

The prototype embeds a local copy of `mock.js` from `design_handoff_complete/` for data.

## Fidelity
**High-fidelity.** Colors, type and spacing match the existing revamp design language and should be
reproduced exactly. All values are listed under Design tokens.

## Data contract

Everything renders from what `normalizeEarnings` already returns, per ticker:

```ts
{ date: string | null, endDate: string | null, estimated: boolean, upcoming: boolean }
```

Constraints that shaped the design — do not design past them:

- **One date only.** The service returns the next report *or* the most recent one, never a series.
  There is no quarterly history, so no history table and only ever one chart marker.
- **No time of day.** Yahoo publishes no clock time, so there is no before/after-bell indicator.
  The banner says "no time of day published" instead.
- **`endDate` means an estimated window.** When present, render the date as a range and mark it
  estimated. When absent the date is confirmed.
- **`date: null` is normal** for ETFs and for a failed fetch — the payload looks identical in both
  cases, so copy must not claim which it is.

## Screens

### 1. Dashboard

**Layout.** Below the portfolio chart and its period pills, one grid:
`display:grid; grid-template-columns:1.65fr 1fr; gap:12px 20px; padding:26px 24px 0; align-items:start`.
Left track = Holdings, right track = Earnings. Each track is a
`flex column, gap:10px` with a section header above its content.

Two conditional layout rules:

- **Nothing upcoming inside the horizon → the whole earnings track is removed** (not just hidden)
  and the grid collapses to `grid-template-columns:1fr`, so holdings reflow full width. Hiding the
  child alone leaves a dead track.
- **Below 760px → `grid-template-columns:1fr`** and the earnings track takes `order:-1`, so the
  timely information leads on mobile.

**Section header.** Left: "Earnings", 13px/600. Right: "next 4 weeks · holdings + watchlist",
11px, `#8b929c`. The second half reads "holdings only" when the watchlist is excluded.

**Earnings card.** `background:#ffffff; border:1px solid rgba(16,18,22,0.07); border-radius:16px;
box-shadow:0 1px 2px rgba(16,18,22,0.03); padding:12px 16px 6px`.

Rows: `flex, align-items:center, gap:10px, padding:10px 0`, divided by
`border-bottom:1px solid rgba(16,18,22,0.06)`, hover `background:rgba(16,18,22,0.015)`, whole row
navigates to the stock detail. Row contents, left to right:

| Part | Style | Content |
| --- | --- | --- |
| Status square | 6×6, `border-radius:1px`, `1.5px` border in the ticker color | filled = held, hollow = watchlist |
| Ticker | JetBrains Mono 12px/700, width 46px | `ASTS` |
| Date | JetBrains Mono 11px/600 | `TUE 11 AUG`, or `14–18 Aug` for a window |
| Status | 11px `#8b929c`, under the date | "Confirmed date" / "Estimated window" / "Already reported", plus " · watchlist" when not held |
| Relative | JetBrains Mono 11px/600, right | "tomorrow", "in 4d", "3d ago" |

Reported rows render in `#b3b8c0` throughout. The list shows up to 5 upcoming rows inside the
horizon plus at most 1 recently reported row.

**Card footer legend.** `padding:10px 0 6px`, 10px `#8b929c`: a filled square "held", a hollow
square "watchlist", and right-aligned "estimated dates shown as a range".

**Holding card badge.** Appended to each existing holding card, above the card's bottom edge:
`margin-top:9px; padding-top:8px; border-top:1px solid rgba(16,18,22,0.06)`, a
`flex, align-items:center, gap:5px` row. Left: "Earnings", 9.5px, `letter-spacing:0.06em`,
uppercase, `#b3b8c0`. Right: the date in JetBrains Mono 10px/600.

Badge value by state:
- upcoming, ≤7 days out → `11 Aug` in `#101216`
- upcoming, further out → `11 Aug` in `#8b929c`
- estimated window → `14–18 Aug` with `border-bottom:1px dashed rgba(16,18,22,0.30)`
- already reported → `reported 6 Aug` in `#b3b8c0`
- no date → `—` in `#b3b8c0` (same degradation as the existing empty P/E cell)

### 2. Stock detail

**Countdown banner.** Sits on the price row, which becomes
`flex; align-items:center; flex-wrap:wrap; gap:14px 28px`. The banner is
`margin-left:auto; flex:0 0 auto; max-width:400px`, white card, `border-radius:14px`,
`padding:12px 16px`, `border:1px solid rgba(16,18,22,0.07)` — **dashed
`rgba(16,18,22,0.22)` when the date is estimated**. Below 760px it becomes `flex:1 1 100%` and drops
under the price.

Contents: a 7×7 `border-radius:2px` dot (`#101216` upcoming, `#b3b8c0` otherwise); title 13.5px/700;
sub-line 11px `#8b929c`; on the right the date in JetBrains Mono 12.5px/600 with a 10px
`#8b929c` flag underneath.

| State | Title | Sub | Right |
| --- | --- | --- | --- |
| upcoming, confirmed | "Reports in 4 days" / "tomorrow" / "today" | "Tue 11 aug · no time of day published" | `TUE 11 AUG` / "confirmed" |
| upcoming, estimated | same countdown, from the window start | "Estimated window · 14 Aug – 18 Aug · not confirmed by the company" | `14–18 AUG` / "estimated" |
| already reported | "Last reported 4d ago" | "Thu 06 aug · next date not published yet" | `THU 06 AUG` / "confirmed" |
| no date | banner not rendered | — | — |

**Visibility.** The banner only renders when the date is an upcoming one inside the horizon
(default 4 weeks) **or** a reported one no more than 7 days old. Outside that window, and whenever
`date` is null, the price row renders without it.

**Chart marker.** When the returned date is in the past, draw one marker on the price chart: a
vertical `1px rgba(16,18,22,0.16)` line, `stroke-dasharray:2 4`, from y=12 to y=238; a 3px `#101216`
dot with a 1.5px `#fafaf8` halo at the price on that date; and the date under the axis in JetBrains
Mono 9px `#8b929c`. A "last reported" legend item appears next to the period pills, and only then.
There is no future-date line — the banner covers that.

**Key stats.** No earnings entry in the stat strip; it read as noise next to the banner.

## Interactions & behaviour
- Earnings rows and holding cards navigate to the stock detail for that ticker.
- Nothing else is interactive; the period pills are the app's existing behaviour.
- Responsive: single breakpoint at **760px** of container width, measured with a `ResizeObserver` on
  the screen root in the prototype. In the app use the existing media-query approach. Below it the
  dashboard split stacks with earnings first and the banner goes full width. Both charts scale
  uniformly from their viewBox (`width:100%; height:auto`), so they keep their aspect ratio.
- No loading or error state is specified. A failed fetch arrives as `date: null` and renders as the
  no-date case.

## State
No new client state. Two configuration values in the prototype, both worth keeping as constants:

- `horizon` — how far ahead the list and banner look. Default **4 weeks** (2 / 4 / 6 offered).
- `showWatchlist` — whether the list includes watchlist tickers or only holdings. Default **true**.

## Design tokens
Existing revamp tokens, unchanged:

- Ink `#101216`, secondary ink `#3c414a`, muted `#8b929c`, faint `#b3b8c0`
- Canvas `#fafaf8`, surface `#ffffff`, selected chip `#eceae3`
- Positive `#047857`, negative `#b91c1c`
- Hairline `rgba(16,18,22,0.06)`, card border `rgba(16,18,22,0.07)`, dashed accent `rgba(16,18,22,0.22)`
- Card shadow `0 1px 2px rgba(16,18,22,0.03)`; radii 16px (cards), 14px (holding cards, banner), 8px (pills)
- Type: Inter 400/500/600/700 with `letter-spacing:-0.005em`; JetBrains Mono 400/500/600/700 for all
  numerals, dates and tickers
- Sizes used: 9.5 / 10 / 10.5 / 11 / 12 / 12.5 / 13 / 13.5px

## Assets
None. No icons or images were added.

## Files
- `Earnings Dates.dc.html` — both screens
- `mock.js` — data, copied from `design_handoff_complete/mock.js`

## Repo references
- `portfolio-tracker/server/domain/earnings.js` — the service and `normalizeEarnings`
- `portfolio-tracker/src/lib/types/stats.ts` — `EarningsInfo`
- `design_handoff_complete/specs/dashboard.md`, `specs/stock_detail_v3.md` — the screens being added to
