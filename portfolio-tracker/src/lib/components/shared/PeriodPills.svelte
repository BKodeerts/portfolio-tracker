<script lang="ts">
  /**
   * Generic pill row (period selector, Analysis dimension switcher).
   * Default: equal-flex row, 30px tall. Small: auto-width compact pills.
   */
  interface Props {
    options: { value: string; label: string }[];
    selected: string;
    onselect: (v: string) => void;
    size?: 'default' | 'small';
  }
  const { options, selected, onselect, size = 'default' }: Props = $props();
</script>

<div class="pills" class:small={size === 'small'} role="tablist">
  {#each options as opt (opt.value)}
    <button
      type="button"
      role="tab"
      class="pill-btn"
      class:on={selected === opt.value}
      aria-selected={selected === opt.value}
      onclick={() => onselect(opt.value)}
    >{opt.label}</button>
  {/each}
</div>

<style>
  .pills {
    display: flex;
    justify-content: space-between;
    gap: 2px;
  }
  .pill-btn {
    flex: 1;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    letter-spacing: -0.005em;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--fg-faint);
    cursor: pointer;
    transition: color 0.12s, background 0.12s;
  }
  .pill-btn.on {
    background: var(--pill-selected-bg);
    color: var(--fg);
    font-weight: 700;
  }
  .pill-btn:hover:not(.on) { color: var(--fg); }

  .pills.small {
    justify-content: flex-start;
    gap: 2px;
  }
  .pills.small .pill-btn {
    flex: 0 0 auto;
    height: auto;
    padding: 4px 10px;
    font-size: 11px;
  }
</style>
