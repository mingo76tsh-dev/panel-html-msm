// sw.js — HSM v7 Móvil (pro)
const VERSION = 'v1.3.0';
const PREFIX = 'hsm-cache';
const STATIC_CACHE = `${PREFIX}-static-${VERSION}`;
const RUNTIME_CACHE = `${PREFIX}-runtime-${VERSION}`;
const IMG_CACHE = `${PREFIX}-img-${VERSION}`;

// Archivos mínimos para arrancar offline
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // agrega aquí tus CSS/JS empacados si los separás del index
];

// --- Utils
const sameOrigin = (url) => new URL(url, self.location.href).origin === self.location.origin;
const isHTML = (req, evt) =>
  req.mode === 'navigate' ||
  (req.method === 'GET' &&
   req.headers.get('accept') &&
   req.headers.get('accept').includes('text/html')) ||
  (evt && evt.request.destination === 'document');

async function putInCache(cacheName, request, response, maxEntries) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  if (maxEntries) {
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
      // FIFO: elimina los más antiguos
      await cache.delete(keys[0]);
    }
  }
}

async function cleanOldCaches() {
  const names = await caches.keys();
  const alive = [STATIC_CACHE, RUNTIME_CACHE, IMG_CACHE];
  await Promise.all(
    names.map((n) => (n.startsWith(PREFIX) && !alive.includes(n) ? caches.delete(n) : Promise.resolve()))
  );
}

function timeoutFetch(request, ms = 10000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(id));
}

// --- Install: precache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// --- Activate: claim & limpiar viejos + navigation preload
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await cleanOldCaches();
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    await self.clients.claim();
    // Notifica a las páginas que hay nueva versión
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach((c) => c.postMessage({ type: 'SW_ACTIVATED', version: VERSION }));
  })());
});

// --- Mensajes: permitir skipWaiting desde la UI (opcional)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// --- Fetch strategies
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Evita cachear POST o non-GET (ej. /exec de Apps Script)
  if (req.method !== 'GET') {
    event.respondWith(fetch(req).catch(() => new Response(null, { status: 503 })));
    return;
  }

  // Navegaciones/HTML: network-first + preload + fallback a index
  if (isHTML(req, event)) {
    event.respondWith((async () => {
      try {
        // Usa navigation preload si está disponible
        const preload = await event.preloadResponse;
        if (preload) {
          putInCache(RUNTIME_CACHE, req, preload.clone());
          return preload;
        }
        const net = await timeoutFetch(req, 8000);
        if (net && net.ok) {
          putInCache(RUNTIME_CACHE, req, net.clone());
          return net;
        }
        throw new Error('net-fail');
      } catch {
        // Fallback offline
        const cached = await caches.match('./index.html');
        return cached || new Response('<h1>Offline</h1>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
    })());
    return;
  }

  const url = new URL(req.url);

  // Recursos de otro origen: deja pasar (no cachea) salvo imágenes CORS simples
  if (!sameOrigin(url)) {
    // Para imágenes externas sencillas aplica cache-first con límite
    if (req.destination === 'image') {
      event.respondWith((async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const net = await fetch(req, { mode: 'no-cors' });
          // Respuestas opaques no pueden re-usarse siempre; aun así guardamos para hits futuros
          putInCache(IMG_CACHE, req, net.clone(), 60);
          return net;
        } catch {
          return new Response('', { status: 504 });
        }
      })());
      return;
    }
    // El resto pasa directo
    return;
  }

  // Misma-origen: estrategias por tipo
  // 1) JS / CSS -> stale-while-revalidate
  if (req.destination === 'script' || req.destination === 'style') {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const fetchAndUpdate = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      return cached || (await fetchAndUpdate) || new Response('', { status: 504 });
    })());
    return;
  }

  // 2) Imágenes / íconos -> cache-first con límite
  if (req.destination === 'image' || url.pathname.startsWith('/icons/')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        if (net && net.ok) await putInCache(IMG_CACHE, req, net.clone(), 80);
        return net;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // 3) JSON/manifest → cache-first
  if (req.destination === 'manifest' || url.pathname.endsWith('.json')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        if (net && net.ok) await putInCache(RUNTIME_CACHE, req, net.clone(), 40);
        return net;
      } catch {
        return cached || new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  // 4) Resto (misma-origen) → cache-first con actualización en segundo plano
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const netPromise = fetch(req)
      .then((res) => {
        if (res && res.ok) putInCache(RUNTIME_CACHE, req, res.clone(), 100);
        return res;
      })
      .catch(() => null);

    return cached || (await netPromise) || new Response('', { status: 504 });
  })());
});
