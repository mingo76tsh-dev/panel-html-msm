// sw.js — HSM v7 Móvil (pro) — v1.3.2
const VERSION = 'v1.3.2';
const PREFIX = 'hsm-cache';
const STATIC_CACHE  = `${PREFIX}-static-${VERSION}`;
const RUNTIME_CACHE = `${PREFIX}-runtime-${VERSION}`;
const IMG_CACHE     = `${PREFIX}-img-${VERSION}`;

// ===== Helpers de rutas (soporta GitHub Pages con subcarpeta)
const SCOPE = self.registration.scope; // ej: https://usuario.github.io/panel-html-msm/
const P = (rel) => new URL(rel, SCOPE).toString();

// Archivos mínimos para arrancar offline
const STATIC_ASSETS = [
  P('./'),              // página inicial dentro del scope real
  P('index.html'),
  P('manifest.json'),
  P('icons/icon-192.png'),
  P('icons/icon-512.png'),
  // si más adelante separás CSS/JS, agrégalos aquí con P('app.css')/P('app.js')
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
      await cache.delete(keys[0]); // FIFO
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
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// --- Fetch strategies
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // No cachear POST (ej. Apps Script /exec) ni non-GET
  if (req.method !== 'GET') {
    event.respondWith(fetch(req).catch(() => new Response(null, { status: 503 })));
    return;
  }

  // Navegaciones/HTML: network-first + preload + fallback al index de STATIC
  if (isHTML(req, event)) {
    event.respondWith((async () => {
      try {
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
        // Fallback offline: usa el index del cache estático
        const cached = await caches.match(P('index.html'));
        return cached || new Response('<h1>Offline</h1>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
    })());
    return;
  }

  const url = new URL(req.url);

  // Recursos de otro origen: deja pasar (no cachea) salvo imágenes simples
  if (!sameOrigin(url)) {
    if (req.destination === 'image') {
      event.respondWith((async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const net = await fetch(req, { mode: 'no-cors' });
          putInCache(IMG_CACHE, req, net.clone(), 60);
          return net;
        } catch {
          return new Response('', { status: 504 });
        }
      })());
    }
    return;
  }

  // Misma-origen: estrategias por tipo
  // 1) JS / CSS -> stale-while-revalidate
  if (req.destination === 'script' || req.destination === 'style') {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const fetchAndUpdate = fetch(req)
        .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      return cached || (await fetchAndUpdate) || new Response('', { status: 504 });
    })());
    return;
  }

  // 2) Imágenes / íconos -> cache-first con límite
  if (req.destination === 'image' || url.pathname.includes('/icons/')) {
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
      .then((res) => { if (res && res.ok) putInCache(RUNTIME_CACHE, req, res.clone(), 100); return res; })
      .catch(() => null);
    return cached || (await netPromise) || new Response('', { status: 504 });
  })());
});
