import { firstHref, hasType, parseMultistatus, parseXml, text } from './multistatus';

export interface Principal {
  href: string;
  user: string;
  displayName: string;
  calendarHome: string;
  addressbookHome: string;
}

export interface DavFile {
  href: string;
  parent: string;
  name: string;
  isDir: boolean;
  etag: string;
  lastModified: number;
  size: number;
  contentType?: string;
  fileId: number;
  permissions: string;
  hasPreview: boolean;
}

export interface Folder {
  self: DavFile;
  children: DavFile[];
}

export interface Calendar {
  href: string;
  displayName: string;
  color: string;
  ctag?: string;
  syncToken?: string;
  components: string[];
  subscribed: boolean;
}

export interface Addressbook {
  href: string;
  displayName: string;
  readOnly: boolean;
}

export interface SyncResult {
  syncToken: string;
  changed: { href: string; etag: string }[];
  deleted: string[];
}

export interface DavObject {
  href: string;
  etag: string;
  data: string;
}

export interface DavError {
  exception: string;
  message: string;
}

export const unquoteEtag = (etag: string | undefined) => (etag ?? '').replace(/^W\//, '').replace(/^"|"$/g, '');

const lastSegment = (href: string) => decodeURIComponent(href.replace(/\/$/, '').split('/').pop() ?? '');

const parentOf = (href: string) => href.replace(/[^/]+\/?$/, '');

export function parsePrincipal(xml: string): Principal {
  const [r] = parseMultistatus(xml).responses;
  const href = firstHref(r.props['current-user-principal']) ?? r.href;
  return {
    href,
    user: lastSegment(href),
    displayName: text(r.props.displayname) ?? lastSegment(href),
    calendarHome: firstHref(r.props['calendar-home-set']) ?? '',
    addressbookHome: firstHref(r.props['addressbook-home-set']) ?? '',
  };
}

function toFile(href: string, p: Record<string, unknown>): DavFile {
  const isDir = hasType(p.resourcetype, 'collection');
  const modified = text(p.getlastmodified);
  return {
    href,
    parent: parentOf(href),
    name: lastSegment(href),
    isDir,
    etag: unquoteEtag(text(p.getetag)),
    lastModified: modified ? Date.parse(modified) : 0,
    size: Number(text(p.size) ?? text(p.getcontentlength) ?? 0),
    contentType: text(p.getcontenttype),
    fileId: Number(text(p.fileid) ?? 0),
    permissions: text(p.permissions) ?? '',
    hasPreview: text(p['has-preview']) === 'true',
  };
}

export function parseFolder(xml: string): Folder {
  const [self, ...children] = parseMultistatus(xml)
    .responses.filter((r) => r.status === 200)
    .map((r) => toFile(r.href, r.props));
  return { self, children };
}

export function parseCalendars(xml: string): Calendar[] {
  return parseMultistatus(xml)
    .responses.filter((r) => hasType(r.props.resourcetype, 'calendar') || hasType(r.props.resourcetype, 'subscribed'))
    .map((r) => {
      const comps = (r.props['supported-calendar-component-set'] as { comp?: Record<string, string>[] } | undefined)
        ?.comp;
      return {
        href: r.href,
        displayName: text(r.props.displayname) ?? lastSegment(r.href),
        color: (text(r.props['calendar-color']) ?? '#0082c9').slice(0, 7),
        ctag: text(r.props.getctag),
        syncToken: text(r.props['sync-token']),
        components: (comps ?? []).map((c) => c['@name']),
        subscribed: hasType(r.props.resourcetype, 'subscribed'),
      };
    });
}

export function parseAddressbooks(xml: string): Addressbook[] {
  return parseMultistatus(xml)
    .responses.filter((r) => hasType(r.props.resourcetype, 'addressbook'))
    .map((r) => ({
      href: r.href,
      displayName: text(r.props.displayname) ?? lastSegment(r.href),
      readOnly: text(r.props['read-only']) === '1',
    }));
}

export function parseSyncCollection(xml: string): SyncResult {
  const { responses, syncToken } = parseMultistatus(xml);
  const result: SyncResult = { syncToken: syncToken ?? '', changed: [], deleted: [] };
  for (const r of responses) {
    if (r.status === 404) result.deleted.push(r.href);
    else if (r.status === 200) result.changed.push({ href: r.href, etag: unquoteEtag(text(r.props.getetag)) });
  }
  return result;
}

export function parseObjects(xml: string): DavObject[] {
  return parseMultistatus(xml)
    .responses.filter((r) => r.status === 200)
    .map((r) => ({
      href: r.href,
      etag: unquoteEtag(text(r.props.getetag)),
      data: text(r.props['calendar-data']) ?? text(r.props['address-data']) ?? '',
    }))
    .filter((o) => o.data !== '');
}

export function parseDavError(xml: string): DavError {
  const error = parseXml(xml).error ?? {};
  return { exception: text(error.exception) ?? '', message: text(error.message) ?? '' };
}
