<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { themeStore } from '$lib/stores/theme.svelte';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { fetchSettings, saveSettings, clearCache, pushToHa } from '$lib/api/settings';
  import { saveTransactions } from '$lib/api/portfolio';
  import type { Settings } from '$lib/types/settings';
  import pkg from '../../../package.json';

  const CURRENCIES = ['EUR','USD','GBP','CHF','SEK','DKK','NOK','CAD','AUD','JPY','CLP','MXN','BRL'];

  type Section = 'algemeen' | 'watchlist' | 'home-assistant' | 'data' | 'over';
  const SECTIONS: { id: Section; title: string; icon: string; subtitle: () => string }[] = [
    { id: 'algemeen',       title: 'Algemeen',       icon: '⚙',  subtitle: () => 'Weergave, munt, privacy' },
    { id: 'watchlist',      title: 'Watchlist',      icon: '☆',  subtitle: () => `${watchlist.length} ticker${watchlist.length === 1 ? '' : 's'}` },
    { id: 'home-assistant', title: 'Home Assistant', icon: '⚡',  subtitle: () => haPushActive ? 'Actief' : 'Uit' },
    { id: 'data',           title: 'Data',           icon: '⭳',  subtitle: () => 'Import, export, cache' },
    { id: 'over',           title: 'Over',           icon: 'ⓘ',  subtitle: () => `v${pkg.version}` },
  ];

  let settings = $state<Settings | null>(null);
  let loading  = $state(true);
  let active   = $state<Section | null>('algemeen');
  let isMobile = $state(false);

  // Editable state
  let baseCurrency  = $state('EUR');
  let intradayAuto  = $state(true);
  let watchlist     = $state<string[]>([]);
  let newTicker     = $state('');
  let haPushActive  = $state(false);
  let pushInterval  = $state(15);

  // Transient UI
  let saveMsg  = $state('');
  let cacheMsg = $state('');
  let haMsg    = $state('');
  let clearing = $state(false);
  let pushing  = $state(false);

  const firstDate = $derived(
    portfolioStore.rawTransactions.length > 0
      ? [...portfolioStore.rawTransactions].map((t) => t.date).sort()[0]
      : '—',
  );
  const txCount = $derived(portfolioStore.rawTransactions.length);

  onMount(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const sync = () => {
      isMobile = mq.matches;
      if (isMobile && active === 'algemeen') active = null; // show list on mobile entry
      if (!isMobile && active === null) active = 'algemeen';
    };
    sync();
    mq.addEventListener('change', sync);

    (async () => {
      try {
        const s = await fetchSettings();
        settings     = s;
        baseCurrency = s.baseCurrency ?? 'EUR';
        intradayAuto = s.intradayDuringMarketHours ?? true;
        watchlist    = [...(s.watchlist ?? [])];
        pushInterval = s.pushInterval ?? 15;
        haPushActive = s.pushPositions !== false;
      } catch { /* ignore */ }
      loading = false;
    })();

    return () => mq.removeEventListener('change', sync);
  });

  async function persist(partial: Partial<Settings>, msg = 'Opgeslagen') {
    try {
      const updated = await saveSettings(partial);
      settings = updated;
      saveMsg = msg;
      setTimeout(() => { saveMsg = ''; }, 1500);
      await portfolioStore.load();
      if ('intradayDuringMarketHours' in partial) await intradayStore.load(true);
    } catch (e) {
      saveMsg = e instanceof Error ? e.message : 'Opslaan mislukt';
    }
  }

  function addTicker() {
    const t = newTicker.trim().toUpperCase();
    if (!t || watchlist.includes(t)) return;
    watchlist = [...watchlist, t];
    newTicker = '';
    persist({ watchlist });
  }
  function removeTicker(t: string) {
    watchlist = watchlist.filter((x) => x !== t);
    persist({ watchlist });
  }

  async function doClearCache() {
    clearing = true;
    cacheMsg = '';
    try {
      const r = await clearCache();
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
    haMsg = '';
    try {
      const r = await pushToHa();
      haMsg = `${r.pushed} sensoren gepusht`;
      setTimeout(() => { haMsg = ''; }, 3000);
    } catch (e) {
      haMsg = e instanceof Error ? e.message : 'Push mislukt';
    } finally {
      pushing = false;
    }
  }

  async function wipeTransactions() {
    if (!confirm('Weet je zeker dat je ALLE transacties wilt wissen? Er wordt een back-up aangemaakt.')) return;
    try {
      await saveTransactions('replace', []);
      await portfolioStore.load();
      saveMsg = 'Transacties gewist';
      setTimeout(() => { saveMsg = ''; }, 2000);
    } catch (e) {
      saveMsg = e instanceof Error ? e.message : 'Wissen mislukt';
    }
  }

  const buildDate = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
</script>

<div class="page-root settings-page">
  <div class="settings-head">
    <div class="eyebrow">INSTELLINGEN</div>
    <div class="h-lg">Voorkeuren &amp; data</div>
  </div>

  {#if loading}
    <div class="c-muted" style="font-size:13px">Laden…</div>
  {:else}
    <div class="settings-shell" class:mobile={isMobile}>
      {#if !isMobile || active === null}
        <aside class="settings-nav" class:full={isMobile}>
          {#each SECTIONS as s}
            <button class="nav-item" class:active={active === s.id} onclick={() => (active = s.id)}>
              <span class="nav-icon">{s.icon}</span>
              <span class="nav-text">
                <span class="nav-title">{s.title}</span>
                <span class="nav-sub">{s.subtitle()}</span>
              </span>
              {#if isMobile}<span class="nav-chev">›</span>{/if}
            </button>
          {/each}
        </aside>
      {/if}

      {#if active !== null && (!isMobile || active !== null)}
        <section class="settings-panel">
          {#if isMobile}
            <button class="back-btn" onclick={() => (active = null)}>‹ Terug</button>
          {/if}

          {#if active === 'algemeen'}
            <header class="panel-head">
              <div class="panel-title">Algemeen</div>
              <div class="panel-sub">Weergave, munt, privacy</div>
            </header>

            <div class="row">
              <div class="row-text">
                <div class="row-label">Basismunt</div>
                <div class="row-hint">Alle bedragen worden omgerekend naar deze munt.</div>
              </div>
              <select class="form-select" bind:value={baseCurrency} onchange={() => persist({ baseCurrency })}>
                {#each CURRENCIES as c}<option value={c}>{c}</option>{/each}
              </select>
            </div>

            <div class="row">
              <div class="row-text">
                <div class="row-label">Privacy-modus</div>
                <div class="row-hint">Verberg alle bedragen achter een blur.</div>
              </div>
              <label class="switch">
                <input type="checkbox" checked={themeStore.privacyMode} onchange={() => themeStore.togglePrivacy()} />
                <span class="slider"></span>
              </label>
            </div>

            <div class="row">
              <div class="row-text">
                <div class="row-label">Intraday tijdens beurstijden</div>
                <div class="row-hint">Ververs koersen elke minuut als de beurs open is.</div>
              </div>
              <label class="switch">
                <input
                  type="checkbox"
                  bind:checked={intradayAuto}
                  onchange={() => persist({ intradayDuringMarketHours: intradayAuto })}
                />
                <span class="slider"></span>
              </label>
            </div>

            <div class="row">
              <div class="row-text">
                <div class="row-label">Thema</div>
                <div class="row-hint">Systeem-voorkeur, licht of donker.</div>
              </div>
              <div class="seg">
                <button class="seg-btn" class:on={themeStore.theme === 'system'} onclick={() => themeStore.setTheme('system')}>Auto</button>
                <button class="seg-btn" class:on={themeStore.theme === 'light'}  onclick={() => themeStore.setTheme('light')}>Licht</button>
                <button class="seg-btn" class:on={themeStore.theme === 'dark'}   onclick={() => themeStore.setTheme('dark')}>Donker</button>
              </div>
            </div>

            {#if saveMsg}<div class="toast">{saveMsg}</div>{/if}

          {:else if active === 'watchlist'}
            <header class="panel-head">
              <div class="panel-title">Watchlist</div>
              <div class="panel-sub">{watchlist.length} ticker{watchlist.length === 1 ? '' : 's'}</div>
            </header>

            <div class="section-label">ACTIEVE TICKERS</div>
            <div class="chips">
              {#each watchlist as t}
                <span class="chip">
                  <span class="chip-dot"></span>
                  {t}
                  <button class="chip-x" aria-label="Verwijder {t}" onclick={() => removeTicker(t)}>×</button>
                </span>
              {/each}
              {#if watchlist.length === 0}
                <span class="c-muted" style="font-size:12px">Nog geen tickers.</span>
              {/if}
            </div>

            <div class="ticker-add">
              <input
                class="form-input"
                placeholder="Voeg ticker toe…"
                bind:value={newTicker}
                onkeydown={(e) => e.key === 'Enter' && addTicker()}
              />
              <button class="btn primary" onclick={addTicker}>Toevoegen</button>
            </div>
            <div class="row-hint" style="margin-top:10px">Watchlist-tickers verschijnen bovenaan het dashboard zonder positie.</div>

            {#if saveMsg}<div class="toast">{saveMsg}</div>{/if}

          {:else if active === 'home-assistant'}
            <header class="panel-head">
              <div class="panel-title">Home Assistant</div>
              <div class="panel-sub">{haPushActive ? 'Actief' : 'Uit'}</div>
            </header>

            <div class="row">
              <div class="row-text">
                <div class="row-label">Push actief</div>
                <div class="row-hint">Verstuurt portefeuille-waarde en P&amp;L via MQTT.</div>
              </div>
              <label class="switch">
                <input
                  type="checkbox"
                  bind:checked={haPushActive}
                  onchange={() => persist({ pushPositions: haPushActive ? ['*'] : false })}
                />
                <span class="slider"></span>
              </label>
            </div>

            <div class="row">
              <div class="row-text">
                <div class="row-label">Interval</div>
                <div class="row-hint">Hoe vaak een push verzonden wordt.</div>
              </div>
              <div class="num-with-unit">
                <input
                  class="form-input num"
                  type="number"
                  min="1"
                  max="60"
                  bind:value={pushInterval}
                  onchange={() => persist({ pushInterval })}
                />
                <span class="unit">min</span>
              </div>
            </div>

            <div class="row">
              <div class="row-text">
                <div class="row-label">Handmatig pushen</div>
                <div class="row-hint">Stuur nu direct een update naar Home Assistant.</div>
              </div>
              <button class="btn" disabled={pushing} onclick={doPushToHa}>
                {pushing ? 'Pushen…' : 'Nu pushen'}
              </button>
            </div>

            {#if haMsg}<div class="toast">{haMsg}</div>{/if}

          {:else if active === 'data'}
            <header class="panel-head">
              <div class="panel-title">Data</div>
              <div class="panel-sub">Import, export, cache</div>
            </header>

            <div class="section-label">IMPORT &amp; EXPORT</div>
            <div class="data-grid">
              <a class="data-tile" href={resolve('/import')}>
                <div class="data-tile-title">↑ Importeer CSV</div>
                <div class="data-tile-sub">DeGiro, Bolero, T212</div>
              </a>
              <div class="data-tile disabled">
                <div class="data-tile-title">↓ Exporteer CSV</div>
                <div class="data-tile-sub">{txCount} transacties · binnenkort</div>
              </div>
            </div>

            <div class="section-label" style="margin-top:18px">GEVAARLIJK</div>
            <button class="btn full" disabled={clearing} onclick={doClearCache}>
              {clearing ? 'Wissen…' : '↻ Cache legen'}
            </button>
            {#if cacheMsg}<div class="toast">{cacheMsg}</div>{/if}

            <button class="btn full danger" onclick={wipeTransactions}>
              Alle transacties wissen…
            </button>

            {#if saveMsg}<div class="toast">{saveMsg}</div>{/if}

          {:else if active === 'over'}
            <header class="panel-head">
              <div class="panel-title">Over</div>
              <div class="panel-sub">v{pkg.version}</div>
            </header>

            <div class="about">
              <div class="about-logo">P</div>
              <div class="about-name">Portfolio tracker</div>
              <div class="about-ver">v{pkg.version} · build {buildDate}</div>
            </div>

            <div class="about-row"><span>Data-bron</span><span class="mono">Yahoo Finance</span></div>
            <div class="about-row"><span>Framework</span><span class="mono">SvelteKit 2.x</span></div>
            <div class="about-row"><span>Transacties</span><span class="mono">{txCount}</span></div>
            <div class="about-row"><span>Eerste boeking</span><span class="mono">{firstDate}</span></div>
          {/if}
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .settings-page { max-width: 1100px; }
  .settings-head { margin-bottom: 18px; }
  .eyebrow {
    font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
    color: var(--fg-muted); text-transform: uppercase; margin-bottom: 4px;
  }
  .h-lg { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }

  .settings-shell {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 14px;
  }
  .settings-shell.mobile { grid-template-columns: 1fr; padding: 0; background: transparent; border: none; }

  /* ── Left nav ── */
  .settings-nav { display: flex; flex-direction: column; gap: 4px; }
  .settings-nav.full { gap: 0; }
  .nav-item {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px;
    background: transparent; border: none; border-radius: 10px;
    cursor: pointer; text-align: left;
    color: var(--fg); font-family: inherit;
    position: relative;
  }
  .nav-item:hover { background: var(--surface-hover); }
  .nav-item.active { background: var(--accent-soft); }
  .nav-item.active::before {
    content: ''; position: absolute; left: 0; top: 8px; bottom: 8px;
    width: 3px; border-radius: 2px; background: var(--accent);
  }
  .nav-icon {
    width: 32px; height: 32px; display: grid; place-items: center;
    background: var(--surface-2); border-radius: 8px; font-size: 15px;
    flex: 0 0 32px;
  }
  .nav-item.active .nav-icon { background: color-mix(in srgb, var(--accent) 15%, var(--surface)); }
  .nav-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .nav-title { font-weight: 600; font-size: 14px; }
  .nav-sub   { font-size: 12px; color: var(--fg-muted); }
  .nav-chev  { color: var(--fg-subtle); font-size: 18px; }

  .settings-nav.full .nav-item {
    padding: 14px 12px; border-radius: 0; border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .settings-nav.full .nav-item:first-child { border-top-left-radius: 12px; border-top-right-radius: 12px; }
  .settings-nav.full .nav-item:last-child  { border-bottom: none; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; }
  .settings-nav.full .nav-item.active::before { display: none; }

  /* ── Right panel ── */
  .settings-panel { padding: 8px 14px 14px; min-width: 0; }
  .panel-head { margin-bottom: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
  .panel-title { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
  .panel-sub   { font-size: 13px; color: var(--fg-muted); margin-top: 2px; }

  .back-btn {
    background: transparent; border: none; color: var(--fg-muted);
    font-size: 14px; padding: 6px 0 12px; cursor: pointer; font-family: inherit;
  }

  .row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--border);
  }
  .row:last-of-type { border-bottom: none; }
  .row-text { min-width: 0; flex: 1; }
  .row-label { font-weight: 600; font-size: 14px; }
  .row-hint  { font-size: 12px; color: var(--fg-muted); margin-top: 2px; }

  .form-input, .form-select {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 8px; padding: 7px 10px; color: var(--fg);
    font-size: 13px; font-family: inherit;
  }
  .form-input:focus, .form-select:focus { outline: none; border-color: var(--border-strong); }
  .form-input.num { width: 72px; text-align: right; font-family: 'JetBrains Mono', monospace; }
  .num-with-unit { display: flex; align-items: center; gap: 6px; }
  .unit { font-size: 12px; color: var(--fg-muted); }

  /* Switch */
  .switch { position: relative; display: inline-block; width: 42px; height: 24px; flex: 0 0 42px; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute; inset: 0; cursor: pointer; background: var(--surface-3);
    border-radius: 999px; transition: background 0.15s;
  }
  .slider::before {
    content: ''; position: absolute; height: 18px; width: 18px;
    left: 3px; top: 3px; background: #fff; border-radius: 50%;
    transition: transform 0.15s; box-shadow: 0 1px 2px rgba(0,0,0,0.2);
  }
  .switch input:checked + .slider { background: var(--accent); }
  .switch input:checked + .slider::before { transform: translateX(18px); }

  /* Segmented */
  .seg {
    display: inline-flex; background: var(--surface-2);
    border: 1px solid var(--border); border-radius: 8px; padding: 2px;
  }
  .seg-btn {
    background: transparent; border: none; padding: 5px 12px;
    font-size: 12px; font-weight: 500; color: var(--fg-muted);
    border-radius: 6px; cursor: pointer; font-family: inherit;
  }
  .seg-btn.on {
    background: var(--surface); color: var(--fg);
    box-shadow: 0 1px 2px rgba(0,0,0,0.06);
  }

  /* Buttons */
  .btn {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 8px; padding: 7px 14px; font-size: 13px;
    color: var(--fg); font-family: inherit; cursor: pointer;
  }
  .btn:hover:not(:disabled) { background: var(--surface-3); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.primary { background: var(--fg); color: var(--bg); border-color: var(--fg); }
  .btn.primary:hover:not(:disabled) { opacity: 0.9; background: var(--fg); }
  .btn.full { width: 100%; padding: 10px; margin-top: 8px; text-align: center; }
  .btn.danger {
    color: var(--c-neg); border-color: var(--c-neg);
    background: transparent;
  }
  .btn.danger:hover { background: var(--c-neg-bg); }

  /* Chips */
  .section-label {
    font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
    color: var(--fg-muted); text-transform: uppercase; margin: 10px 0 8px;
  }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 999px; padding: 5px 10px;
    font-size: 13px; font-weight: 500;
  }
  .chip-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
  .chip-x {
    background: transparent; border: none; cursor: pointer;
    color: var(--fg-muted); font-size: 14px; padding: 0 2px; line-height: 1;
    font-family: inherit;
  }
  .chip-x:hover { color: var(--fg); }

  .ticker-add { display: flex; gap: 8px; }
  .ticker-add .form-input { flex: 1; }

  /* Data tiles */
  .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .data-tile {
    display: flex; flex-direction: column; gap: 4px;
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 10px; padding: 14px;
    text-decoration: none; color: var(--fg); cursor: pointer;
  }
  .data-tile:hover { background: var(--surface-3); }
  .data-tile.disabled { opacity: 0.55; cursor: not-allowed; pointer-events: none; }
  .data-tile-title { font-weight: 600; font-size: 14px; }
  .data-tile-sub   { font-size: 12px; color: var(--fg-muted); }

  /* About */
  .about { display: flex; flex-direction: column; align-items: center; padding: 16px 0; gap: 2px; }
  .about-logo {
    width: 56px; height: 56px; border-radius: 14px;
    background: var(--fg); color: var(--bg);
    display: grid; place-items: center; font-size: 28px; font-weight: 700;
    margin-bottom: 8px;
  }
  .about-name { font-weight: 600; font-size: 16px; }
  .about-ver  { font-size: 12px; color: var(--fg-muted); }
  .about-row {
    display: flex; justify-content: space-between; padding: 12px 0;
    border-bottom: 1px solid var(--border); font-size: 14px;
  }
  .about-row:last-child { border-bottom: none; }
  .about-row span:first-child { font-weight: 500; }
  .mono { font-family: 'JetBrains Mono', monospace; color: var(--fg-muted); font-size: 13px; }

  /* Toast */
  .toast {
    margin-top: 14px; font-size: 12px; color: var(--c-pos);
  }

  @media (max-width: 720px) {
    .data-grid { grid-template-columns: 1fr; }
  }
</style>
