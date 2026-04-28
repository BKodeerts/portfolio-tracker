<script lang="ts">
  import { resolve } from '$app/paths';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { fmt } from '$lib/utils/fmt';
  import { saveTransactions } from '$lib/api/portfolio';
  import { getColor } from '$lib/utils/color';
  import type { Transaction } from '$lib/types/transaction';

  const CURRENCIES = ['EUR','USD','GBP','GBX','CLP','CHF','SEK','DKK','NOK','CAD','AUD','JPY','MXN','BRL'];

  let search   = $state('');
  let saving   = $state(false);
  let saveMsg  = $state('');
  let showAdd  = $state(false);
  let dirty    = $state(false);
  let typeFilter = $state<'all' | 'buy' | 'sell' | 'dividend'>('all');

  // local editable copy
  let txs = $state<Transaction[]>([]);

  $effect(() => {
    if (!dirty) txs = portfolioStore.rawTransactions.map((t) => ({ ...t }));
  });

  const filtered = $derived.by(() => {
    let result = txs;
    if (typeFilter === 'buy')      result = result.filter((t) => t.shares > 0);
    if (typeFilter === 'sell')     result = result.filter((t) => t.shares < 0);
    if (typeFilter === 'dividend') result = result.filter((t) => t.shares === 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) =>
        [t.ticker, t.yahoo ?? '', t.label ?? '', t.isin ?? ''].some((v) =>
          v.toLowerCase().includes(q),
        ),
      );
    }
    // newest first
    return [...result].sort((a, b) => b.date.localeCompare(a.date));
  });

  // Group by month (YYYY-MM)
  const grouped = $derived.by(() => {
    const groups: { key: string; label: string; rows: Transaction[] }[] = [];
    const seen = new Map<string, number>();
    for (const tx of filtered) {
      const key = tx.date.slice(0, 7);
      let idx = seen.get(key);
      if (idx === undefined) {
        idx = groups.length;
        seen.set(key, idx);
        const [y, m] = key.split('-');
        const months = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
        groups.push({ key, label: `${months[Number(m)-1]} ${y}`, rows: [] });
      }
      groups[idx]!.rows.push(tx);
    }
    return groups;
  });

  // Summary stats over current filtered set
  const stats = $derived.by(() => {
    let bought = 0, sold = 0, div = 0;
    let buyCount = 0, sellCount = 0, divCount = 0;
    for (const t of txs) {
      if (t.shares > 0) { bought += t.costEur; buyCount++; }
      else if (t.shares < 0) { sold += t.costEur; sellCount++; }
      else { div += t.costEur; divCount++; }
    }
    return { bought, sold, div, buyCount, sellCount, divCount, net: bought - sold };
  });

  // ── Add form ─────────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  let addType     = $state<'buy' | 'sell' | 'dividend'>('buy');
  let addDate     = $state(today);
  let addTicker   = $state('');
  let addYahoo    = $state('');
  let addLabel    = $state('');
  let addIsin     = $state('');
  let addShares   = $state('');
  let addCostEur  = $state('');
  let addCurrency = $state('USD');

  function resetAdd() {
    addType = 'buy'; addDate = today; addTicker = ''; addYahoo = ''; addLabel = '';
    addIsin = ''; addShares = ''; addCostEur = ''; addCurrency = 'USD';
  }

  function addTx() {
    const shares  = parseFloat(addShares);
    const costEur = parseFloat(addCostEur);
    if (!addDate || !addTicker || isNaN(costEur)) return;

    const ticker = addTicker.toUpperCase().trim();
    const yahoo  = addYahoo.trim() || ticker;
    const finalShares = addType === 'dividend' ? 0
      : (addType === 'sell' ? -Math.abs(isNaN(shares) ? 0 : shares) : Math.abs(isNaN(shares) ? 0 : shares));

    const tx: Transaction = {
      date: addDate, ticker, yahoo,
      label: addLabel.trim() || undefined,
      isin:  addIsin.trim() || undefined,
      shares: finalShares,
      costEur: Math.abs(costEur),
      currency: addCurrency,
    };

    dirty = true;
    txs = [...txs, tx].sort((a, b) => a.date.localeCompare(b.date));
    showAdd = false;
    resetAdd();
  }

  function deleteTx(tx: Transaction) {
    const idx = txs.indexOf(tx);
    if (idx < 0) return;
    dirty = true;
    txs = txs.filter((_, i) => i !== idx);
  }

  async function save() {
    saving = true; saveMsg = '';
    try {
      await saveTransactions('replace', txs);
      portfolioStore.rawTransactions = txs;
      dirty = false;
      saveMsg = 'Opgeslagen';
      setTimeout(() => { saveMsg = ''; }, 2000);
    } catch (e) {
      saveMsg = e instanceof Error ? e.message : 'Opslaan mislukt';
    } finally {
      saving = false;
    }
  }

  function discard() {
    dirty = false;
    txs = portfolioStore.rawTransactions.map((t) => ({ ...t }));
  }

  function txKind(t: Transaction): 'koop' | 'verk' | 'div' {
    if (t.shares === 0) return 'div';
    return t.shares > 0 ? 'koop' : 'verk';
  }
