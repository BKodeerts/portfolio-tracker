<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { portfolioStore } from '$lib/stores/portfolio.svelte';
  import { intradayStore } from '$lib/stores/intraday.svelte';
  import { themeStore } from '$lib/stores/theme.svelte';
  import Nav from '$lib/components/Nav.svelte';
  import SummaryBar from '$lib/components/SummaryBar.svelte';

  interface Props { children: import('svelte').Snippet }
  const { children }: Props = $props();

  // Detail pages (stock/[ticker] and bonus/[id]) use their own back-nav header
  const isDetailPage = $derived(
    $page.url.pathname.startsWith('/stock/') ||
    ($page.url.pathname.startsWith('/bonus/') && $page.url.pathname !== '/bonus'),
  );
  const isSettingsPage = $derived($page.url.pathname === '/settings');

  onMount(() => {
    // Apply saved theme immediately
    themeStore.applyTheme();
    document.body.classList.toggle('privacy', themeStore.privacyMode);

    // Boot: load portfolio data then start intraday auto-refresh
    portfolioStore.load().then(() => {
      intradayStore.load();
      intradayStore.startAutoRefresh();
    });

    return () => intradayStore.stopAutoRefresh();
  });
</script>

<header class="top-bar">
  <div class="top-bar-inner">
    {#if portfolioStore.loaded}
      <SummaryBar />
    {/if}

    <div class="nav-with-controls">
      <div class="nav-slot">
        {#if isDetailPage}
          <!-- Back navigation rendered by the detail page itself -->
        {:else}
          <Nav />
        {/if}
      </div>

      <div class="display-controls">
        <button
          class="icon-toggle"
          class:on={themeStore.privacyMode}
          onclick={() => themeStore.togglePrivacy()}
          title="Privacy mode"
          aria-label="Toggle privacy mode"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/>
            <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
          </svg>
        </button>

        <a
          href="/settings"
          class="icon-toggle"
          class:on={isSettingsPage}
          title="Settings"
          aria-label="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/>
            <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
          </svg>
        </a>
      </div>
    </div>
  </div>
</header>

<main>
  {#if portfolioStore.error}
    <div class="page-root">
      <div class="error-box">
        <div style="font-size:14px;color:#f87171;margin-bottom:8px;font-weight:600">Laden mislukt</div>
        <div style="font-size:12px;color:var(--fg-muted)">{portfolioStore.error}</div>
        <button class="btn" onclick={() => portfolioStore.load()} style="margin-top:16px">Opnieuw</button>
      </div>
    </div>
  {:else if !portfolioStore.loaded && portfolioStore.loading}
    <div class="page-root">
      <div class="loading">
        <div style="color:var(--fg-muted);font-size:13px;margin-bottom:12px">Laden…</div>
        <div class="progress-bar"><div class="progress-fill" style="width:40%"></div></div>
      </div>
    </div>
  {:else}
    {@render children()}
  {/if}
</main>
