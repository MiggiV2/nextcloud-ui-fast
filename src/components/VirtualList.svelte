<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';

  let {
    items,
    rowHeight,
    key,
    row,
  }: { items: T[]; rowHeight: number; key: (item: T) => string; row: Snippet<[T, number]> } = $props();

  const overscan = 10;
  let scrollTop = $state(0);
  let height = $state(0);
  let first = $derived(Math.max(0, Math.floor(scrollTop / rowHeight) - overscan));
  let last = $derived(Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + overscan));
  let visible = $derived(items.slice(first, last));
</script>

<div class="viewport" bind:clientHeight={height} onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}>
  <div class="canvas" style:height="{items.length * rowHeight}px">
    {#each visible as item, i (key(item))}
      <div class="row" style:height="{rowHeight}px" style:transform="translateY({(first + i) * rowHeight}px)">
        {@render row(item, first + i)}
      </div>
    {/each}
  </div>
</div>

<style>
  .viewport {
    height: 100%;
    overflow-y: auto;
    contain: strict;
  }

  .canvas {
    position: relative;
  }

  .row {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
  }
</style>
