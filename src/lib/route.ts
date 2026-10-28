export type Route =
  | { view: 'files'; path: string }
  | { view: 'edit'; path: string }
  | { view: 'calendar'; date: string; mode: 'month' | 'week' }
  | { view: 'contacts'; href?: string };

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseIsoDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function parseHash(hash: string): Route {
  const [view, ...rest] = hash.replace(/^#\/?/, '').split('/');
  if (view === 'calendar') {
    const [date, mode] = rest;
    return { view, date: date || isoDate(new Date()), mode: mode === 'week' ? 'week' : 'month' };
  }
  if (view === 'edit') return { view, path: decodePath(rest) };
  if (view === 'contacts') return rest.length ? { view, href: decodeURIComponent(rest.join('/')) } : { view };
  return { view: 'files', path: decodePath(rest) };
}

const decodePath = (segments: string[]) => segments.filter(Boolean).map(decodeURIComponent).join('/');
const encodePath = (path: string) => path.split('/').filter(Boolean).map(encodeURIComponent).join('/');

export function filesHash(path: string) {
  return '#/files/' + encodePath(path);
}

export function editHash(path: string) {
  return '#/edit/' + encodePath(path);
}

export function calendarHash(date: Date, mode: 'month' | 'week') {
  return `#/calendar/${isoDate(date)}/${mode}`;
}

export function contactHash(href?: string) {
  return '#/contacts' + (href ? '/' + encodeURIComponent(href) : '');
}

export function sabreEncode(segment: string) {
  return encodeURIComponent(segment)
    .replace(/[!'*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%3A/g, ':')
    .replace(/%40/g, '@');
}
