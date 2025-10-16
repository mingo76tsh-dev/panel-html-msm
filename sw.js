// sw.js — HSM móvil — v1.4.0
const VERSION = 'v1.4.0';
const PREFIX = 'hsm-cache';
const STATIC_CACHE  = `${PREFIX}-static-${VERSION}`;
const RUNTIME_CACHE = `${PREFIX}-runtime-${VERSION}`;
const IMG_CACHE     = `${PREFIX}-img-${VERSION}`;

const SCOPE = self.registration.scope;           // p.ej. https://.../panel-html-msm/
const P = (rel) => new URL(rel, SCOPE).toString();

const STATIC_ASSETS = [
  P('./'),
  P('index.html'),
  P('manifest.json'),
  P('icons/maskable-192.png'),
  P('icons/maskable-512.png')
];

const sameOrigin = (url) => new URL(url, self.location.href).origin === self.location.origin;
const isHTML = (req, evt) =>
  req.mode === 'navigate' ||
  (req.method === 'GET' && req.headers.get('accept')?.includes('text/html')) ||
  (evt && evt.request.destination === 'document');

async function putInCache(cacheName, request, response, maxEntries) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  if (maxEntries) {
    const keys = await cache.keys();
    if (keys.length > maxEntries) await cache.delete(keys[0]); // FIFO
  }
}
async function cleanOldCaches() {
  const names = await caches.keys();
  const alive = [STATIC_CACHE, RUNTIME_CACHE, IMG_CACHE];
  await Promise.all(names.map(n => (n.startsWith(PREFIX) && !alive.includes(n) ? caches.delete(n) : Promise.resolve())));
}
function timeoutFetch(request, ms = 9000) {
  const ctrl = new AbortController(); const id = setTimeout(()=>ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(()=>clearTimeout(id));
}

// Install
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', (event) => {
  event.waitUntil((async ()=>{
    await cleanOldCaches();
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    await self.clients.claim();
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(c => c.postMessage({ type: 'SW_ACTIVATED', version: VERSION }));
  })());
});

// Message
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Fetch
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Nunca cachear POST ni non-GET (Apps Script /exec)
  if (req.method !== 'GET') {
    event.respondWith(fetch(req).catch(() => new Response(null, { status: 503 })));
    return;
  }

  // HTML → network-first con preload + fallback a index cacheado
  if (isHTML(req, event)) {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) { putInCache(RUNTIME_CACHE, req, preload.clone()); return preload; }
        const net = await timeoutFetch(req, 8000);
        if (net && net.ok) { putInCache(RUNTIME_CACHE, req, net.clone()); return net; }
        throw new Error('net-fail');
      } catch {
        const cached = await caches.match(P('index.html'));
        return cached || new Response('<h1>Offline</h1>', { headers: { 'Content-Type':'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  const url = new URL(req.url);

  // Otro origen → sólo imágenes con cache liviano
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

  // Misma-origen
  if (req.destination === 'script' || req.destination === 'style') {
    // stale-while-revalidate
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const upd = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(()=>null);
      return cached || (await upd) || new Response('', { status: 504 });
    })());
    return;
  }

  if (req.destination === 'image' || url.pathname.includes('/icons/')) {
    // cache-first (límite)
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        if (net && net.ok) await putInCache(IMG_CACHE, req, net.clone(), 80);
        return net;
      } catch { return new Response('', { status: 504 }); }
    })());
    return;
  }

  if (req.destination === 'manifest' || url.pathname.endsWith('.json')) {
    // cache-first para JSON del sitio
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

  // Resto → cache-first + update en bg
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const net = fetch(req).then(res => { if (res && res.ok) putInCache(RUNTIME_CACHE, req, res.clone(), 100); return res; }).catch(()=>null);
    return cached || (await net) || new Response('', { status: 504 });
  })());
});
