<script lang="ts">
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { themeStore } from '$lib/stores/theme.svelte';
  import { fmt, fmtPct, fmtNum } from '$lib/utils/fmt';
  import { getColor } from '$lib/utils/color';
  import Chart from '$lib/components/Chart.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import type { EChartsOption } from 'echarts';

  const SECTOR_COLORS = ['var(--accent)','#8b5cf6','#14b8a6','#f59e0b','#ec4899','#10b981','#f97316','#06b6d4','#e11d48','#84cc16'];
  const GEO_COLORS    = ['var(--accent)','#8b5cf6','#14b8a6','#f59e0b','#ec4899','#10b981','#f97316'];
  const CCY_COLORS    = ['var(--accent)','#8b5cf6','#14b8a6','#f59e0b','#ec4899','#10b981','#f97316'];

  function chartColors() {
    const isDark = themeStore.isDark;
    return {
      text:        isDark ? '#8b929c' : '#6a6f78',
      grid:        isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
      tooltipBg:   isDark ? '#15181c' : '#ffffff',
      tooltipBord: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(16,18,22,0.12)',
      tooltipText: isDark ? '#f2f4f7' : '#101216',
      posBar:      isDark ? '#34d399' : '#047857',
      negBar:      isDark ? '#f87171' : '#b91c1c',
    };
  }

  // ── KPI values ───────────────────────────────────────────────────────────────

  const startYear = $derived(() => {
    const d = portfolioStore.chartData[0];
    return d ? new Date(d.date as string).getFullYear() : null;
  });

  const totalValue = $derived(portfolioStore.positions.reduce((s, p) => s + p.value, 0));

  const twr = $derived(() => {
    const cost = portfolioStore.totalInvested;
    if (cost <= 0) return null;
    return ((totalValue - cost) / cost) * 100;
  });

  const rm = $derived(portfolioStore.riskMetrics);

  // ── Rolling returns chart ────────────────────────────────────────────────────

  // Backend keys: '1w', '1m', '3m', 'ytd', '1y', 'inception'
  const PERIOD_ORDER: Array<[string, string]> = [
    ['1w', '1W'], ['1m', '1M'], ['3m', '3M'], ['ytd', 'YTD'], ['1y', '1Y'], ['inception', 'Max'],
  ];

  const orderedRolling = $derived(() => {
    const rr = portfolioStore.rollingReturns;
    if (!rr) return [];
    return PERIOD_ORDER
      .map(([key, label]) => {
        const r = rr[key];
        return r && r.portfolio != null ? { period: label, portfolio: r.portfolio, vwce: r.vwce } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r != null);
  });

  const rollingChartOption = $derived((): EChartsOption => {
    const rows = orderedRolling();
    if (!rows.length) return {};
    const { text, grid, posBar, negBar } = chartColors();
    const values = rows.map((r) => +(r.portfolio ?? 0));
    return {
      backgroundColor: 'transparent',
      grid: { top: 36, right: 12, bottom: 24, left: 44, containLabel: false },
      xAxis: {
        type: 'category',
        data: rows.map((r) => r.period),
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { color: text, fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: grid } },
        axisLabel: { color: text, fontSize: 10, formatter: (v: number) => `${v.toFixed(0)}%` },
      },
      tooltip: { show: false },
      series: [{
        type: 'bar',
        barMaxWidth: 36,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: values.map((v) => ({
          value: v,
          itemStyle: { color: v >= 0 ? posBar : negBar, borderRadius: v >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3] },
          label: {
            show: true,
            position: v >= 0 ? 'top' : 'bottom',
            color: v >= 0 ? posBar : negBar,
            fontSize: 9,
            fontWeight: 600,
            formatter: () => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
          },
        })),
      }],
    };
  });

  // ── Risk profile bars ────────────────────────────────────────────────────────

  const riskBars = $derived(() => {
    if (!rm) return [];
    const isDark = themeStore.isDark;
    const pos  = isDark ? '#34d399' : '#047857';
    const neg  = isDark ? '#f87171' : '#b91c1c';
    const neu  = isDark ? '#8b929c' : '#6a6f78';
    const acc  = isDark ? '#818cf8' : '#6366f1';
    const bars = [];
    if (rm.volatility != null)
      bars.push({ label: 'Volatiliteit (1J)', display: fmtPct(rm.volatility), barPct: Math.min(100, Math.abs(rm.volatility) / 130 * 100), color: neg });
    if (rm.beta != null)
      bars.push({ label: 'Beta', display: fmtNum(rm.beta), barPct: Math.min(100, Math.abs(rm.beta) / 2 * 100), color: acc });
    if (rm.sharpe != null)
      bars.push({ label: 'Sharpe', display: fmtNum(rm.sharpe), barPct: Math.min(100, Math.max(0, rm.sharpe) / 3 * 100), color: rm.sharpe >= 1 ? pos : neu });
    if (portfolioStore.irrPct != null)
      bars.push({ label: 'Annual return', display: fmtPct(portfolioStore.irrPct), barPct: Math.min(100, Math.abs(portfolioStore.irrPct) / 100 * 100), color: portfolioStore.irrPct >= 0 ? pos : neg });
    return bars;
  });

  // ── Risk narrative ────────────────────────────────────────────────────────────

  const riskNarrative = $derived(() => {
    if (!rm) return '';
    const parts: string[] = [];
    if (rm.sharpe != null) parts.push(rm.sharpe > 1 ? 'Hoog rendement' : rm.sharpe < 0.5 ? 'Laag rendement' : 'Gemiddeld rendement');
    if (rm.volatility != null) parts.push(rm.volatility > 30 ? 'hoge volatiliteit' : rm.volatility < 10 ? 'lage volatiliteit' : 'gemiddelde volatiliteit');
    const top3 = [...portfolioStore.positions].sort((a, b) => b.value - a.value).slice(0, 3);
    const top3val = top3.reduce((s, p) => s + p.value, 0);
    const conc = totalValue > 0 ? Math.round(top3val / totalValue * 100) : 0;
    if (conc > 50 && top3.length >= 3) parts.push(`Concentratierisico: ${conc}% van portefeuille in ${top3.length} namen`);
    if (!parts.length) return '';
    return parts.join(', ') + '.';
  });

  // ── Allocation panels ────────────────────────────────────────────────────────

  const latest = $derived(portfolioStore.chartData[portfolioStore.chartData.length - 1]);

  function toAllocItems(map: Record<string, number>, colors: string[]) {
    const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, val], i) => ({ name, pct: val / total * 100, color: colors[i % colors.length]! }));
  }

  const sectorItems = $derived(() => {
    if (!latest) return [];
    const map: Record<string, number> = {};
    for (const t of portfolioStore.currentTickers) {
      const s = (portfolioStore.tickerMeta[t]?.['sector'] as string | undefined) ?? 'Overig';
      map[s] = (map[s] ?? 0) + ((latest[t] as number | undefined) ?? 0);
    }
    return toAllocItems(map, SECTOR_COLORS);
  });

  const geoItems = $derived(() => {
    if (!latest) return [];
    const map: Record<string, number> = {};
    for (const t of portfolioStore.currentTickers) {
      const g = (portfolioStore.tickerMeta[t]?.['geo'] as string | undefined) ?? 'Overig';
      map[g] = (map[g] ?? 0) + ((latest[t] as number | undefined) ?? 0);
    }
    return toAllocItems(map, GEO_COLORS);
  });

  const currencyItems = $derived(() => {
    const exp = portfolioStore.currencyExposure ?? {};
    if (!Object.keys(exp).length) {
      const usd = portfolioStore.usdExposurePct ?? 0;
      return [
        { name: 'USD', pct: usd,       color: CCY_COLORS[0]! },
        { name: 'EUR', pct: 100 - usd, color: CCY_COLORS[1]! },
      ];
    }
    return toAllocItems(exp, CCY_COLORS);
  });

  // ── Contribution to return ───────────────────────────────────────────────────

  const contributionItems = $derived(() => {
    const positions = portfolioStore.positions;
    if (!positions.length) return [];
    const maxAbs = Math.max(...positions.map((p) => Math.abs(p.pl)), 1);
    return [...positions]
      .sort((a, b) => b.pl - a.pl)
      .map((p) => ({
        ticker: p.ticker,
        pl: p.pl,
        plPct: p.plPct,
        barPct: Math.abs(p.pl) / maxAbs * 78,
      }));
  });

  function fmtContrib(pl: number): string {
    const abs = Math.abs(Math.round(pl));
    return `${pl >= 0 ? '+' : '-'}€ ${abs.toLocaleString('nl-BE')}`;
  }
