<script lang="ts">
  import { themeStore } from '$lib/stores/theme.svelte';

  interface Props {
    value: string;
    class?: string;
  }

  const { value, class: cls = '' }: Props = $props();
</script>

{#if themeStore.privacyMode}
  <span class={cls} style="filter:blur(7px);user-select:none" aria-hidden="true">●●●</span>
{:else}
  <span class={cls}>{value}</span>
{/if}
