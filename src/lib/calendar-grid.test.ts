import { describe, expect, it } from 'vitest';
import { layoutDay, monthGrid, shiftDate, weekDays } from './calendar-grid';

const d = (s: string) => new Date(s);

describe('monthGrid', () => {
  it('returns 6 full weeks starting on Monday', () => {
    // when
    const days = monthGrid(new Date(2026, 10, 15));

    // then
    expect(days).toHaveLength(42);
    expect(days[0]).toEqual(new Date(2026, 9, 26));
    expect(days[0].getDay()).toBe(1);
    expect(days[41]).toEqual(new Date(2026, 11, 6));
  });
});

describe('weekDays', () => {
  it('returns Monday to Sunday of the given date', () => {
    // when
    const days = weekDays(new Date(2026, 10, 1));

    // then
    expect(days[0]).toEqual(new Date(2026, 9, 26));
    expect(days[6]).toEqual(new Date(2026, 10, 1));
  });
});

describe('shiftDate', () => {
  it('moves by months and weeks', () => {
    expect(shiftDate(new Date(2026, 0, 31), 'month', 1)).toEqual(new Date(2026, 1, 1));
    expect(shiftDate(new Date(2026, 10, 4), 'week', -1)).toEqual(new Date(2026, 9, 28));
  });
});

describe('layoutDay', () => {
  it('places overlapping events in side-by-side columns', () => {
    // given
    const day = new Date(2026, 10, 4);
    const events = [
      { key: 'a', start: new Date(2026, 10, 4, 9), end: new Date(2026, 10, 4, 11) },
      { key: 'b', start: new Date(2026, 10, 4, 10), end: new Date(2026, 10, 4, 12) },
      { key: 'c', start: new Date(2026, 10, 4, 13), end: new Date(2026, 10, 4, 14) },
    ];

    // when
    const placed = layoutDay(events, day);

    // then
    expect(placed.map((p) => [p.item.key, p.column, p.columns])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 1],
    ]);
    expect(placed[0].top).toBeCloseTo(9 / 24);
    expect(placed[0].height).toBeCloseTo(2 / 24);
  });

  it('clips events spanning midnight to the visible day', () => {
    // given
    const events = [{ key: 'x', start: d('2026-10-31T16:00:00'), end: d('2026-11-01T06:00:00') }];

    // when
    const [placed] = layoutDay(events, new Date(2026, 10, 1));

    // then
    expect(placed.top).toBe(0);
    expect(placed.height).toBeCloseTo(6 / 24);
  });
});
