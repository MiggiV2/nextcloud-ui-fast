import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { DavHttpError } from '../dav/client';
import type { DavFile } from '../dav/parsers';
import { ConflictError, refreshDocument, saveDocument, type DocumentDav } from './documents';

const href = '/remote.php/dav/files/demo/Notes/Home.md';
const row: DavFile = {
  href,
  parent: '/remote.php/dav/files/demo/Notes/',
  name: 'Home.md',
  isDir: false,
  etag: 'v1',
  lastModified: 0,
  size: 5,
  contentType: 'text/markdown',
  fileId: 958,
  permissions: 'RGDNVW',
  hasPreview: true,
};

function fakeDav(opts: { text?: string; etag?: string; put?: string | null | DavHttpError } = {}) {
  const calls: string[] = [];
  const puts: Array<{ body: string; etag: string | null }> = [];
  const dav: DocumentDav = {
    async getText(h) {
      calls.push(`GET ${h}`);
      return { text: opts.text ?? '# v1', etag: opts.etag ?? 'v1' };
    },
    async put(h, body, _type, etag) {
      calls.push(`PUT ${h}`);
      puts.push({ body: String(body), etag });
      if (opts.put instanceof DavHttpError) throw opts.put;
      return opts.put === undefined ? 'v2' : opts.put;
    },
  };
  return { dav, calls, puts };
}

describe('refreshDocument', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.files.put(row);
  });

  it('downloads and caches a document that is not cached yet', async () => {
    // given
    const { dav, calls } = fakeDav();

    // when
    const doc = await refreshDocument(dav, href);

    // then
    expect(calls).toEqual([`GET ${href}`]);
    expect(doc).toEqual({ href, text: '# v1', etag: 'v1' });
    expect(await db.documents.get(href)).toEqual(doc);
  });

  it('skips the download when the cached etag matches the listed file etag', async () => {
    // given
    await db.documents.put({ href, text: '# v1', etag: 'v1' });
    const { dav, calls } = fakeDav();

    // when
    await refreshDocument(dav, href);

    // then
    expect(calls).toEqual([]);
  });

  it('always downloads when forced, even if the possibly stale listing matches the cache', async () => {
    // given
    await db.documents.put({ href, text: '# v1', etag: 'v1' });
    const { dav, calls } = fakeDav({ text: '# remote', etag: 'v2' });

    // when
    const doc = await refreshDocument(dav, href, { force: true });

    // then
    expect(calls).toEqual([`GET ${href}`]);
    expect(doc).toEqual({ href, text: '# remote', etag: 'v2' });
    expect(await db.documents.get(href)).toEqual(doc);
  });

  it('downloads again when the file changed on the server', async () => {
    // given
    await db.documents.put({ href, text: '# old', etag: 'v0' });
    const { dav } = fakeDav({ text: '# new', etag: 'v1' });

    // when
    const doc = await refreshDocument(dav, href);

    // then
    expect(doc.text).toBe('# new');
  });
});

describe('saveDocument', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.files.put(row);
    await db.documents.put({ href, text: '# v1', etag: 'v1' });
  });

  it('saves with If-Match on the base etag and updates cache and file row', async () => {
    // given
    const { dav, puts } = fakeDav({ put: 'v2' });

    // when
    const doc = await saveDocument(dav, href, '# changed', 'v1');

    // then
    expect(puts).toEqual([{ body: '# changed', etag: 'v1' }]);
    expect(doc).toEqual({ href, text: '# changed', etag: 'v2' });
    expect(await db.documents.get(href)).toEqual(doc);
    expect(await db.files.get(href)).toMatchObject({ etag: 'v2', size: 9 });
  });

  it('refetches the etag when the server does not return one', async () => {
    // given
    const { dav, calls } = fakeDav({ put: null, etag: 'v3', text: '# changed' });

    // when
    const doc = await saveDocument(dav, href, '# changed', 'v1');

    // then
    expect(calls).toEqual([`PUT ${href}`, `GET ${href}`]);
    expect(doc.etag).toBe('v3');
  });

  it('reports a conflict on 412 and leaves the cache untouched', async () => {
    // given
    const { dav } = fakeDav({ put: new DavHttpError(412, 'PUT', href, '') });

    // when
    const error = await saveDocument(dav, href, '# mine', 'v1').catch((e) => e);

    // then
    expect(error).toBeInstanceOf(ConflictError);
    expect(await db.documents.get(href)).toEqual({ href, text: '# v1', etag: 'v1' });
  });
});
