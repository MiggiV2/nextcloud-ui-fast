<script lang="ts">
  import { api, onUploadProgress } from '../lib/api';
  import { db } from '../lib/db';
  import type { DavFile, Principal } from '../lib/dav/parsers';
  import { formatDateTime, formatSize } from '../lib/format';
  import { live } from '../lib/live.svelte';
  import { filesHash, sabreEncode } from '../lib/route';
  import VirtualList from '../components/VirtualList.svelte';

  let { principal, path }: { principal: Principal; path: string } = $props();

  const segments = $derived(path.split('/').filter(Boolean));
  const root = $derived(`/remote.php/dav/files/${sabreEncode(principal.user)}/`);
  const href = $derived(root + segments.map((s) => sabreEncode(s) + '/').join(''));
  const listing = live(
    () => href,
    (h) => db.files.where('parent').equals(h).toArray(),
    [] as DavFile[],
  );
  const files = $derived(
    [...listing.current].sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, 'de')),
  );

  let syncing = $state(false);
  let error = $state('');
  let dragging = $state(false);
  let uploads = $state<Record<string, { name: string; sent: number; total: number }>>({});
  const prefetched = new Set<string>();

  $effect(() =>
    onUploadProgress((p) => {
      if (uploads[p.href]) uploads[p.href].sent = p.sent;
    }),
  );

  $effect(() => {
    const current = href;
    syncing = true;
    error = '';
    api
      .syncFolder(current)
      .then((r) => r.staleSubfolders.slice(0, 5).forEach((s) => api.prefetchFolder(s)))
      .catch((e) => (error = e.message))
      .finally(() => (syncing = false));
  });

  function prefetch(file: DavFile) {
    if (!file.isDir || prefetched.has(file.href)) return;
    prefetched.add(file.href);
    api.prefetchFolder(file.href).catch(() => prefetched.delete(file.href));
  }

  const childPath = (file: DavFile) => [...segments, file.name].join('/');
  const run = (p: Promise<unknown>) => p.catch((e) => (error = e.message));

  function rename(file: DavFile) {
    const name = prompt('Neuer Name', file.name)?.trim();
    if (!name || name === file.name) return;
    run(api.move(file.href, file.parent + sabreEncode(name) + (file.isDir ? '/' : '')));
  }

  function move(file: DavFile) {
    const target = prompt('Zielordner (relativ zum Home-Verzeichnis)', segments.join('/'));
    if (target === null || target === undefined) return;
    const folder =
      root +
      target
        .split('/')
        .filter(Boolean)
        .map((s) => sabreEncode(s) + '/')
        .join('');
    if (folder === file.parent) return;
    run(api.move(file.href, folder + sabreEncode(file.name) + (file.isDir ? '/' : '')));
  }

  function remove(file: DavFile) {
    if (confirm(`„${file.name}“ löschen?`)) run(api.remove(file.href));
  }

  function mkdir() {
    const name = prompt('Ordnername')?.trim();
    if (name) run(api.mkdir(href + sabreEncode(name) + '/'));
  }

  async function upload(list: FileList | null) {
    for (const file of Array.from(list ?? [])) {
      const target = href + sabreEncode(file.name);
      uploads[target] = { name: file.name, sent: 0, total: file.size };
      await run(api.upload(target, file));
      delete uploads[target];
    }
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    upload(event.dataTransfer?.files ?? null);
  }

  const preview = (file: DavFile) => `/index.php/core/preview?fileId=${file.fileId}&x=64&y=64&a=1`;
</script>

<section
  class="files"
  class:dragging
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={drop}
  aria-label="Dateien"
>
  <div class="toolbar">
    <nav class="crumbs">
      <a href={filesHash('')}>Home</a>
      {#each segments as segment, i (i)}
        / <a href={filesHash(segments.slice(0, i + 1).join('/'))}>{segment}</a>
      {/each}
    </nav>
    <span class="spacer"></span>
    {#if syncing}<span class="muted">synchronisiere…</span>{/if}
    <button onclick={mkdir}>Neuer Ordner</button>
    <label class="upload">
      Hochladen
      <input type="file" multiple onchange={(e) => upload(e.currentTarget.files)} />
    </label>
  </div>

  {#if error}<div class="error">{error} <button onclick={() => (error = '')}>×</button></div>{/if}
  {#each Object.entries(uploads) as [target, u] (target)}
    <div class="progress">{u.name}: {Math.round((u.sent / Math.max(u.total, 1)) * 100)} %</div>
  {/each}

  <div class="list">
    {#if files.length === 0 && !syncing}
      <p class="muted empty">Leerer Ordner</p>
    {/if}
    <VirtualList items={files} rowHeight={44} key={(f) => f.href}>
      {#snippet row(file: DavFile)}
        <div class="file" role="listitem" onmouseenter={() => prefetch(file)}>
          <span class="icon">
            {#if file.isDir}📁{:else if file.hasPreview}<img
                src={preview(file)}
                alt=""
                loading="lazy"
                decoding="async"
              />{:else}📄{/if}
          </span>
          {#if file.isDir}
            <a class="name" href={filesHash(childPath(file))}>{file.name}</a>
          {:else}
            <a class="name" href={file.href} download={file.name}>{file.name}</a>
          {/if}
          <span class="muted size">{formatSize(file.size)}</span>
          <span class="muted date">{formatDateTime(file.lastModified)}</span>
          <span class="actions">
            {#if file.permissions.includes('N')}<button onclick={() => rename(file)} title="Umbenennen">✎</button>{/if}
            {#if file.permissions.includes('V')}<button onclick={() => move(file)} title="Verschieben">⇄</button>{/if}
            {#if file.permissions.includes('D')}<button class="danger" onclick={() => remove(file)} title="Löschen"
                >🗑</button
              >{/if}
          </span>
        </div>
      {/snippet}
    </VirtualList>
  </div>
</section>

<style>
  .files {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .files.dragging {
    outline: 2px dashed var(--accent);
    outline-offset: -4px;
  }

  .crumbs {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .upload {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 4px 10px;
    cursor: pointer;
    background: var(--bg-alt);
  }

  .upload input {
    display: none;
  }

  .list {
    flex: 1;
    min-height: 0;
  }

  .empty {
    padding: 16px;
  }

  .file {
    display: grid;
    grid-template-columns: 32px 1fr 90px 150px auto;
    gap: 12px;
    align-items: center;
    height: 100%;
    padding: 0 12px;
    border-bottom: 1px solid var(--border);
  }

  .file:hover {
    background: var(--hover);
  }

  .icon {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    font-size: 20px;
  }

  .icon img {
    width: 32px;
    height: 32px;
    object-fit: cover;
    border-radius: 4px;
  }

  .name {
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .size {
    text-align: right;
  }

  .actions {
    display: flex;
    gap: 4px;
    opacity: 0;
  }

  .file:hover .actions,
  .file:focus-within .actions {
    opacity: 1;
  }

  .error,
  .progress {
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
  }

  .error {
    color: var(--danger);
  }

  @media (max-width: 640px) {
    .file {
      grid-template-columns: 32px 1fr auto;
    }

    .date,
    .size {
      display: none;
    }

    .actions {
      opacity: 1;
    }
  }
</style>
