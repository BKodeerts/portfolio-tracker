<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { themeStore } from '$lib/stores/theme.svelte';
  import { anyMarketOpen } from '$lib/derived/dashboard';
  import Nav from '$lib/components/Nav.svelte';

  interface Props { children: import('svelte').Snippet }
  const { children }: Props = $props();

  function isAt(route: '/' | '/analysis' | '/transactions' | '/import' | '/bonus' | '/settings'): boolean {
    const current = page.url.pathname;
    const target = resolve(route);
    if (route === '/') return current === target;
    return current === target || current.startsWith(target + '/');
  }

  // Re-fetch intraday whenever the set of current tickers changes (e.g. after import)
  let _lastTickerKey = '';
  $effect(() => {
    const key = portfolioStore.currentTickers.slice().sort().join(',');
    if (key && key !== _lastTickerKey) {
      _lastTickerKey = key;
      intradayStore.load();
    }
  });

  onMount(() => {
    themeStore.applyTheme();
    document.body.classList.toggle('privacy', themeStore.privacyMode);
    portfolioStore.load().then(() => {
      intradayStore.startAutoRefresh();
    });
    return () => intradayStore.stopAutoRefresh();
  });

  const isSettingsPage = $derived(isAt('/settings'));
  const isPortfolio    = $derived(isAt('/'));
  const isAnalysis     = $derived(isAt('/analysis'));
  const isTransactions = $derived(isAt('/transactions'));

  // Stock detail is a drill-in page: no top nav, its own back-button header.
  // (Prefix built via a sentinel param — empty params throw at runtime.)
  const stockPrefix   = $derived(resolve('/stock/[ticker]', { ticker: '_' }).slice(0, -1));
  const isStockDetail = $derived(page.url.pathname.startsWith(stockPrefix));

  const marketsOpen = $derived(anyMarketOpen());
</script>

{#if !isStockDetail}
<header class="top-bar">
  <div class="top-bar-inner">
    <!-- Wordmark -->
    <div class="top-wordmark">Portfolio</div>

    <!-- Navigation tabs -->
    <Nav />

    <!-- Right controls -->
    <div class="top-bar-right">
      <!-- No live-status chip on the Analysis screen (design handoff 3) -->
      {#if !isAnalysis}
        <div class="live-chip">
          <span class="live-chip-dot" class:open={marketsOpen}></span>
          <span>{marketsOpen ? 'LIVE' : 'CLOSED'}{#if intradayStore.liveEurUsd}&nbsp;· EUR/USD {intradayStore.liveEurUsd.toFixed(3)}{/if}</span>
        </div>
      {/if}

      <button
        class="icon-toggle"
        class:on={themeStore.privacyMode}
        onclick={() => themeStore.togglePrivacy()}
        title="Privacy mode"
        aria-label="Toggle privacy mode"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          {#if themeStore.privacyMode}
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          {:else}
            <path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/>
            <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
          {/if}
        </svg>
      </button>

      <button
        class="icon-toggle"
        onclick={() => themeStore.setTheme(themeStore.isDark ? 'light' : 'dark')}
        title="Toggle theme"
        aria-label="Toggle theme"
      >
        {#if themeStore.isDark}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
        {:else}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>
        {/if}
      </button>

      <a
        href={resolve('/settings')}
        class="icon-toggle"
        class:on={isSettingsPage}
        title="Settings"
        aria-label="Settings"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/>
          <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
        </svg>
      </a>
    </div>
  </div>

</header>
{/if}

<!-- Mobile bottom tab bar — must be outside <header> to escape backdrop-filter stacking context -->
<nav class="mobile-tab-bar" aria-label="Navigation">
  <a href={resolve('/')}             class="mtab" class:active={isPortfolio}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={isPortfolio ? 2.2 : 1.7} stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-5 3 3 5-7"/></svg>
    <span>Portfolio</span>
  </a>
  <a href={resolve('/analysis')}     class="mtab" class:active={isAnalysis}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={isAnalysis ? 2.2 : 1.7} stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 4"/></svg>
    <span>Analysis</span>
  </a>
  <a href={resolve('/transactions')} class="mtab" class:active={isTransactions}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={isTransactions ? 2.2 : 1.7} stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h10"/></svg>
    <span>Activity</span>
  </a>
</nav>

<main>
  {#if portfolioStore.error}
    <div class="page-root">
      <div class="error-box">
        <div style="font-size:14px;color:var(--c-neg);margin-bottom:8px;font-weight:600">Failed to load</div>
        <div style="font-size:12px;color:var(--fg-muted)">{portfolioStore.error}</div>
        <button class="btn" onclick={() => portfolioStore.load()} style="margin-top:16px">Retry</button>
      </div>
    </div>
  {:else if !portfolioStore.loaded && portfolioStore.loading}
    <div class="page-root">
      <div class="loading">
        <div style="color:var(--fg-muted);font-size:13px;margin-bottom:12px">Loading…</div>
        <div class="progress-bar"><div class="progress-fill" style="width:40%"></div></div>
      </div>
    </div>
  {:else}
    {@render children()}
  {/if}
</main>

<style>
  /* Mobile tab bar — hidden on desktop, fixed to bottom on mobile */
  .mobile-tab-bar {
    display: none;
    position: fixed;
    bottom: 0; left: 0; right: 0;
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border-top: 1px solid var(--hairline);
    padding: 8px 12px 24px;
    z-index: 200;
    justify-content: space-around;
  }
  .mtab {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 4px 16px; text-decoration: none;
    color: var(--fg-faint); font-size: 10px; font-weight: 500;
    letter-spacing: -0.01em; border-radius: 10px;
    transition: color 0.15s;
    font-family: 'Inter', inherit;
  }
  .mtab.active { color: var(--fg); font-weight: 700; }

  @media (max-width: 899.98px) {
    .mobile-tab-bar { display: flex; }
  }
</style>
