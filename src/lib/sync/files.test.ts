import { beforeEach, describe, expect, it } from 'vitest';
import { fixture } from '../../../test/fixtures';
import { db } from '../db';
import { revalidateFolder, type FilesDav } from './files';

const notes = '/remote.php/dav/files/demo/Notes/';

function fakeDav(listings: string[]) {
  const requested: string[] = [];
  const dav: FilesDav = {
    async propfind(href) {
      requested.push(href);
      const next = listings.shift();
      if (next === undefined) throw new Error('unexpected propfind');
      return next;
    },
  };
  return { dav, requested };
}

describe('revalidateFolder', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('stores the listing and the folder etag', async () => {
    // given
    const { dav } = fakeDav([fixture('files-notes.xml')]);

    // when
    const result = await revalidateFolder(dav, notes);

    // then
    expect(result.changed).toBe(true);
    expect(await db.files.where('parent').equals(notes).count()).toBe(7);
    expect((await db.folders.get(notes))?.etag).toBe('6ae1e56366d06');
  });

  it('reports unchanged when the folder etag is the same', async () => {
    // given
    await revalidateFolder(fakeDav([fixture('files-notes.xml')]).dav, notes);

    // when
    const result = await revalidateFolder(fakeDav([fixture('files-notes.xml')]).dav, notes);

    // then
    expect(result.changed).toBe(false);
  });

  it('removes children that disappeared from the listing', async () => {
    // given
    await revalidateFolder(fakeDav([fixture('files-notes.xml')]).dav, notes);
    const withoutHome = fixture('files-notes.xml')
      .replace(/<d:response><d:href>\/remote\.php\/dav\/files\/demo\/Notes\/Home\.md<\/d:href>.*?<\/d:response>/s, '')
      .replace('6ae1e56366d06', '6ae1e56366d07');

    // when
    const result = await revalidateFolder(fakeDav([withoutHome]).dav, notes);

    // then
    expect(result.changed).toBe(true);
    expect(await db.files.get(notes + 'Home.md')).toBeUndefined();
    expect(await db.files.where('parent').equals(notes).count()).toBe(6);
  });

  it('lists subfolders whose etag differs from the cached listing as stale', async () => {
    // given
    await revalidateFolder(fakeDav([fixture('files-notes.xml')]).dav, notes);
    await db.folders.put({ href: notes + 'Projects/', etag: 'outdated', syncedAt: 0 });
    await db.folders.put({ href: notes + 'Archive/', etag: '6adb4f7e54481', syncedAt: 0 });
    const changedRoot = fixture('files-notes.xml').replace('6ae1e56366d06', '6ae1e56366d08');

    // when
    const result = await revalidateFolder(fakeDav([changedRoot]).dav, notes);

    // then
    expect(result.staleSubfolders).toEqual([notes + 'Projects/']);
  });
});
