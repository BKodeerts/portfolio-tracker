# Handoff: Activity Screen (full transaction history)

## Overview

Fifth handoff in the series. Builds on:

1. `design_handoff_frontend_revamp/` — mobile-first revamp (tokens, formatting rules).
2. `design_handoff_desktop_dashboard/` — responsive framework (900px breakpoint, 1160px container, desktop top nav).
3. `design_handoff_desktop_detail_analysis/` — Stock Detail + Analysis desktop.
4. `design_handoff_tax_screen/` — Tax screen (introduced the 4-tab nav).

This handoff adds the **Activity** screen — the full transaction history the Dashboard's "Activity → All" links to. It replaces the old raw transactions list. Target: `portfolio-tracker/src` (SvelteKit, Svelte 5 runes, `tokens.css`), same recreation rules as previous handoffs.

## About the Design Files

`Revamp - Activity.dc.html` is a **design reference created in HTML** — an interactive prototype showing intended look and behavior, not production code. `mock.js` documents data shapes (`transactions`, `realizedPl`, `dividends`); `support.js` is the prototype runtime — ignore it.

## Fidelity

**High-fidelity.** Tokens, type scale, nav, tab bar, and responsive framework are identical to previous handoffs. Express values through `tokens.css`.

## Layout

- Max-width 1160px centered, 24px page padding on desktop, 20px mobile. Breakpoint 900px.
- Desktop: top nav (Portfolio / Analysis / Tax / **Activity** active) + settings gear at the right (see "Global nav update" below). Mobile: "Activity" title bar with gear, fixed bottom tab bar (4 items, Activity active).
- Content column: list capped at `max-width: 720px` — transaction rows read poorly full-width.

## Sections

### Year summary (top)

3-column grid (`repeat(3, minmax(0,220px))` desktop, `repeat(3,1fr)` mobile):
1. **Net invested · {year}** — Σ buys − Σ sells, mono 24px/700 (18px mobile).
2. **Realized P&L** — signed, green `#047857` / red `#b91c1c`.
3. **Dividends** — from totals.

Labels 11px `#8b929c`. Computed over ALL transactions regardless of the active filter.

### Filter chips

All / Buys / Sells / Dividends. Active: bg `#eceae3`, 700, no border. Inactive: text `#8b929c`, 1px border `rgba(16,18,22,0.12)`. Filtering applies to the list only.

### Transaction list, grouped by month

- Month header row: "June 2026" (13/600) left, "net +€X" (mono 11px `#8b929c`) right. Net = sells + dividends − buys for that month (cash-flow sign).
- Row anatomy (hairline-divided, hover `rgba(16,18,22,0.02)`):
  - Kind chip 34px wide, 10/700: BUY (green tint `rgba(4,120,87,0.10)`), SELL (red tint), DIV (indigo tint `rgba(99,102,241,0.10)` / `#6366f1`).
  - 6px ticker color square + ticker (13/700) + full name (11px `#8b929c`, truncates).
  - Sub-line mono 10px: "{n} sh @ €X.XX" (per-share = costEur / |shares|; USD tickers prefix "≈€" since the stored value is EUR-converted) or "cash dividend".
  - Right: amount mono 13.5/700 — buys "-€X" in `#101216`, sells "+€X" green, dividends "+€X" indigo; date "27 Jun" 10px `#b3b8c0` underneath.
- Empty filter result: centered "No {kind} in this period." 12px `#8b929c`.
- Footer caption: "Showing all activity since {first month}".

## Data & state

- `kind` derives from `shares`: > 0 BUY, < 0 SELL, = 0 DIV (same rule as the Dashboard's activity preview).
- Only UI state is the active filter. No new stores; reads the existing transactions store.
- Prototype tweak `density` (comfortable 13px / compact 9px row padding) is a design toggle — pick comfortable in production, or expose it in Settings if desired.

## Global nav update (applies to ALL screens)

Shipped alongside this screen and already reflected in all design files of this series:

1. **4-tab nav everywhere**: Portfolio / Analysis / Tax / Activity — desktop top nav and mobile bottom tab bar (12px horizontal item padding so 4 tabs fit 360px).
2. **Settings gear on every screen** (previously only on Analysis): desktop — 30×30px icon button at the right end of the top nav (16px stroke gear; idle `#8b929c`, hover `#101216` on `#eceae3`, active state on the Settings screen itself: `#eceae3` bg + `#101216`); mobile — same button in the top title bar, right-aligned. Navigates to Settings.
3. **No layout shift between tabs**: `html { scrollbar-gutter: stable; }` and identical container geometry (1160px, 18px top padding) on every screen.

## Assets

None — inline SVG only.

## Files

- `Revamp - Activity.dc.html` — the full design (resize to see both layouts; filters are interactive)
- `mock.js` — mock data shapes
- `support.js` — prototype runtime; ignore.
