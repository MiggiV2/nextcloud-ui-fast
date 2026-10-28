<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from './lib/api';
  import { router } from './lib/router.svelte';
  import type { Principal } from './lib/dav/parsers';
  import Files from './views/Files.svelte';
  import Calendar from './views/Calendar.svelte';
  import Contacts from './views/Contacts.svelte';

  let principal = $state<Principal | null>(null);
  let loggedOut = $state(false);
  let error = $state('');

  onMount(() => {
    api
      .bootstrap()
      .then((p) => (principal = p))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) loggedOut = true;
        else error = String(e.message ?? e);
      });
  });

  const loginUrl = `/login?redirect_url=${encodeURIComponent(import.meta.env.BASE_URL)}`;
  const tabs = [
    { view: 'files', label: 'Dateien', hash: '#/files' },
    { view: 'calendar', label: 'Kalender', hash: '#/calendar' },
    { view: 'contacts', label: 'Kontakte', hash: '#/contacts' },
  ] as const;
</script>

<div class="shell">
  <nav>
    {#each tabs as tab (tab.view)}
      <a href={tab.hash} class:active={router.route.view === tab.view}>{tab.label}</a>
    {/each}
    <span class="spacer"></span>
    {#if principal}<span class="muted">{principal.displayName}</span>{/if}
  </nav>

  <main>
    {#if loggedOut}
      <div class="notice">Nicht angemeldet. <a href={loginUrl}>Bei Nextcloud anmelden</a></div>
    {:else if error}
      <div class="notice">Fehler: {error}</div>
    {:else if principal}
      {#if router.route.view === 'files'}
        <Files {principal} path={router.route.path} />
      {:else if router.route.view === 'calendar'}
        <Calendar date={router.route.date} mode={router.route.mode} />
      {:else}
        <Contacts selected={router.route.href} />
      {/if}
    {/if}
  </main>
</div>

<style>
  .shell {
    display: grid;
    grid-template-rows: auto 1fr;
    height: 100%;
  }

  nav {
    display: flex;
    gap: 4px;
    align-items: center;
    padding: 6px 12px;
    background: var(--bg-alt);
    border-bottom: 1px solid var(--border);
  }

  nav a {
    padding: 6px 12px;
    border-radius: var(--radius);
    color: var(--fg);
  }

  nav a.active {
    background: var(--accent);
    color: var(--accent-fg);
  }

  main {
    min-height: 0;
    overflow: hidden;
  }

  .notice {
    padding: 24px;
  }
</style>
