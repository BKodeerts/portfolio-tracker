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
  let chart: ECharts | null = null;

  onMount(() => {
    let ro: ResizeObserver;
    import('echarts').then((echarts) => {
      chart = echarts.init(container, null, { renderer: 'canvas' });
      chart.setOption(option);
      ro = new ResizeObserver(() => chart?.resize());
      ro.observe(container);
    });
    return () => ro?.disconnect();
  });

  $effect(() => {
    if (chart) {
      chart.setOption(option, { notMerge: false, lazyUpdate: true });
    }
  });

  onDestroy(() => {
    chart?.dispose();
    chart = null;
  });
</script>

<div bind:this={container} class={cls} style="width:100%; height:{height}"></div>
