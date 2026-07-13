# Portfolio Tracker — Complete Design Handoff

Single consolidated handoff replacing all previous `design_handoff_*` bundles. Contains the **current** version of every screen in the redesign, with all cross-screen consistency fixes applied.

Target: `portfolio-tracker/src` (SvelteKit, Svelte 5 runes, `tokens.css`). The `.dc.html` files are **design references created in HTML** — interactive prototypes showing intended look and behavior, not production code. Recreate them in the codebase using its established patterns. `mock.js` documents data shapes; `support.js` is only the prototype runtime — ignore it.

## Screens (open each file in a browser; resize across 900px to see both layouts)

| File | Screen | Detailed spec |
|---|---|---|
| `Revamp - Dashboard v2.dc.html` | Dashboard (Portfolio tab) | `specs/desktop_dashboard.md` + `specs/dashboard.md` (v3 supersedes holdings + main chart) |
| `Revamp - Analysis v2.dc.html` | Analysis | `specs/stock_detail_and_analysis.md` |
| `Revamp - Stock Detail v3.dc.html` | Stock drill-in | `specs/stock_detail_and_analysis.md` + `specs/stock_detail_v3.md` |
| `Revamp - Tax.dc.html` | Capital gains tax | `specs/tax.md` |
| `Revamp - Activity.dc.html` | Full transaction history (new) | `specs/activity.md` |
| `Revamp - Settings.dc.html` | Settings (restyle of existing page) | `specs/settings.md` |

Specs were written per-milestone; **the design files are the source of truth** where a spec and file disagree (see "Late changes" below — these postdate some specs).

## Late changes applied to ALL screens (may not appear in older specs)

1. **4-tab nav everywhere**: Portfolio / Analysis / Tax / Activity — desktop top nav and mobile bottom tab bar (12px horizontal item padding so 4 tabs fit 360px).
2. **Settings gear on every screen** (was analysis-only): 30×30px icon button at the right end of the desktop top nav and in mobile top bars; idle `#8b929c`, hover `#101216` on `#eceae3`. Navigates to Settings; active (filled) state on the Settings screen itself.
3. **Stock Detail now includes the desktop top nav** (Portfolio tab active) above its back-button header — supersedes the "no top nav on this screen" line in `specs/stock_detail_and_analysis.md`. Mobile keeps the back-button-only header.
4. **No layout shift between tabs**: `html { scrollbar-gutter: stable; }`, identical nav markup, 1160px container, and 18px top padding on every screen.

## Shared foundation

- Breakpoint **900px**; container max-width **1160px** centered, page padding 24px desktop / 20px mobile.
- Tokens: bg `#fafaf8` · text `#101216` / `#6a6f78` / `#8b929c` / `#b3b8c0` · green `#047857` · red `#b91c1c` · indigo `#6366f1` · active fill `#eceae3` · hairlines `rgba(16,18,22,0.06–0.07)`.
- Type: **Inter** (UI) + **JetBrains Mono** (all numeric/monetary values).
- Market-hours model (pre-open / live / closed states for charts and sparklines): see `specs/desktop_dashboard.md` and `specs/stock_detail_and_analysis.md`.
- Prototype-only tweaks (market simulation, density, tax scenario, etc.) preview states — do not implement as UI unless a spec says otherwise.

## Files

- 6 × `Revamp - *.dc.html` — the designs
- `mock.js` — shared mock dataset / data shapes
- `support.js` — prototype runtime; ignore
- `specs/` — per-screen detailed specifications
