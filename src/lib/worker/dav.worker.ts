/// <reference lib="webworker" />
import { db, getMeta, setMeta, type ObjectRow } from '../db';
import { DavClient, DavHttpError } from '../dav/client';
import { parseAddressbooks, parseCalendars, type Principal } from '../dav/parsers';
import { ADDRESSBOOKS_PROPFIND, CALENDARS_PROPFIND } from '../dav/requests';
import { discoverPrincipal, isComplete } from '../sync/principal';
import { buildEventIcs, expandEvents, updateEventIcs } from '../ical/events';
import { buildVCard, parseVCard, updateVCard } from '../ical/vcard';
import { syncCalendar, syncCollectionObjects, syncSubscription } from '../sync/calendar';
import { revalidateFolder } from '../sync/files';
import { uploadFile } from '../sync/upload';
import type { ContactEntry, Reply, Request, WorkerApi } from './protocol';

const client = new DavClient();
let principal: Promise<Principal> | null = null;

const post = (reply: Reply) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(reply);

async function discover(): Promise<Principal> {
  const cached = await getMeta<Principal>('principal');
  const fresh = discoverPrincipal(client).then(async (p) => {
    await setMeta('principal', p);
    return p;
  });
  if (cached && isComplete(cached)) {
    fresh.catch(() => {});
    return cached;
  }
  return fresh;
}

const me = () => (principal ??= discover().catch((e) => ((principal = null), Promise.reject(e))));

async function settleAll(tasks: Promise<unknown>[]) {
  const results = await Promise.allSettled(tasks);
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  failed.forEach((f) => console.warn('collection sync failed', f.reason));
  if (failed.length && failed.length === results.length) throw failed[0].reason;
}

async function forgetFolder(href: string) {
  const nested = await db.folders.where('href').startsWith(href).primaryKeys();
  await db.folders.bulkDelete(nested);
  await db.files.where('parent').startsWith(href).delete();
}

async function optimisticPut(
  href: string,
  collection: string,
  data: string,
  existing: ObjectRow | undefined,
  type: string,
) {
  await db.objects.put({ href, collection, etag: existing?.etag ?? '', data });
  try {
    const etag = await client.put(href, data, type, existing?.etag ?? null);
    await db.objects.update(href, { etag: etag ?? '' });
  } catch (e) {
    if (existing) await db.objects.put(existing);
    else await db.objects.delete(href);
    throw e;
  }
}

async function optimisticDelete(href: string) {
  const existing = await db.objects.get(href);
  await db.objects.delete(href);
  try {
    await client.delete(href, existing?.etag || undefined);
  } catch (e) {
    if (existing) await db.objects.put(existing);
    throw e;
  }
}

const parsedContacts = new Map<string, { data: string; entry: ContactEntry }>();

