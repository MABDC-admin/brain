// Command Brain — Service Worker
// Provides offline caching (cache-first for assets, network-first for API)

const CACHE_NAME = 'cmdbrain-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ── Install: pre-cache static shell ───────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting(); // Force activate new service worker immediately
});

// ── Activate: remove old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() =>
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) client.navigate(client.url);
      })
    )
  );
  self.clients.claim(); // Take control of all pages immediately
});

// ── Fetch: network-first for HTML & API, cache-first for assets ──────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isAPI = requestUrl.pathname.startsWith('/api/') || requestUrl.pathname.startsWith('/items');
  const isHTML = event.request.headers.get('accept')?.includes('text/html');

  if (isAPI) {
    // Network first for API
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
  } else if (isHTML) {
    // Network first for HTML ensures we always load the latest index.js chunk
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
  } else {
    // Cache first for assets (js, css, images) - update in background
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // Ignore network errors for old hashed assets that no longer exist
        });
        return cached || networkFetch;
      })
    );
  }
});

// ── Push notifications ─────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || { title: 'Command Brain', body: 'You have a reminder!' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/favicon.svg',
      badge:   '/favicon.svg',
      vibrate: [200, 100, 200],
      data:    { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data?.url || '/');
    })
  );
});
