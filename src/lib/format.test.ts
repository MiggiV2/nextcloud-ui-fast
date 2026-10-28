import { describe, expect, it } from 'vitest';
import { formatRelative } from './format';

const now = new Date(2026, 9, 28, 14, 0).getTime();
const ago = (ms: number) => now - ms;
const MIN = 60_000;

describe('formatRelative', () => {
  it('uses relative wording for recent changes', () => {
    expect(formatRelative(ago(20_000), now)).toBe('gerade eben');
    expect(formatRelative(ago(5 * MIN), now)).toBe('vor 5 Min.');
    expect(formatRelative(ago(3 * 60 * MIN), now)).toBe('vor 3 Std.');
    expect(formatRelative(new Date(2026, 9, 27, 22, 32).getTime(), now)).toBe('gestern');
    expect(formatRelative(new Date(2026, 9, 24, 9, 0).getTime(), now)).toBe('vor 4 Tagen');
  });

  it('falls back to the date for older changes', () => {
    expect(formatRelative(new Date(2026, 6, 5, 13, 21).getTime(), now)).toBe('05.07.2026');
  });

  it('returns an empty string for unknown dates', () => {
    expect(formatRelative(0, now)).toBe('');
  });
});
