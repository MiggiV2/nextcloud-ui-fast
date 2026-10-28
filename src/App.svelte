<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from './lib/api';
  import { router } from './lib/router.svelte';
  import type { Principal } from './lib/dav/parsers';
  import Icon, { type IconName } from './components/Icon.svelte';
  import Files from './views/Files.svelte';
  import Editor from './views/Editor.svelte';
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
  const tabs: { view: string; label: string; hash: string; icon: IconName }[] = [
    { view: 'files', label: 'Dateien', hash: '#/files', icon: 'folder' },
    { view: 'calendar', label: 'Kalender', hash: '#/calendar', icon: 'calendar' },
    { view: 'contacts', label: 'Kontakte', hash: '#/contacts', icon: 'users' },
  ];
  const activeTab = $derived(router.route.view === 'edit' ? 'files' : router.route.view);
  const initials = $derived((principal?.displayName ?? '?').slice(0, 1).toUpperCase());
</script>

<div class="shell">
  <aside class="sidebar">
    <div class="brand">
      <span class="logo"><Icon name="cloud" size={20} /></span>
      <span>Cloud</span>
    </div>
    <nav>
      {#each tabs as tab (tab.view)}
        <a
          href={tab.hash}
          class:active={activeTab === tab.view}
          aria-current={activeTab === tab.view ? 'page' : undefined}
        >
          <Icon name={tab.icon} />
          <span>{tab.label}</span>
        </a>
      {/each}
    </nav>
    <span class="spacer"></span>
    {#if principal}
      <a class="classic" href="/apps/files/" title="Klassische Nextcloud-Oberfläche">
        <Icon name="external" size={16} />
        <span>Nextcloud</span>
      </a>
      <div class="user">
        <span class="avatar">{initials}</span>
        <span class="name">{principal.displayName}</span>
      </div>
    {/if}
  </aside>

  <main>
    {#if loggedOut}
      <div class="notice card">
        <Icon name="cloud" size={32} />
        <h2>Nicht angemeldet</h2>
        <p class="muted">Melde dich bei Nextcloud an, danach geht es hier weiter.</p>
        <a class="login" href={loginUrl}>Bei Nextcloud anmelden</a>
      </div>
    {:else if error}
      <div class="notice card">
        <Icon name="alert" size={32} />
        <h2>Verbindung fehlgeschlagen</h2>
        <p class="muted">{error}</p>
      </div>
    {:else if principal}
      {#if router.route.view === 'files'}
        <Files {principal} path={router.route.path} />
      {:else if router.route.view === 'edit'}
        <Editor {principal} path={router.route.path} />
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
    grid-template-columns: 220px 1fr;
    height: 100%;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px 12px;
    background: var(--sidebar);
    border-right: 1px solid var(--border);
    min-height: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 10px 16px;
    font-weight: 600;
    font-size: 16px;
  }

  .logo {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 9px;
    background: var(--accent);
    color: var(--accent-fg);
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  nav a,
  .classic {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: var(--radius);
    color: var(--muted);
    font-weight: 500;
  }

  nav a:hover,
  .classic:hover {
    background: var(--hover);
    color: var(--fg);
  }

  nav a.active {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .classic {
    font-size: 13px;
    font-weight: 400;
  }

  .user {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-top: 1px solid var(--border);
    margin-top: 6px;
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--fg);
    font-size: 12px;
    font-weight: 600;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  main {
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  .notice {
    max-width: 420px;
    margin: 15vh auto 0;
    padding: 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 6px;
    color: var(--muted);
  }

  .notice h2 {
    margin: 8px 0 0;
    color: var(--fg);
    font-size: 18px;
  }

  .login {
    margin-top: 12px;
    padding: 8px 16px;
    border-radius: var(--radius);
    background: var(--accent);
    color: var(--accent-fg);
    font-weight: 500;
  }

  @media (max-width: 760px) {
    .shell {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr auto;
    }

    main {
      grid-row: 1;
    }

    .sidebar {
      grid-row: 2;
      flex-direction: row;
      padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
      border-right: 0;
      border-top: 1px solid var(--border);
    }

    .brand,
    .spacer,
    .classic,
    .user {
      display: none;
    }

    nav {
      flex: 1;
      flex-direction: row;
      justify-content: space-around;
    }

    nav a {
      flex-direction: column;
      gap: 2px;
      padding: 6px 12px;
      font-size: 11px;
    }
  }
</style>
