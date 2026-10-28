const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `ui-${VERSION}`;
const base = new URL(self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([base, ...PRECACHE.map((path) => base + path)]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(base)) return;
  const key = event.request.mode === 'navigate' ? base : event.request;
  event.respondWith(caches.match(key, { cacheName: CACHE }).then((hit) => hit ?? fetch(event.request)));
});
