<script lang="ts" module>
  import type { IconName } from './Icon.svelte';

  export interface MenuItem {
    label: string;
    icon: IconName;
    run: () => void;
    danger?: boolean;
  }
</script>

<script lang="ts">
  import Icon from './Icon.svelte';

  let { items }: { items: MenuItem[] } = $props();

  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();

  function place(event: ToggleEvent) {
    if (event.newState !== 'open' || !trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const below = rect.bottom + 4 + height <= innerHeight;
    menu.style.left = `${Math.max(8, Math.min(rect.right - width, innerWidth - width - 8))}px`;
    menu.style.top = `${below ? rect.bottom + 4 : rect.top - height - 4}px`;
  }

  function choose(item: MenuItem) {
    menu?.hidePopover();
    item.run();
  }
</script>

<button bind:this={trigger} class="ghost icon" aria-label="Aktionen" onclick={() => menu?.togglePopover()}>
  <Icon name="more" size={18} />
</button>
<div bind:this={menu} class="menu" popover="auto" ontoggle={place}>
  {#each items as item (item.label)}
    <button class="ghost" class:danger={item.danger} onclick={() => choose(item)}>
      <Icon name={item.icon} size={16} />{item.label}
    </button>
  {/each}
</div>

<style>
  .menu {
    position: fixed;
    inset: auto;
    margin: 0;
    min-width: 180px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--fg);
    box-shadow: var(--shadow-lg);
  }

  .menu button {
    width: 100%;
    justify-content: flex-start;
    height: 36px;
  }
</style>
