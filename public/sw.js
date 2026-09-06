// Shell-only cache. Deliberately does NOT cache /api/* or serve stale
// market data -- that would silently violate the no-fake-data rule by
// showing old prices without the honest STALE labeling the rest of the
// app uses. If the network is down, API calls fail normally and the
// existing STALE/UNAVAILABLE UI states handle it (see marketData.ts /
// ingest.ts). The service worker's only job is making the app shell
// (static JS/CSS/fonts/icons) load instantly.
const SHELL_CACHE = 'pulse-shell-v1';
const SHELL_ASSETS = ['/', '/dashboard', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // Best-effort: don't fail install if one asset 404s in dev.
      Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept API/data calls, and never intercept the SSE stream --
  // both must always hit the network so freshness stays honest.
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
