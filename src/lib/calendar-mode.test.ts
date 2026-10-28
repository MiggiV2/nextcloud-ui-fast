import { describe, expect, it } from 'vitest';
import { readCalendarMode, saveCalendarMode } from './calendar-mode';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  } as Storage;
}

describe('calendar mode preference', () => {
  it('defaults to month when nothing is stored', () => {
    // given
    const storage = memoryStorage();
    // when
    const mode = readCalendarMode(storage);
    // then
    expect(mode).toBe('month');
  });

  it('returns the saved mode', () => {
    // given
    const storage = memoryStorage();
    // when
    saveCalendarMode('week', storage);
    // then
    expect(readCalendarMode(storage)).toBe('week');
  });

  it('ignores unknown stored values', () => {
    // given
    const storage = memoryStorage();
    storage.setItem('calendar.mode', 'year');
    // when
    const mode = readCalendarMode(storage);
    // then
    expect(mode).toBe('month');
  });

  it('falls back to month when storage throws', () => {
    // given
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    // when
    saveCalendarMode('week', storage);
    // then
    expect(readCalendarMode(storage)).toBe('month');
  });
});
