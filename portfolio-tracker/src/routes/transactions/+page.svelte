<script lang="ts">
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { fmt } from '$lib/utils/fmt';
  import { saveTransactions } from '$lib/api/portfolio';
  import type { Transaction } from '$lib/types/transaction';

  const CURRENCIES = ['EUR','USD','GBP','GBX','CLP','CHF','SEK','DKK','NOK','CAD','AUD','JPY','MXN','BRL'];

  let search   = $state('');
  let saving   = $state(false);
  let saveMsg  = $state('');
  let showAdd  = $state(false);
  let editIdx  = $state<number | null>(null);
  let dirty    = $state(false);

  // local editable copy
  let txs = $state<Transaction[]>([]);

  $effect(() => {
    if (!dirty) txs = portfolioStore.rawTransactions.map((t) => ({ ...t }));
  });

  const filtered = $derived(
    search.trim()
      ? txs.filter((t) =>
          [t.ticker, t.yahoo ?? '', t.label ?? '', t.isin ?? ''].some((v) =>
            v.toLowerCase().includes(search.toLowerCase()),
          ),
        )
      : txs,
  );

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
    const shares   = parseFloat(addShares);
    const costEur  = parseFloat(addCostEur);
    if (!addDate || !addTicker || isNaN(costEur)) return;

    const ticker = addTicker.toUpperCase().trim();
    const yahoo  = addYahoo.trim() || ticker;

    let finalShares = addType === 'dividend' ? 0 : (addType === 'sell' ? -Math.abs(isNaN(shares) ? 0 : shares) : Math.abs(isNaN(shares) ? 0 : shares));

    const tx: Transaction = {
      date: addDate,
      ticker,
      yahoo,
      label: addLabel.trim() || undefined,
      isin: addIsin.trim() || undefined,
      shares: finalShares,
      costEur: Math.abs(costEur),
      currency: addCurrency,
    };

    dirty = true;
    txs = [...txs, tx].sort((a, b) => a.date.localeCompare(b.date));
    showAdd = false;
    resetAdd();
  }

  function deleteTx(idx: number) {
    const globalIdx = txs.indexOf(filtered[idx]!);
    if (globalIdx < 0) return;
    dirty = true;
    txs = txs.filter((_, i) => i !== globalIdx);
  }

  async function save() {
    saving  = true;
    saveMsg = '';
    try {
      await saveTransactions('replace', txs);
      portfolioStore.rawTransactions = txs;
      dirty   = false;
      saveMsg = 'Opgeslagen!';
      setTimeout(() => { saveMsg = ''; }, 2000);
    } catch (e) {
      saveMsg = e instanceof Error ? e.message : 'Opslaan mislukt';
    } finally {
      saving = false;
    }
  }

  function discard() {
    dirty = false;
    txs   = portfolioStore.rawTransactions.map((t) => ({ ...t }));
  }

  function typeLabel(t: Transaction) {
    if (t.shares === 0) return 'Div';
    return t.shares > 0 ? 'Koop' : 'Verk';
  }
  function typeClass(t: Transaction) {
    if (t.shares === 0) return 'c-neutral';
    return t.shares > 0 ? 'c-pos' : 'c-neg';
  }
</script>

