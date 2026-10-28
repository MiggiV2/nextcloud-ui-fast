<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { db, type CollectionRow } from '../lib/db';
  import type { ContactEdit } from '../lib/ical/vcard';
  import { live } from '../lib/live.svelte';
  import { contactHash } from '../lib/route';
  import type { ContactEntry } from '../lib/worker/protocol';
  import VirtualList from '../components/VirtualList.svelte';
  import ContactForm from '../components/ContactForm.svelte';
  import Icon from '../components/Icon.svelte';

  let { selected }: { selected?: string } = $props();

  const books = live(
    () => null,
    () => db.collections.where('kind').equals('addressbook').toArray(),
    [] as CollectionRow[],
  );
  const revision = live(
    () => books.current.map((b) => b.href),
    (hrefs) => db.objects.where('collection').anyOf(hrefs).primaryKeys(),
    [] as string[],
  );

  let contacts = $state.raw<ContactEntry[]>([]);
  let query = $state('');
  let editing = $state<'new' | 'edit' | null>(null);
  let error = $state('');

  $effect(() => {
    void revision.current;
    api.contacts().then((c) => (contacts = c));
  });

  onMount(() => {
    api.syncAddressbooks().catch((e) => (error = e.message));
  });

  const normalized = $derived(query.trim().toLowerCase());
  const filtered = $derived(
    normalized
      ? contacts.filter((c) =>
          [c.fullName, c.org, ...c.emails.map((e) => e.value), ...c.phones.map((p) => p.value)].some((v) =>
            v.toLowerCase().includes(normalized),
          ),
        )
      : contacts,
  );
  const current = $derived(contacts.find((c) => c.href === selected));
  const writableBook = $derived(books.current.find((b) => !b.readOnly));
  const readOnly = $derived(!!books.current.find((b) => b.href === current?.collection)?.readOnly);

  const hue = (name: string) => [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);

  const empty: ContactEdit = { fullName: '', org: '', note: '', emails: [], phones: [] };

  function save(edit: ContactEdit) {
    const target = editing === 'new' ? null : current!.href;
    const book = editing === 'new' ? writableBook!.href : current!.collection;
    editing = null;
    api.saveContact(book, target, edit).catch((e) => (error = e.message));
  }

  function remove() {
    if (!current || !confirm(`„${current.fullName}“ löschen?`)) return;
    const href = current.href;
    location.hash = contactHash();
    api.deleteContact(href).catch((e) => (error = e.message));
  }
</script>

<section class="contacts">
  <div class="list card">
    <div class="toolbar">
      <input type="search" placeholder="Suchen…" bind:value={query} />
      {#if writableBook}<button onclick={() => (editing = 'new')}>+</button>{/if}
    </div>
    <div class="scroll">
      <VirtualList items={filtered} rowHeight={48} key={(c) => c.href}>
        {#snippet row(c: ContactEntry)}
          <a class="entry" class:active={c.href === selected} href={contactHash(c.href)}>
            <span class="avatar" style:--hue={hue(c.fullName)}>{(c.fullName || '?').slice(0, 1).toUpperCase()}</span>
            <span class="text">
              <span>{c.fullName || '(ohne Namen)'}</span>
              <span class="muted small">{c.emails[0]?.value ?? c.org}</span>
            </span>
          </a>
        {/snippet}
      </VirtualList>
    </div>
  </div>

  <div class="detail card">
    {#if error}<p class="error">{error} <button onclick={() => (error = '')}>×</button></p>{/if}
    {#if editing === 'new'}
      <h2>Neuer Kontakt</h2>
      <ContactForm initial={empty} onsave={save} oncancel={() => (editing = null)} />
    {:else if current && editing === 'edit'}
      <h2>{current.fullName} bearbeiten</h2>
      <ContactForm initial={current} onsave={save} oncancel={() => (editing = null)} />
    {:else if current}
      <div class="toolbar plain">
        <h2>{current.fullName}</h2>
        <span class="spacer"></span>
        {#if !readOnly}
          <button onclick={() => (editing = 'edit')}>Bearbeiten</button>
          <button class="danger" onclick={remove}>Löschen</button>
        {/if}
      </div>
      {#if current.org}<p>{current.org}</p>{/if}
      <dl>
        {#each current.emails as e (e.value)}<dt>{e.type}</dt>
          <dd><a href="mailto:{e.value}">{e.value}</a></dd>{/each}
        {#each current.phones as p (p.value)}<dt>{p.type}</dt>
          <dd><a href="tel:{p.value}">{p.value}</a></dd>{/each}
        {#each current.addresses as a (a)}<dt>Adresse</dt>
          <dd>{a}</dd>{/each}
      </dl>
      {#if current.note}<p class="note">{current.note}</p>{/if}
    {:else}
      <div class="empty">
        <span class="empty-icon"><Icon name="users" size={28} /></span>
        <strong>{contacts.length} Kontakte</strong>
        <span class="muted">Wähle links einen Kontakt aus oder lege einen neuen an.</span>
      </div>
    {/if}
  </div>
</section>

<style>
  .contacts {
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: 16px;
    height: 100%;
    padding: 20px;
  }

  .list {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .list input {
    flex: 1;
  }

  .scroll {
    flex: 1;
    min-height: 0;
  }

  .entry {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 100%;
    padding: 0 12px;
    color: var(--fg);
    border-bottom: 1px solid var(--border);
  }

  .entry:hover {
    background: var(--hover);
  }

  .entry.active {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: hsl(var(--hue) 55% 52%);
    color: #fff;
    font-weight: 600;
    flex-shrink: 0;
  }

  .text {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    white-space: nowrap;
  }

  .small {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .detail {
    padding: 16px 24px;
    overflow: auto;
  }

  .plain {
    border: 0;
    padding: 0;
  }

  h2 {
    margin: 0 0 8px;
    font-size: 18px;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 16px;
  }

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
  }

  .note {
    white-space: pre-wrap;
  }

  .empty {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-align: center;
  }

  .empty-icon {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 16px;
    color: var(--accent);
    background: var(--accent-soft);
    margin-bottom: 6px;
  }

  .error {
    color: var(--danger);
  }

  @media (max-width: 760px) {
    .contacts {
      padding: 12px;
      gap: 12px;
      grid-template-columns: 1fr;
      grid-template-rows: 45% 1fr;
    }
  }
</style>
