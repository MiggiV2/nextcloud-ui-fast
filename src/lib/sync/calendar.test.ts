import { beforeEach, describe, expect, it } from 'vitest';
import { fixture } from '../../../test/fixtures';
import { db } from '../db';
import { DavHttpError } from '../dav/client';
import { syncCalendar, syncSubscription, type CalendarDav } from './calendar';
import type { Calendar } from '../dav/parsers';

const calendar: Calendar = {
  href: '/remote.php/dav/calendars/demo/personal/',
  displayName: 'Persönlich',
  color: '#00679e',
  ctag: 'c',
  syncToken: 'http://sabre.io/ns/sync/660',
  components: ['VEVENT'],
  subscribed: false,
};

function fakeDav(reports: Array<string | DavHttpError>) {
  const bodies: string[] = [];
  const dav: CalendarDav = {
    async report(_href, body) {
      bodies.push(body);
      const next = reports.shift();
      if (next instanceof DavHttpError) throw next;
      if (next === undefined) throw new Error('unexpected report');
      return next;
    },
  };
  return { dav, bodies };
}

describe('syncCalendar', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('does an initial sync, fetches changed objects via multiget and stores the token', async () => {
    // given
    const { dav, bodies } = fakeDav([fixture('calendar-sync.xml'), fixture('events-range.xml')]);

    // when
    await syncCalendar(dav, calendar);

    // then
    expect(bodies[0]).toContain('<d:sync-token></d:sync-token>');
    expect(bodies[1]).toContain('calendar-multiget');
    expect(await db.objects.where('collection').equals(calendar.href).count()).toBe(13);
    expect((await db.collections.get(calendar.href))?.syncToken).toBe('http://sabre.io/ns/sync/660');
  });

  it('sends the stored token and removes deleted objects on delta sync', async () => {
    // given
    const { dav: first } = fakeDav([fixture('calendar-sync.xml'), fixture('events-range.xml')]);
    await syncCalendar(first, calendar);
    const gone = (await db.objects.where('collection').equals(calendar.href).first())!.href;
    const delta = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">
      <d:response><d:href>${gone}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>
      <d:sync-token>http://sabre.io/ns/sync/661</d:sync-token></d:multistatus>`;
    const { dav, bodies } = fakeDav([delta]);

    // when
    await syncCalendar(dav, { ...calendar, syncToken: 'http://sabre.io/ns/sync/661' });

    // then
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain('<d:sync-token>http://sabre.io/ns/sync/660</d:sync-token>');
    expect(await db.objects.get(gone)).toBeUndefined();
    expect(await db.objects.where('collection').equals(calendar.href).count()).toBe(12);
    expect((await db.collections.get(calendar.href))?.syncToken).toBe('http://sabre.io/ns/sync/661');
  });

  it('skips the network entirely when the token did not change', async () => {
    // given
    const { dav: first } = fakeDav([fixture('calendar-sync.xml'), fixture('events-range.xml')]);
    await syncCalendar(first, calendar);
    const { dav, bodies } = fakeDav([]);

    // when
    await syncCalendar(dav, calendar);

    // then
    expect(bodies).toHaveLength(0);
  });

  it('falls back to a full resync when the server rejects an invalid token', async () => {
    // given
    const { dav: first } = fakeDav([fixture('calendar-sync.xml'), fixture('events-range.xml')]);
    await syncCalendar(first, calendar);
    await db.objects.put({ href: calendar.href + 'stale.ics', collection: calendar.href, etag: 'x', data: '' });
    const { dav, bodies } = fakeDav([
      new DavHttpError(403, 'REPORT', calendar.href, 'invalid sync token'),
      fixture('calendar-sync.xml'),
      fixture('events-range.xml'),
    ]);

    // when
    await syncCalendar(dav, { ...calendar, syncToken: 'http://sabre.io/ns/sync/999' });

    // then
    expect(bodies[1]).toContain('<d:sync-token></d:sync-token>');
    expect(await db.objects.get(calendar.href + 'stale.ics')).toBeUndefined();
  });

  it('fully refetches a subscription only when its ctag changed', async () => {
    // given
    const uni = { href: '/remote.php/dav/calendars/demo/university/', ctag: '5043' };
    const { dav, bodies } = fakeDav([fixture('events-range.xml')]);

    // when
    await syncSubscription(dav, uni);
    await syncSubscription(dav, uni);

    // then
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain('calendar-query');
    expect(await db.objects.where('collection').equals(uni.href).count()).toBe(13);
  });

  it('drops subscription objects that vanished after a ctag change', async () => {
    // given
    const uni = { href: '/remote.php/dav/calendars/demo/university/', ctag: '5043' };
    await syncSubscription(fakeDav([fixture('events-range.xml')]).dav, uni);
    const empty = '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"></d:multistatus>';

    // when
    await syncSubscription(fakeDav([empty]).dav, { ...uni, ctag: '5044' });

    // then
    expect(await db.objects.where('collection').equals(uni.href).count()).toBe(0);
  });
});
