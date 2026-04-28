<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';

  const tabs = [
    { path: '/',             label: 'Dashboard' },
    { path: '/analysis',     label: 'Analyse' },
    { path: '/transactions', label: 'Transacties' },
    { path: '/import',       label: 'Import' },
    { path: '/bonus',        label: 'Bonus' },
  ] as const;

  type TabPath = (typeof tabs)[number]['path'];

  function isActive(path: TabPath): boolean {
    const current = page.url.pathname;
    const resolved = resolve(path);
    if (path === '/') return current === resolved;
    return current === resolved || current.startsWith(resolved + '/');
  }

  // Build prefixes via a sentinel param, then strip it — empty params throw at runtime.
  const stockPrefix   = $derived(resolve('/stock/[ticker]', { ticker: '_' }).slice(0, -1));
  const bonusHome     = $derived(resolve('/bonus'));
  const bonusPrefix   = $derived(bonusHome + '/');
  const isStockDetail = $derived(page.url.pathname.startsWith(stockPrefix));
  const isBonusDetail = $derived(
    page.url.pathname.startsWith(bonusPrefix) && page.url.pathname !== bonusHome,
  );
  const isDetailPage  = $derived(isStockDetail || isBonusDetail);
  const backHref      = $derived(isBonusDetail ? resolve('/bonus') : resolve('/'));
  const backLabel     = $derived(isBonusDetail ? '← Bonus' : '← Portfolio');
</script>

<nav class="app-nav" aria-label="Navigatie">
  {#if isDetailPage}
    <a href={backHref} class="nav-btn back-btn">{backLabel}</a>
  {/if}
  {#each tabs as tab}
    <a href={resolve(tab.path)} class="nav-btn" class:active={isActive(tab.path)}>
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
