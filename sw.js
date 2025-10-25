/* sw.js — HSM v7 móvil (prod) */
const SCOPE = '/panel-html-msm/';
const VERSION = 'v7.8';                 // será sobrescrito por build.mjs con un tag único
const STATIC_CACHE  = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

const PRECACHE = [
  `${SCOPE}`,
  `${SCOPE}index.html`,
  `${SCOPE}manifest.json`,
  `${SCOPE}icons/icon-192.png`,
  `${SCOPE}icons/icon-512.png`,
  `${SCOPE}icons/apple-touch-icon.png`,
  `${SCOPE}icons/favicon-32.png`,
  `${SCOPE}icons/favicon-16.png`
];

const isHTML = (req) =>
  req.mode === 'navigate' ||
  (req.headers.get('accept') || '').includes('text/html');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
    try {
      const cs = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      cs.forEach(c => c.postMessage({ type: 'SW_ACTIVATED', version: VERSION }));
    } catch (_) {}
    try { self.registration.active && self.registration.active.postMessage({ type: 'WARMUP' }); } catch (_) {}
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(SCOPE)) return;

  if (isHTML(request)) {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload && preload.ok) {
          const copy = preload.clone();
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, copy);
          return preload;
        }
        const net = await fetch(request, { cache: 'no-store' });
        if (!net || net.status >= 400) throw new Error('bad html');
        const copy = net.clone();
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, copy);
        return net;
      } catch (_) {
        const cache = await caches.open(RUNTIME_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        return new Response('<!doctype html><meta charset="utf-8"><body style="background:#0b1220;color:#e5e7eb;font:16px system-ui"><h1>Sin conexión</h1><p>La app sigue disponible offline.</p></body>', { headers: { 'Content-Type': 'text/html; charset=utf-8' }});
      }
    })());
    return;
  }

  const isScreenshot =
    url.pathname.includes('screen-1080x1920') ||
    url.pathname.includes('screen-1920x1080');

  const isOurStatic =
    url.pathname.startsWith(SCOPE) &&
    !isScreenshot &&
    /(\.png|\.jpg|\.jpeg|\.svg|\.ico|\.webp|\.css|\.js|\.json)$/i.test(url.pathname);

  if (isOurStatic) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) {
        fetch(request).then((r) => { if (r && r.ok) cache.put(request, r.clone()); }).catch(()=>{});
        return cached;
      }
      try {
        const net = await fetch(request);
        if (net && net.ok) cache.put(request, net.clone());
        return net;
      } catch (_) {
        return cached || Response.error();
      }
    })());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'flush-pend') {
    event.waitUntil((async () => {
      const cs = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      cs.forEach((c) => c.postMessage({ type: 'TRY_FLUSH_PEND' }));
    })());
  }
});
