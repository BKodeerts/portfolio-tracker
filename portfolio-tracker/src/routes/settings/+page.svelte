<script lang="ts">
  import { onMount } from 'svelte';
  import { themeStore } from '$lib/stores/theme.svelte';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { fetchSettings, saveSettings, fetchTickerMeta, saveTickerMeta, clearCache, pushToHa } from '$lib/api/settings';
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import type { Settings } from '$lib/types/settings';
  import type { TickerMeta } from '$lib/types/portfolio';

  const CURRENCIES = ['EUR','USD','GBP','CHF','SEK','DKK','NOK','CAD','AUD','JPY','CLP','MXN','BRL'];
  const SECTORS    = ['Technology','Healthcare','Financials','Consumer Discretionary','Industrials','Energy','Materials','Real Estate','Communication Services','Consumer Staples','Utilities','Overig'];
  const GEO_OPTS   = ['US','EU','BE','UK','JP','EM','Overig'];
  const ASSET_TYPES = ['EQUITY','ETF','MUTUALFUND','WARRANT','OPTION','INDEX'];

  let settings   = $state<Settings | null>(null);
  let meta       = $state<Record<string, TickerMeta>>({});
  let loading    = $state(true);
  let saveMsg    = $state('');
  let cacheMsg   = $state('');
  let haMsg      = $state('');
  let metaMsg    = $state('');
  let saving     = $state(false);
  let metaSaving = $state(false);
  let clearing   = $state(false);
  let pushing    = $state(false);

  // Local editable copies
  let baseCurrency = $state('EUR');
  let watchlistRaw = $state('');
  let intradayAuto = $state(true);

  onMount(async () => {
    try {
      const [s, m] = await Promise.all([fetchSettings(), fetchTickerMeta()]);
      settings     = s;
      meta         = m;
      baseCurrency = s.baseCurrency ?? 'EUR';
      watchlistRaw = (s.watchlist ?? []).join(', ');
      intradayAuto = s.intradayDuringMarketHours ?? true;
    } catch { /* ignore */ }
    loading = false;
  });

  async function save() {
    saving  = true;
    saveMsg = '';
    try {
      const updated = await saveSettings({
        baseCurrency,
        watchlist: watchlistRaw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
        intradayDuringMarketHours: intradayAuto,
      });
      settings = updated;
      await portfolioStore.load();
      await intradayStore.load(true);
      saveMsg  = 'Opgeslagen!';
      setTimeout(() => { saveMsg = ''; }, 2000);
    } catch (e) {
      saveMsg = e instanceof Error ? e.message : 'Opslaan mislukt';
    } finally {
      saving = false;
    }
  }

  async function doClearCache(group?: string) {
    clearing = true;
    cacheMsg = '';
    try {
      const r = await clearCache(group);
      cacheMsg = `${r.cleared} bestanden gewist`;
      setTimeout(() => { cacheMsg = ''; }, 3000);
    } catch (e) {
      cacheMsg = e instanceof Error ? e.message : 'Wissen mislukt';
    } finally {
      clearing = false;
    }
  }

  async function doPushToHa() {
    pushing = true;
    haMsg   = '';
    try {
      const r = await pushToHa();
      haMsg   = `${r.pushed} sensoren gepusht`;
      setTimeout(() => { haMsg = ''; }, 3000);
    } catch (e) {
      haMsg = e instanceof Error ? e.message : 'Push mislukt';
    } finally {
      pushing = false;
    }
  }

  async function saveMeta() {
    metaSaving = true;
    metaMsg    = '';
    try {
      await saveTickerMeta(meta);
      portfolioStore.tickerMeta = { ...meta };
      metaMsg = 'Opgeslagen!';
      setTimeout(() => { metaMsg = ''; }, 2000);
    } catch (e) {
      metaMsg = e instanceof Error ? e.message : 'Opslaan mislukt';
    } finally {
      metaSaving = false;
    }
  }

  function setMeta(ticker: string, key: string, val: string) {
    meta = {
      ...meta,
      [ticker]: { ...(meta[ticker] ?? {}), [key]: val || undefined },
    };
  }
