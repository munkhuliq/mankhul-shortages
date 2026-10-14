// Service Worker for Mankhul Shortages System
const CACHE_NAME = 'mankhul-pwa-v10:' + new URL(self.registration.scope).pathname;
const STATIC_ASSETS = [
  './',
  'index.html',
  'style.css',
  'config.js?v=3.1',
  'app.js?v=3.1',
  'helpers.js?v=3.1',
  'manifest.json',
  'icon.svg',
  'logo.jpg'
].map(path => new URL(path, self.registration.scope).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith('mankhul-pwa-') && key !== CACHE_NAME && (key.endsWith(':' + new URL(self.registration.scope).pathname) || (new URL(self.registration.scope).pathname === '/' && !key.includes(':')))) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // لا تقم بتخزين طلبات الـ API أو الطلبات غير GET
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io') || url.origin !== self.location.origin) {
    return;
  }

  // استراتيجية Network-First للملفات الثابتة مع fallback للكاش
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone)));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match(new URL('index.html', self.registration.scope).href);
          }
          return new Response('', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});
