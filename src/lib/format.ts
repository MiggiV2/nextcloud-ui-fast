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
