# nextcloud-ui-fast

## Guiding principle

Every view renders from IndexedDB first. The network is only used to revalidate. Parsing happens in the worker. Target: under 100 ms to first paint on navigation.

## Layout

- `src/lib/dav/`: DAV client (CSRF `requesttoken`, If-Match/If-None-Match), request bodies, multistatus parser and typed parsers. Tests run against `fixtures/`.
- `src/lib/ical/`: ICS expansion (ical.js `RecurExpansion` with EXDATE and RECURRENCE-ID) and vCard read/write.
- `src/lib/sync/`: calendar/address book sync (sync-token, multiget, full resync on 403/409/507 invalid token, ctag-based refetch for subscriptions), folder ETag revalidation, chunked upload v2.
- `src/lib/worker/`: everything that touches the network or parses runs here. `api.ts` is the main-thread RPC proxy.
- `src/views/`, `src/components/`: Svelte 5 runes UI. Read from Dexie via `live()` (liveQuery).

## Facts learned from the real server

- A folder's ETag changes when anything below it changes, and sibling folders can share an ETag value.
- Sabre encodes path segments except `A-Za-z0-9_-.~():@`. Build hrefs with `sabreEncode`, never `encodeURIComponent`, or they will not match the cached keys.
- Subscribed calendars (`cs:subscribed`) have a `ctag` but return 404 for `sync-token`.
- Address book names vary (`importv2-1`, not `contacts`). Always discover them from the home set.
- `contact_birthdays` is read-only.
- The DAV root `/remote.php/dav/` only returns `current-user-principal`. `calendar-home-set`/`addressbook-home-set` exist only on the principal URL, so discovery needs two steps.
- Sabre writes CRLF inside `address-data` as `&#13;`, so the XML parser needs `htmlEntities: true`. Hand-written fixtures with LF endings hid this.
- `z-app-generated--contactsinteraction--recent` answers REPORT with 415. Sync it via an etag PROPFIND plus GET.
- An empty href inside the worker resolves to the worker script itself, which shows up as a 405 on `dav.worker-*.js`.
- Properties the server does not know come back in a separate 404 `propstat`. Only 2xx propstats count.

## v2 backlog

Shares, editing recurring events, an optional BFF (Quarkus native) that translates DAV XML into compact JSON, only if the client cache is not enough.

## Conventions

Tests come first (vitest, given/when/then). Format with prettier conventions: 2 spaces, single quotes, 120 columns.
