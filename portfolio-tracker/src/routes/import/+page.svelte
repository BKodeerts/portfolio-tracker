<script lang="ts">
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { parseDeGiroCSV, parseBoleroXLSX, aggregateOrders, buildIsinLookup, guessYahooSuffix } from '$lib/utils/csv';
  import { saveTransactions } from '$lib/api/portfolio';
  import { lookupIsin } from '$lib/api/settings';
  import type { ParsedRow, BoleroRow } from '$lib/utils/csv';
  import type { Transaction } from '$lib/types/transaction';

  interface MappedRow {
    isin: string;
    product: string;
    exchange: string;
    ticker: string;
    yahoo: string;
    shares: number;
    costEur: number;
    date: string;
    currency: string;
  }

  let dragOver   = $state(false);
  let parsing    = $state(false);
  let saveMode   = $state<'merge' | 'replace'>('merge');
  let saving     = $state(false);
  let saveMsg    = $state('');
  let rows       = $state<MappedRow[]>([]);
  let parseError = $state('');

  // Ticker rename state
  const tickerGroups = $derived(() => {
    const map: Record<string, { yahoo: string; label: string; count: number }> = {};
    for (const tx of portfolioStore.rawTransactions) {
      if (!map[tx.ticker]) map[tx.ticker] = { yahoo: tx.yahoo ?? tx.ticker, label: tx.label ?? '', count: 0 };
      map[tx.ticker]!.count++;
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  });

  let renameEdits = $state<Record<string, { ticker: string; yahoo: string }>>({});
  let renameSaving = $state(false);
  let renameMsg    = $state('');

  // Init rename edits from current transactions
  $effect(() => {
    const edits: Record<string, { ticker: string; yahoo: string }> = {};
    for (const [t, info] of tickerGroups()) {
      edits[t] = { ticker: t, yahoo: info.yahoo };
    }
    renameEdits = edits;
  });

  const txCount   = $derived(portfolioStore.rawTransactions.length);
  const dateRange = $derived(
    txCount > 0
      ? `${portfolioStore.rawTransactions[0]?.date ?? ''} → ${portfolioStore.rawTransactions[txCount - 1]?.date ?? ''}`
      : '—',
  );

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    parsing    = true;
    parseError = '';
    rows       = [];

    try {
      const isBolero = file.name.endsWith('.xlsx') || file.name.startsWith('portfolio_');
      let parsed: (ParsedRow | BoleroRow)[];

      if (isBolero) {
        parsed = parseBoleroXLSX(await file.arrayBuffer());
      } else {
        const text = await file.text();
        const raw  = parseDeGiroCSV(text);
        parsed     = aggregateOrders(raw);
      }

      if (parsed.length === 0) {
        parseError = 'Geen geldige transacties gevonden.';
        return;
      }

      const isinLookup  = buildIsinLookup(portfolioStore.rawTransactions);
      const unknownIsins = [...new Set(parsed.map((r) => r.isin))].filter((isin) => !isinLookup[isin]);

      // Auto-lookup unknown ISINs
      const resolved: Record<string, { ticker: string; yahoo: string }> = {};
      await Promise.all(
        unknownIsins.map(async (isin) => {
          const row = parsed.find((r) => r.isin === isin);
          if (!row) return;
          try {
            const j = await lookupIsin(isin, row.exchange);
            if (j.symbol) {
              const sfx    = guessYahooSuffix(row.exchange);
              const ticker = sfx ? j.symbol.slice(0, j.symbol.length - sfx.length) : j.symbol;
              resolved[isin] = { ticker, yahoo: j.symbol };
            }
          } catch { /* ignore lookup failures */ }
        }),
      );

      rows = parsed.map((r) => {
        const known  = isinLookup[r.isin];
        const looked = resolved[r.isin];
        const ticker = known?.ticker ?? looked?.ticker ?? r.isin.slice(0, 6);
        const yahoo  = known?.yahoo  ?? looked?.yahoo  ?? ticker;
        const shares = (r as ParsedRow).shares ?? (r as BoleroRow).shares;
        const costEur = (r as ParsedRow).costEur ?? (r as BoleroRow).totaalEur;
        return {
          isin: r.isin,
          product: r.product,
          exchange: r.exchange,
          ticker,
          yahoo,
          shares,
          costEur,
          date: r.date,
          currency: r.currency,
        };
      });
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    } finally {
      parsing = false;
    }
  }

  async function importRows() {
    if (rows.length === 0) return;
    saving  = true;
    saveMsg = '';
    try {
      const transactions: Transaction[] = rows.map((r) => ({
        date: r.date,
        ticker: r.ticker,
        yahoo: r.yahoo,
        isin: r.isin || undefined,
        shares: r.shares,
        costEur: r.costEur,
        currency: r.currency,
      }));
      await saveTransactions(saveMode, transactions);
      await portfolioStore.load();
      rows    = [];
      saveMsg = `${transactions.length} transacties ${saveMode === 'merge' ? 'samengevoegd' : 'vervangen'}!`;
      setTimeout(() => { saveMsg = ''; }, 3000);
    } catch (e) {
      saveMsg = e instanceof Error ? e.message : 'Opslaan mislukt';
    } finally {
      saving = false;
    }
  }

  async function saveRenames() {
    renameSaving = true;
    renameMsg    = '';
    try {
      const txs = portfolioStore.rawTransactions.map((t) => {
        const edit = renameEdits[t.ticker];
        if (!edit) return t;
        return { ...t, ticker: edit.ticker.toUpperCase().trim() || t.ticker, yahoo: edit.yahoo.trim() || t.yahoo };
      });
      await saveTransactions('replace', txs);
      portfolioStore.rawTransactions = txs;
      renameMsg = 'Opgeslagen!';
      setTimeout(() => { renameMsg = ''; }, 2000);
    } catch (e) {
      renameMsg = e instanceof Error ? e.message : 'Opslaan mislukt';
    } finally {
      renameSaving = false;
    }
  }
