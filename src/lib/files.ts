export type FileKind =
  'folder' | 'markdown' | 'text' | 'image' | 'pdf' | 'video' | 'audio' | 'archive' | 'code' | 'sheet' | 'doc' | 'file';

interface FileLike {
  name: string;
  isDir: boolean;
  size: number;
  contentType?: string;
}

const byExtension: Record<string, FileKind> = {
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  lst: 'text',
  log: 'text',
  csv: 'text',
  pdf: 'pdf',
  zip: 'archive',
  gz: 'archive',
  tgz: 'archive',
  tar: 'archive',
  '7z': 'archive',
  rar: 'archive',
  ods: 'sheet',
  xlsx: 'sheet',
  xls: 'sheet',
  odt: 'doc',
  docx: 'doc',
  doc: 'doc',
};

const codeExtensions = new Set([
  'ts',
  'js',
  'json',
  'yaml',
  'yml',
  'py',
  'java',
  'sh',
  'html',
  'css',
  'svelte',
  'xml',
  'go',
  'rs',
]);
const MAX_EDITABLE = 2 * 1024 * 1024;

export function fileKind(file: FileLike): FileKind {
  if (file.isDir) return 'folder';
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (byExtension[ext]) return byExtension[ext];
  if (codeExtensions.has(ext)) return 'code';
  const type = file.contentType ?? '';
  if (/^image\/|\.(png|jpe?g|gif|webp|svg|heic|avif)$/i.test(type || file.name)) return 'image';
  if (/^video\/|\.(mp4|mkv|mov|webm)$/i.test(type || file.name)) return 'video';
  if (/^audio\/|\.(mp3|flac|ogg|wav|m4a)$/i.test(type || file.name)) return 'audio';
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('text/')) return 'text';
  return 'file';
}

export function isEditable(file: FileLike): boolean {
  const kind = fileKind(file);
  return (kind === 'markdown' || kind === 'text') && file.size <= MAX_EDITABLE;
}
