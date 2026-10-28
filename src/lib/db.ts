import Dexie, { type EntityTable } from 'dexie';
import type { DavFile } from './dav/parsers';

export interface CollectionRow {
  href: string;
  kind: 'calendar' | 'addressbook';
  displayName: string;
  color?: string;
  readOnly?: boolean;
  syncToken?: string;
}

export interface ObjectRow {
  href: string;
  collection: string;
  etag: string;
  data: string;
}

export interface FolderRow {
  href: string;
  etag: string;
  syncedAt: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export const db = new Dexie('nextcloud-ui-fast') as Dexie & {
  collections: EntityTable<CollectionRow, 'href'>;
  objects: EntityTable<ObjectRow, 'href'>;
  files: EntityTable<DavFile, 'href'>;
  folders: EntityTable<FolderRow, 'href'>;
  meta: EntityTable<MetaRow, 'key'>;
};

db.version(1).stores({
  collections: 'href, kind',
  objects: 'href, collection',
  files: 'href, parent',
  folders: 'href',
  meta: 'key',
});

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}
