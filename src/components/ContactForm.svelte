<script lang="ts">
  import { untrack } from 'svelte';
  import type { ContactEdit, TypedValue } from '../lib/ical/vcard';

  let {
    initial,
    onsave,
    oncancel,
  }: { initial: ContactEdit; onsave: (edit: ContactEdit) => void; oncancel: () => void } = $props();

  const start = untrack(() => $state.snapshot(initial));
  let fullName = $state(start.fullName);
  let org = $state(start.org);
  let note = $state(start.note);
  let emails = $state<TypedValue[]>(start.emails.length ? start.emails : [{ type: 'home', value: '' }]);
  let phones = $state<TypedValue[]>(start.phones.length ? start.phones : [{ type: 'cell', value: '' }]);

  const clean = (list: TypedValue[]) =>
    list.filter((v) => v.value.trim()).map((v) => ({ ...v, value: v.value.trim() }));
</script>

<form
  onsubmit={(e) => {
    e.preventDefault();
    onsave({ fullName: fullName.trim(), org: org.trim(), note, emails: clean(emails), phones: clean(phones) });
  }}
>
  <input placeholder="Name" bind:value={fullName} required />
  <input placeholder="Organisation" bind:value={org} />
  {#each [{ list: emails, label: 'E-Mail', types: ['home', 'work', 'other'], kind: 'email' }, { list: phones, label: 'Telefon', types: ['cell', 'home', 'work', 'other'], kind: 'tel' }] as group (group.kind)}
    <fieldset>
      <legend>{group.label}</legend>
      {#each group.list as entry, i (i)}
        <div class="row">
          <select bind:value={entry.type}>
            {#each group.types as t (t)}<option value={t}>{t}</option>{/each}
          </select>
          <input type={group.kind} bind:value={entry.value} />
          <button type="button" onclick={() => group.list.splice(i, 1)}>−</button>
        </div>
      {/each}
      <button type="button" onclick={() => group.list.push({ type: group.types[0], value: '' })}>+ {group.label}</button
      >
    </fieldset>
  {/each}
  <textarea placeholder="Notiz" rows="3" bind:value={note}></textarea>
  <div class="row">
    <span class="spacer"></span>
    <button type="button" onclick={oncancel}>Abbrechen</button>
    <button class="primary" type="submit">Speichern</button>
  </div>
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 520px;
  }

  fieldset {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
  }

  .row {
    display: flex;
    gap: 6px;
    width: 100%;
  }

  .row input {
    flex: 1;
    min-width: 0;
  }
</style>
