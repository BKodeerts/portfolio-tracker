<script lang="ts">
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { fmtEur, fmtEurSigned } from '$lib/utils/fmt';
  import { getColor } from '$lib/utils/color';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import SettingsGear from '$lib/components/shared/SettingsGear.svelte';
  import type { TaxSale, TaxYear } from '$lib/types/portfolio';

  const WITHHOLDING_START = '2026-06-01';

  const T = $derived(portfolioStore.tax);

  // ── Year selection ───────────────────────────────────────────────────────────
  let pickedYear = $state<number | null>(null);
  const selYear = $derived(
    T ? Math.min(Math.max(pickedYear ?? T.currentYear, T.years[0]?.year ?? T.currentYear), T.currentYear) : 0,
  );
  const Y = $derived<TaxYear | null>(T?.years.find((y) => y.year === selYear) ?? null);

  const isClosedYear = $derived(T != null && selYear < T.currentYear);
  /** The assessment normally arrives the year after filing (aangifte in year+1). */
  const settled = $derived(T != null && isClosedYear && selYear + 2 <= T.currentYear);
  const couple = $derived(T?.household === 'couple');
  const exemptionBase = $derived(Y ? Y.exemption / (couple ? 2 : 1) : 0);

  const yearChips = $derived(() => {
    if (!T) return [];
    const chips = T.years.map((y) => ({ year: y.year, enabled: true, active: y.year === selYear }));
    chips.push({ year: T.currentYear + 1, enabled: false, active: false });
    return chips;
  });

  // ── Realized sales list ──────────────────────────────────────────────────────
  const fmtD = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  function saleNote(s: TaxSale): string {
    if (s.costAboveFoto) return 'actual cost basis (higher than foto)';
    if (s.withheld > 0) return 'broker withheld 10%';
    if (T?.brokerWithholds && s.date < WITHHOLDING_START) return 'transition — self-declare';
    return 'no withholding — self-declare';
  }

  // ── Calculation table ────────────────────────────────────────────────────────
  interface CalcRow { label: string; value: string; cls: 'pos' | 'neg' | 'muted' | 'plain'; strong: boolean }
  const calcRows = $derived(() => {
    if (!T || !Y) return [];
    const filing = `aangifte ${selYear + 1}`;
    const rows: CalcRow[] = [
      { label: 'Realized gains',               value: fmtEurSigned(Y.gains),  cls: 'pos',   strong: false },
      { label: 'Realized losses (same year)',  value: fmtEurSigned(Y.losses), cls: 'neg',   strong: false },
      { label: 'Net realized gain',            value: fmtEur(Y.net),          cls: 'plain', strong: true },
      { label: 'Exemption applied',            value: `−${fmtEur(Y.used)}`,   cls: 'muted', strong: false },
      { label: 'Taxable base',                 value: fmtEur(Y.taxable),      cls: 'plain', strong: true },
      { label: 'Tax (10%)',                    value: fmtEur(Y.tax),          cls: Y.tax > 0 ? 'neg' : 'plain', strong: true },
      {
        label: T.brokerWithholds
          ? (selYear === 2026 ? 'Withheld by broker since 1 Jun' : 'Withheld by broker')
          : 'Withheld by broker (not supported)',
        value: fmtEur(Y.withheld), cls: 'muted', strong: false,
      },
    ];
    if (Y.withheld === 0) {
      rows.push({
        label: `${settled ? 'Paid via' : 'To pay via'} ${filing}`,
        value: fmtEur(Y.tax), cls: Y.tax > 0 ? 'neg' : 'plain', strong: true,
      });
    } else if (Y.balance >= 0) {
      rows.push({
        label: `${settled ? 'Reclaimed via' : 'To reclaim via'} ${filing}`,
        value: fmtEurSigned(Y.balance), cls: 'pos', strong: true,
      });
    } else {
      rows.push({
        label: `${settled ? 'Paid via' : 'To pay via'} ${filing}`,
        value: fmtEur(-Y.balance), cls: 'neg', strong: true,
      });
    }
    return rows;
  });

  // ── Hero: balance card (context-dependent) ───────────────────────────────────
  const balanceCard = $derived(() => {
    if (!Y) return null;
    const filing = `aangifte ${selYear + 1}`;
    if (Y.withheld === 0) {
      return {
        label: settled ? (Y.tax > 0 ? 'Paid' : 'No tax due') : 'Due via aangifte',
        value: fmtEur(Y.tax),
        cls: Y.tax > 0 ? 'neg' : 'plain',
        sub: settled
          ? `settled with ${filing}`
          : 'your broker does not withhold — self-declare all gains',
      };
    }
    const reclaim = Y.balance >= 0;
    return {
      label: settled ? (reclaim ? 'Reclaimed' : 'Paid') : reclaim ? 'Reclaimable' : 'Still due',
      value: reclaim ? fmtEurSigned(Y.balance) : fmtEur(-Y.balance),
      cls: reclaim ? 'pos' : 'neg',
      sub: settled
        ? `settled with ${filing}`
        : reclaim
          ? `withheld ${fmtEur(Y.withheld)} · claim via ${filing}`
          : `withheld ${fmtEur(Y.withheld)} of ${fmtEur(Y.tax)} · pay via ${filing}`,
    };
  });

  const usedPct  = $derived(Y && Y.exemption > 0 ? (Y.used / Y.exemption) * 100 : 0);

  // ── Sell simulator (presentation-only what-if over server-computed gains) ────
  let simSel = $state<Record<string, boolean>>({});
  const simRows = $derived(() => {
    if (!T) return [];
    return T.simPositions.map((p) => ({
      ...p,
      color: getColor(p.ticker),
      selected: !!simSel[p.ticker],
      sub: p.gain < 0
        ? `latent loss vs ${p.basisType === 'foto' ? 'foto' : 'purchase price'}`
        : p.usesCost
          ? 'sell all · vs purchase price (higher than foto)'
          : `sell all · vs ${p.basisType === 'foto' ? 'foto' : 'purchase price'}`,
    }));
  });
  const simOn      = $derived(Object.values(simSel).some(Boolean));
  const selGain    = $derived(T ? T.simPositions.reduce((a, p) => a + (simSel[p.ticker] ? p.gain : 0), 0) : 0);
  const simNet     = $derived(Y ? Math.max(0, Y.net + selGain) : 0);
  const simTaxable = $derived(Y ? Math.max(0, simNet - Y.exemption) : 0);
  const simTax     = $derived(T ? simTaxable * T.rate : 0);

  function toggleSim(ticker: string) {
    simSel = { ...simSel, [ticker]: !simSel[ticker] };
  }

  // ── Closed-year status card ──────────────────────────────────────────────────
  const statusRows = $derived(() => {
    if (!Y) return [];
    const reclaim = Y.withheld > 0 && Y.balance >= 0;
    const amountLabel = settled
      ? (reclaim ? 'Reclaimed' : 'Paid')
      : (reclaim ? 'Expected refund' : 'Expected payment');
    const amount = reclaim ? fmtEurSigned(Y.balance) : fmtEur(Y.withheld === 0 ? Y.tax : -Y.balance);
    return [
      { label: 'Filed', value: `aangifte ${selYear + 1}`, strong: false, cls: 'plain' },
      { label: amountLabel, value: amount, strong: true, cls: reclaim ? 'pos' : (Y.tax > 0 ? 'neg' : 'plain') },
    ];
  });

  // ── Rules copy ───────────────────────────────────────────────────────────────
  const rules = $derived(() => {
    if (!Y) return [];
    return [
      '10% flat on gains realized since 1 Jan 2026. Costs and transaction taxes are not deductible.',
      'Basis for pre-2026 holdings = value on 31/12/2025 ("foto"). Until end 2030 you may use your actual purchase price if it was higher.',
      'Losses offset gains within the same year only — no carry-forward of losses.',
      `Exemption ${fmtEur(exemptionBase)}/person/year (indexed). Carry-forward of +€1,000/yr up to €15,000 only in years you use less than €1,000 — you used ${fmtEur(Y.used)} in ${selYear}, so ${selYear + 1} resets to the base exemption.`,
      'Since 1 Jun 2026 your broker may withhold 10% at sale (depends on the broker and whether you opted in) — withholding ignores your exemption, so reclaim any excess via your aangifte. Gains without withholding must be self-declared.',
    ];
  });
