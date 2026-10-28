import { describe, expect, it } from 'vitest';
import { fileKind, isEditable } from './files';

const file = (name: string, extra: Partial<{ isDir: boolean; contentType: string; size: number }> = {}) => ({
  name,
  isDir: false,
  size: 100,
  ...extra,
});

describe('fileKind', () => {
  it('classifies by extension and content type', () => {
    expect(fileKind(file('Backups', { isDir: true }))).toBe('folder');
    expect(fileKind(file('Home.md'))).toBe('markdown');
    expect(fileKind(file('photo.JPG'))).toBe('image');
    expect(fileKind(file('scan', { contentType: 'application/pdf' }))).toBe('pdf');
    expect(fileKind(file('clip.mp4'))).toBe('video');
    expect(fileKind(file('song.flac'))).toBe('audio');
    expect(fileKind(file('backup.tar.gz'))).toBe('archive');
    expect(fileKind(file('main.ts'))).toBe('code');
    expect(fileKind(file('budget.ods'))).toBe('sheet');
    expect(fileKind(file('brief.docx'))).toBe('doc');
    expect(fileKind(file('.sync-exclude.lst'))).toBe('text');
    expect(fileKind(file('blob.bin'))).toBe('file');
  });
});

describe('isEditable', () => {
  it('allows markdown and plain text up to 2 MB', () => {
    expect(isEditable(file('Home.md'))).toBe(true);
    expect(isEditable(file('notes.txt'))).toBe(true);
    expect(isEditable(file('huge.md', { size: 3 * 1024 * 1024 }))).toBe(false);
    expect(isEditable(file('photo.png'))).toBe(false);
    expect(isEditable(file('Notes', { isDir: true }))).toBe(false);
  });
});
