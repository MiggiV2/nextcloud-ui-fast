<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { addDays, layoutDay, monthGrid, shiftDate, startOfDay, visibleRange, weekDays } from '../lib/calendar-grid';
  import { db, type CollectionRow } from '../lib/db';
  import { formatTime } from '../lib/format';
  import { live } from '../lib/live.svelte';
  import { calendarHash, isoDate, parseIsoDate } from '../lib/route';
  import type { CalendarOccurrence } from '../lib/worker/protocol';
  import EventDialog, { type Draft } from '../components/EventDialog.svelte';

  let { date, mode }: { date: string; mode: 'month' | 'week' } = $props();

  const HIDDEN_KEY = 'calendar.hidden';
  const HOUR_PX = 48;

  const current = $derived(parseIsoDate(date));
  const calendars = live(
    () => null,
    () => db.collections.where('kind').equals('calendar').toArray(),
    [] as CollectionRow[],
  );
  let hidden = $state<string[]>(readHidden());
  const visibleHrefs = $derived(calendars.current.map((c) => c.href).filter((h) => !hidden.includes(h)));
  const colorOf = $derived(new Map(calendars.current.map((c) => [c.href, c.color ?? 'var(--accent)'])));
  const revision = live(
    () => visibleHrefs,
    (hrefs) => db.objects.where('collection').anyOf(hrefs).primaryKeys(),
    [] as string[],
  );

  let occurrences = $state.raw<CalendarOccurrence[]>([]);
  let draft = $state<Draft | null>(null);
  let syncError = $state('');
  const cache = new Map<string, Promise<CalendarOccurrence[]>>();
  let cacheRevision: unknown = null;

  function readHidden(): string[] {
    try {
      return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
    } catch {
      return [];
    }
  }

  function toggle(href: string) {
    hidden = hidden.includes(href) ? hidden.filter((h) => h !== href) : [...hidden, href];
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
    } catch {
      /* storage unavailable */
    }
  }

  function expand(anchor: Date, hrefs: string[]) {
    const [start, end] = visibleRange(anchor, mode);
    const key = `${mode}|${start.getTime()}|${hrefs.join(',')}`;
    if (!cache.has(key)) cache.set(key, api.expand(hrefs, start.getTime(), end.getTime()));
    return cache.get(key)!;
  }

  $effect(() => {
    const hrefs = visibleHrefs;
    const anchor = current;
    if (cacheRevision !== revision.current) {
      cache.clear();
      cacheRevision = revision.current;
    }
    let cancelled = false;
    expand(anchor, hrefs).then((o) => !cancelled && (occurrences = o));
    expand(shiftDate(anchor, mode, 1), hrefs);
    expand(shiftDate(anchor, mode, -1), hrefs);
    return () => (cancelled = true);
  });

  function sync() {
    api
      .syncCalendars()
      .then(() => (syncError = ''))
      .catch((e) => (syncError = e.message));
  }

  onMount(() => {
    sync();
    const timer = setInterval(() => document.visibilityState === 'visible' && sync(), 60_000);
    addEventListener('focus', sync);
    return () => {
      clearInterval(timer);
      removeEventListener('focus', sync);
    };
  });

  const days = $derived(mode === 'month' ? monthGrid(current) : weekDays(current));
  const today = isoDate(new Date());

  function onDay(day: Date) {
    const dayStart = startOfDay(day).getTime();
    const dayEnd = addDays(day, 1).getTime();
    return occurrences.filter(
      (o) => o.start.getTime() < dayEnd && Math.max(o.end.getTime(), o.start.getTime() + 1) > dayStart,
    );
  }

  const title = $derived(
    new Intl.DateTimeFormat(
      'de-DE',
      mode === 'month' ? { month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' },
    ).format(mode === 'month' ? current : days[0]) +
      (mode === 'week'
        ? ` – ${new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' }).format(days[6])}`
        : ''),
  );

  function open(o: CalendarOccurrence) {
    draft = { ...o, href: o.href, collection: o.collection, recurring: o.recurring };
  }

  function create(start: Date, allDay: boolean) {
    const writable =
      calendars.current.find((c) => !c.readOnly && !hidden.includes(c.href)) ??
      calendars.current.find((c) => !c.readOnly);
    if (!writable) return;
    draft = {
      href: null,
      collection: writable.href,
      recurring: false,
      summary: '',
      location: '',
      description: '',
      allDay,
      start,
      end: allDay ? addDays(start, 1) : new Date(start.getTime() + 3_600_000),
    };
  }

  function createAt(event: MouseEvent, day: Date) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const hour = Math.floor((event.clientY - rect.top) / HOUR_PX);
    const start = startOfDay(day);
    start.setHours(hour);
    create(start, false);
  }

  let scroller = $state<HTMLElement>();
  $effect(() => {
    if (mode === 'week' && scroller) scroller.scrollTop = 7 * HOUR_PX;
  });
</script>

