<script lang="ts">
  import type { DavFile } from '../lib/dav/parsers';
  import { fileKind } from '../lib/files';
  import Icon from './Icon.svelte';

  let { file }: { file: DavFile } = $props();

  const kind = $derived(fileKind(file));
  const thumbnail = $derived(
    file.hasPreview && (kind === 'image' || kind === 'pdf' || kind === 'video')
      ? `/index.php/core/preview?fileId=${file.fileId}&x=64&y=64&a=1`
      : null,
  );
  let failed = $state(false);
</script>

<span class="tile" style:--kind="var(--kind-{kind})">
  {#if thumbnail && !failed}
    <img src={thumbnail} alt="" loading="lazy" decoding="async" onerror={() => (failed = true)} />
  {:else}
    <Icon name={kind} size={18} />
  {/if}
</span>

<style>
  .tile {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    color: var(--kind);
    background: color-mix(in srgb, var(--kind) 14%, transparent);
    overflow: hidden;
    flex-shrink: 0;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
