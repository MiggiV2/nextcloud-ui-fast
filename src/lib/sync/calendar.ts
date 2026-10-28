import { db } from '../db';
import { DavHttpError } from '../dav/client';
import { parseObjects, parseSyncCollection } from '../dav/parsers';
import {
  CALENDAR_QUERY_ALL,
  ETAG_PROPFIND,
  addressbookMultiget,
  calendarMultiget,
  syncCollection,
} from '../dav/requests';

export interface CalendarDav {
  report(href: string, body: string, depth?: 0 | 1): Promise<string>;
  propfind(href: string, body: string, depth?: 0 | 1): Promise<string>;
  getText(href: string): Promise<{ text: string; etag: string }>;
}

export interface SyncableCollection {
  href: string;
  syncToken?: string;
}

const MULTIGET_BATCH = 200;
const INVALID_TOKEN_STATUSES = [403, 409, 507];
const REPORT_NOT_SUPPORTED = 415;

async function syncByListing(dav: CalendarDav, collection: string, kind: 'calendar' | 'addressbook'): Promise<boolean> {
  const listed = parseSyncCollection(await dav.propfind(collection, ETAG_PROPFIND, 1)).changed.filter(
    (c) => c.href !== collection && c.etag,
  );
  const cached = new Map(
    (await db.objects.where('collection').equals(collection).toArray()).map((o) => [o.href, o.etag]),
  );
  const changed = listed.filter((c) => cached.get(c.href) !== c.etag);
  const fetched = await Promise.all(
    changed.map(async (c) => ({ href: c.href, collection, etag: c.etag, data: (await dav.getText(c.href)).text })),
  );
  const removed = [...cached.keys()].filter((href) => !listed.some((c) => c.href === href));
  await db.objects.bulkPut(fetched);
  await db.objects.bulkDelete(removed);
  if (!(await db.collections.get(collection)))
    await db.collections.put({ href: collection, kind, displayName: collection });
  return fetched.length > 0 || removed.length > 0;
}

async function fetchChanged(dav: CalendarDav, collection: string, hrefs: string[], kind: 'calendar' | 'addressbook') {
  const multiget = kind === 'calendar' ? calendarMultiget : addressbookMultiget;
  for (let i = 0; i < hrefs.length; i += MULTIGET_BATCH) {
    const xml = await dav.report(collection, multiget(hrefs.slice(i, i + MULTIGET_BATCH)), 1);
    await db.objects.bulkPut(parseObjects(xml).map((o) => ({ ...o, collection })));
  }
}

export async function syncCollectionObjects(
  dav: CalendarDav,
  collection: SyncableCollection,
  kind: 'calendar' | 'addressbook',
): Promise<boolean> {
  const stored = await db.collections.get(collection.href);
  const token = stored?.syncToken ?? null;
  if (token && collection.syncToken && token === collection.syncToken) return false;

  let xml: string;
  let full = !token;
  try {
    xml = await dav.report(collection.href, syncCollection(token));
  } catch (e) {
    if (e instanceof DavHttpError && e.status === REPORT_NOT_SUPPORTED)
      return syncByListing(dav, collection.href, kind);
    if (!(token && e instanceof DavHttpError && INVALID_TOKEN_STATUSES.includes(e.status))) throw e;
    full = true;
    xml = await dav.report(collection.href, syncCollection(null));
  }
  const result = parseSyncCollection(xml);

  const cached = new Map(
    (await db.objects.where('collection').equals(collection.href).toArray()).map((o) => [o.href, o.etag]),
  );
  const toFetch = result.changed.filter((c) => cached.get(c.href) !== c.etag).map((c) => c.href);
  await fetchChanged(dav, collection.href, toFetch, kind);

  const toDelete = full
    ? [...cached.keys()].filter((href) => !result.changed.some((c) => c.href === href))
    : result.deleted;
  await db.objects.bulkDelete(toDelete);

  await db.collections.update(collection.href, { syncToken: result.syncToken }).then(async (updated) => {
    if (!updated)
      await db.collections.put({
        href: collection.href,
        kind,
        displayName: collection.href,
        syncToken: result.syncToken,
      });
  });
  return toFetch.length > 0 || toDelete.length > 0;
}

export function syncCalendar(dav: CalendarDav, calendar: SyncableCollection) {
  return syncCollectionObjects(dav, calendar, 'calendar');
}

export async function syncSubscription(
  dav: CalendarDav,
  subscription: { href: string; ctag?: string },
): Promise<boolean> {
  const marker = `ctag:${subscription.ctag ?? ''}`;
  const stored = await db.collections.get(subscription.href);
  if (subscription.ctag && stored?.syncToken === marker) return false;
  const objects = parseObjects(await dav.report(subscription.href, CALENDAR_QUERY_ALL, 1));
  await db.transaction('rw', db.objects, db.collections, async () => {
    await db.objects.where('collection').equals(subscription.href).delete();
    await db.objects.bulkPut(objects.map((o) => ({ ...o, collection: subscription.href })));
    const updated = await db.collections.update(subscription.href, { syncToken: marker });
    if (!updated)
      await db.collections.put({
        href: subscription.href,
        kind: 'calendar',
        displayName: subscription.href,
        readOnly: true,
        syncToken: marker,
      });
  });
  return true;
}
