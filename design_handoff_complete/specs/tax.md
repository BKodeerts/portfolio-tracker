# Handoff: Capital Gains Tax Screen (meerwaardebelasting)

## Overview
A tax overview screen for a Belgian retail-investing portfolio app. It explains and tracks the Belgian capital gains tax ("meerwaardebelasting", wet van 3 april 2026): 10% flat on realized gains above a yearly exemption. The screen shows realized sales for a tax year, the full tax calculation, remaining tax-free headroom with a sell-simulator, filing/settlement status for past years, and the rules that apply to the user.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate this design in the target codebase's existing environment** (React, Vue, SwiftUI, native, etc.) using its established patterns and libraries — or, if no environment exists yet, choose the most appropriate framework and implement the design there. `Revamp - Tax.dc.html` contains the full design; `mock.js` contains the mock dataset it renders from. `support.js` is only the prototype runtime — ignore it.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and copy are final intent. Recreate pixel-perfectly, mapping values onto the codebase's token system where equivalents exist.

## Design Tokens
- Background: `#fafaf8` (warm off-white)
- Text primary: `#101216`; secondary: `#6a6f78`; tertiary/muted: `#8b929c`; disabled: `#c6cad1`; chip text: `#3c414a`
- Positive/green: `#047857` · Negative/red: `#b91c1c` · Pending/amber: `#b45309`
- Active chip / soft fill: `#eceae3`; sim result panel: `#f4f3ee`
- Borders: `rgba(16,18,22,0.06–0.07)` 1px; card shadow: `0 1px 2px rgba(16,18,22,0.03)`
- Radii: cards 14–16px, chips/buttons 8px, rows 10px, checkbox 5px, ticker dot 2px (6×6px square)
- Type: **Inter** (UI) + **JetBrains Mono** (all numeric/monetary values), letter-spacing -0.005em on body, -0.02em on headings
- Scale: page title 15/700 · card values 22/700 mono · section titles 13/600 · row tickers 12.5/700 · secondary 11–11.5 · captions 10–10.5 · uppercase card labels 10/600, letter-spacing 0.06em

## Layout
Max-width 1160px, centered. Desktop (≥900px): top nav (product name + tabs Portfolio / Analysis / **Tax** / Activity); hero strip = 4 cards in `grid repeat(4,1fr)`, gap 10px; below, two columns via `flex wrap, gap 28px 56px` — left `flex:1 1 420px`, right `flex:1 1 380px`. Mobile: hero grid `1fr 1fr`, columns stack, fixed bottom tab bar (blurred `rgba(250,250,248,0.92)`, 4 items with 20px stroke icons).

## Screens / States

### Header
- Title "Capital gains tax" + muted subtitle "meerwaardebelasting · 10% on realized gains".
- Right: **year chips** (2026 / 2027 / …). Active chip: bg `#eceae3`, weight 700. Enabled inactive: text `#8b929c`, clickable. Future/disabled years: `#c6cad1`, not clickable. Selecting a chip switches the whole screen to that tax year.
- Sub-line: "Filed via aangifte {year+1} · exemption €X (per person, indexed | couple)".

