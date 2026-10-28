import { db } from '../db';
import { parseFolder, type DavFile } from '../dav/parsers';
import { FILES_PROPFIND } from '../dav/requests';

export interface FilesDav {
  propfind(href: string, body: string, depth?: 0 | 1): Promise<string>;
}

export interface RevalidateResult {
  changed: boolean;
  children: DavFile[];
  staleSubfolders: string[];
}

export async function revalidateFolder(dav: FilesDav, href: string): Promise<RevalidateResult> {
  const { self, children } = parseFolder(await dav.propfind(href, FILES_PROPFIND, 1));
  const previous = await db.folders.get(href);
  const changed = previous?.etag !== self.etag;

  const subfolders = children.filter((c) => c.isDir);
  const cachedSubfolders = await db.folders.bulkGet(subfolders.map((s) => s.href));
  const staleSubfolders = subfolders
    .filter((s, i) => cachedSubfolders[i] && cachedSubfolders[i]!.etag !== s.etag)
    .map((s) => s.href);

  if (changed) {
    await db.transaction('rw', db.files, db.folders, async () => {
      const keep = new Set(children.map((c) => c.href));
      const existing = await db.files.where('parent').equals(href).primaryKeys();
      await db.files.bulkDelete(existing.filter((k) => !keep.has(k)));
      await db.files.bulkPut(children.map((c) => ({ ...c, parent: href })));
      await db.folders.put({ href, etag: self.etag, syncedAt: Date.now() });
    });
  }
  return { changed, children, staleSubfolders };
}
