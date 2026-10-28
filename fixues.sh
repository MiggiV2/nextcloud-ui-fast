NC=https://cloud.ha1nz.de/remote.php/dav

# 1. Discovery (dein "keine Ahnung"-Request: liefert calendar-home-set & addressbook-home-set)
curl -su $AUTH -X PROPFIND -H "Depth: 0" -H "Content-Type: application/xml" --data '
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:card="urn:ietf:params:xml:ns:carddav">
 <d:prop><d:current-user-principal/><d:displayname/><c:calendar-home-set/><card:addressbook-home-set/></d:prop>
</d:propfind>' $NC/principals/users/miggi/ >fixtures/principal.xml

# 2. Dateien – nur benötigte Props anfragen (macht's auch serverseitig schneller)
curl -su $AUTH -X PROPFIND -H "Depth: 1" -H "Content-Type: application/xml" -w "%{stderr}TTFB %{time_starttransfer}s\n" --data '
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
 <d:prop><d:getetag/><d:getlastmodified/><d:getcontentlength/><d:getcontenttype/><d:resourcetype/>
  <oc:fileid/><oc:size/><oc:permissions/><nc:has-preview/></d:prop>
</d:propfind>' $NC/files/miggi/Notes/ >fixtures/files-notes.xml

# 3. Kalenderliste
curl -su $AUTH -X PROPFIND -H "Depth: 1" -H "Content-Type: application/xml" --data '
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:ic="http://apple.com/ns/ical/" xmlns:c="urn:ietf:params:xml:ns:caldav">
 <d:prop><d:displayname/><cs:getctag/><d:sync-token/><ic:calendar-color/><c:supported-calendar-component-set/><d:resourcetype/></d:prop>
</d:propfind>' $NC/calendars/miggi/ >fixtures/calendars.xml

# 4. Events in einem Zeitraum
curl -su $AUTH -X REPORT -H "Depth: 1" -H "Content-Type: application/xml" --data '
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
 <d:prop><d:getetag/><c:calendar-data/></d:prop>
 <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
  <c:time-range start="20261101T000000Z" end="20261201T000000Z"/></c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>' $NC/calendars/miggi/personal/ >fixtures/events-range.xml

# 5. Delta-Sync (erst mit leerem Token, dann mit dem zurückgegebenen)
curl -su $AUTH -X REPORT -H "Content-Type: application/xml" --data '
<d:sync-collection xmlns:d="DAV:"><d:sync-token/><d:sync-level>1</d:sync-level>
 <d:prop><d:getetag/></d:prop></d:sync-collection>' $NC/calendars/miggi/personal/ >fixtures/calendar-sync.xml

# 6. Adressbücher + Kontakte (Adressbuchname aus der Liste, meist "contacts")
curl -su $AUTH -X PROPFIND -H "Depth: 1" $NC/addressbooks/users/miggi/ >fixtures/addressbooks.xml
curl -su $AUTH -X REPORT -H "Depth: 1" -H "Content-Type: application/xml" --data '
<card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
 <d:prop><d:getetag/><card:address-data/></d:prop></card:addressbook-query>' \
  $NC/addressbooks/users/miggi/contacts/ >fixtures/contacts.xml
