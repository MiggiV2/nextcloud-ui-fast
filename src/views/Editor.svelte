<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '../lib/api';
  import { db, type DocumentRow } from '../lib/db';
  import type { Principal } from '../lib/dav/parsers';
  import { live } from '../lib/live.svelte';
  import { renderMarkdown } from '../lib/markdown';
  import { filesHash, sabreEncode } from '../lib/route';
  import { setLeaveGuard } from '../lib/router.svelte';
  import Icon, { type IconName } from '../components/Icon.svelte';

  let { principal, path }: { principal: Principal; path: string } = $props();

  type Mode = 'edit' | 'split' | 'preview';
  type Status = 'loading' | 'idle' | 'saving' | 'saved' | 'error' | 'conflict' | 'remote-changed';
  const MODE_KEY = 'editor.mode';

  const segments = $derived(path.split('/').filter(Boolean));
  const name = $derived(segments.at(-1) ?? '');
  const folderPath = $derived(segments.slice(0, -1).join('/'));
  const root = $derived(`/remote.php/dav/files/${sabreEncode(principal.user)}/`);
  const href = $derived(root + segments.map(sabreEncode).join('/'));
  const folderHref = $derived(
    root +
      segments
        .slice(0, -1)
        .map((s) => sabreEncode(s) + '/')
        .join(''),
  );
  const isMarkdown = $derived(/\.(md|markdown)$/i.test(name));

  const cached = live(
    () => href,
    (h) => db.documents.get(h),
    undefined as DocumentRow | undefined,
  );

  let text = $state('');
  let savedText = $state('');
  let baseEtag = $state('');
  let loaded = $state(false);
  let status = $state<Status>('loading');
  let errorMessage = $state('');
  let mode = $state<Mode>(readMode());
  let previewHtml = $state('');
  let textarea = $state<HTMLTextAreaElement>();

  const dirty = $derived(loaded && text !== savedText);
  const effectiveMode = $derived<Mode>(isMarkdown ? mode : 'edit');

  function readMode(): Mode {
    try {
      const stored = localStorage.getItem(MODE_KEY) as Mode | null;
      if (stored) return stored;
    } catch {
      /* storage unavailable */
    }
    return matchMedia('(max-width: 760px)').matches ? 'edit' : 'split';
  }

  function setMode(next: Mode) {
    mode = next;
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }

  function adopt(doc: DocumentRow) {
    text = doc.text;
    savedText = doc.text;
    baseEtag = doc.etag;
    loaded = true;
  }

  $effect(() => {
    const doc = cached.current;
    if (doc && !loaded) {
      adopt(doc);
      status = 'idle';
    }
  });

  onMount(() => {
    api
      .openDocument(href)
      .then((doc) => {
        if (!loaded || !dirty) {
          adopt(doc);
          status = 'idle';
        } else if (doc.etag !== baseEtag) {
          status = 'remote-changed';
        }
      })
      .catch((e) => {
        if (!loaded) status = 'error';
        errorMessage = e.message;
      });

    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    addEventListener('beforeunload', beforeUnload);
    const releaseGuard = setLeaveGuard(() => !dirty || confirm('Ungespeicherte Änderungen verwerfen?'));
    return () => {
      removeEventListener('beforeunload', beforeUnload);
      releaseGuard();
    };
  });

  $effect(() => {
    if (effectiveMode === 'edit') return;
    const source = text;
    const base = folderHref;
    const timer = setTimeout(() => (previewHtml = renderMarkdown(source, base)), previewHtml ? 120 : 0);
    return () => clearTimeout(timer);
  });

  async function save() {
    if (!loaded || status === 'saving') return;
    const snapshot = text;
    status = 'saving';
    try {
      const doc = await api.saveDocument(href, snapshot, baseEtag);
      savedText = snapshot;
      baseEtag = doc.etag;
      status = 'saved';
    } catch (e) {
      if (e instanceof ApiError && e.status === 412) status = 'conflict';
      else {
        status = 'error';
        errorMessage = (e as Error).message;
      }
    }
  }

  function fail(e: unknown) {
    status = 'error';
    errorMessage = (e as Error).message;
  }

  async function loadRemote() {
    if (dirty && !confirm('Deine Änderungen gehen verloren. Server-Version laden?')) return;
    try {
      adopt(await api.openDocument(href, true));
      status = 'idle';
    } catch (e) {
      fail(e);
    }
  }

  async function overwrite() {
    const mine = text;
    try {
      const doc = await api.openDocument(href, true);
      baseEtag = doc.etag;
      savedText = doc.text;
      text = mine;
    } catch (e) {
      return fail(e);
    }
    await save();
  }

  function onKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  }

  function surround(before: string, after = before, placeholder = '') {
    if (!textarea) return;
    const { selectionStart: start, selectionEnd: end } = textarea;
    const selected = text.slice(start, end) || placeholder;
    text = text.slice(0, start) + before + selected + after + text.slice(end);
    requestAnimationFrame(() => {
      textarea!.focus();
      textarea!.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function prefixLines(prefix: string) {
    if (!textarea) return;
    const { selectionStart: start, selectionEnd: end } = textarea;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const block = text.slice(lineStart, end);
    const replaced = block
      .split('\n')
      .map((line) => prefix + line)
      .join('\n');
    text = text.slice(0, lineStart) + replaced + text.slice(end);
    requestAnimationFrame(() => {
      textarea!.focus();
      textarea!.setSelectionRange(lineStart, lineStart + replaced.length);
    });
  }

  function onTextareaKeydown(event: KeyboardEvent) {
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      surround('  ', '');
    }
  }

  const tools: { icon: string; title: string; run: () => void }[] = [
    { icon: 'H', title: 'Überschrift', run: () => prefixLines('## ') },
    { icon: 'B', title: 'Fett', run: () => surround('**', '**', 'fett') },
    { icon: 'I', title: 'Kursiv', run: () => surround('_', '_', 'kursiv') },
    { icon: '•', title: 'Liste', run: () => prefixLines('- ') },
    { icon: '☐', title: 'Aufgabe', run: () => prefixLines('- [ ] ') },
    { icon: '</>', title: 'Code', run: () => surround('`', '`', 'code') },
    { icon: '🔗', title: 'Link', run: () => surround('[', '](https://)', 'Text') },
  ];

  const modes: { value: Mode; icon: IconName; label: string }[] = [
    { value: 'edit', icon: 'pencil', label: 'Bearbeiten' },
    { value: 'split', icon: 'columns', label: 'Geteilt' },
    { value: 'preview', icon: 'eye', label: 'Vorschau' },
  ];

  const statusText: Record<Status, string> = {
    loading: 'Lädt…',
    idle: 'Gespeichert',
    saving: 'Speichert…',
    saved: 'Gespeichert',
    error: 'Fehler',
    conflict: 'Konflikt',
    'remote-changed': 'Server-Version neuer',
  };
</script>

<svelte:window onkeydown={onKeydown} />

<section class="editor">
  <header>
    <a class="back" href={filesHash(folderPath)} title="Zurück zum Ordner"><Icon name="chevron-left" size={18} /></a>
    <div class="title">
      <h1 title={name}>{name}</h1>
      <span class="crumb muted">{folderPath || 'Home'}</span>
    </div>
    <span class="pill" class:dirty class:bad={status === 'error' || status === 'conflict'}>
      {dirty && status !== 'saving' && status !== 'conflict' ? 'Ungespeichert' : statusText[status]}
    </span>
    <span class="spacer"></span>
    {#if isMarkdown}
      <div class="segmented" role="group" aria-label="Ansicht">
        {#each modes as m (m.value)}
          <button
            class:active={mode === m.value}
            class:split={m.value === 'split'}
            onclick={() => setMode(m.value)}
            title={m.label}
          >
            <Icon name={m.icon} size={16} /><span class="label">{m.label}</span>
          </button>
        {/each}
      </div>
    {/if}
    <button class="primary" onclick={save} disabled={!dirty || status === 'saving'} title="Speichern (Strg+S)">
      <Icon name="save" size={16} /><span class="label">Speichern</span>
    </button>
  </header>

  {#if status === 'conflict' || status === 'remote-changed'}
    <div class="banner warning">
      <Icon name="alert" size={16} />
      <span>Die Datei wurde zwischenzeitlich anderswo geändert.</span>
      <span class="spacer"></span>
      <button onclick={loadRemote}>Server-Version laden</button>
      <button onclick={overwrite}>Meine Version speichern</button>
    </div>
  {:else if status === 'error'}
    <div class="banner"><Icon name="alert" size={16} />{errorMessage}</div>
  {/if}

  <div class="panes mode-{effectiveMode}">
    {#if effectiveMode !== 'preview'}
      <div class="pane write card">
        {#if isMarkdown}
          <div class="tools">
            {#each tools as tool (tool.title)}
              <button class="ghost tool" title={tool.title} onclick={tool.run}>{tool.icon}</button>
            {/each}
          </div>
        {/if}
        <textarea
          bind:this={textarea}
          bind:value={text}
          onkeydown={onTextareaKeydown}
          disabled={!loaded}
          spellcheck="true"
          placeholder={loaded ? 'Schreib los…' : 'Lädt…'}
          aria-label="Inhalt"
        ></textarea>
      </div>
    {/if}
    {#if effectiveMode !== 'edit'}
      <article class="pane preview card prose">
        {@html previewHtml}
      </article>
    {/if}
  </div>
</section>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding-bottom: 20px;
  }

  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 20px;
  }

  .back {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius);
    color: var(--fg);
    border: 1px solid var(--border);
    background: var(--surface);
  }

  .back:hover {
    background: var(--hover);
  }

  .title {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  h1 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .crumb {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pill {
    flex-shrink: 0;
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 999px;
    color: var(--success);
    background: color-mix(in srgb, var(--success) 12%, transparent);
  }

  .pill.dirty {
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 14%, transparent);
  }

  .pill.bad {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
  }

  .segmented {
    display: flex;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
  }

  .segmented button {
    height: 28px;
    border: 0;
    background: transparent;
    color: var(--muted);
  }

  .segmented button.active {
    background: var(--surface);
    color: var(--fg);
    box-shadow: var(--shadow);
  }

  .panes {
    flex: 1;
    min-height: 0;
    display: grid;
    gap: 16px;
    padding: 0 20px;
  }

  .panes.mode-split {
    grid-template-columns: 1fr 1fr;
  }

  .pane {
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tools {
    display: flex;
    gap: 2px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
  }

  .tool {
    min-width: 32px;
    justify-content: center;
    padding: 0 8px;
    font-weight: 600;
    color: var(--muted);
  }

  .tool:hover {
    color: var(--fg);
  }

  textarea {
    flex: 1;
    resize: none;
    border: 0;
    border-radius: 0;
    padding: 18px 22px;
    background: transparent;
    font-family: var(--mono);
    font-size: 13.5px;
    line-height: 1.65;
    tab-size: 2;
  }

  textarea:focus {
    outline: none;
  }

  .preview {
    contain: paint;
    overflow-y: auto;
    padding: 18px 28px;
  }

  .mode-preview .preview {
    width: min(100%, 820px);
    justify-self: center;
  }

  .prose {
    font-size: 15px;
    line-height: 1.7;
  }

  .prose :global(h1),
  .prose :global(h2),
  .prose :global(h3) {
    line-height: 1.25;
    margin: 1.4em 0 0.5em;
    letter-spacing: -0.01em;
  }

  .prose :global(h1) {
    font-size: 1.75em;
    margin-top: 0.2em;
  }

  .prose :global(h2) {
    font-size: 1.35em;
    padding-bottom: 0.25em;
    border-bottom: 1px solid var(--border);
  }

  .prose :global(h3) {
    font-size: 1.12em;
  }

  .prose :global(p),
  .prose :global(ul),
  .prose :global(ol),
  .prose :global(blockquote),
  .prose :global(pre),
  .prose :global(table) {
    margin: 0 0 1em;
  }

  .prose :global(ul),
  .prose :global(ol) {
    padding-left: 1.4em;
  }

  .prose :global(li:has(> input[type='checkbox'])) {
    list-style: none;
    margin-left: -1.3em;
  }

  .prose :global(input[type='checkbox']) {
    margin-right: 0.45em;
    accent-color: var(--accent);
  }

  .prose :global(code) {
    font-family: var(--mono);
    font-size: 0.88em;
    padding: 0.15em 0.35em;
    border-radius: 4px;
    background: var(--surface-2);
  }

  .prose :global(pre) {
    padding: 12px 14px;
    border-radius: var(--radius);
    background: var(--surface-2);
    overflow-x: auto;
  }

  .prose :global(pre code) {
    padding: 0;
    background: none;
  }

  .prose :global(blockquote) {
    padding: 2px 14px;
    border-left: 3px solid var(--accent);
    color: var(--muted);
  }

  .prose :global(table) {
    border-collapse: collapse;
    display: block;
    overflow-x: auto;
  }

  .prose :global(th),
  .prose :global(td) {
    border: 1px solid var(--border);
    padding: 6px 10px;
  }

  .prose :global(th) {
    background: var(--surface-2);
  }

  .prose :global(img) {
    max-width: 100%;
    border-radius: var(--radius);
  }

  .prose :global(hr) {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 1.5em 0;
  }

  @media (max-width: 760px) {
    header {
      padding: 12px;
      gap: 8px;
    }

    .panes {
      padding: 0 12px;
    }

    .panes.mode-split {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr 1fr;
    }

    .label,
    .segmented .split,
    .crumb {
      display: none;
    }

    .pill {
      width: 10px;
      height: 10px;
      padding: 0;
      font-size: 0;
      background: var(--success);
    }

    .pill.dirty {
      background: var(--warning);
    }

    .pill.bad {
      background: var(--danger);
    }

    textarea {
      padding: 14px;
    }

    .preview {
      padding: 14px 16px;
    }
  }
</style>
