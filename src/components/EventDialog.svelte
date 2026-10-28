<script lang="ts" module>
  import type { EventFields } from '../lib/ical/events';

  export interface Draft extends EventFields {
    href: string | null;
    collection: string;
    recurring: boolean;
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { api } from '../lib/api';
  import type { CollectionRow } from '../lib/db';
  import { isoDate } from '../lib/route';
  import { addDays } from '../lib/calendar-grid';

  let { draft, calendars, onclose }: { draft: Draft; calendars: CollectionRow[]; onclose: () => void } = $props();

  const pad = (n: number) => String(n).padStart(2, '0');
  const toLocal = (d: Date) => `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fromLocal = (s: string) => new Date(s);
  const fromDate = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const initial = untrack(() => $state.snapshot(draft));
  let summary = $state(initial.summary);
  let location = $state(initial.location);
  let description = $state(initial.description);
  let allDay = $state(initial.allDay);
  let collection = $state(initial.collection);
  let start = $state(initial.allDay ? isoDate(initial.start) : toLocal(initial.start));
  let end = $state(initial.allDay ? isoDate(addDays(initial.end, -1)) : toLocal(initial.end));
  let busy = $state(false);
  let error = $state('');

  const writable = $derived(calendars.filter((c) => !c.readOnly));
  const readOnly = $derived(initial.recurring || !!calendars.find((c) => c.href === initial.collection)?.readOnly);

  function toggleAllDay() {
    if (allDay) {
      start = start.slice(0, 10);
      end = end.slice(0, 10);
    } else {
      start = `${start}T09:00`;
      end = `${end}T10:00`;
    }
  }

  function fields(): EventFields {
    if (allDay) {
      const s = fromDate(start);
      const e = addDays(fromDate(end), 1);
      return { summary, location, description, allDay, start: s, end: e > s ? e : addDays(s, 1) };
    }
    const s = fromLocal(start);
    const e = fromLocal(end);
    return { summary, location, description, allDay, start: s, end: e > s ? e : new Date(s.getTime() + 3_600_000) };
  }

  async function act(action: () => Promise<unknown>) {
    busy = true;
    error = '';
    try {
      const pending = action();
      onclose();
      await pending;
    } catch (e) {
      error = (e as Error).message;
      alert(`Speichern fehlgeschlagen: ${error}`);
    } finally {
      busy = false;
    }
  }

  const save = () => act(() => api.saveEvent(collection, initial.href, fields()));
  const remove = () => confirm('Termin löschen?') && act(() => api.deleteEvent(initial.href!));
</script>

<div class="backdrop" role="presentation" onclick={onclose}></div>
<form
  class="dialog"
  onsubmit={(e) => {
    e.preventDefault();
    save();
  }}
>
  <h2>{initial.href ? (readOnly ? 'Termin' : 'Termin bearbeiten') : 'Neuer Termin'}</h2>
  {#if initial.recurring}
    <p class="muted">Wiederkehrender Termin – Bearbeiten von Serien folgt in v2.</p>
  {/if}
  <fieldset disabled={readOnly || busy}>
    <input placeholder="Titel" bind:value={summary} required />
    <label><input type="checkbox" bind:checked={allDay} onchange={toggleAllDay} /> Ganztägig</label>
    <div class="row">
      {#if allDay}
        <input type="date" bind:value={start} required />
        <input type="date" bind:value={end} required />
      {:else}
        <input type="datetime-local" bind:value={start} required />
        <input type="datetime-local" bind:value={end} required />
      {/if}
    </div>
    <input placeholder="Ort" bind:value={location} />
    <textarea placeholder="Beschreibung" rows="4" bind:value={description}></textarea>
    {#if !initial.href}
      <select bind:value={collection}>
        {#each writable as c (c.href)}<option value={c.href}>{c.displayName}</option>{/each}
      </select>
    {/if}
  </fieldset>
  <div class="row buttons">
    {#if initial.href && !readOnly}<button type="button" class="danger" onclick={remove}>Löschen</button>{/if}
    <span class="spacer"></span>
    <button type="button" onclick={onclose}>{readOnly ? 'Schließen' : 'Abbrechen'}</button>
    {#if !readOnly}<button class="primary" type="submit" disabled={busy}>Speichern</button>{/if}
  </div>
</form>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.35);
    z-index: 10;
  }

  .dialog {
    position: fixed;
    z-index: 11;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(480px, calc(100vw - 32px));
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  h2 {
    margin: 0;
    font-size: 16px;
  }

  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .row {
    display: flex;
    gap: 8px;
  }

  .row > input {
    flex: 1;
    min-width: 0;
  }

  .buttons {
    align-items: center;
  }
</style>