const api: WorkerApi = {
  bootstrap: () => me(),

  async syncFolder(href) {
    const { changed, staleSubfolders } = await revalidateFolder(client, href);
    return { changed, staleSubfolders };
  },

  async prefetchFolder(href) {
    const known = await db.folders.get(href);
    if (!known || Date.now() - known.syncedAt > 30_000) await revalidateFolder(client, href);
  },

  async syncCalendars() {
    const { calendarHome } = await me();
    const calendars = parseCalendars(await client.propfind(calendarHome, CALENDARS_PROPFIND, 1)).filter((c) =>
      c.components.includes('VEVENT'),
    );
    const existing = await db.collections.where('kind').equals('calendar').toArray();
    const removed = existing.filter((e) => !calendars.some((c) => c.href === e.href)).map((e) => e.href);
    await db.collections.bulkDelete(removed);
    for (const href of removed) await db.objects.where('collection').equals(href).delete();
    for (const c of calendars) {
      const prev = existing.find((e) => e.href === c.href);
      await db.collections.put({
        href: c.href,
        kind: 'calendar',
        displayName: c.displayName,
        color: c.color,
        readOnly: c.subscribed || c.href.endsWith('/contact_birthdays/'),
        syncToken: prev?.syncToken,
      });
    }
    await settleAll(calendars.map((c) => (c.subscribed ? syncSubscription(client, c) : syncCalendar(client, c))));
  },

  async syncAddressbooks() {
    const { addressbookHome } = await me();
    const books = parseAddressbooks(await client.propfind(addressbookHome, ADDRESSBOOKS_PROPFIND, 1));
    const existing = await db.collections.where('kind').equals('addressbook').toArray();
    for (const b of books) {
      const prev = existing.find((e) => e.href === b.href);
      await db.collections.put({
        href: b.href,
        kind: 'addressbook',
        displayName: b.displayName,
        readOnly: b.readOnly,
        syncToken: prev?.syncToken,
      });
    }
    await settleAll(books.map((b) => syncCollectionObjects(client, { href: b.href }, 'addressbook')));
  },

  async expand(collections, start, end) {
    const objects = await db.objects.where('collection').anyOf(collections).toArray();
    const collectionOf = new Map(objects.map((o) => [o.href, o.collection]));
    return expandEvents(objects, new Date(start), new Date(end)).map((o) => ({
      ...o,
      collection: collectionOf.get(o.href)!,
    }));
  },

  async contacts() {
    const books = await db.collections.where('kind').equals('addressbook').primaryKeys();
    const objects = await db.objects.where('collection').anyOf(books).toArray();
    const entries: ContactEntry[] = [];
    for (const o of objects) {
      const cached = parsedContacts.get(o.href);
      if (cached?.data === o.data) {
        entries.push(cached.entry);
        continue;
      }
      try {
        const entry = { ...parseVCard(o.data), href: o.href, etag: o.etag, collection: o.collection };
        parsedContacts.set(o.href, { data: o.data, entry });
        entries.push(entry);
      } catch (e) {
        console.warn('skipping unparsable vCard', o.href, e);
      }
    }
    return entries.sort((a, b) => a.fullName.localeCompare(b.fullName));
  },

  async move(from, to) {
    const row = await db.files.get(from);
    const parent = to.replace(/[^/]+\/?$/, '');
    const name = decodeURIComponent(to.replace(/\/$/, '').split('/').pop() ?? '');
    if (row) {
      await db.files.delete(from);
      await db.files.put({ ...row, href: to, parent, name });
    }
    try {
      await client.move(from, to);
      if (row?.isDir) await forgetFolder(from);
    } catch (e) {
      if (row) {
        await db.files.delete(to);
        await db.files.put(row);
      }
      throw e;
    }
  },

  async remove(href) {
    const row = await db.files.get(href);
    await db.files.delete(href);
    try {
      await client.delete(href);
      if (row?.isDir) await forgetFolder(href);
    } catch (e) {
      if (row) await db.files.put(row);
      throw e;
    }
  },

  async mkdir(href) {
    await client.mkcol(href);
    await revalidateFolder(client, href.replace(/[^/]+\/?$/, ''));
  },

  async upload(targetHref, file) {
    const { user } = await me();
    await uploadFile(client, user, targetHref, file, (sent) =>
      post({ id: -1, progress: { href: targetHref, sent, total: file.size } }),
    );
    await revalidateFolder(client, targetHref.replace(/[^/]+$/, ''));
  },

  async saveEvent(collection, href, fields) {
    const existing = href ? await db.objects.get(href) : undefined;
    const target = href ?? `${collection}${crypto.randomUUID()}.ics`;
    const data = existing
      ? updateEventIcs(existing.data, fields)
      : buildEventIcs({ ...fields, uid: crypto.randomUUID() });
    await optimisticPut(target, collection, data, existing, 'text/calendar');
  },

  async deleteEvent(href) {
    await optimisticDelete(href);
  },

  async saveContact(collection, href, edit) {
    const existing = href ? await db.objects.get(href) : undefined;
    const uid = crypto.randomUUID();
    const target = href ?? `${collection}${uid}.vcf`;
    const data = existing ? updateVCard(existing.data, edit) : buildVCard(uid, edit);
    await optimisticPut(target, collection, data, existing, 'text/vcard');
  },

  async deleteContact(href) {
    await optimisticDelete(href);
  },
};

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, method, args } = event.data;
  try {
    const value = await (api[method] as (...a: unknown[]) => Promise<unknown>)(...args);
    post({ id, ok: true, value });
  } catch (e) {
    post({
      id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      status: e instanceof DavHttpError ? e.status : undefined,
    });
  }
};
