<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { ECharts, EChartsOption } from 'echarts';

  interface Props {
    option: EChartsOption;
    height?: string;
    class?: string;
  }

  let { option, height = '300px', class: cls = '' }: Props = $props();

  let container: HTMLDivElement;
  let chart = $state<ECharts | null>(null);
  let ro: ResizeObserver | null = null;
  let disposed = false;

  onMount(() => {
    import('echarts').then((echarts) => {
      if (disposed) return;
      chart = echarts.init(container, null, { renderer: 'canvas' });
      ro = new ResizeObserver(() => chart?.resize());
      ro.observe(container);
    });
  });

  $effect(() => {
    if (chart) {
      chart.setOption(option, { notMerge: true });
    }
  });

  onDestroy(() => {
    disposed = true;
    ro?.disconnect();
    ro = null;
    chart?.dispose();
    chart = null;
  });
</script>

<div bind:this={container} class={cls} style="width:100%; height:{height}"></div>
