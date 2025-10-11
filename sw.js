// sw.js — HSM v7 Móvil
const VERSION = 'v1.0.0';
const CACHE_NAME = `hsm-cache-${VERSION}`;

// Archivos mínimos para arrancar offline
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Instala y precachea
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activa y limpia caches viejos
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// Estrategia: cache-first con fallback a red; si falla, devolver index.html
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Sólo manejamos mismas-orígenes (evita problemas CORS)
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  if (!sameOrigin) return;

  e.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req)
        .then(res => {
          // Cacheamos GET exitosos
          if (req.method === 'GET' && res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => cached || caches.match('./index.html'));
      return cached || fetchPromise;
    })
  );
});
