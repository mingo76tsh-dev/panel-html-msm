/* sw.js — HSM v7 móvil */
const SCOPE = '/panel-html-msm/';
const VERSION = 'v7.3';
const STATIC_CACHE = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;
const QUEUE = 'hsm-outbox';

// Precargamos solo UI crítica liviana (NO screenshots)
const PRECACHE = [
  `${SCOPE}`,
  `${SCOPE}index.html`,        // si existe (en GH Pages puede ser la raíz del repo)
  `${SCOPE}manifest.json`,
  `${SCOPE}icons/icon-192.png`,
  `${SCOPE}icons/icon-512.png`,
  `${SCOPE}icons/apple-touch-icon.png`
  // NADA de screen-*.png acá
];

// Pequeño helper
const isHTML = (req) => req.mode === 'navigate' ||
  (req.headers.get('accept') || '').includes('text/html');

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => ![STATIC_CACHE, RUNTIME_CACHE].includes(k)).map(k => caches.delete(k))
    );
    await self.clients.claim();
    // Calentamos levemente
    self.registration.active && self.registration.active.postMessage({ type: 'WARMUP' });
  })());
});

// Estrategias:
// - HTML: network-first → fallback cache → offline page mínima
// - Estáticos del scope (css/js/png/svg/etc): cache-first con revalidate asíncrona
// - Imágenes "extrañas" (screenshots, externos): dejamos pasar (no interceptar)
// - No cachear respuestas con status >= 400

self.addEventListener('fetch', (e) => {
  const { request } = e;

  // Solo manejamos nuestro scope
  if (!new URL(request.url).pathname.startsWith(SCOPE)) return;

  // 1) Navegación/HTML → network-first
  if (isHTML(request)) {
    e.respondWith((async () => {
      try {
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
        // fallback ultra mínima
        return new Response('<!doctype html><meta charset="utf-8"><body style="background:#0b1220;color:#e5e7eb;font:16px system-ui"><h1>Sin conexión</h1><p>La app sigue disponible offline.</p></body>', { headers: { 'Content-Type': 'text/html;charset=utf-8' }});
      }
    })());
    return;
  }

  // 2) Recursos estáticos del scope (NO screenshots)
  const u = new URL(request.url);
  const isOurStatic = u.pathname.startsWith(SCOPE) &&
    !u.pathname.includes('screen-1080x1920.png') &&
    !u.pathname.includes('screen-1920x1080.png');

  if (isOurStatic && /(\.png|\.jpg|\.jpeg|\.svg|\.ico|\.webp|\.css|\.js|\.json)$/i.test(u.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) {
        // SWR: revalidamos a un costado
        fetch(request).then(r => (r && r.ok) ? cache.put(request, r.clone()) : 0).catch(()=>{});
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
    return;
  }

  // 3) Todo lo demás: dejar pasar (no ensuciar cache con 404/galería)
  // (No respondWith → el navegador maneja normal)
});

// (Opcional) background sync (nombre de etiqueta en tu app: 'flush-pend')
self.addEventListener('sync', (e) => {
  if (e.tag === 'flush-pend') {
    e.waitUntil((async () => {
      // Tu app hace postMessage TRY_FLUSH_PEND → el cliente lo ejecuta
      const cs = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      cs.forEach(c => c.postMessage({ type: 'TRY_FLUSH_PEND' }));
    })());
  }
});

