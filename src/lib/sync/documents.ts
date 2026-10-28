import { db, type DocumentRow } from '../db';
import { DavHttpError } from '../dav/client';

export interface DocumentDav {
  getText(href: string): Promise<{ text: string; etag: string }>;
  put(href: string, body: BodyInit, contentType: string, etag: string | null): Promise<string | null>;
}

export class ConflictError extends Error {
  constructor(readonly href: string) {
    super('Die Datei wurde zwischenzeitlich anderswo geändert.');
  }
}

const contentTypeOf = (href: string) => (/\.(md|markdown)$/i.test(href) ? 'text/markdown' : 'text/plain');

export async function refreshDocument(
  dav: DocumentDav,
  href: string,
  opts: { force?: boolean } = {},
): Promise<DocumentRow> {
  const [cached, listed] = await Promise.all([db.documents.get(href), db.files.get(href)]);
  if (!opts.force && cached && listed && cached.etag === listed.etag) return cached;
  const { text, etag } = await dav.getText(href);
  const doc = { href, text, etag };
  await db.documents.put(doc);
  return doc;
}

export async function saveDocument(
  dav: DocumentDav,
  href: string,
  text: string,
  baseEtag: string,
): Promise<DocumentRow> {
  let etag: string | null;
  try {
    etag = await dav.put(href, text, contentTypeOf(href), baseEtag);
  } catch (e) {
    if (e instanceof DavHttpError && e.status === 412) throw new ConflictError(href);
    throw e;
  }
  etag ??= (await dav.getText(href)).etag;
  const doc = { href, text, etag };
  await db.transaction('rw', db.documents, db.files, async () => {
    await db.documents.put(doc);
    await db.files.update(href, { etag, size: new Blob([text]).size, lastModified: Date.now() });
  });
  return doc;
}
