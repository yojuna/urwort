/* sw.js — Service Worker
   Strategy:
     - App shell (HTML, CSS, JS, manifest, icons): Cache-first, cached on install
     - Dictionary data chunks (data/xx-xx/*.json): Cache-first, fetched & cached on demand
     - Everything else: Network-first with cache fallback
*/

const SHELL_CACHE   = 'urwort-shell-v1';
const DATA_CACHE    = 'urwort-data-v1';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/app.css',
  '/js/db.js',
  '/js/search.js',
  '/js/ui.js',
  '/js/app.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ---- Install: cache shell ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// ---- Activate: clean up old caches ----
self.addEventListener('activate', (event) => {
  const KNOWN = [SHELL_CACHE, DATA_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !KNOWN.includes(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ---- Fetch ----
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) return;

  const path = url.pathname;

  // Data chunks → cache-first, populate on demand
  if (path.startsWith('/data/')) {
    event.respondWith(cacheFirstData(event.request));
    return;
  }

  // Shell assets → cache-first
  if (isShellAsset(path)) {
    event.respondWith(cacheFirst(SHELL_CACHE, event.request));
    return;
  }

  // Default → network-first with shell cache fallback
  event.respondWith(networkFirst(event.request));
});

// ---- Strategies ----

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
    return new Response('Offline', { status: 503 });
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
