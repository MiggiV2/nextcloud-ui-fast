<script lang="ts">
  import { api, onUploadProgress } from '../lib/api';
  import { db } from '../lib/db';
  import type { DavFile, Principal } from '../lib/dav/parsers';
  import { isEditable } from '../lib/files';
  import { formatDateTime, formatRelative, formatSize } from '../lib/format';
  import { live } from '../lib/live.svelte';
  import { editHash, filesHash, sabreEncode } from '../lib/route';
  import FileIcon from '../components/FileIcon.svelte';
  import RowMenu, { type MenuItem } from '../components/RowMenu.svelte';
  import Icon from '../components/Icon.svelte';
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
  const title = $derived(segments.at(-1) ?? 'Alle Dateien');

  let syncing = $state(false);
  let synced = $state(false);
  let error = $state('');
  let dragging = $state(false);
  let uploads = $state<Record<string, { name: string; sent: number; total: number }>>({});
  const prefetched = new Set<string>();
  const now = Date.now();

  $effect(() =>
    onUploadProgress((p) => {
      if (uploads[p.href]) uploads[p.href].sent = p.sent;
    }),
  );

  $effect(() => {
    const current = href;
    syncing = true;
    synced = false;
    error = '';
    api
      .syncFolder(current)
      .then((r) => r.staleSubfolders.slice(0, 5).forEach((s) => api.prefetchFolder(s)))
      .catch((e) => (error = e.message))
      .finally(() => {
        syncing = false;
        synced = true;
      });
  });

  function prefetch(file: DavFile) {
    if (!file.isDir || prefetched.has(file.href)) return;
    prefetched.add(file.href);
    api.prefetchFolder(file.href).catch(() => prefetched.delete(file.href));
  }

  const childPath = (file: DavFile) => [...segments, file.name].join('/');
  const run = (p: Promise<unknown>) => p.catch((e) => (error = e.message));

  function linkOf(file: DavFile) {
    if (file.isDir) return filesHash(childPath(file));
    if (isEditable(file)) return editHash(childPath(file));
    return file.href;
  }

  function download(file: DavFile) {
    const a = document.createElement('a');
    a.href = file.href;
    a.download = file.name;
    a.click();
  }

  function menuItems(file: DavFile): MenuItem[] {
    const items: MenuItem[] = [];
    if (!file.isDir) items.push({ label: 'Herunterladen', icon: 'download', run: () => download(file) });
    if (file.permissions.includes('N')) items.push({ label: 'Umbenennen', icon: 'pencil', run: () => rename(file) });
    if (file.permissions.includes('V')) items.push({ label: 'Verschieben', icon: 'move', run: () => move(file) });
    if (file.permissions.includes('D'))
      items.push({ label: 'Löschen', icon: 'trash', run: () => remove(file), danger: true });
    return items;
  }

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

  async function newNote() {
    let name = prompt('Name der Notiz', 'Neue Notiz.md')?.trim();
    if (!name) return;
    if (!/\.(md|markdown|txt)$/i.test(name)) name += '.md';
    const heading = name.replace(/\.(md|markdown|txt)$/i, '');
    try {
      await api.createDocument(href + sabreEncode(name), name.endsWith('.txt') ? '' : `# ${heading}\n\n`);
      location.hash = editHash([...segments, name].join('/'));
    } catch (e) {
      error = (e as Error).message;
    }
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
</script>

<section
  class="files"
  class:dragging
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={(e) => {
    if (e.currentTarget === e.target) dragging = false;
  }}
  ondrop={drop}
  aria-label="Dateien"
>
  <header>
    <nav class="crumbs" aria-label="Pfad">
      <a href={filesHash('')} title="Home"><Icon name="home" size={16} /></a>
      {#each segments as segment, i (i)}
        <Icon name="chevron" size={14} />
        <a href={filesHash(segments.slice(0, i + 1).join('/'))} class:current={i === segments.length - 1}>{segment}</a>
      {/each}
    </nav>
    <div class="titlebar">
      <h1>{title}</h1>
      {#if syncing}<span class="sync" title="Synchronisiere"><Icon name="refresh" size={14} /></span>{/if}
      <span class="spacer"></span>
      <button onclick={newNote}><Icon name="note-plus" size={16} /><span class="label">Neue Notiz</span></button>
      <button onclick={mkdir}><Icon name="folder-plus" size={16} /><span class="label">Neuer Ordner</span></button>
      <label class="upload">
        <Icon name="upload" size={16} /><span class="label">Hochladen</span>
        <input type="file" multiple onchange={(e) => upload(e.currentTarget.files)} />
      </label>
    </div>
  </header>

  {#if error}
    <div class="banner">
      <Icon name="alert" size={16} />{error}<span class="spacer"></span><button
        class="ghost icon"
        onclick={() => (error = '')}
        aria-label="Schließen"><Icon name="x" size={16} /></button
      >
    </div>
  {/if}
  {#each Object.entries(uploads) as [target, u] (target)}
    {@const percent = Math.round((u.sent / Math.max(u.total, 1)) * 100)}
    <div class="progress card">
      <Icon name="upload" size={16} /><span class="name">{u.name}</span>
      <span class="bar"><span style:width="{percent}%"></span></span><span class="muted">{percent} %</span>
    </div>
  {/each}

  <div class="list card">
    <div class="head" role="row">
      <span></span><span>Name</span><span class="size">Größe</span><span class="date">Geändert</span><span></span>
    </div>
    {#if files.length === 0}
      <div class="empty">
        {#if synced && !syncing}
          <span class="empty-icon"><Icon name="folder" size={28} /></span>
          <strong>Dieser Ordner ist leer</strong>
          <span class="muted">Dateien hierher ziehen oder „Hochladen“ wählen.</span>
        {/if}
      </div>
    {:else}
      <div class="rows">
        <VirtualList items={files} rowHeight={52} key={(f) => f.href}>
          {#snippet row(file: DavFile)}
            <div class="file" role="row" tabindex="-1" onmouseenter={() => prefetch(file)}>
              <FileIcon {file} />
              <a
                class="name"
                href={linkOf(file)}
                download={!file.isDir && !isEditable(file) ? file.name : undefined}
                title={file.name}>{file.name}</a
              >
              <span class="muted size">{file.isDir && !file.size ? '—' : formatSize(file.size)}</span>
              <span class="muted date" title={formatDateTime(file.lastModified)}
                >{formatRelative(file.lastModified, now)}</span
              >
              <span class="actions">
                {#if !file.isDir}
                  <a class="action" href={file.href} download={file.name} title="Herunterladen"
                    ><Icon name="download" size={16} /></a
                  >
                {/if}
                {#if file.permissions.includes('N')}
                  <button class="ghost icon" onclick={() => rename(file)} title="Umbenennen"
                    ><Icon name="pencil" size={16} /></button
                  >
                {/if}
                {#if file.permissions.includes('V')}
                  <button class="ghost icon" onclick={() => move(file)} title="Verschieben"
                    ><Icon name="move" size={16} /></button
                  >
                {/if}
                {#if file.permissions.includes('D')}
                  <button class="ghost icon danger" onclick={() => remove(file)} title="Löschen"
                    ><Icon name="trash" size={16} /></button
                  >
                {/if}
              </span>
              <span class="menu-slot"><RowMenu items={menuItems(file)} /></span>
            </div>
          {/snippet}
        </VirtualList>
      </div>
    {/if}
  </div>

  {#if dragging}
    <div class="dropzone"><Icon name="upload" size={32} /><span>Zum Hochladen loslassen</span></div>
  {/if}
</section>

<style>
  .files {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    padding-bottom: 20px;
  }

  header {
    padding: 18px 20px 14px;
  }

  .crumbs {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    color: var(--faint);
    font-size: 13px;
  }

  .crumbs a {
    display: flex;
    color: var(--muted);
    padding: 2px 4px;
    border-radius: 4px;
  }

  .crumbs a:hover {
    color: var(--fg);
    background: var(--hover);
  }

  .crumbs a.current {
    color: var(--fg);
  }

  .titlebar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
  }

  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sync {
    color: var(--muted);
    animation: spin 1.2s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .upload {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border-radius: var(--radius);
    background: var(--accent);
    color: var(--accent-fg);
    font-weight: 500;
    cursor: pointer;
  }

  .upload input {
    display: none;
  }

  .list {
    flex: 1;
    min-height: 0;
    margin: 0 20px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .head,
  .file {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 96px 120px 156px;
    gap: 14px;
    align-items: center;
    padding: 0 16px;
  }

  .head {
    height: 38px;
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
  }

  .rows {
    flex: 1;
    min-height: 0;
  }

  .file {
    height: 100%;
    border-bottom: 1px solid var(--border);
  }

  .file:hover {
    background: var(--hover);
  }

  .name {
    color: var(--fg);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name:hover {
    color: var(--accent);
  }

  .size {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .date {
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.12s;
  }

  .file:hover .actions,
  .file:focus-within .actions {
    opacity: 1;
  }

  .menu-slot {
    display: none;
  }

  .action {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius);
    color: var(--fg);
  }

  .action:hover {
    background: var(--surface-2);
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 48px 16px;
    text-align: center;
  }

  .empty-icon {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 16px;
    color: var(--kind-folder);
    background: color-mix(in srgb, var(--kind-folder) 14%, transparent);
    margin-bottom: 6px;
  }

  .progress {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 20px 10px;
    padding: 10px 14px;
  }

  .progress .name {
    max-width: 40%;
  }

  .bar {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.2s;
  }

  .dropzone {
    position: absolute;
    inset: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border: 2px dashed var(--accent);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--accent) 8%, var(--bg));
    color: var(--accent);
    font-weight: 500;
    pointer-events: none;
  }

  @media (max-width: 760px) {
    header {
      padding: 14px 12px 10px;
    }

    .list {
      margin: 0 12px;
    }

    .head {
      display: none;
    }

    .file {
      grid-template-columns: 34px minmax(0, 1fr) auto;
      padding: 0 12px;
    }

    .size,
    .date {
      display: none;
    }

    .actions {
      display: none;
    }

    .menu-slot {
      display: flex;
    }

    .label {
      display: none;
    }

    .titlebar button,
    .upload {
      width: 36px;
      padding: 0;
      justify-content: center;
    }
  }
</style>
