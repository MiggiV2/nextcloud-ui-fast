const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const PRINCIPAL_PROPFIND = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:card="urn:ietf:params:xml:ns:carddav">
 <d:prop><d:current-user-principal/><d:displayname/><c:calendar-home-set/><card:addressbook-home-set/></d:prop>
</d:propfind>`;

export const FILES_PROPFIND = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
 <d:prop><d:getetag/><d:getlastmodified/><d:getcontentlength/><d:getcontenttype/><d:resourcetype/>
  <oc:fileid/><oc:size/><oc:permissions/><nc:has-preview/></d:prop>
</d:propfind>`;

export const CALENDARS_PROPFIND = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:ic="http://apple.com/ns/ical/" xmlns:c="urn:ietf:params:xml:ns:caldav">
 <d:prop><d:displayname/><cs:getctag/><d:sync-token/><ic:calendar-color/><c:supported-calendar-component-set/><d:resourcetype/></d:prop>
</d:propfind>`;

export const ADDRESSBOOKS_PROPFIND = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:oc="http://owncloud.org/ns">
 <d:prop><d:resourcetype/><d:displayname/><cs:getctag/><d:sync-token/><oc:read-only/></d:prop>
</d:propfind>`;

export function syncCollection(token: string | null): string {
  return `<?xml version="1.0"?>
<d:sync-collection xmlns:d="DAV:"><d:sync-token>${escapeXml(token ?? '')}</d:sync-token><d:sync-level>1</d:sync-level>
 <d:prop><d:getetag/></d:prop></d:sync-collection>`;
}

function hrefs(list: string[]): string {
  return list.map((h) => `<d:href>${escapeXml(h)}</d:href>`).join('');
}

export const CALENDAR_QUERY_ALL = `<?xml version="1.0"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
 <d:prop><d:getetag/><c:calendar-data/></d:prop>
 <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter>
</c:calendar-query>`;

export function calendarMultiget(list: string[]): string {
  return `<?xml version="1.0"?>
<c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
 <d:prop><d:getetag/><c:calendar-data/></d:prop>${hrefs(list)}</c:calendar-multiget>`;
}

export function addressbookMultiget(list: string[]): string {
  return `<?xml version="1.0"?>
<card:addressbook-multiget xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
 <d:prop><d:getetag/><card:address-data/></d:prop>${hrefs(list)}</card:addressbook-multiget>`;
}
