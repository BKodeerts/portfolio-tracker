<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';

  const tabs = [
    { path: '/',             label: 'Dashboard' },
    { path: '/analysis',     label: 'Analyse' },
    { path: '/transactions', label: 'Transacties' },
    { path: '/import',       label: 'Import' },
    { path: '/bonus',        label: 'Bonus' },
  ];

  function pathname(): string {
    const p = $page.url.pathname;
    return base && p.startsWith(base) ? p.slice(base.length) || '/' : p;
  }

  function isActive(path: string): boolean {
    const p = pathname();
    if (path === '/') return p === '/';
    return p.startsWith(path);
  }

  const isStockDetail = $derived(pathname().startsWith('/stock/'));
  const isBonusDetail = $derived(
    pathname().startsWith('/bonus/') && pathname() !== '/bonus',
  );
  const isDetailPage = $derived(isStockDetail || isBonusDetail);
  const backHref     = $derived(isBonusDetail ? `${base}/bonus` : `${base}/`);
  const backLabel    = $derived(isBonusDetail ? '← Bonus' : '← Portfolio');
</script>

<nav class="app-nav" aria-label="Navigatie">
  {#if isDetailPage}
    <a href={backHref} class="nav-btn back-btn">{backLabel}</a>
  {/if}
  {#each tabs as tab}
    <a href="{base}{tab.path === '/' ? '/' : tab.path}" class="nav-btn" class:active={isActive(tab.path)}>
      {tab.label}
    </a>
  {/each}
</nav>

<style>
  .back-btn {
    border-right: 1px solid var(--border);
    padding-right: 12px;
    margin-right: 2px;
    color: var(--fg-muted);
  }

  @media (max-width: 640px) {
    .app-nav { display: none; }
  }
</style>
