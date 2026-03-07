/* sw.js — Service Worker v2
 *
 * Cache strategies:
 *   App shell (HTML, CSS, JS, Dexie, Worker, manifest, icons)
 *     → Cache-first, pre-cached on SW install
 *   Dictionary data chunks (/data/xx-xx/*.json)
 *     → Cache-first, populated on demand (lazy per letter)
 *     → Falls back to [] so the app doesn't crash offline
 *   Everything else
 *     → Network-first with cache fallback
 *
 * Web Worker compatibility:
 *   search.worker.js is listed in SHELL_ASSETS so it is pre-cached on
 *   install. When the main thread spawns `new Worker('js/search.worker.js')`
 *   the SW intercepts that fetch and serves it from cache — fully offline.
 *   The worker's own fetch() calls for data chunks are also intercepted.
 *
 * Version bump: increment SHELL_CACHE name to force clients to update.
 */

const SHELL_CACHE = 'urwort-shell-v4';
const DATA_CACHE  = 'urwort-data-v2';
const KNOWN_CACHES = ['urwort-shell-v4', 'urwort-data-v2'];

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/app.css',
  '/js/vendor/dexie.min.js',
  '/js/db.js',
  '/js/search.js',
  '/js/search.worker.js',
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

  // Dictionary data chunks → cache-first, populate on demand
  if (path.startsWith('/data/')) {
    event.respondWith(cacheFirstData(event.request));
    return;
  }

  // Shell assets (includes worker file) → cache-first
  if (isShellAsset(path)) {
    event.respondWith(cacheFirst(SHELL_CACHE, event.request));
    return;
  }

  // Fallback → network-first with shell cache backup
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

async function cacheFirstData(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DATA_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return empty array so the worker gracefully handles missing chunks offline
    return new Response('[]', {
      status:  200,
      headers: { 'Content-Type': 'application/json' },
    });
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
