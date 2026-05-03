// VinoFlow service worker — minimal "app shell" cache.
// Strategy:
//   - HTML / index : network-first (so deploys are picked up quickly)
//   - JS / CSS / assets / icons : cache-first (Vite hashes filenames so safe)
//   - API calls (/api/) : network-only, never cached (data must be fresh)

const CACHE = 'vinoflow-v1';
const ASSET_PATHS = [
  '/manifest.webmanifest',
  '/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSET_PATHS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return; // let the browser handle cross-origin

  // API: never cache
  if (url.pathname.startsWith('/api/')) return;

  // HTML / root: network-first, fallback to cache
  if (event.request.mode === 'navigate' || event.request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(event.request, clone)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match('/')))
    );
    return;
  }

  // Static assets: cache-first
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(event.request, clone)).catch(() => {});
          return res;
        });
      })
    );
  }
});
