# nextcloud-ui-fast

A fast, local-first web UI for Nextcloud: files, calendar and contacts. Svelte 5 + Vite as a static SPA served under `/ui/` on the same domain as Nextcloud, so it reuses the existing Nextcloud session.

The frontend does not make Nextcloud faster. It feels fast because every view renders from IndexedDB first and only revalidates over the network:

- **Files**: folder ETags. A folder is re-listed only when its ETag changed; subfolders with a changed ETag are prefetched, and so are folders you hover.
- **Calendar and contacts**: `sync-collection` (RFC 6578) with `sync-token`, so after the first sync only changes are transferred. Subscribed (webcal) calendars have no sync token and are refetched only when their `ctag` changes.
- **Web Worker**: all network traffic, XML parsing (`fast-xml-parser`), ICS/vCard parsing (`ical.js`) and recurrence expansion run in a worker. The main thread only renders.
- **Optimistic UI**: rename, move, delete and event/contact edits are written to IndexedDB first and rolled back if the server rejects them.
- **App shell**: the service worker precaches the shell together with every hashed asset of the same build (`scripts/sw-manifest.js` writes the list into `sw.js`), in a cache named after that build. After a deploy, the old version keeps working until the new worker takes over and reloads the page once. Assets are served with `Cache-Control: immutable` and pre-compressed with Brotli and gzip at build time.
- **Markdown preview**: sanitized with DOMPurify before rendering, because the page shares the Nextcloud origin and session.

## Scope (v1)

| Area     | Features                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Files    | browse, upload (chunked v2 for files > 10 MB, drag & drop), download, rename, move, delete, new folder, previews                           |
| Calendar | month and week view (the last chosen view is remembered), create/edit/delete events; recurring events are display-only                     |
| Contacts | list, search, detail, create/edit/delete                                                                                                   |
| Notes    | Markdown/text editor with edit, split and preview modes, Ctrl+S, conflict detection via `If-Match`, relative images from the note's folder |

## Auth

The UI uses the Nextcloud cookie session. DAV requests carry the CSRF token from `/index.php/csrftoken` in the `requesttoken` header. If there is no session, the UI links to `/login?redirect_url=/ui/`.

## Development

The package manager is pnpm (pinned via `packageManager`; `corepack enable` provides it).

```bash
pnpm install
NC_URL=https://cloud.example.org pnpm dev   # proxies /remote.php, /index.php, /login
pnpm test                                   # needs local fixtures/, see below
pnpm check
pnpm build
```

Because the session cookie belongs to the Nextcloud domain, log in through the dev server's proxied `/login` page.

### Fixtures

The tests run against real DAV responses in `fixtures/`, generated with `fixues.sh` (set `AUTH="user:app-password"` in your shell first). `fixtures/` is in `.gitignore` and never committed, even after anonymization. `contacts-synthetic.xml` is hand-written because the real address book was empty.

## Deployment

The image (`ghcr.io/<owner>/nextcloud-ui-fast`) is Alpine + nginx with `brotli_static`/`gzip_static`. It listens on `:8080`, runs as a non-root user, and serves `/ui/*` with SPA fallback. There is deliberately no Go binary in the image: Caddy 2.11.7 still ships go1.26.8 with Critical CVEs. `/healthz` returns 200. The GitHub Action runs `pnpm audit --audit-level high`, prettier, svelte-check, and a Grype scan of the image (fails on fixable High/Critical). It then builds `linux/amd64` and `linux/arm64` and pushes on `main` and `v*` tags. A weekly scheduled run catches newly published CVEs. All actions are pinned to commit SHAs.

Traefik route with higher priority than the Nextcloud route:

```yaml
match: Host(`cloud.example.org`) && PathPrefix(`/ui`)
priority: 100
services:
  - name: nextcloud-ui-fast
    port: 8080
```
