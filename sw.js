/* sw.js — HSM v7 móvil (prod) */
const SCOPE = '/panel-html-msm/';
const VERSION = 'v7.4';                    // <- si cambiás algo, subí versión
const STATIC_CACHE  = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

// Precargamos solo UI crítica liviana (NO screenshots)
const PRECACHE = [
  `${SCOPE}`,
  `${SCOPE}index.html`,        // en GH Pages puede resolverse a la raíz del repo
  `${SCOPE}manifest.json`,
  `${SCOPE}icons/icon-192.png`,
  `${SCOPE}icons/icon-512.png`,
  `${SCOPE}icons/apple-touch-icon.png`
  // NO incluir screen-*.png acá
];

// Helper: ¿es navegación/HTML?
const isHTML = (req) =>
  req.mode === 'navigate' ||
  (req.headers.get('accept') || '').includes('text/html');

// ----- Install -----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ----- Activate -----
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Navigation Preload puede mejorar LCP
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }

    // Borrar caches viejos
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
          .map((k) => caches.delete(k))
    );

    await self.clients.claim();

    // Ping suave a clientes
    try {
      self.registration.active && self.registration.active.postMessage({ type: 'WARMUP' });
    } catch (_) {}
  })());
});

// ----- Fetch -----
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo manejamos nuestro scope y mismo origen
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(SCOPE)) return;

  // 1) HTML → network-first con preload + fallback cache + offline page
  if (isHTML(request)) {
    event.respondWith((async () => {
      try {
        // Preload si está disponible (puede venir ya descargado por el browser)
        const preload = await event.preloadResponse;
        if (preload && preload.ok) {
          const copy = preload.clone();
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, copy);
          return preload;
        }

        // Fetch normal
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
        // Offline ultra mínimo
        return new Response(
          '<!doctype html><meta charset="utf-8"><body style="background:#0b1220;color:#e5e7eb;font:16px system-ui"><h1>Sin conexión</h1><p>La app sigue disponible offline.</p></body>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  // 2) Estáticos de nuestro scope (NO screenshots) → cache-first con revalidación
  const isScreenshot =
    url.pathname.includes('screen-1080x1920.png') ||
    url.pathname.includes('screen-1920x1080.png');

  const isOurStatic =
    url.pathname.startsWith(SCOPE) &&
    !isScreenshot &&
    /(\.png|\.jpg|\.jpeg|\.svg|\.ico|\.webp|\.css|\.js|\.json)$/i.test(url.pathname);

  if (isOurStatic) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) {
        // Stale-While-Revalidate (actualizamos en background)
        fetch(request).then((r) => {
          if (r && r.ok) cache.put(request, r.clone());
        }).catch(() => {});
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

  // 3) Todo lo demás → dejar pasar (no ensuciamos la cache)
  // (sin respondWith → maneja el navegador)
});

// ----- Background Sync opcional (etiqueta: 'flush-pend') -----
self.addEventListener('sync', (event) => {
  if (event.tag === 'flush-pend') {
    event.waitUntil((async () => {
      const cs = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      cs.forEach((c) => c.postMessage({ type: 'TRY_FLUSH_PEND' }));
    })());
  }
});

// ----- Mensajes utilitarios -----
self.addEventListener('message', (event) => {
  // Te permite, si querés, forzar que la nueva versión del SW tome control ya:
  // navigator.serviceWorker.controller.postMessage({type:'SKIP_WAITING'})
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