</script>

<div class="page-root">
  <!-- Info bar -->
  <div class="import-info card">
    <strong>{txCount} transacties opgeslagen</strong>{txCount > 0 ? ` · ${dateRange}` : ''}<br />
    Upload een DeGiro <em>Transacties.csv</em> of Bolero <em>portfolio_…xlsx</em>. Bestaande data kun je behouden of vervangen.
  </div>

  <!-- Drop zone -->
  <div
    class="drop-zone"
    class:drag-over={dragOver}
    role="button"
    tabindex="0"
    ondragover={(e) => { e.preventDefault(); dragOver = true; }}
    ondragleave={() => (dragOver = false)}
    ondrop={(e) => { e.preventDefault(); dragOver = false; handleFile(e.dataTransfer?.files[0]); }}
    onkeydown={(e) => { if (e.key === 'Enter') document.getElementById('csv-input')?.click(); }}
    onclick={() => document.getElementById('csv-input')?.click()}
  >
    {#if parsing}
      <div class="c-muted">Bestand verwerken…</div>
    {:else}
      <strong>Sleep bestand hierheen</strong>
      <p class="c-muted" style="margin:4px 0 0">of klik om te bladeren (.csv, .xlsx)</p>
    {/if}
  </div>
  <input
    id="csv-input"
    type="file"
    accept=".csv,.xlsx,text/csv,text/plain"
    style="display:none"
    onchange={(e) => handleFile((e.target as HTMLInputElement).files?.[0])}
  />

  {#if parseError}
    <div class="error-box">{parseError}</div>
  {/if}

  <!-- Mapping table -->
  {#if rows.length > 0}
    <div class="card" style="margin-top:16px;overflow-x:auto">
      <div class="map-header">
        <span style="font-size:13px;font-weight:600">{rows.length} rijen gevonden</span>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select class="mobile-select" bind:value={saveMode}>
            <option value="merge">Samenvoegen</option>
            <option value="replace">Vervangen</option>
          </select>
          <button class="btn success" disabled={saving} onclick={importRows}>
            {saving ? 'Opslaan…' : 'Importeren'}
          </button>
          <button class="btn" onclick={() => (rows = [])}>Annuleren</button>
          {#if saveMsg}
            <span style="font-size:12px" class:c-neg={saveMsg.includes('mislukt')}>{saveMsg}</span>
          {/if}
        </div>
      </div>
      <table class="map-table">
        <thead>
          <tr>
            <th>ISIN</th>
            <th>Product</th>
            <th>Ticker</th>
            <th>Yahoo</th>
            <th class="right">Aandelen</th>
            <th class="right">Kosten €</th>
            <th>Datum</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row, i}
            <tr>
              <td class="mono" style="font-size:11px">{row.isin}</td>
              <td style="font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{row.product}</td>
              <td>
                <input
                  class="map-input"
                  value={row.ticker}
                  oninput={(e) => { rows[i] = { ...rows[i]!, ticker: (e.target as HTMLInputElement).value.toUpperCase() }; }}
                  style="width:80px;text-transform:uppercase"
                />
              </td>
              <td>
                <input
                  class="map-input"
                  value={row.yahoo}
                  oninput={(e) => { rows[i] = { ...rows[i]!, yahoo: (e.target as HTMLInputElement).value }; }}
                  style="width:100px"
                />
              </td>
              <td class="right mono">{row.shares}</td>
              <td class="right mono">€{Math.round(row.costEur).toLocaleString('nl-BE')}</td>
              <td class="mono" style="font-size:11px">{row.date}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- Ticker rename -->
  {#if txCount > 0}
    <div class="card" style="margin-top:20px;padding:16px">
      <h3 style="font-size:13px;font-weight:600;margin:0 0 4px">Tickers hernoemen</h3>
      <p class="c-muted" style="font-size:12px;margin-bottom:12px;line-height:1.5">
        Wijzig ticker of Yahoo-symbool. Wordt toegepast op alle bijbehorende transacties.
      </p>
      <div style="overflow-x:auto">
        <table class="map-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Yahoo symbool</th>
              <th>Label</th>
              <th class="right">#</th>
            </tr>
          </thead>
          <tbody>
            {#each tickerGroups() as [origTicker, info]}
              <tr>
                <td>
                  <input
                    class="map-input"
                    value={renameEdits[origTicker]?.ticker ?? origTicker}
                    oninput={(e) => {
                      renameEdits = {
                        ...renameEdits,
                        [origTicker]: { ...renameEdits[origTicker]!, ticker: (e.target as HTMLInputElement).value },
                      };
                    }}
                    style="width:80px;font-family:'JetBrains Mono',monospace;text-transform:uppercase"
                  />
                </td>
                <td>
                  <input
                    class="map-input"
                    value={renameEdits[origTicker]?.yahoo ?? info.yahoo}
                    oninput={(e) => {
                      renameEdits = {
                        ...renameEdits,
                        [origTicker]: { ...renameEdits[origTicker]!, yahoo: (e.target as HTMLInputElement).value },
                      };
                    }}
                    style="width:110px"
                  />
                </td>
                <td style="font-size:11px;color:var(--fg-muted);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{info.label}</td>
                <td class="right mono" style="font-size:11px">{info.count}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
        <button class="btn success" disabled={renameSaving} onclick={saveRenames}>
          {renameSaving ? 'Opslaan…' : 'Tickers opslaan'}
        </button>
        {#if renameMsg}
          <span style="font-size:12px" class:c-neg={renameMsg.includes('mislukt')}>{renameMsg}</span>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .import-info {
    padding: 14px 16px;
    font-size: 13px;
    line-height: 1.6;
    margin-bottom: 12px;
  }

  .drop-zone {
    border: 2px dashed var(--border);
    border-radius: 10px;
    padding: 32px 24px;
    text-align: center;
    cursor: pointer;
    font-size: 14px;
    transition: border-color 0.15s, background 0.15s;
  }
  .drop-zone:hover, .drop-zone.drag-over {
    border-color: #818cf8;
    background: rgba(99,102,241,0.05);
  }

  .map-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }

  .map-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .map-table th {
    padding: 7px 12px; font-size: 11px; font-weight: 600; color: var(--fg-muted);
    text-transform: uppercase; letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border); white-space: nowrap; text-align: left;
  }
  .map-table th.right, .map-table td.right { text-align: right; }
  .map-table td { padding: 7px 12px; border-bottom: 1px solid var(--border); }
  .map-table tbody tr:last-child td { border-bottom: none; }

  .map-input {
    background: var(--input-bg, transparent);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 6px;
    color: var(--fg);
    font-size: 12px;
    font-family: inherit;
  }
  .map-input:focus { outline: none; border-color: #818cf8; }

  .error-box {
    margin-top: 12px;
    padding: 10px 14px;
    border-radius: 8px;
    background: rgba(248,113,113,0.1);
    color: #f87171;
    font-size: 13px;
  }

  .mono { font-family: 'JetBrains Mono', monospace; }
  .c-muted { color: var(--fg-muted); }
</style>