### Hero cards (4)
1. **Net realized gain** — signed value, green/red; caption "{n} sales in {year}".
2. **Exemption used** — percentage; 5px progress bar (track `rgba(16,18,22,0.07)`, fill `#101216`, capped 100%); caption "€used / €exemption" mono.
3. **Tax due** — value red when > 0; caption "10% above exemption".
4. **Balance card** — context-dependent (see State Logic): "Reclaimable +€X" (green) / "Still due €X" (red) / "Reclaimed / Paid" (settled years) / "Due via aangifte €X" (broker doesn't withhold) / "No tax due". Caption explains withholding and aangifte.

### Left column
- **Realized in {year}** list: per sale — 6px colored ticker square, ticker (12.5/700), "{shares} sh · {d Mmm}", basis chip (mono 9.5px, bg `rgba(16,18,22,0.05)`: "foto 31/12/25" or "purchase price"), note ("transition — self-declare", "broker withheld 10%", "no withholding — self-declare", "actual cost basis (higher than foto)"), right-aligned signed gain (mono, green/red) with "withheld €X" underneath when applicable. Rows divided by 1px hairlines.
- **Calculation** table (label left, mono value right): Realized gains → Realized losses (same year) → **Net realized gain** → Exemption applied (−€X, muted) → **Taxable base** → **Tax (10%)** → Withheld by broker (label varies: "since 1 Jun" in 2026; "(not supported)" when broker doesn't withhold) → final row **To reclaim / To pay / Reclaimed / Paid via aangifte {year+1}** (green or red, 700).

### Right column — open (current) year
- **Tax-free headroom** card: title + big mono headroom value (green; red €0 when exemption fully used). Hint text swaps: "Gains you can still realize in {year} without paying tax…" vs "Exemption fully used — every additional euro of realized gains is taxed at 10%…".
- **Sell simulator**: one row per holding — 15px checkbox (checked: `#101216` fill, white check), ticker dot + ticker, basis note ("sell all · vs foto" / "sell all · vs purchase price (higher than foto)" / "latent loss vs …"), right-aligned signed simulated gain. Rows hover `rgba(16,18,22,0.04)`, selected `rgba(16,18,22,0.035)`. When ≥1 selected, a `#f4f3ee` panel shows: "If sold: net realized gain", "Tax due (10% above exemption)" (red if > 0), and a hint ("Fits within your remaining exemption — no tax due." / "Exceeds your exemption by €X — consider spreading sales across tax years.").
- **Rules that apply to you**: bulleted list (4px grey dot), 11.5px `#6a6f78`, line-height 1.55. See copy in the HTML; several strings interpolate the selected year and exemption.

### Right column — closed (past) year
Replaces the headroom/simulator card with a **status card**:
- 8px status dot: green = "Settled", amber = "Filed — assessment pending".
- Rows (label/value hairline table): Filed ("aangifte {year+1} · {date}"), Assessment received ({date}, settled only), and Reclaimed/Paid or Expected refund/payment (700, green/red).
- Footnote: "This tax year is closed. Figures are final as assessed." / "The assessment usually arrives within a few months of filing."

## State Logic (the important part)
Inputs (prototype exposes these as tweaks; in production they come from real data):
- **household**: individual (€10,000 exemption) or couple (×2). Exemption is indexed per year: 2026 €10,000 · 2027 €10,300 · 2028 €10,600.
- **broker withholding**: since 1 Jun 2026 brokers *may* withhold 10% at sale (depends on broker + user opt-in). Withholding ignores the exemption. If the broker doesn't withhold, all gains are self-declared and the balance card shows "Due via aangifte".
- **year selection / time**: past years are read-only with settlement status; assessment status (pending → received) comes from the tax authority.

Calculation (per year):
```
gains   = Σ positive realized gains
losses  = Σ negative realized gains        (offset within same year only, no carry-forward)
net     = gains + losses
used    = min(max(net,0), exemption)
taxable = max(0, max(net,0) − exemption)
tax     = taxable × 10%
balance = withheld − tax                   (>0 reclaim via aangifte, <0 still due)
headroom = max(0, exemption − max(net,0))
```
Simulator basis (until end 2030): `basis = max(fotoValue31/12/25, actualPurchasePrice)`; simulated gain = current value − basis. Simulated totals: `simNet = max(0, net + Σ selected gains)`, tax as above.

Basis rules: pre-2026 holdings use the 31/12/2025 "foto" value; actual purchase price may be used if higher (until end 2030). Costs/transaction taxes not deductible. Exemption carry-forward (+€1,000/yr up to €15,000) only in years where < €1,000 is used.

## Interactions & Behavior
- Year chips: click to switch year (enabled years only).
- Simulator rows: click toggles selection; multi-select; result panel appears/disappears.
- Hover states on nav items and simulator rows as specified above.
- Responsive breakpoint at 900px (top nav + 4-col hero vs bottom tabs + 2-col hero).
- No animations required beyond default hover transitions.

## Assets
No image assets. Icons are inline 20×20 stroke SVGs (tab bar: chart line, clock, checklist square, list). Ticker colors come from the app's per-holding color map.

## Files
- `Revamp - Tax.dc.html` — the full design (template markup + logic in one file)
- `mock.js` — mock portfolio + `TAX` dataset (realized sales, exemption base, rate)