</script>

<div class="page-root">
  <!-- Hero -->
  <div class="tx-hero">
    <div>
      <div class="h-eyebrow">Transacties</div>
      <div class="tx-title">{txs.length} geboekt · netto <span class="mono">{fmt(stats.net)}</span></div>
    </div>
    <div class="tx-stats">
      <div class="tx-stat">
        <div class="tx-stat-label">Gekocht</div>
        <div class="tx-stat-val mono">{fmt(stats.bought)}</div>
        <div class="tx-stat-sub">{stats.buyCount}×</div>
      </div>
      <div class="tx-stat">
        <div class="tx-stat-label">Verkocht</div>
        <div class="tx-stat-val mono">{fmt(stats.sold)}</div>
        <div class="tx-stat-sub">{stats.sellCount}×</div>
      </div>
      <div class="tx-stat">
        <div class="tx-stat-label">Dividend</div>
        <div class="tx-stat-val mono c-pos">{fmt(stats.div)}</div>
        <div class="tx-stat-sub">{stats.divCount}×</div>
      </div>
    </div>
  </div>

  <!-- Toolbar -->
  <div class="tx-toolbar">
    <div class="tx-search">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>
      </svg>
      <input type="text" placeholder="Zoek ticker, ISIN, naam…" bind:value={search} />
      {#if search}
        <button class="clear-btn" onclick={() => (search = '')} aria-label="Wis zoekterm">×</button>
      {/if}
    </div>

    <div class="seg">
      <button class:on={typeFilter === 'all'}      onclick={() => (typeFilter = 'all')}>Alle</button>
      <button class:on={typeFilter === 'buy'}      onclick={() => (typeFilter = 'buy')}>Koop</button>
      <button class:on={typeFilter === 'sell'}     onclick={() => (typeFilter = 'sell')}>Verkoop</button>
      <button class:on={typeFilter === 'dividend'} onclick={() => (typeFilter = 'dividend')}>Dividend</button>
    </div>

    <div class="tx-actions">
      <a href={resolve('/import')} class="btn">⤒ CSV</a>
      <button class="btn primary" onclick={() => (showAdd = !showAdd)}>
        {showAdd ? 'Sluiten' : '+ Transactie'}
      </button>
    </div>
  </div>

  <!-- Inline add form -->
  {#if showAdd}
    <div class="add-drawer">
      <div class="add-drawer-head">
        <div class="seg">
          <button class:on={addType === 'buy'}      onclick={() => (addType = 'buy')}>Koop</button>
          <button class:on={addType === 'sell'}     onclick={() => (addType = 'sell')}>Verkoop</button>
          <button class:on={addType === 'dividend'} onclick={() => (addType = 'dividend')}>Dividend</button>
        </div>
        <button class="ghost-btn" onclick={() => (showAdd = false)}>Annuleren</button>
      </div>

      <div class="add-grid">
        <label class="add-field">
          <span>Datum *</span>
          <input type="date" bind:value={addDate} />
        </label>
        <label class="add-field">
          <span>Ticker *</span>
          <input type="text" bind:value={addTicker} placeholder="GOOGL" style="text-transform:uppercase" />
        </label>
        <label class="add-field">
          <span>Yahoo</span>
          <input type="text" bind:value={addYahoo} placeholder="GOOGL" />
        </label>
        <label class="add-field add-field-wide">
          <span>Naam</span>
          <input type="text" bind:value={addLabel} placeholder="Alphabet Inc." />
        </label>
        <label class="add-field">
          <span>ISIN</span>
          <input type="text" bind:value={addIsin} placeholder="US02079K3059" />
        </label>
        {#if addType !== 'dividend'}
          <label class="add-field">
            <span>Aandelen *</span>
            <input type="number" bind:value={addShares} step="any" placeholder="10" />
          </label>
        {/if}
        <label class="add-field">
          <span>Kosten € *</span>
          <input type="number" bind:value={addCostEur} step="any" min="0" placeholder="1234.56" />
        </label>
        <label class="add-field">
          <span>Munt</span>
          <select bind:value={addCurrency}>
            {#each CURRENCIES as c}<option value={c}>{c}</option>{/each}
          </select>
        </label>
      </div>

      <div class="add-drawer-foot">
        <button class="btn primary" onclick={addTx}>Transactie toevoegen</button>
      </div>
    </div>
  {/if}

  <!-- Grouped list -->
  {#if grouped.length === 0}
    <div class="empty">
      <div class="empty-icon">∅</div>
      <div class="empty-title">{search || typeFilter !== 'all' ? 'Niets gevonden' : 'Nog geen transacties'}</div>
      <div class="empty-sub">
        {search || typeFilter !== 'all'
          ? 'Pas je zoekterm of filter aan.'
          : 'Voeg je eerste transactie toe of importeer een CSV.'}
      </div>
    </div>
  {:else}
    <div class="tx-groups">
      {#each grouped as g}
        <div class="tx-group">
          <div class="tx-group-head">
            <div class="tx-group-label">{g.label}</div>
            <div class="tx-group-count">{g.rows.length}</div>
          </div>
          <div class="tx-list">
            {#each g.rows as tx}
              {@const kind = txKind(tx)}
              <div class="tx-row">
                <div class="tx-date mono">{tx.date.slice(8)}</div>
                <div class="tx-ticker">
                  <span class="ticker-dot" style="background:{getColor(tx.ticker)}"></span>
                  <div class="tx-ticker-text">
                    <div class="tx-ticker-name">{tx.ticker}</div>
                    {#if tx.label}
                      <div class="tx-ticker-label">{tx.label}</div>
                    {/if}
                  </div>
                </div>
                <div class="tx-kind">
                  <span class="pill-badge sm" class:pos={kind === 'koop'} class:neg={kind === 'verk'} class:neutral={kind === 'div'}>
                    {kind === 'koop' ? 'KOOP' : kind === 'verk' ? 'VERK' : 'DIV'}
                  </span>
                </div>
                <div class="tx-shares mono desktop-only">
                  {tx.shares !== 0 ? Math.abs(tx.shares).toLocaleString('nl-BE') : '—'}
                </div>
                <div class="tx-cost mono">
                  <span class:c-pos={kind === 'div'}>{fmt(tx.costEur)}</span>
                </div>
                <div class="tx-ccy mono desktop-only">{tx.currency}</div>
                <div class="tx-isin mono desktop-only">{tx.isin ?? '—'}</div>
                <button class="tx-del" onclick={() => deleteTx(tx)} title="Verwijderen" aria-label="Verwijderen">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Footer summary -->
  <div class="tx-footer">
    <div>{filtered.length} van {txs.length} transacties</div>
    {#if dirty}
      <div class="tx-footer-actions">
        <span class="dirty-dot"></span>
        <span class="h-sm">Niet opgeslagen wijzigingen</span>
        <button class="btn ghost" onclick={discard}>Annuleren</button>
        <button class="btn primary" disabled={saving} onclick={save}>
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
        {#if saveMsg}<span class="save-msg" class:c-neg={saveMsg.includes('mislukt')}>{saveMsg}</span>{/if}
      </div>
    {:else if saveMsg}
      <span class="save-msg c-pos">✓ {saveMsg}</span>
    {/if}
  </div>
</div>

<style>
  .page-root { padding-bottom: 80px; }

  /* ── Hero ── */
  .tx-hero {
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 24px; flex-wrap: wrap;
    padding: 4px 0 18px;
  }
  .tx-title { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin-top: 4px; }
  .tx-stats { display: flex; gap: 6px; flex-wrap: wrap; }
  .tx-stat {
    background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    padding: 8px 14px; min-width: 110px;
  }
  .tx-stat-label {
    font-size: 9px; font-weight: 600; color: var(--fg-muted);
    text-transform: uppercase; letter-spacing: 0.08em;
  }
  .tx-stat-val { font-size: 16px; font-weight: 600; margin-top: 3px; }
  .tx-stat-sub { font-size: 10px; color: var(--fg-muted); margin-top: 1px; }

  /* ── Toolbar ── */
  .tx-toolbar {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    margin-bottom: 14px;
  }
  .tx-search {
    flex: 1 1 280px; max-width: 360px;
    display: flex; align-items: center; gap: 8px;
    height: 34px; padding: 0 12px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    color: var(--fg-muted); font-size: 13px;
  }
  .tx-search:focus-within { border-color: var(--border-strong); color: var(--fg); }
  .tx-search input {
    flex: 1; border: 0; outline: 0; background: transparent; color: var(--fg);
    font-size: 13px; font-family: inherit;
  }
  .clear-btn {
    width: 18px; height: 18px; border: 0; border-radius: 50%;
    background: var(--surface-2); color: var(--fg-muted); cursor: pointer;
    font-size: 14px; line-height: 1; display: flex; align-items: center; justify-content: center;
  }
  .clear-btn:hover { background: var(--border); color: var(--fg); }
  .tx-actions { display: flex; gap: 6px; margin-left: auto; }

  /* ── Add drawer ── */
  .add-drawer {
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    margin-bottom: 14px; overflow: hidden;
  }
  .add-drawer-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }
  .ghost-btn {
    background: transparent; border: 0; color: var(--fg-muted);
    font-size: 12px; cursor: pointer; padding: 4px 8px; border-radius: 6px;
  }
  .ghost-btn:hover { background: var(--surface); color: var(--fg); }
  .add-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px; padding: 16px;
  }
  .add-field { display: flex; flex-direction: column; gap: 4px; }
  .add-field-wide { grid-column: span 2; }
  .add-field span {
    font-size: 10px; font-weight: 600; color: var(--fg-muted);
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .add-field input, .add-field select {
    height: 32px; padding: 0 10px; border-radius: 8px;
    border: 1px solid var(--border); background: var(--surface-2); color: var(--fg);
    font-size: 13px; font-family: inherit; outline: 0;
  }
  .add-field input:focus, .add-field select:focus { border-color: var(--border-strong); }
  .add-drawer-foot {
    padding: 0 16px 16px; display: flex; justify-content: flex-end;
  }

  /* ── Groups ── */
  .tx-groups { display: flex; flex-direction: column; gap: 18px; }
  .tx-group { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
  .tx-group-head {
    display: flex; align-items: baseline; justify-content: space-between;
    padding: 10px 16px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
  }
  .tx-group-label {
    font-size: 11px; font-weight: 600; color: var(--fg-muted);
    text-transform: uppercase; letter-spacing: 0.08em;
  }
  .tx-group-count {
    font-size: 10px; color: var(--fg-muted);
    font-family: 'JetBrains Mono', monospace;
  }

  /* ── Rows ── */
  .tx-list { }
  .tx-row {
    display: grid;
    grid-template-columns: 36px 1fr 60px 80px 120px 50px 130px 28px;
    align-items: center; gap: 12px;
    padding: 10px 16px;
    border-top: 1px solid var(--border);
    transition: background .12s;
  }
  .tx-row:first-child { border-top: 0; }
  .tx-row:hover { background: var(--surface-2); }

  .tx-date { font-size: 12px; color: var(--fg-muted); font-weight: 600; }
  .tx-ticker { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .ticker-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .tx-ticker-text { min-width: 0; }
  .tx-ticker-name { font-size: 13px; font-weight: 700; letter-spacing: -0.01em; }
  .tx-ticker-label {
    font-size: 10px; color: var(--fg-muted); margin-top: 1px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .tx-shares { text-align: right; font-size: 12px; color: var(--fg-muted); }
  .tx-cost { text-align: right; font-size: 13px; font-weight: 600; }
  .tx-ccy { text-align: right; font-size: 11px; color: var(--fg-muted); }
  .tx-isin {
    text-align: right; font-size: 10px; color: var(--fg-muted);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .tx-del {
    width: 28px; height: 28px; border: 0; border-radius: 6px;
    background: transparent; color: var(--fg-muted); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity .15s, background .15s, color .15s;
  }
  .tx-row:hover .tx-del { opacity: 1; }
  .tx-del:hover { background: rgba(248,113,113,0.15); color: #f87171; opacity: 1; }

  /* ── Empty ── */
  .empty {
    text-align: center; padding: 64px 24px;
    background: var(--surface); border: 1px dashed var(--border); border-radius: 14px;
  }
  .empty-icon { font-size: 32px; color: var(--fg-muted); margin-bottom: 10px; }
  .empty-title { font-size: 15px; font-weight: 700; }
  .empty-sub { font-size: 12px; color: var(--fg-muted); margin-top: 4px; }

  /* ── Footer / save bar ── */
  .tx-footer {
    margin-top: 16px;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 12px; color: var(--fg-muted); flex-wrap: wrap; gap: 8px;
  }
  .tx-footer-actions {
    display: flex; align-items: center; gap: 8px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    padding: 6px 8px 6px 12px;
  }
  .dirty-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--c-warn, #f59e0b);
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
  }
  .save-msg { font-size: 11px; }

  .mono { font-family: 'JetBrains Mono', monospace; }

  /* Pill colors — neutral for dividend */
  :global(.pill-badge.sm.neutral) {
    background: var(--surface-2);
    color: var(--fg-muted);
    border: 1px solid var(--border);
  }

  /* ── Mobile ── */
  @media (max-width: 720px) {
    .desktop-only { display: none !important; }
    .tx-hero { gap: 12px; }
    .tx-stats { width: 100%; }
    .tx-stat { flex: 1; min-width: 0; padding: 8px 10px; }
    .tx-stat-val { font-size: 13px; }
    .tx-search { flex: 1 1 100%; max-width: 100%; }
    .tx-actions { margin-left: 0; }
    .tx-row {
      grid-template-columns: 28px 1fr 56px auto 28px;
      gap: 8px; padding: 12px;
    }
    .add-field-wide { grid-column: auto; }
  }
</style>
