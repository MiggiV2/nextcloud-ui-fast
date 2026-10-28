import { describe, expect, it } from 'vitest';
import { fixture } from '../../../test/fixtures';
import {
  parseAddressbooks,
  parseCalendars,
  parseDavError,
  parseFolder,
  parseObjects,
  parsePrincipal,
  parseSyncCollection,
} from './parsers';

describe('parsePrincipal', () => {
  it('extracts home sets and display name', () => {
    // when
    const principal = parsePrincipal(fixture('principal.xml'));

    // then
    expect(principal).toEqual({
      href: '/remote.php/dav/principals/users/demo/',
      user: 'demo',
      displayName: 'Demo User',
      calendarHome: '/remote.php/dav/calendars/demo/',
      addressbookHome: '/remote.php/dav/addressbooks/users/demo/',
    });
  });
});

describe('parseFolder', () => {
  const folder = parseFolder(fixture('files-notes.xml'));

  it('separates the folder itself from its children', () => {
    expect(folder.self.href).toBe('/remote.php/dav/files/demo/Notes/');
    expect(folder.self.isDir).toBe(true);
    expect(folder.self.etag).toBe('6ae1e56366d06');
    expect(folder.children).toHaveLength(7);
  });

  it('decodes names and reads 404-propstat fields as absent', () => {
    // when
    const areas = folder.children.find((f) => f.fileId === 206)!;

    // then
    expect(areas.name).toBe('Areas of Responsibility');
    expect(areas.isDir).toBe(true);
    expect(areas.contentType).toBeUndefined();
    expect(areas.size).toBe(3895368);
    expect(areas.permissions).toBe('RGDNVCK');
  });

  it('parses file metadata', () => {
    // when
    const home = folder.children.find((f) => f.name === 'Home.md')!;

    // then
    expect(home).toMatchObject({
      isDir: false,
      fileId: 958,
      size: 301,
      contentType: 'text/markdown',
      hasPreview: true,
      etag: '6abe5544e77cc',
      lastModified: Date.UTC(2026, 9, 1, 12, 42, 28),
    });
  });

  it('keeps empty files with size 0', () => {
    expect(folder.children.find((f) => f.name === 'Untitled.md')!.size).toBe(0);
  });
});

describe('parseCalendars', () => {
  it('lists only calendar collections with their sync metadata', () => {
    // when
    const calendars = parseCalendars(fixture('calendars.xml'));

    // then
    expect(calendars.map((c) => c.href)).toEqual([
      '/remote.php/dav/calendars/demo/contact_birthdays/',
      '/remote.php/dav/calendars/demo/personal/',
      '/remote.php/dav/calendars/demo/university/',
    ]);
    expect(calendars[1]).toEqual({
      href: '/remote.php/dav/calendars/demo/personal/',
      displayName: 'Persönlich',
      color: '#00679e',
      ctag: 'http://sabre.io/ns/sync/660',
      syncToken: 'http://sabre.io/ns/sync/660',
      components: ['VEVENT'],
      subscribed: false,
    });
  });

  it('marks webcal subscriptions which have a ctag but no sync-token', () => {
    // when
    const uni = parseCalendars(fixture('calendars.xml'))[2];

    // then
    expect(uni).toMatchObject({ displayName: 'Uni', ctag: '5043', syncToken: undefined, subscribed: true });
    expect(uni.components).toEqual(['VTODO', 'VEVENT']);
  });
});

describe('parseAddressbooks', () => {
  it('lists address books, falling back to the path segment as name', () => {
    // when
    const books = parseAddressbooks(fixture('addressbooks.xml'));

    // then
    expect(books).toEqual([
      { href: '/remote.php/dav/addressbooks/users/demo/importv2-1/', displayName: 'importv2-1', readOnly: false },
      {
        href: '/remote.php/dav/addressbooks/users/demo/z-server-generated--system/',
        displayName: 'z-server-generated--system',
        readOnly: false,
      },
      {
        href: '/remote.php/dav/addressbooks/users/demo/z-app-generated--contactsinteraction--recent/',
        displayName: 'Zuletzt kontaktiert',
        readOnly: true,
      },
    ]);
  });
});

describe('parseSyncCollection', () => {
  it('returns new sync token and changed members', () => {
    // when
    const sync = parseSyncCollection(fixture('calendar-sync.xml'));

    // then
    expect(sync.syncToken).toBe('http://sabre.io/ns/sync/660');
    expect(sync.changed).toHaveLength(16);
    expect(sync.changed[0].href).toMatch(/^\/remote\.php\/dav\/calendars\/demo\/personal\/.+\.ics$/);
    expect(sync.changed[0].etag).toMatch(/^[0-9a-f]{32}$/);
    expect(sync.deleted).toEqual([]);
  });

  it('reports members with 404 status as deleted', () => {
    // given
    const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">
      <d:response><d:href>/remote.php/dav/calendars/demo/personal/gone.ics</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>
      <d:sync-token>http://sabre.io/ns/sync/661</d:sync-token></d:multistatus>`;

    // when
    const sync = parseSyncCollection(xml);

    // then
    expect(sync).toEqual({
      syncToken: 'http://sabre.io/ns/sync/661',
      changed: [],
      deleted: ['/remote.php/dav/calendars/demo/personal/gone.ics'],
    });
  });
});

describe('parseObjects', () => {
  it('extracts calendar-data with etag', () => {
    // when
    const objects = parseObjects(fixture('events-range.xml'));

    // then
    expect(objects).toHaveLength(13);
    expect(objects[0].data).toMatch(/^BEGIN:VCALENDAR/);
    expect(objects[0].data).toMatch(/END:VCALENDAR\s*$/);
    expect(objects[0].etag).toMatch(/^[0-9a-f]{32}$/);
  });

  it('extracts address-data', () => {
    // when
    const cards = parseObjects(fixture('contacts-synthetic.xml'));

    // then
    expect(cards).toHaveLength(2);
    expect(cards[0].data).toContain('FN:Erika Mustermann');
  });
});

describe('parseDavError', () => {
  it('reads sabre exception and message', () => {
    expect(parseDavError(fixture('contacts.xml'))).toEqual({
      exception: 'Sabre\\DAV\\Exception\\NotFound',
      message: "Addressbook with name 'contacts' could not be found",
    });
  });
});
