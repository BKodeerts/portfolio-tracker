# Handoff: Settings Screen (revamp of existing page)

## Overview

Sixth handoff in the series (see `design_handoff_activity_screen/README.md` for the series list). This one **revamps the existing Settings page** — `src/routes/settings/+page.svelte` — rather than adding a new screen. Structure, sections, rows, and behavior are preserved 1:1 from the current implementation; only the visual language changes to match the revamp (plus the global nav update below).

## About the Design Files

`Revamp - Settings.dc.html` is a **design reference created in HTML** — a prototype showing intended look and behavior, not production code. Recreate it in the SvelteKit codebase by restyling the existing page; all wiring (stores, `fetchSettings`/`saveSettings`, MQTT push, cache clear, CSV routes) stays as-is. `support.js` is the prototype runtime — ignore it.

## Language note

The prototype uses **English copy** for design-review consistency with the other revamp files. The production page is Dutch — **keep the existing Dutch strings** (Algemeen, Instellingen, "Basismunt", toasts, etc.) unless a separate localization decision is made. Layout was checked against the longer Dutch strings; nothing depends on English lengths.

## Fidelity

**High-fidelity** for layout, spacing, and states; copy per the language note. Same tokens as previous handoffs (`#fafaf8` bg, Inter + JetBrains Mono, green `#047857`, red `#b91c1c`, active fill `#eceae3`, hairlines `rgba(16,18,22,0.06)`).

## Layout

- Max-width 1160px centered, breakpoint 900px, same chrome as all screens (top nav + gear active / bottom tab bar with **no** tab active — Settings is reached via the gear, see global nav update in the Activity README).
- **Desktop (≥900px)**: "Settings" page title (22/700), then two columns in one flex row, 56px gap — section nav `flex: 0 0 260px` left, panel `flex: 2 1 480px; max-width: 640px` right. No card shell around the shell (unlike the current `--surface` box) — flat on the page background, consistent with the revamp's flat aesthetic.
- **Mobile (<900px)**: master-detail drill-in, same as today. List view = section rows with chevron ›. Tapping opens the panel full-width; top bar swaps to 30px circular back button (`#eceae3`) + section title. Bottom tab bar stays visible.

## Section nav (5 items, unchanged set)

Row: 30×30px icon tile (8px radius, bg `#eceae3`; active tile `#e0ddd2`) + title (13/600; active 700) + live subtitle (11px `#8b929c`: watchlist count, HA "Actief/Uit", version). Active row (desktop only): bg `#eceae3`, 10px radius. Hover: `#f1efe9`. Keep the existing glyphs (⚙ ☆ ⚡ ⭳ ⓘ).

## Panels (rows: label 13/600 + hint 11.5px `#8b929c` left, control right, 15px vertical padding, hairline dividers)

1. **Algemeen** — Basismunt (select, white bg, mono value); Privacy-modus (switch); Intraday tijdens beurstijden (switch); Meerwaardebelasting huishouden (segmented Individueel/Koppel — same control style as the Tax screen's chips); Broker houdt 10% in (switch); Thema (segmented Auto/Licht/Donker).
2. **Watchlist** — uppercase section label "ACTIEVE TICKERS"; chips: white pill, 999px radius, ticker color dot (app color map; grey for unknown), × remove; add-row: mono input + solid `#101216` "Toevoegen" button; helper caption below.
3. **Home Assistant** — Push actief (switch); Interval (56px numeric input + "min" unit, clamped 1–60); Handmatig pushen (bordered button, "Pushen…" while busy); success toast in mono green.
4. **Data** — "IMPORT & EXPORT" label; two tiles (white card, 12px radius): "↑ Importeer CSV" (links to /import) and "↓ Exporteer CSV" disabled at 0.55 opacity with tx count; "GEVAARLIJK" label; full-width "↻ Cache legen" (bordered) and "Alle transacties wissen…" (red border `rgba(185,28,28,0.4)`, red text, confirm dialog as today).
5. **Over** — centered 56px "P" logo tile (`#101216`), app name, "v{pkg.version} · build {date}" mono caption (values from `package.json` / build — never hardcode; the prototype shows v0.7.0-redesign.2 as a snapshot), then hairline label/value rows: Data-bron, Framework, Transacties, Eerste boeking (mono values, `#8b929c`).

## Controls spec

- **Switch**: 42×24px, 999px radius; off track `#d5d8dd`, on `#047857`; 18px white knob, 3px inset, 0.15s transition.
- **Segmented**: 1px border `rgba(16,18,22,0.12)`, 8px radius; active segment `#eceae3` + 700, inactive text `#8b929c`.
- **Inputs/selects**: white bg, same border, 8px radius, mono for values.
- **Toasts**: inline mono 12px `#047857`, auto-clear ~3s (existing behavior).

## State & behavior

All existing: settings persist per-field on change; watchlist add/remove; HA push + interval; cache clear; wipe with confirm; theme + privacy via `themeStore`. Mobile entry shows the list (no section preselected); desktop preselects Algemeen. The 720px media query moves to the shared 900px breakpoint for consistency with the rest of the app.

## Assets

None — inline SVG (gear, back chevron) only.

## Files

- `Revamp - Settings.dc.html` — the full design (resize for mobile drill-in; all controls interactive)
- `mock.js` — mock data (watchlist tickers, transaction count)
- `support.js` — prototype runtime; ignore.