<div class="page-root">
  <div class="tx-toolbar">
    <input
      class="search-input"
      type="text"
      placeholder="Zoek ticker, ISIN…"
      bind:value={search}
    />
    <button class="btn" onclick={() => (showAdd = !showAdd)}>
      {showAdd ? 'Annuleren' : '+ Transactie'}
    </button>
    <a href="/import" class="btn">CSV importeren</a>
    {#if dirty}
      <button class="btn success" disabled={saving} onclick={save}>
        {saving ? 'Opslaan…' : 'Opslaan'}
      </button>
      <button class="btn" onclick={discard}>Annuleren</button>
    {/if}
    {#if saveMsg}
      <span class="save-msg" class:c-neg={saveMsg.includes('mislukt')}>{saveMsg}</span>
    {/if}
  </div>

  {#if showAdd}
    <div class="card add-form">
      <div class="add-form-fields">
        <div class="add-field">
          <label>Type</label>
          <select bind:value={addType} style="width:90px">
            <option value="buy">Koop</option>
            <option value="sell">Verkoop</option>
            <option value="dividend">Dividend</option>
          </select>
        </div>
        <div class="add-field">
          <label>Datum *</label>
          <input type="date" bind:value={addDate} style="width:130px" />
        </div>
        <div class="add-field">
          <label>Ticker *</label>
          <input type="text" bind:value={addTicker} placeholder="GOOGL" style="width:72px;text-transform:uppercase" />
        </div>
        <div class="add-field">
          <label>Yahoo</label>
          <input type="text" bind:value={addYahoo} placeholder="GOOGL" style="width:90px" />
        </div>
        <div class="add-field">
          <label>Naam</label>
          <input type="text" bind:value={addLabel} placeholder="Alphabet Inc." style="width:140px" />
        </div>
        <div class="add-field">
          <label>ISIN</label>
          <input type="text" bind:value={addIsin} placeholder="optioneel" style="width:110px" />
        </div>
        {#if addType !== 'dividend'}
          <div class="add-field">
            <label>Aandelen *</label>
            <input type="number" bind:value={addShares} step="any" placeholder="10" style="width:80px" />
          </div>
        {/if}
        <div class="add-field">
          <label>Kosten € *</label>
          <input type="number" bind:value={addCostEur} step="any" min="0" placeholder="1234.56" style="width:92px" />
        </div>
        <div class="add-field">
          <label>Munt</label>
          <select bind:value={addCurrency} style="width:64px">
            {#each CURRENCIES as c}
              <option value={c}>{c}</option>
            {/each}
          </select>
        </div>
        <div class="add-field" style="justify-content:flex-end">
          <button class="btn success" onclick={addTx}>Toevoegen</button>
        </div>
      </div>
    </div>
  {/if}

  <div class="card" style="overflow-x:auto">
    <table class="tx-table">
      <thead>
        <tr>
          <th>Datum</th>
          <th>Type</th>
          <th>Ticker</th>
          <th class="right desktop-only">Aandelen</th>
          <th class="right">Kosten €</th>
          <th class="desktop-only">Munt</th>
          <th class="desktop-only">ISIN</th>
          <th style="width:32px"></th>
        </tr>
      </thead>
      <tbody>
        {#each filtered as tx, i}
          <tr>
            <td class="mono">{tx.date}</td>
            <td class={typeClass(tx)}>{typeLabel(tx)}</td>
            <td>
              <span class="ticker-name">{tx.ticker}</span>
              {#if tx.yahoo !== tx.ticker}
                <span class="ticker-sub desktop-only">{tx.yahoo}</span>
              {/if}
              {#if tx.label}
                <div class="ticker-label desktop-only">{tx.label}</div>
              {/if}
            </td>
            <td class="right mono desktop-only">{tx.shares !== 0 ? tx.shares : '—'}</td>
            <td class="right mono">
              {fmt(tx.costEur)}
            </td>
            <td class="mono desktop-only">{tx.currency}</td>
            <td class="mono desktop-only" style="font-size:11px;color:var(--fg-muted)">{tx.isin ?? '—'}</td>
            <td>
              <button class="del-btn" onclick={() => deleteTx(i)} title="Verwijderen">×</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if filtered.length === 0}
      <div style="padding:24px;text-align:center;color:var(--fg-muted);font-size:13px">
        {search ? 'Geen transacties gevonden' : 'Geen transacties'}
      </div>
    {/if}
  </div>

  <div style="margin-top:8px;font-size:12px;color:var(--fg-muted);text-align:right">
    {filtered.length} van {txs.length} transacties
  </div>
</div>

<style>
  .tx-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .search-input {
    flex: 1;
    min-width: 160px;
    max-width: 300px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--input-bg, var(--card-bg));
    color: var(--fg);
    font-size: 13px;
  }
  .save-msg { font-size: 12px; color: var(--c-pos, #16a34a); }

  .add-form { padding: 14px 16px; margin-bottom: 12px; }
  .add-form-fields {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: flex-end;
  }
  .add-field { display: flex; flex-direction: column; gap: 3px; }
  .add-field label { font-size: 11px; color: var(--fg-muted); }

  .tx-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .tx-table th {
    padding: 8px 12px; font-size: 11px; font-weight: 600; color: var(--fg-muted);
    text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border);
    white-space: nowrap; text-align: left;
  }
  .tx-table th.right, .tx-table td.right { text-align: right; }
  .tx-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; }
  .tx-table tbody tr:last-child td { border-bottom: none; }
  .tx-table tbody tr:hover { background: var(--hover-bg, rgba(0,0,0,0.03)); }

  .ticker-sub { font-size: 11px; color: var(--fg-muted); margin-left: 4px; }
  .ticker-label { font-size: 11px; color: var(--fg-muted); margin-top: 1px; }
  .mono { font-family: 'JetBrains Mono', monospace; }

  .del-btn {
    width: 20px; height: 20px;
    border: none; border-radius: 4px;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    display: flex; align-items: center; justify-content: center;
    padding: 0;
  }
  .del-btn:hover { background: rgba(248,113,113,0.15); color: #f87171; }

  @media (max-width: 640px) {
    .desktop-only { display: none !important; }
  }
</style>
