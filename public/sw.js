/**
 * Service Worker – LDRRMO Diplahan Emergency Response System
 * Provides:
 *  - Offline fallback for the SPA shell
 *  - The React app flushes authenticated offline reports when the page reconnects
 *  - Cache-first for static assets, network-first for API calls
 */

const CACHE_NAME = 'ldrrmo-v1';

const STATIC_URLS = [
  '/',
  '/manifest.json',
  '/favicon.png',
];

// ── Install: pre-cache the app shell ─────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_URLS))
  );
  self.skipWaiting();
});

// ── Activate: purge old caches ───────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for API, cache-first for statics ────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Always network-first for backend APIs, including PHP session and device endpoints.
  if (
    url.searchParams.has('action') ||
    url.pathname.startsWith('/api/')
  ) {
    event.respondWith(fetch(request).catch(() => new Response('{}', { status: 503 })));
    return;
  }

  // Cache-first for same-origin static assets
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request).then((response) => {
          // Cache successful GET responses for static assets
          if (response.ok && (url.pathname.match(/\.(js|css|png|jpg|svg|woff2?)$/))) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() =>
          // Offline fallback: return cached index.html for navigation requests
          request.destination === 'document'
            ? caches.match('/')
            : new Response('', { status: 503 })
        )
      )
    );
  }
});