<section class="calendar">
  <div class="toolbar">
    <button onclick={() => (location.hash = calendarHash(shiftDate(current, mode, -1), mode))}>‹</button>
    <button onclick={() => (location.hash = calendarHash(new Date(), mode))}>Heute</button>
    <button onclick={() => (location.hash = calendarHash(shiftDate(current, mode, 1), mode))}>›</button>
    <strong>{title}</strong>
    <span class="spacer"></span>
    {#if syncError}<span class="error">{syncError}</span>{/if}
    <button class:primary={mode === 'month'} onclick={() => (location.hash = calendarHash(current, 'month'))}
      >Monat</button
    >
    <button class:primary={mode === 'week'} onclick={() => (location.hash = calendarHash(current, 'week'))}
      >Woche</button
    >
    <button onclick={() => create(new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000), false)}>+ Termin</button>
  </div>

  <div class="body">
    <aside>
      {#each calendars.current as c (c.href)}
        <label>
          <input
            type="checkbox"
            checked={!hidden.includes(c.href)}
            onchange={() => toggle(c.href)}
            style:accent-color={c.color}
          />
          {c.displayName}
        </label>
      {/each}
    </aside>

    {#if mode === 'month'}
      <div class="month">
        {#each ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as name (name)}<div class="head">{name}</div>{/each}
        {#each days as day (day.getTime())}
          {@const list = onDay(day)}
          <div
            class="cell"
            class:other={day.getMonth() !== current.getMonth()}
            class:today={isoDate(day) === today}
            role="button"
            tabindex="-1"
            ondblclick={() => create(day, true)}
            onkeydown={() => {}}
          >
            <a class="daynum" href={calendarHash(day, 'week')}>{day.getDate()}</a>
            {#each list.slice(0, 4) as o (o.key)}
              <button class="chip" style:--c={colorOf.get(o.collection)} onclick={() => open(o)}>
                {#if !o.allDay}<span class="time">{formatTime(o.start)}</span>{/if}
                {o.summary || '(ohne Titel)'}
              </button>
            {/each}
            {#if list.length > 4}<a class="more" href={calendarHash(day, 'week')}>+{list.length - 4} weitere</a>{/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="week">
        <div class="week-head">
          <div></div>
          {#each days as day (day.getTime())}
            <div class="head" class:today={isoDate(day) === today}>
              {new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric' }).format(day)}
            </div>
          {/each}
          <div class="muted allday-label">ganzt.</div>
          {#each days as day (day.getTime())}
            <div class="allday">
              {#each onDay(day).filter((o) => o.allDay) as o (o.key)}
                <button class="chip" style:--c={colorOf.get(o.collection)} onclick={() => open(o)}>{o.summary}</button>
              {/each}
            </div>
          {/each}
        </div>
        <div class="week-body" bind:this={scroller}>
          <div class="hours">
            {#each Array.from({ length: 24 }, (_, h) => h) as h (h)}<div style:height="{HOUR_PX}px">{h}:00</div>{/each}
          </div>
          {#each days as day (day.getTime())}
            <div
              class="column"
              style:height="{24 * HOUR_PX}px"
              role="presentation"
              ondblclick={(e) => createAt(e, day)}
            >
              {#each layoutDay( onDay(day).filter((o) => !o.allDay), day ) as p (p.item.key)}
                <button
                  class="block"
                  style:--c={colorOf.get(p.item.collection)}
                  style:top="{p.top * 100}%"
                  style:height="{p.height * 100}%"
                  style:left="{(p.column / p.columns) * 100}%"
                  style:width="{100 / p.columns}%"
                  onclick={() => open(p.item)}
                  ondblclick={(e) => e.stopPropagation()}
                >
                  <span class="time">{formatTime(p.item.start)}</span>
                  {p.item.summary || '(ohne Titel)'}
                </button>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</section>

{#if draft}
  <EventDialog {draft} calendars={calendars.current} onclose={() => (draft = null)} />
{/if}

<style>
  .calendar {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 180px 1fr;
  }

  aside {
    padding: 12px;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: auto;
  }

  .error {
    color: var(--danger);
  }

  .month {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    grid-template-rows: auto repeat(6, minmax(0, 1fr));
    min-height: 0;
  }

  .head {
    padding: 6px;
    text-align: center;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
  }

  .head.today {
    color: var(--accent);
    font-weight: 600;
  }

  .cell {
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    padding: 2px 4px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
  }

  .cell.other {
    background: var(--bg-alt);
  }

  .daynum {
    color: var(--fg);
    font-size: 12px;
    align-self: flex-end;
    padding: 0 4px;
    border-radius: 10px;
  }

  .cell.today .daynum {
    background: var(--accent);
    color: var(--accent-fg);
  }

  .chip {
    all: unset;
    cursor: pointer;
    font-size: 12px;
    padding: 1px 4px;
    border-radius: 4px;
    border-left: 3px solid var(--c);
    background: color-mix(in srgb, var(--c) 15%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .time {
    color: var(--muted);
    margin-right: 4px;
  }

  .more {
    font-size: 12px;
  }

  .week {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .week-head,
  .week-body {
    display: grid;
    grid-template-columns: 48px repeat(7, minmax(0, 1fr));
  }

  .allday,
  .allday-label {
    border-bottom: 1px solid var(--border);
    padding: 2px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
  }

  .week-body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .hours div {
    font-size: 11px;
    color: var(--muted);
    text-align: right;
    padding-right: 4px;
    border-top: 1px solid var(--border);
  }

  .column {
    position: relative;
    border-left: 1px solid var(--border);
    background-image: repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px 48px);
  }

  .block {
    all: unset;
    position: absolute;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
    border-radius: 4px;
    border-left: 3px solid var(--c);
    background: color-mix(in srgb, var(--c) 22%, var(--bg));
    overflow: hidden;
    box-sizing: border-box;
  }

  @media (max-width: 760px) {
    .body {
      grid-template-columns: 1fr;
    }

    aside {
      display: none;
    }
  }
</style>
