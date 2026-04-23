<script lang="ts">
  import { page } from '$app/stores';

  const tabs = [
    { path: '/',            label: 'Dashboard' },
    { path: '/analysis',    label: 'Analysis' },
    { path: '/transactions', label: 'Transactions' },
    { path: '/import',      label: 'Import' },
    { path: '/bonus',       label: 'Bonus' },
  ];

  function isActive(path: string): boolean {
    if (path === '/') return $page.url.pathname === '/';
    return $page.url.pathname.startsWith(path);
  }

  const isStockDetail = $derived($page.url.pathname.startsWith('/stock/'));
  const isBonusDetail = $derived(
    $page.url.pathname.startsWith('/bonus/') && $page.url.pathname !== '/bonus',
  );
  const isDetailPage = $derived(isStockDetail || isBonusDetail);
  const backHref     = $derived(isBonusDetail ? '/bonus' : '/');
  const backLabel    = $derived(isBonusDetail ? 'Bonus' : 'Portfolio');
</script>

<nav class="app-nav" aria-label="Navigation">
  {#if isDetailPage}
    <a href={backHref} class="nav-btn back-pill">← {backLabel}</a>
  {/if}
  {#each tabs as tab}
    <a href={tab.path} class="nav-btn" class:active={isActive(tab.path)}>
      {tab.label}
    </a>
  {/each}
</nav>

<style>
  .back-pill {
    border-right: 1px solid var(--border-3);
    padding-right: 12px;
    margin-right: 1px;
  }
</style>