</script>

<div class="page-root">

  <!-- ── Page header ──────────────────────────────────────────────────────────── -->
  <div style="margin-bottom:20px">
    <div class="h-eyebrow" style="margin-bottom:4px">Analyse</div>
    <div class="h-xl">Prestaties &amp; risico</div>
  </div>

  {#if portfolioStore.loaded && portfolioStore.positions.length > 0}

    <!-- ── KPI strip ──────────────────────────────────────────────────────────── -->
    <div class="kpi-grid">
      <div class="card kpi-card">
        <div class="h-eyebrow">TWR{startYear() ? ` SINDS ${startYear()}` : ''}</div>
        <div class="kpi-val mono {(twr() ?? 0) >= 0 ? 'c-pos' : 'c-neg'}">
          <PrivacyValue value={twr() != null ? `${(twr()! >= 0 ? '+' : '')}${twr()!.toFixed(1)}%` : '—'} />
        </div>
        <div class="h-sm">Tijd-gewogen</div>
      </div>

      <div class="card kpi-card">
        <div class="h-eyebrow">IRR (GELD-GEWOGEN)</div>
        <div class="kpi-val mono {(portfolioStore.irrPct ?? 0) >= 0 ? 'c-pos' : 'c-neg'}">
          <PrivacyValue value={portfolioStore.irrPct != null ? fmtPct(portfolioStore.irrPct) : '—'} />
        </div>
        <div class="h-sm">Jaarlijks</div>
      </div>

      {#if rm}
        <div class="card kpi-card">
          <div class="h-eyebrow">SHARPE</div>
          <div class="kpi-val mono">{rm.sharpe != null ? fmtNum(rm.sharpe) : '—'}</div>
          <div class="h-sm">Rendement / risico</div>
        </div>

        <div class="card kpi-card">
          <div class="h-eyebrow">MAX DRAWDOWN</div>
          <div class="kpi-val mono c-neg">
            <PrivacyValue value={rm.maxDrawdown != null ? fmtPct(rm.maxDrawdown) : '—'} />
          </div>
          <div class="h-sm">Worst stretch</div>
        </div>
      {/if}
    </div>

    <!-- ── Rolling returns + Risk profile ─────────────────────────────────────── -->
    <div class="analysis-split">

      <!-- Rolling returns chart -->
      <div class="card">
        <div class="split-card-head">
          <div class="h-md">Rolling returns</div>
          <div class="h-sm" style="margin-top:1px">Portefeuille per periode</div>
        </div>
        {#if orderedRolling().length > 0}
          <Chart option={rollingChartOption()} height="220px" />
        {:else}
          <div class="empty-msg">Geen rolling returns beschikbaar</div>
        {/if}
      </div>

      <!-- Risk profile -->
      <div class="card risk-card">
        <div class="split-card-head">
          <div class="h-md">Risico-profiel</div>
        </div>
        {#if riskBars().length > 0}
          <div class="risk-bars">
            {#each riskBars() as bar}
              <div class="risk-row">
                <div class="risk-label">{bar.label}</div>
                <div class="risk-track">
                  <div class="risk-fill" style="width:{bar.barPct}%;background:{bar.color}"></div>
                </div>
                <div class="risk-val mono" style="color:{bar.color}">{bar.display}</div>
              </div>
            {/each}
          </div>
          {#if rm}
            <div class="risk-extra">
              <div class="risk-extra-row">
                <span class="h-sm">Sortino</span>
                <span class="mono" style="font-size:12px;font-weight:600">{rm.sortino != null ? fmtNum(rm.sortino) : '—'}</span>
              </div>
              <div class="risk-extra-row">
                <span class="h-sm">Calmar</span>
                <span class="mono" style="font-size:12px;font-weight:600">{rm.calmar != null ? fmtNum(rm.calmar) : '—'}</span>
              </div>
              <div class="risk-extra-row">
                <span class="h-sm">Gerealiseerd</span>
                <span class="mono {portfolioStore.realizedPl >= 0 ? 'c-pos' : 'c-neg'}" style="font-size:12px;font-weight:600">
                  <PrivacyValue value={`${portfolioStore.realizedPl >= 0 ? '+' : ''}${fmt(portfolioStore.realizedPl)}`} />
                </span>
              </div>
            </div>
          {/if}
          {#if riskNarrative()}
            <div class="risk-narrative">{riskNarrative()}</div>
          {/if}
        {:else}
          <div class="empty-msg">Onvoldoende data</div>
        {/if}
      </div>

    </div>

    <!-- ── Allocation panels ──────────────────────────────────────────────────── -->
    <div class="alloc-grid">
      {#each [
        { title: 'Sector', items: sectorItems() },
        { title: 'Regio',  items: geoItems() },
        { title: 'Munt',   items: currencyItems() },
      ] as panel}
        <div class="card alloc-card">
          <div class="h-md" style="margin-bottom:10px">{panel.title}</div>
          <!-- Stacked bar -->
          <div class="alloc-stack">
            {#each panel.items as item}
              <div class="alloc-seg" style="width:{item.pct}%;background:{item.color}"></div>
            {/each}
          </div>
          <!-- List -->
          <div class="alloc-list">
            {#each panel.items as item}
              <div class="alloc-row">
                <span class="dot" style="background:{item.color}"></span>
                <span class="alloc-name">{item.name}</span>
                <span class="alloc-pct mono">{item.pct.toFixed(1)}%</span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>

    <!-- ── Bijdrage aan rendement ──────────────────────────────────────────────── -->
    {#if contributionItems().length > 0}
      <div class="card contrib-card">
        <div style="padding:14px 18px 12px;border-bottom:1px solid var(--border)">
          <div class="h-md">Bijdrage aan rendement</div>
          <div class="h-sm" style="margin-top:2px">Welke posities dreven de performance</div>
        </div>
        {#each contributionItems() as item}
          <div class="contrib-row">
            <span class="dot" style="background:{getColor(item.ticker)}"></span>
            <span class="contrib-ticker">{item.ticker}</span>
            <div class="contrib-track">
              <div class="contrib-fill {item.pl >= 0 ? 'pos' : 'neg'}" style="width:{item.barPct}%"></div>
              <span class="contrib-amount mono {item.pl >= 0 ? 'c-pos' : 'c-neg'}">
                <PrivacyValue value={fmtContrib(item.pl)} />
              </span>
            </div>
            <span class="contrib-pct mono {item.plPct >= 0 ? 'c-pos' : 'c-neg'}">{fmtPct(item.plPct)}</span>
          </div>
        {/each}
      </div>
    {/if}

  {:else if portfolioStore.loaded}
    <div class="empty-msg" style="padding:32px 0">Voeg transacties toe om de analyse te zien.</div>
  {/if}

</div>

<style>
  /* ── KPI strip ──────────────────────── */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 12px;
  }
  .kpi-card { padding: 16px 18px; }
  .kpi-val {
    font-size: 26px; font-weight: 700;
    letter-spacing: -0.03em; line-height: 1;
    margin: 6px 0 4px;
  }

  @media (max-width: 860px) { .kpi-grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 480px) { .kpi-grid { grid-template-columns: 1fr 1fr; } .kpi-val { font-size: 20px; } }

  /* ── Rolling + Risk split ───────────── */
  .analysis-split {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 12px;
    margin-bottom: 12px;
  }
  .split-card-head { padding: 14px 16px 10px; }
  .risk-card { display: flex; flex-direction: column; }

  /* Risk bars */
  .risk-bars { padding: 4px 16px 8px; }
  .risk-row {
    display: grid;
    grid-template-columns: 120px 1fr 56px;
    align-items: center; gap: 10px;
    padding: 7px 0;
  }
  .risk-label { font-size: 11px; color: var(--fg-muted); white-space: nowrap; }
  .risk-track {
    height: 6px; border-radius: 3px;
    background: var(--surface-2); overflow: hidden;
  }
  .risk-fill { height: 100%; border-radius: 3px; transition: width 0.4s; }
  .risk-val { font-size: 12px; font-weight: 700; text-align: right; }

  /* Extra small stats */
  .risk-extra {
    margin: 2px 16px 0;
    padding: 8px 0;
    border-top: 1px solid var(--border);
    display: flex; gap: 0; flex-direction: column;
  }
  .risk-extra-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 4px 0;
  }

  .risk-narrative {
    margin: 0 16px 14px;
    padding: 10px 12px;
    background: var(--surface-2); border-radius: 8px;
    font-size: 12px; color: var(--fg-muted); line-height: 1.5;
  }

  @media (max-width: 700px) {
    .analysis-split { grid-template-columns: 1fr; }
    .risk-row { grid-template-columns: 100px 1fr 52px; }
  }

  /* ── Allocation panels ──────────────── */
  .alloc-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 12px;
  }
  .alloc-card { padding: 14px 16px 12px; }
  .alloc-stack {
    height: 7px; border-radius: 999px;
    display: flex; overflow: hidden; gap: 2px;
    margin-bottom: 12px;
  }
  .alloc-seg { height: 100%; min-width: 2px; }
  .alloc-list { display: flex; flex-direction: column; gap: 6px; }
  .alloc-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .alloc-name { flex: 1; color: var(--fg-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .alloc-pct  { font-size: 11px; font-weight: 600; color: var(--fg); min-width: 40px; text-align: right; }

  @media (max-width: 640px) { .alloc-grid { grid-template-columns: 1fr; } }

  /* ── Contribution ───────────────────── */
  .contrib-card { overflow: hidden; }
  .contrib-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 18px;
    border-bottom: 1px solid var(--border);
  }
  .contrib-row:last-child { border-bottom: none; }
  .contrib-ticker { font-size: 12px; font-weight: 700; width: 52px; flex-shrink: 0; }
  .contrib-track {
    flex: 1; position: relative; height: 26px;
    background: var(--surface-2); border-radius: 5px; overflow: hidden;
    display: flex; align-items: center;
  }
  .contrib-fill {
    position: absolute; left: 0; top: 0; height: 100%; border-radius: 5px;
    transition: width 0.3s;
  }
  .contrib-fill.pos { background: var(--c-pos-bg-strong); }
  .contrib-fill.neg { background: var(--c-neg-bg-strong); }
  .contrib-amount {
    position: relative; z-index: 1;
    padding: 0 8px; font-size: 11px; font-weight: 700;
    white-space: nowrap;
  }
  .contrib-pct { font-size: 11px; font-weight: 700; min-width: 54px; text-align: right; flex-shrink: 0; }

  @media (max-width: 640px) {
    .contrib-ticker { width: 40px; }
    .contrib-pct { min-width: 44px; }
    .risk-row { grid-template-columns: 90px 1fr 48px; }
  }

  /* ── Misc ───────────────────────────── */
  .empty-msg { padding: 24px; text-align: center; font-size: 13px; color: var(--fg-muted); }
  .mono { font-family: 'JetBrains Mono', monospace; }
</style>
