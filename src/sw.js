/* sw.js — Service Worker v6 (v3 architecture: API-backed)
 *
 * Cache strategies:
 *   App shell (HTML, CSS, JS, manifest, icons)
 *     → Cache-first, pre-cached on install
 *
 *   /api/* (FastAPI backend)
 *     → Network-only; IDB caching is handled by app.js/db.js
 *
 *   Everything else
 *     → Network with shell cache fallback
 *
 * Bump SHELL_CACHE version to force full cache update on all clients.
 */

const SHELL_CACHE  = 'urwort-shell-v6';
const KNOWN_CACHES = [SHELL_CACHE];

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/app.css',
  '/js/vendor/dexie.min.js',
  '/js/db.js',
  '/js/search.js',
  '/js/ui.js',
  '/js/app.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !KNOWN_CACHES.includes(k))
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GETs
  if (url.origin !== location.origin) return;
  if (event.request.method !== 'GET') return;

  const path = url.pathname;

  // API calls: pass through (not cached — IDB handles caching)
  if (path.startsWith('/api/')) return;

  // Shell assets → cache-first
  if (isShellAsset(path)) {
    event.respondWith(cacheFirst(SHELL_CACHE, event.request));
    return;
  }

  // Everything else → network with cache fallback
  event.respondWith(networkFirst(event.request));
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function isShellAsset(path) {
  return SHELL_ASSETS.some(a => {
    const ap = new URL(a, 'http://x').pathname;
    return ap === path || (a === '/' && path === '/index.html');
  });
}

async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}
