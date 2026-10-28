import { describe, expect, it } from 'vitest';
import { filesHash, isoDate, parseHash, sabreEncode } from './route';

describe('parseHash', () => {
  it('defaults to the files root', () => {
    expect(parseHash('')).toEqual({ view: 'files', path: '' });
  });

  it('decodes nested file paths', () => {
    expect(parseHash('#/files/Notes/Areas%20of%20Responsibility')).toEqual({
      view: 'files',
      path: 'Notes/Areas of Responsibility',
    });
  });

  it('round-trips file paths with special characters', () => {
    const path = 'Notes/a b/ä#?.md';
    expect(parseHash(filesHash(path))).toEqual({ view: 'files', path });
  });

  it('parses calendar date and mode', () => {
    expect(parseHash('#/calendar/2026-11-04/week')).toEqual({ view: 'calendar', date: '2026-11-04', mode: 'week' });
    expect(parseHash('#/calendar/2026-11-04')).toMatchObject({ mode: 'month' });
  });

  it('defaults calendar date to today', () => {
    expect(parseHash('#/calendar')).toMatchObject({ view: 'calendar', date: isoDate(new Date()) });
  });

  it('parses selected contact href', () => {
    expect(parseHash('#/contacts/' + encodeURIComponent('/remote.php/dav/addressbooks/users/demo/a/x.vcf'))).toEqual({
      view: 'contacts',
      href: '/remote.php/dav/addressbooks/users/demo/a/x.vcf',
    });
  });
});

describe('sabreEncode', () => {
  it('encodes path segments exactly like Sabre so hrefs match server responses', () => {
    expect(sabreEncode("a b(1)!:@'*~.md")).toBe('a%20b(1)%21:@%27%2A~.md');
    expect(sabreEncode('Areas of Responsibility')).toBe('Areas%20of%20Responsibility');
    expect(sabreEncode('ä/x')).toBe('%C3%A4%2Fx');
  });
});
