/* sw.js — HSM v7 Móvil (pro+) — v1.5.0 */
/// 𝙉𝙤𝙩𝙖: el scope real lo determina el registro desde /panel-html-msm/
const VERSION = 'v1.5.0';
const PREFIX  = 'hsm-cache';
const STATIC  = `${PREFIX}-static-${VERSION}`;
const RUNTIME = `${PREFIX}-rt-${VERSION}`;
const IMAGES  = `${PREFIX}-img-${VERSION}`;

// ===== Helpers de rutas (resuelven contra el scope real del SW)
const SCOPE_URL = new URL(self.registration.scope);
const P = (rel) => new URL(rel, SCOPE_URL).toString();

const CORE_ASSETS = [
  P('./'),                    // entry real del scope
  P('index.html'),
  P('manifest.json'),
  P('icons/maskable-192.png'),
  P('icons/maskable-512.png'),
];

// ===== Utils
const sameOrigin = (req) => new URL(req.url).origin === location.origin;
const isHTML = (req, evt) =>
  req.mode === 'navigate' ||
  (req.method === 'GET' && req.headers.get('accept')?.includes('text/html')) ||
  (evt && evt.request.destination === 'document');

async function put(cacheName, request, response, maxEntries) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  if (maxEntries) {
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
      // FIFO: limpia los más antiguos
      await cache.delete(keys[0]);
    }
  }
}

async function cleanStaleCaches() {
  const keep = [STATIC, RUNTIME, IMAGES];
  const names = await caches.keys();
  await Promise.all(
    names.map((n) => (n.startsWith(PREFIX) && !keep.includes(n) ? caches.delete(n) : null))
  );
}

function timeoutFetch(request, ms = 10000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(id));
}

function htmlOfflineResponse() {
  const html = `
  <!doctype html><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Offline • HSM</title>
  <style>
    html,body{height:100%;margin:0;background:#0b1220;color:#e5e7eb;
      font:14px/1.46 system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
    .c{max-width:560px;margin:0 auto;display:flex;height:100%;align-items:center}
    .card{background:#0f172a;border:1px solid #1f2a44;border-radius:16px;padding:16px;box-shadow:0 8px 28px rgba(0,0,0,.35)}
    .mut{color:#94a3b8}
    button{margin-top:10px;border:1px solid #1f2a44;background:#13203b;color:#e5e7eb;
      border-radius:10px;padding:10px 14px;cursor:pointer}
  </style>
  <div class="c"><div class="card">
    <h3>Estás sin conexión</h3>
    <div class="mut">Podés seguir usando la app; al volver la red, enviá <b>Pendientes</b>.</div>
    <button onclick="location.reload()">Reintentar</button>
  </div></div>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ===== Install (precache core)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC).then((c) => c.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// ===== Activate (clean + navigation preload + notify)
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await cleanStaleCaches();
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    await self.clients.claim();

    // Notifica a las páginas que hay nueva versión
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach((c) => c.postMessage({ type: 'SW_ACTIVATED', version: VERSION }));
  })());
});

// ===== Mensajes (opcional: skipWaiting, sync manual)
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;
  if (data === 'SKIP_WAITING') self.skipWaiting();

  // Si la página quiere pedir un sync manual (background sync opcional)
  if (data === 'REQUEST_SYNC' && 'sync' in self.registration) {
    self.registration.sync.register('flush-pend').catch(() => {});
  }
});

// ===== Background Sync (ganancia opcional)
// La página puede escuchar este evento vía postMessage si hace falta.
self.addEventListener('sync', async (event) => {
  if (event.tag === 'flush-pend') {
    event.waitUntil((async () => {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      clients.forEach(c => c.postMessage({ type: 'SYNC_REQUESTED' }));
    })());
  }
});

// ===== Fetch strategies
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // No tocar métodos no-GET (Apps Script /exec, etc.)
  if (req.method !== 'GET') {
    event.respondWith(fetch(req).catch(() => new Response(null, { status: 503 })));
    return;
  }

  // Navegaciones/HTML: network-first + navigationPreload + fallback al index del STATIC
  if (isHTML(req, event)) {
    event.respondWith((async () => {
      try {
        // Usa la respuesta pre-cargada si existe (navigation preload)
        const preload = await event.preloadResponse;
        if (preload) {
          put(RUNTIME, req, preload.clone(), 40);
          return preload;
        }
        const net = await timeoutFetch(req, 8000);
        if (net && net.ok) {
          put(RUNTIME, req, net.clone(), 40);
          return net;
        }
        throw new Error('net-fail');
      } catch {
        const cached = await caches.match(P('index.html'));
        return cached || htmlOfflineResponse();
      }
    })());
    return;
  }

  const url = new URL(req.url);

  // Recursos de otro origen: deja pasar, salvo imágenes (cache-first light)
  if (url.origin !== location.origin) {
    if (req.destination === 'image') {
      event.respondWith((async () => {
        const c = await caches.open(IMAGES);
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const net = await fetch(req, { mode: 'no-cors' });
          // no-cors responses son opaques, igual sirven para cache de CDNs
          put(IMAGES, req, net.clone(), 80);
          return net;
        } catch {
          return new Response('', { status: 504 });
        }
      })());
    }
    return;
  }

  // ===== Misma-origen: estrategias por tipo =====

  // JS / CSS → stale-while-revalidate
  if (req.destination === 'script' || req.destination === 'style') {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const cached = await cache.match(req);
      const fetchAndUpdate = fetch(req)
        .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      return cached || (await fetchAndUpdate) || new Response('', { status: 504 });
    })());
    return;
  }

  // Imágenes / íconos → cache-first con límite
  if (req.destination === 'image' || url.pathname.includes('/icons/')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        if (net && net.ok) await put(IMAGES, req, net.clone(), 100);
        return net;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // JSON / manifest → cache-first, con actualización oportunista
  if (req.destination === 'manifest' || url.pathname.endsWith('.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const hit = await cache.match(req);
      const net = fetch(req)
        .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      return hit || (await net) || new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    })());
    return;
  }

  // Fuentes → cache-first (evita FOUT offline)
  if (req.destination === 'font') {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const net = await fetch(req).catch(() => null);
      if (net && net.ok) await put(RUNTIME, req, net.clone(), 40);
      return net || new Response('', { status: 504 });
    })());
    return;
  }

  // Resto (misma-origen) → cache-first con revalidación en segundo plano
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const net = fetch(req)
      .then((res) => { if (res && res.ok) put(RUNTIME, req, res.clone(), 100); return res; })
      .catch(() => null);
    return cached || (await net) || new Response('', { status: 504 });
  })());
});
// ---- Background Sync: pedir a los clientes que envíen pendientes
self.addEventListener('sync', (event) => {
  if (event.tag === 'flush-pend') {
    event.waitUntil((async () => {
      const clis = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      for (const c of clis) {
        // La página escuchará este mensaje y llamará a boxFlush()
        c.postMessage({ type: 'BG_SYNC_FLUSH' });
      }
    })());
  }
});