</script>

<div class="page-root">
  <h2 class="page-title">Instellingen</h2>

  {#if loading}
    <div class="c-muted" style="font-size:13px">Laden…</div>
  {:else}
    <!-- General settings -->
    <div class="card settings-card">
      <div class="card-title" style="margin-bottom:14px">Algemeen</div>
      <div class="settings-fields">
        <div class="field-group">
          <label class="field-label" for="baseCurrency">Basisvaluta</label>
          <select id="baseCurrency" class="form-select" bind:value={baseCurrency}>
            {#each CURRENCIES as c}
              <option value={c}>{c}</option>
            {/each}
          </select>
        </div>

        <div class="field-group">
          <label class="field-label" for="watchlistRaw">Watchlist (komma-gescheiden)</label>
          <input
            id="watchlistRaw"
            class="form-input"
            type="text"
            bind:value={watchlistRaw}
            placeholder="SPY, QQQ, BTC-USD"
          />
          <div class="field-hint">Voeg Yahoo-symbolen toe om ze te volgen in Intraday</div>
        </div>

        <div class="field-group">
          <label class="field-label">Thema</label>
          <div class="seg">
            <button class="seg-btn" class:on={themeStore.theme === 'light'} onclick={() => themeStore.setTheme('light')}>Licht</button>
            <button class="seg-btn" class:on={themeStore.theme === 'dark'}  onclick={() => themeStore.setTheme('dark')}>Donker</button>
            <button class="seg-btn" class:on={themeStore.theme === 'system'} onclick={() => themeStore.setTheme('system')}>Systeem</button>
          </div>
        </div>

        <div class="field-group">
          <label class="toggle-row">
            <input type="checkbox" bind:checked={intradayAuto} />
            <span>Intraday automatisch laden tijdens markturen</span>
          </label>
        </div>
      </div>
      <div class="settings-actions">
        <button class="btn success" disabled={saving} onclick={save}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
        {#if saveMsg}<span class="action-msg" class:c-neg={saveMsg.includes('mislukt')}>{saveMsg}</span>{/if}
      </div>
    </div>

    <!-- Cache management -->
    <div class="card settings-card" style="margin-top:14px">
      <div class="card-title" style="margin-bottom:12px">Cache</div>
      <p class="c-muted" style="font-size:12px;margin-bottom:12px">
        Verwijder gecachte koersdata om verse data van Yahoo Finance op te halen.
      </p>
      <div class="settings-actions">
        <button class="btn" disabled={clearing} onclick={() => doClearCache()}>
          {clearing ? 'Wissen…' : 'Alles wissen'}
        </button>
        <button class="btn" disabled={clearing} onclick={() => doClearCache('candles')}>Candles wissen</button>
        <button class="btn" disabled={clearing} onclick={() => doClearCache('quotes')}>Quotes wissen</button>
        {#if cacheMsg}<span class="action-msg">{cacheMsg}</span>{/if}
      </div>
    </div>

    <!-- Home Assistant push -->
    <div class="card settings-card" style="margin-top:14px">
      <div class="card-title" style="margin-bottom:12px">Home Assistant</div>
      <p class="c-muted" style="font-size:12px;margin-bottom:12px">
        Stuur portfoliodata direct naar HA-sensoren via MQTT discovery.
      </p>
      <div class="settings-actions">
        <button class="btn" disabled={pushing} onclick={doPushToHa}>
          {pushing ? 'Pushen…' : 'Nu pushen naar HA'}
        </button>
        {#if haMsg}<span class="action-msg">{haMsg}</span>{/if}
      </div>
    </div>

    <!-- Ticker metadata -->
    {#if Object.keys(meta).length > 0}
      <div class="card" style="margin-top:14px;overflow-x:auto">
        <div class="card-title" style="padding:12px 16px;border-bottom:1px solid var(--border)">Ticker metadata</div>
        <table class="meta-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Sector</th>
              <th>Geografie</th>
              <th>Type</th>
              <th>Handmatige koers</th>
            </tr>
          </thead>
          <tbody>
            {#each Object.entries(meta).sort((a, b) => a[0].localeCompare(b[0])) as [ticker, m]}
              <tr>
                <td class="mono" style="font-weight:600">{ticker}</td>
                <td>
                  <select
                    class="meta-select"
                    value={m.sector as string ?? ''}
                    onchange={(e) => setMeta(ticker, 'sector', (e.target as HTMLSelectElement).value)}
                  >
                    <option value="">—</option>
                    {#each SECTORS as s}<option value={s}>{s}</option>{/each}
                  </select>
                </td>
                <td>
                  <select
                    class="meta-select"
                    value={m.geo as string ?? ''}
                    onchange={(e) => setMeta(ticker, 'geo', (e.target as HTMLSelectElement).value)}
                  >
                    <option value="">—</option>
                    {#each GEO_OPTS as g}<option value={g}>{g}</option>{/each}
                  </select>
                </td>
                <td>
                  <select
                    class="meta-select"
                    value={m.assetType as string ?? ''}
                    onchange={(e) => setMeta(ticker, 'assetType', (e.target as HTMLSelectElement).value)}
                  >
                    <option value="">—</option>
                    {#each ASSET_TYPES as t}<option value={t}>{t}</option>{/each}
                  </select>
                </td>
                <td>
                  <input
                    class="meta-input"
                    type="number"
                    step="any"
                    placeholder="auto"
                    value={m.manualPrice as number ?? ''}
                    oninput={(e) => {
                      const v = parseFloat((e.target as HTMLInputElement).value);
                      setMeta(ticker, 'manualPrice', isNaN(v) ? '' : String(v));
                    }}
                    style="width:90px"
                  />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div style="padding:10px 16px;display:flex;gap:8px;align-items:center;border-top:1px solid var(--border)">
          <button class="btn success" disabled={metaSaving} onclick={saveMeta}>
            {metaSaving ? 'Opslaan…' : 'Metadata opslaan'}
          </button>
          {#if metaMsg}<span class="action-msg" class:c-neg={metaMsg.includes('mislukt')}>{metaMsg}</span>{/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .page-title { font-size: 15px; font-weight: 600; margin: 0 0 16px; }

  .settings-card { padding: 16px; }
  .settings-fields { display: flex; flex-direction: column; gap: 14px; }
  .settings-actions {
    display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 16px;
  }
  .action-msg { font-size: 12px; color: var(--c-pos, #16a34a); }

  .field-group { display: flex; flex-direction: column; gap: 5px; }
  .field-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--fg-muted); }
  .field-hint  { font-size: 11px; color: var(--fg-muted); }

  .form-input, .form-select {
    background: var(--input-bg, var(--card-bg));
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 7px 10px;
    color: var(--fg);
    font-size: 13px;
    max-width: 340px;
    width: 100%;
    box-sizing: border-box;
  }
  .form-input:focus, .form-select:focus { outline: none; border-color: #818cf8; }

  .toggle-row {
    display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;
  }

  .meta-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .meta-table th {
    padding: 8px 12px; font-size: 11px; font-weight: 600; color: var(--fg-muted);
    text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border);
    white-space: nowrap; text-align: left;
  }
  .meta-table td { padding: 6px 12px; border-bottom: 1px solid var(--border); }
  .meta-table tbody tr:last-child td { border-bottom: none; }

  .meta-select, .meta-input {
    background: var(--input-bg, transparent);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 6px;
    color: var(--fg);
    font-size: 12px;
    font-family: inherit;
  }
  .meta-select:focus, .meta-input:focus { outline: none; border-color: #818cf8; }

  .mono { font-family: 'JetBrains Mono', monospace; }
</style>
