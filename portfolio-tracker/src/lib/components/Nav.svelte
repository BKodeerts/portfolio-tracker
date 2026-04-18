<script lang="ts">
  import { page } from '$app/stores';

  const tabs = [
    { path: '/',            label: 'Portfolio' },
    { path: '/analysis',    label: 'Analysis' },
    { path: '/intraday',    label: 'Intraday' },
    { path: '/transactions', label: 'Transactions' },
    { path: '/bonus',       label: 'Bonus' },
  ];

  function isActive(path: string): boolean {
    if (path === '/') return $page.url.pathname === '/';
    return $page.url.pathname.startsWith(path);
  }
</script>

<nav class="app-nav" aria-label="Navigation">
  {#each tabs as tab}
    <a href={tab.path} class="nav-btn" class:active={isActive(tab.path)}>
      {tab.label}
    </a>
  {/each}
</nav>
