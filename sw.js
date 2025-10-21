/* sw.js — HSM v7 Móvil (pro+) — versión se pisa en build */
/* ========================================================================== */
/* Rutas pensadas para GitHub Pages en /panel-html-msm/                       */
/* ========================================================================== */

/* (Opcional) Warmup manual desde el cliente */
const APP_SHELL = [
  '/panel-html-msm/',
  '/panel-html-msm/index.html',
  '/panel-html-msm/manifest.json',
  '/panel-html-msm/sw.js',
];
const ICONS = [
  '/panel-html-msm/icons/favicon.png',
  '/panel-html-msm/icons/apple-touch-icon.png',
  '/panel-html-msm/icons/icon-192.png',
  '/panel-html-msm/icons/icon-512.png',
  '/panel-html-msm/icons/maskable-192.png',
  '/panel-html-msm/icons/maskable-512.png',
];

/* ===== Versionado de caches ===== */
const VERSION = 'dev-v1.6.0';
const PREFIX  = 'hsm-cache';
const STATIC  = `${PREFIX}-static-${VERSION}`;
const RUNTIME = `${PREFIX}-rt-${VERSION}`;
const IMAGES  = `${PREFIX}-img-${VERSION}`;

/* ===== Helpers de rutas (resuelven contra el scope real del SW) ===== */
const SCOPE_URL = new URL(self.registration.scope);
const P = (rel) => new URL(rel, SCOPE_URL).toString();

/* Core que se precachea en install */
const CORE_ASSETS = [
  P('./'),
  P('index.html'),
  P('manifest.json'),
  P('icons/maskable-192.png'),
  P('icons/maskable-512.png'),
];

/* ===== Utils ===== */
const isHTML = (req, evt) =>
  req.mode === 'navigate' ||
  (req.method === 'GET' && req.headers.get('accept')?.includes('text/html')) ||
  (evt && evt.request.destination === 'document');

async function put(cacheName, request, response, maxEntries) {
  if (!response) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  if (maxEntries) {
    const keys = await cache.keys();
    if (keys.length > maxEntries) await cache.delete(keys[0]); // FIFO simple
  }
}

async function cleanStaleCaches() {
  const keep = [STATIC, RUNTIME, IMAGES];
  const names = await caches.keys();
  await Promise.all(names.map((n) => (n.startsWith(PREFIX) && !keep.includes(n) ? caches.delete(n) : null)));
}

function timeoutFetch(request, ms = 10000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(id));
}

function htmlOfflineResponse() {
  const html = `<!doctype html><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Offline • HSM</title>
  <style>
    html,body{height:100%;margin:0;background:#0b1220;color:#e5e7eb;font:14px/1.46 system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
    .c{max-width:560px;margin:0 auto;display:flex;height:100%;align-items:center}
    .card{background:#0f172a;border:1px solid #1f2a44;border-radius:16px;padding:16px;box-shadow:0 8px 28px rgba(0,0,0,.35)}
    .mut{color:#94a3b8}
    button{margin-top:10px;border:1px solid #1f2a44;background:#13203b;color:#e5e7eb;border-radius:10px;padding:10px 14px;cursor:pointer}
  </style>
  <div class="c"><div class="card">
    <h3>Estás sin conexión</h3>
    <div class="mut">Podés seguir usando la app; al volver la red, enviá <b>Pendientes</b>.</div>
    <button onclick="location.reload()">Reintentar</button>
  </div></div>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function svgOfflineImg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240">
    <rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="50%" dy=".35em"
    fill="#cbd5e1" font-family="system-ui,Segoe UI,Roboto,Helvetica,Arial" font-size="16" text-anchor="middle">
    Offline</text></svg>`;
  return new Response(svg, { headers: { 'Content-Type':'image/svg+xml' } });
}

async function broadcast(msg){
  const clis = await self.clients.matchAll({ includeUncontrolled:true, type:'window' });
  for (const c of clis) c.postMessage(msg);
}

/* ===== Install (precache core) ===== */
self.addEventListener('install', (event) => {
  event.waitUntil((async ()=>{
    try { const c = await caches.open(STATIC); await c.addAll(CORE_ASSETS); } catch(_){}
  })());
  self.skipWaiting();
});

/* ===== Activate (clean + navigation preload + notify) ===== */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await cleanStaleCaches();
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    await self.clients.claim();
    await broadcast({ type: 'SW_ACTIVATED', version: VERSION });
  })());
});

/* ===== Mensajes desde la página ===== */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;

  if (data === 'SKIP_WAITING') self.skipWaiting();

  if (data.type === 'WARMUP') {
    event.waitUntil((async () => {
      try { const c  = await caches.open(STATIC); await c.addAll(APP_SHELL); } catch {}
      try { const ic = await caches.open(IMAGES); await ic.addAll(ICONS); } catch {}
    })());
  }

  if (data === 'REQUEST_SYNC' && 'sync' in self.registration) {
    self.registration.sync.register('flush-pend').catch(() => {});
  }
});

/* ===== Background Sync ===== */
self.addEventListener('sync', (event) => {
  if (event.tag === 'flush-pend') {
    event.waitUntil(broadcast({ type: 'TRY_FLUSH_PEND' }));
  }
});

/* ===== Fetch strategies ===== */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') {
    event.respondWith(fetch(req).catch(() => new Response(null, { status: 503 })));
    return;
  }

  // Navegaciones/HTML: network-first + navigationPreload + SPA fallback
  if (isHTML(req, event)) {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) { put(RUNTIME, req, preload.clone(), 40); return preload; }
        const net = await timeoutFetch(req, 8000);
        if (net && net.ok) { put(RUNTIME, req, net.clone(), 40); return net; }
        throw new Error('net-fail');
      } catch {
        const same = await caches.match(req, { ignoreSearch:true });
        if (same) return same;
        const cached = await caches.match(P('index.html'));
        return cached || htmlOfflineResponse();
      }
    })());
    return;
  }

  const url = new URL(req.url);

  // Otros orígenes: solo imágenes → cache-first light (sin guardar fallos opacos)
  if (url.origin !== location.origin) {
    if (req.destination === 'image') {
      event.respondWith((async () => {
        const c = await caches.open(IMAGES);
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const net = await fetch(req, { mode: 'no-cors' });
          if (net) await put(IMAGES, req, net.clone(), 80);
          return net;
        } catch {
          return svgOfflineImg();
        }
      })());
    }
    return;
  }

  // Misma-origen:

  // JS / CSS → stale-while-revalidate
  if (req.destination === 'script' || req.destination === 'style') {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const cached = await cache.match(req);
      const fetchAndUpdate = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
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
        return svgOfflineImg();
      }
    })());
    return;
  }

  // JSON / manifest → cache-first + actualización oportunista
  if (req.destination === 'manifest' || url.pathname.endsWith('.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return hit || (await net) || new Response('{}', {
        status: 200, headers: { 'Content-Type': 'application/json' }
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

  // Resto (misma-origen) → cache-first con revalidación en 2º plano
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const net = fetch(req).then((res) => {
      if (res && res.ok) put(RUNTIME, req, res.clone(), 100);
      return res;
    }).catch(() => null);
    return cached || (await net) || new Response('', { status: 504 });
  })());
});
