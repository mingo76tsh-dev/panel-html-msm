// sw.js
const CACHE_VERSION = 'v7.0.6';                            // ⇦ súbelo cuando hagas cambios
const PREFIX = (self.registration && self.registration.scope.includes('/panel-html-msm/'))
  ? '/panel-html-msm/' : '/';

const CACHE_NAME = `hsm-cache-${CACHE_VERSION}`;
const APP_SHELL = [
  `${PREFIX}`,
  `${PREFIX}index.html`,
  `${PREFIX}manifest.json`,
  `${PREFIX}icons/icon-192.png`,
  `${PREFIX}icons/icon-512.png`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('hsm-cache-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(resp => {
          // Evita cachear respuestas no válidas
          if (!resp || resp.status !== 200 || resp.type === 'opaque') return resp;
          caches.open(CACHE_NAME).then(c => c.put(request, resp.clone()));
          return resp;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});
