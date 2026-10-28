const units = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatSize(bytes: number) {
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

export const formatDateTime = (ms: number) => (ms ? dateTime.format(ms) : '');
export const formatTime = (d: Date) => time.format(d);

const shortDate = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const MINUTE = 60_000;

export function formatRelative(ms: number, now = Date.now()): string {
  if (!ms) return '';
  const diff = now - ms;
  if (diff < MINUTE) return 'gerade eben';
  if (diff < 60 * MINUTE) return `vor ${Math.floor(diff / MINUTE)} Min.`;
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (ms >= startOfToday) return `vor ${Math.floor(diff / (60 * MINUTE))} Std.`;
  const days = Math.ceil((startOfToday - ms) / (24 * 60 * MINUTE));
  if (days === 1) return 'gestern';
  if (days < 7) return `vor ${days} Tagen`;
  return shortDate.format(ms);
}
