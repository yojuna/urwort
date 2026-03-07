/* sw.js — Service Worker v5 (v2 architecture)
 *
 * Cache strategies:
 *   App shell (HTML, CSS, JS, workers, manifest, icons)
 *     → Cache-first, pre-cached on SW install
 *
 *   /data/{dir}/index/{letter}.json  (slim index chunks — seeding)
 *     → Network-first during seeding (always fresh), cached after
 *
 *   /data/{dir}/data/{letter}.json   (full data chunks — lazy detail)
 *     → Cache-first, populated on first word detail open
 *
 *   External requests (DWDS API etc.)
 *     → Pass-through, not cached
 *
 * Version: bump SHELL_CACHE to force all clients to update.
 */

const SHELL_CACHE  = 'urwort-shell-v5';
const DATA_CACHE   = 'urwort-data-v3';
const KNOWN_CACHES = [SHELL_CACHE, DATA_CACHE];

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/app.css',
  '/js/vendor/dexie.min.js',
  '/js/db.js',
  '/js/search.js',
  '/js/kaikki.js',
  '/js/seed.worker.js',
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

  // Slim index chunks: network-first so seeding always gets fresh data,
  // then cache the response for offline re-seed attempts.
  if (path.match(/^\/data\/[a-z-]+\/index\//)) {
    event.respondWith(networkFirstData(event.request));
    return;
  }

  // Full data chunks: cache-first for fast offline detail views.
  if (path.match(/^\/data\/[a-z-]+\/data\//)) {
    event.respondWith(cacheFirstData(event.request));
    return;
  }

  // Shell assets (HTML, CSS, JS, workers) → cache-first
  if (isShellAsset(path)) {
    event.respondWith(cacheFirst(SHELL_CACHE, event.request));
    return;
  }

  // Everything else → network with shell cache backup
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

async function networkFirstData(request) {
  // Try network first; fall back to cache; final fallback: empty array
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DATA_CACHE);
      cache.put(request, response.clone());
      return response;
    }
  } catch { /* offline */ }

  const cached = await caches.match(request);
  if (cached) return cached;

  return new Response('[]', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
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
    // Return empty array so the app degrades gracefully offline
    return new Response('[]', {
      status: 200,
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
