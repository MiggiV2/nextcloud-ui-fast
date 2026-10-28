import { describe, expect, it } from 'vitest';
import { fixture } from '../../../test/fixtures';
import { parseObjects } from '../dav/parsers';
import { buildEventIcs, expandEvents, updateEventIcs } from './events';

const objects = parseObjects(fixture('events-range.xml'));
const rangeStart = new Date('2026-11-01T00:00:00Z');
const rangeEnd = new Date('2026-12-01T00:00:00Z');
const occurrences = expandEvents(objects, rangeStart, rangeEnd);
const bySummary = (s: string) => occurrences.filter((o) => o.summary === s);

describe('expandEvents', () => {
  it('converts TZID times to UTC instants', () => {
    // then
    expect(bySummary('Termin 1')[0].start.toISOString()).toBe('2026-11-13T19:00:00.000Z');
    expect(bySummary('Termin 1')[0].end.toISOString()).toBe('2026-11-13T22:59:00.000Z');
  });

  it('handles non-European zones and UTC times', () => {
    expect(bySummary('Termin 5')[0].start.toISOString()).toBe('2026-11-27T19:00:00.000Z');
    expect(bySummary('Termin 10 💪')[0].start.toISOString()).toBe('2026-11-04T12:00:00.000Z');
  });

  it('includes events overlapping the range start', () => {
    expect(bySummary('Termin 3')).toHaveLength(1);
  });

  it('expands weekly recurrences and honours EXDATE', () => {
    // when
    const starts = bySummary('Termin 6').map((o) => o.start.toISOString());

    // then
    expect(starts).toEqual(['2026-11-06T18:00:00.000Z', '2026-11-20T18:00:00.000Z']);
    expect(bySummary('Termin 6')[0].recurring).toBe(true);
  });

  it('expands recurrences with overrides outside the range', () => {
    // when
    const starts = bySummary('Termin 11').map((o) => o.start.toISOString());

    // then
    expect(starts).toEqual([
      '2026-11-07T17:00:00.000Z',
      '2026-11-14T17:00:00.000Z',
      '2026-11-21T17:00:00.000Z',
      '2026-11-28T17:00:00.000Z',
    ]);
  });

  it('applies RECURRENCE-ID overrides that move an occurrence', () => {
    // given
    const april = expandEvents(objects, new Date('2025-04-01T00:00:00Z'), new Date('2025-05-01T00:00:00Z'));

    // when
    const starts = april.filter((o) => o.summary === 'Termin 11').map((o) => o.start.toISOString());

    // then
    expect(starts).toContain('2025-04-13T16:00:00.000Z');
    expect(starts).not.toContain('2025-04-12T16:00:00.000Z');
  });

  it('returns occurrences sorted by start with unique keys', () => {
    // then
    const times = occurrences.map((o) => o.start.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(occurrences.map((o) => o.key)).size).toBe(occurrences.length);
  });

  it('unescapes text values', () => {
    // when
    const first = bySummary('Termin 1')[0];

    // then
    expect(first.description).toBe('Beispielnotiz, Zeile 1\nZeile 2');
    expect(first.location).toBe('Beispielort 1, 12345 Musterstadt');
  });

  it('skips unparsable objects instead of failing the whole range', () => {
    // when
    const result = expandEvents([{ href: '/x.ics', etag: 'e', data: 'garbage' }], rangeStart, rangeEnd);

    // then
    expect(result).toEqual([]);
  });
});

describe('buildEventIcs', () => {
  it('creates a parsable VEVENT that round-trips through expandEvents', () => {
    // given
    const ics = buildEventIcs({
      uid: 'test-uid',
      summary: 'Neu, mit Komma',
      location: '',
      description: 'Zeile 1\nZeile 2',
      start: new Date('2026-11-10T09:00:00Z'),
      end: new Date('2026-11-10T10:00:00Z'),
      allDay: false,
    });

    // when
    const [occ] = expandEvents([{ href: '/n.ics', etag: '', data: ics }], rangeStart, rangeEnd);

    // then
    expect(occ.uid).toBe('test-uid');
    expect(occ.summary).toBe('Neu, mit Komma');
    expect(occ.description).toBe('Zeile 1\nZeile 2');
    expect(occ.start.toISOString()).toBe('2026-11-10T09:00:00.000Z');
  });

  it('writes all-day events as DATE values', () => {
    // given
    const ics = buildEventIcs({
      uid: 'allday',
      summary: 'Ganztag',
      location: '',
      description: '',
      start: new Date(2026, 10, 10),
      end: new Date(2026, 10, 11),
      allDay: true,
    });

    // then
    expect(ics).toContain('DTSTART;VALUE=DATE:20261110');
    expect(ics).toContain('DTEND;VALUE=DATE:20261111');
  });
});

describe('updateEventIcs', () => {
  it('changes summary and time of the master event while keeping other components', () => {
    // given
    const original = objects.find((o) => o.data.includes('Termin 2'))!;

    // when
    const updated = updateEventIcs(original.data, {
      summary: 'Umbenannt',
      location: 'Irgendwo',
      description: '',
      start: new Date('2026-11-21T18:00:00Z'),
      end: new Date('2026-11-21T20:00:00Z'),
      allDay: false,
    });
    const [occ] = expandEvents([{ href: original.href, etag: '', data: updated }], rangeStart, rangeEnd);

    // then
    expect(occ.summary).toBe('Umbenannt');
    expect(occ.location).toBe('Irgendwo');
    expect(occ.start.toISOString()).toBe('2026-11-21T18:00:00.000Z');
    expect(updated).toContain('BEGIN:VTIMEZONE');
    expect(updated).toMatch(/SEQUENCE:4/);
  });
});