</script>

<div class="tax-page">
  {#if T && Y}
    <!-- ── Header ── -->
    <div class="head-row">
      <h1 class="page-title">Capital gains tax</h1>
      <span class="mobile-gear"><SettingsGear /></span>
      <div class="subtitle">meerwaardebelasting · 10% on realized gains</div>
      <div class="year-chips">
        {#each yearChips() as c (c.year)}
          <button
            class="year-chip"
            class:active={c.active}
            class:disabled={!c.enabled}
            disabled={!c.enabled}
            onclick={() => (pickedYear = c.year)}
          >{c.year}</button>
        {/each}
      </div>
    </div>
    <div class="filing-line">
      Filed via aangifte {selYear + 1} · exemption {fmtEur(Y.exemption)}
      {couple ? '(couple)' : '(per person, indexed)'}
    </div>

    <!-- ── Hero strip ── -->
    <div class="hero-grid">
      <div class="hero-card">
        <div class="hero-label">Net realized gain</div>
        <div class="hero-value mono {Y.net >= 0 ? 'pos' : 'neg'}">
          <PrivacyValue value={fmtEurSigned(Y.net)} />
        </div>
        <div class="hero-sub">{Y.sales.length} sale{Y.sales.length === 1 ? '' : 's'} in {selYear}</div>
      </div>
      <div class="hero-card">
        <div class="hero-label">Exemption used</div>
        <div class="hero-value mono">{Math.round(usedPct)}%</div>
        <div class="used-track">
          <div class="used-fill" style="width:{Math.min(100, usedPct).toFixed(1)}%"></div>
        </div>
        <div class="hero-sub mono"><PrivacyValue value="{fmtEur(Y.used)} / {fmtEur(Y.exemption)}" /></div>
      </div>
      <div class="hero-card">
        <div class="hero-label">Tax due</div>
        <div class="hero-value mono" class:neg={Y.tax > 0}>
          <PrivacyValue value={fmtEur(Y.tax)} />
        </div>
        <div class="hero-sub">10% above exemption</div>
      </div>
      {#if balanceCard()}
        {@const bc = balanceCard()!}
        <div class="hero-card">
          <div class="hero-label">{bc.label}</div>
          <div class="hero-value mono {bc.cls}"><PrivacyValue value={bc.value} /></div>
          <div class="hero-sub">{bc.sub}</div>
        </div>
      {/if}
    </div>

    <!-- ── Columns ── -->
    <div class="columns">

      <!-- Left: realized + calculation -->
      <div class="col-left">
        <div class="sect-head">
          <h2 class="sect-title">Realized in {selYear}</h2>
          <span class="sect-hint">basis: foto 31/12/25 or purchase price</span>
        </div>
        {#each Y.sales as s (s.date + s.ticker + s.shares)}
          <div class="sale-row">
            <span class="tdot" style="background:{getColor(s.ticker)}"></span>
            <div class="sale-main">
              <div class="sale-top">
                <span class="sale-ticker">{s.ticker}</span>
                <span class="sale-detail">{s.shares} sh · {fmtD(s.date)}</span>
              </div>
              <div class="sale-bottom">
                <span class="basis-chip mono">{s.basisType === 'foto' ? 'foto 31/12/25' : 'purchase price'}</span>
                <span class="sale-note">{saleNote(s)}</span>
              </div>
            </div>
            <div class="sale-right">
              <div class="sale-gain mono {s.gain >= 0 ? 'pos' : 'neg'}">
                <PrivacyValue value={fmtEurSigned(s.gain)} />
              </div>
              {#if s.withheld > 0}
                <div class="sale-withheld mono"><PrivacyValue value="withheld {fmtEur(s.withheld)}" /></div>
              {/if}
            </div>
          </div>
        {:else}
          <div class="empty-row">No sales in {selYear} yet.</div>
        {/each}

        <h2 class="sect-title calc-title">Calculation</h2>
        {#each calcRows() as c (c.label)}
          <div class="calc-row">
            <div class="calc-label" class:strong={c.strong}>{c.label}</div>
            <div class="calc-value mono {c.cls}" class:strong={c.strong}>
              <PrivacyValue value={c.value} />
            </div>
          </div>
        {/each}
      </div>

      <!-- Right: status (closed year) or headroom + simulator (open year), then rules -->
      <div class="col-right">
        {#if isClosedYear}
          <div class="card">
            <div class="status-head">
              <span class="status-dot" class:settled></span>
              <div class="sect-title">{settled ? 'Settled' : 'Filed — assessment pending'}</div>
            </div>
            <div class="status-rows">
              {#each statusRows() as sr (sr.label)}
                <div class="status-row">
                  <span class="status-label">{sr.label}</span>
                  <span class="status-value mono {sr.cls}" class:strong={sr.strong}>
                    <PrivacyValue value={sr.value} />
                  </span>
                </div>
              {/each}
            </div>
            <div class="status-note">
              {settled
                ? 'This tax year is closed. Figures are final as assessed.'
                : 'The assessment usually arrives within a few months of filing.'}
            </div>
          </div>
        {:else}
          <div class="card">
            <div class="headroom-head">
              <div class="sect-title">Tax-free headroom</div>
              <div class="headroom-value mono {Y.headroom > 0 ? 'pos' : 'neg'}">
                <PrivacyValue value={fmtEur(Y.headroom)} />
              </div>
            </div>
            <div class="headroom-hint">
              {Y.headroom > 0
                ? `Gains you can still realize in ${selYear} without paying tax. Tap positions to simulate selling.`
                : 'Exemption fully used — every additional euro of realized gains is taxed at 10%. Tap positions to simulate selling.'}
            </div>
            <div class="sim-list">
              {#each simRows() as p (p.ticker)}
                <button class="sim-row" class:selected={p.selected} onclick={() => toggleSim(p.ticker)}>
                  <span class="sim-box" class:checked={p.selected}>
                    {#if p.selected}
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l6 6L20 7"/></svg>
                    {/if}
                  </span>
                  <span class="tdot" style="background:{p.color}"></span>
                  <span class="sim-ticker">{p.ticker}</span>
                  <span class="sim-sub">{p.sub}</span>
                  <span class="sim-gain mono {p.gain >= 0 ? 'pos' : 'neg'}">
                    <PrivacyValue value={fmtEurSigned(p.gain)} />
                  </span>
                </button>
              {/each}
            </div>
            {#if simOn}
              <div class="sim-panel">
                <div class="sim-panel-row">
                  <span class="sim-panel-label">If sold: net realized gain</span>
                  <span class="sim-panel-value mono"><PrivacyValue value={fmtEur(simNet)} /></span>
                </div>
                <div class="sim-panel-row">
                  <span class="sim-panel-label">Tax due (10% above exemption)</span>
                  <span class="sim-panel-value mono {simTax > 0 ? 'neg' : 'pos'}">
                    <PrivacyValue value={fmtEur(simTax)} />
                  </span>
                </div>
                <div class="sim-hint">
                  {simTax > 0
                    ? `Exceeds your exemption by ${fmtEur(simTaxable)} — consider spreading sales across tax years.`
                    : 'Fits within your remaining exemption — no tax due.'}
                </div>
              </div>
            {/if}
          </div>
        {/if}

        <h2 class="sect-title rules-title">Rules that apply to you</h2>
        {#each rules() as r (r)}
          <div class="rule-row">
            <span class="rule-dot"></span>
            <div class="rule-text">{r}</div>
          </div>
        {/each}
      </div>
    </div>

  {:else if portfolioStore.loaded}
    <div class="head-row">
      <h1 class="page-title">Capital gains tax</h1>
      <span class="mobile-gear"><SettingsGear /></span>
      <div class="subtitle">meerwaardebelasting · 10% on realized gains</div>
    </div>
    <div class="empty-row">Add transactions to see your tax overview.</div>
  {/if}
</div>

<style>
  .tax-page {
    padding: 14px 20px 96px;
    max-width: 560px;
    margin: 0 auto;
    background: var(--bg);
    letter-spacing: -0.005em;
  }

  .mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-feature-settings: 'tnum', 'zero';
  }
  .pos { color: var(--c-pos); }
  .neg { color: var(--c-neg); }
  .muted { color: var(--fg-faint); }

  /* ── Header ── */
  .head-row {
    display: flex;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: 4px;
  }
  .page-title {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .subtitle { font-size: 11px; color: var(--fg-faint); }
  .year-chips { margin-left: auto; display: flex; gap: 2px; }
  .year-chip {
    padding: 5px 14px;
    font-size: 12px;
    font-weight: 500;
    color: var(--fg-faint);
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
    letter-spacing: inherit;
  }
  .year-chip.active {
    font-weight: 700;
    color: var(--fg);
    background: var(--pill-selected-bg);
  }
  .year-chip.disabled { color: var(--chart-band-label); cursor: default; }
  .filing-line { font-size: 11px; color: var(--fg-faint); margin-bottom: 22px; }

  /* ── Hero strip ── */
  .hero-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 30px;
  }
  .hero-card {
    background: var(--surface);
    border: 1px solid var(--card-border);
    border-radius: 14px;
    padding: 14px 16px;
    box-shadow: var(--card-shadow);
  }
  .hero-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg-faint);
    margin-bottom: 6px;
  }
  .hero-value { font-size: 22px; font-weight: 700; }
  .hero-sub { font-size: 10.5px; color: var(--fg-faint); margin-top: 4px; }
  .used-track {
    height: 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--fg) 7%, transparent);
    margin-top: 8px;
    overflow: hidden;
  }
  .used-fill { height: 100%; border-radius: 999px; background: var(--fg); }
  .hero-sub.mono { margin-top: 5px; }

  /* ── Columns ── */
  .columns {
    display: flex;
    flex-wrap: wrap;
    gap: 28px 56px;
    align-items: flex-start;
  }
  .col-left  { flex: 1 1 420px; min-width: 0; }
  .col-right { flex: 1 1 380px; min-width: 0; }

  .sect-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 2px;
  }
  .sect-title { font-size: 13px; font-weight: 600; margin: 0; }
  .sect-hint  { font-size: 11px; color: var(--fg-faint); }

  /* ── Realized sales ── */
  .sale-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 0;
    border-bottom: 1px solid var(--hairline);
  }
  .tdot { width: 6px; height: 6px; border-radius: 2px; flex-shrink: 0; }
  .sale-main { min-width: 0; flex: 1; }
  .sale-top { display: flex; align-items: center; gap: 8px; }
  .sale-ticker { font-size: 12.5px; font-weight: 700; }
  .sale-detail { font-size: 10.5px; color: var(--fg-faint); }
  .sale-bottom { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
  .basis-chip {
    font-size: 9.5px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--fg) 5%, transparent);
    color: var(--fg-muted);
  }
  .sale-note { font-size: 10px; color: var(--chart-axis-label); }
  .sale-right { text-align: right; }
  .sale-gain { font-size: 13px; font-weight: 700; }
  .sale-withheld { font-size: 10px; color: var(--fg-faint); margin-top: 2px; }
  .empty-row { padding: 14px 0; font-size: 12px; color: var(--fg-faint); }

  /* ── Calculation ── */
  .calc-title { margin: 26px 0 2px; }
  .calc-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 9px 0;
    border-bottom: 1px solid var(--hairline);
  }
  .calc-label { font-size: 12px; color: var(--fg-secondary); font-weight: 500; }
  .calc-label.strong { color: var(--fg); font-weight: 700; }
  .calc-value { font-size: 12.5px; font-weight: 500; }
  .calc-value.strong { font-weight: 700; }

  /* ── Right column cards ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--card-border);
    border-radius: 16px;
    padding: 16px 18px;
    box-shadow: var(--card-shadow);
  }

  /* Status card (closed years) */
  .status-head { display: flex; align-items: center; gap: 8px; }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #b45309;
  }
  .status-dot.settled { background: var(--c-pos); }
  .status-rows { margin-top: 8px; }
  .status-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--hairline);
  }
  .status-label { font-size: 11.5px; color: var(--fg-muted); }
  .status-value { font-size: 12px; font-weight: 500; }
  .status-value.strong { font-weight: 700; }
  .status-note { font-size: 10.5px; color: var(--fg-faint); margin-top: 10px; line-height: 1.5; }

  /* Headroom + simulator */
  .headroom-head { display: flex; align-items: baseline; justify-content: space-between; }
  .headroom-value { font-size: 16px; font-weight: 700; }
  .headroom-hint { font-size: 11px; color: var(--fg-faint); margin-top: 3px; line-height: 1.5; }
  .sim-list { margin-top: 12px; }
  .sim-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    margin: 0 -10px;
    width: calc(100% + 20px);
    border: none;
    border-radius: 10px;
    background: transparent;
    cursor: pointer;
    font-family: inherit;
    letter-spacing: inherit;
    color: var(--fg);
    text-align: left;
    transition: background 0.12s;
  }
  .sim-row:hover { background: color-mix(in srgb, var(--fg) 4%, transparent); }
  .sim-row.selected { background: color-mix(in srgb, var(--fg) 3.5%, transparent); }
  .sim-box {
    width: 15px; height: 15px;
    border-radius: 5px;
    flex-shrink: 0;
    border: 1.5px solid color-mix(in srgb, var(--fg) 25%, transparent);
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sim-box.checked { border-color: var(--fg); background: var(--fg); }
  .sim-ticker { font-size: 12.5px; font-weight: 700; }
  .sim-sub { font-size: 10.5px; color: var(--fg-faint); }
  .sim-gain { margin-left: auto; font-size: 12px; font-weight: 600; }

  .sim-panel {
    margin-top: 10px;
    padding: 11px 13px;
    background: var(--surface-2);
    border-radius: 10px;
  }
  .sim-panel-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 3px 0;
  }
  .sim-panel-label { font-size: 11.5px; color: var(--fg-muted); }
  .sim-panel-value { font-size: 12px; font-weight: 700; }
  .sim-hint { font-size: 10.5px; color: var(--fg-faint); margin-top: 4px; line-height: 1.5; }

  /* ── Rules ── */
  .rules-title { margin: 26px 0 2px; }
  .rule-row {
    display: flex;
    gap: 10px;
    padding: 9px 0;
    border-bottom: 1px solid var(--hairline);
  }
  .rule-dot {
    width: 4px; height: 4px;
    border-radius: 50%;
    background: var(--chart-band-label);
    margin-top: 7px;
    flex-shrink: 0;
  }
  .rule-text { font-size: 11.5px; color: var(--fg-muted); line-height: 1.55; }

  /* Settings gear lives in the mobile title row only — desktop has it in the global top nav */
  .mobile-gear { display: flex; align-self: center; margin-left: auto; }

  /* ── Mobile (<900px): gear sits top-right next to the title; the long
     subtitle and year chips wrap to their own lines below it ── */
  @media (max-width: 899px) {
    .subtitle { flex-basis: 100%; }
    .year-chips { margin-left: 0; }
  }

  /* ── Desktop (≥900px) ── */
  @media (min-width: 900px) {
    .mobile-gear { display: none; }
    .tax-page {
      max-width: 1160px;
      padding: 14px 24px 96px;
    }
    .hero-grid { grid-template-columns: repeat(4, 1fr); }
  }
</style>
