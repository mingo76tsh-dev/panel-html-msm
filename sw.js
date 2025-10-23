/* HSM v7 • SW minimal robusto para GitHub Pages
   Estrategias:
   - Navegación (HTML): network-first, fallback cache.
   - GET estáticos mismos origen: stale-while-revalidate.
   - Sync: avisa al cliente para que intente flush de la outbox (implementada en index).
*/
const SCOPE = '/panel-html-msm/';
const VERSION = 'v7.0.0';
const CACHE_CORE = `hsm-core-${VERSION}`;
const CACHE_STATIC = `hsm-static-${VERSION}`;

const CORE = [
  // entry
  `${SCOPE}`,
  `${SCOPE}index.html`,
  // manifest + sw
  `${SCOPE}manifest.json`,
  `${SCOPE}sw.js`,
  // assets obvios (ajustar si cambiás nombres)
  `${SCOPE}icons/icon-192.png`,
  `${SCOPE}icons/icon-512.png`,
  `${SCOPE}icons/apple-touch-icon.png`,
  `${SCOPE}icons/favicon.png`,
  `${SCOPE}icons/screen-1080x1920.png`,
  `${SCOPE}icons/screen-1920x1080.png`
];

// Utilidad segura para filtrar mismas-origin y scope
const sameOriginInScope = (url) => {
  try {
    const u = new URL(url);
    return u.origin === self.location.origin && u.pathname.startsWith(SCOPE);
  } catch { return false; }
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_CORE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => (k.startsWith('hsm-core-') || k.startsWith('hsm-static-')) && ![CACHE_CORE, CACHE_STATIC].includes(k))
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
    // Notificar que hay nueva versión para recarga amable
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(c => c.postMessage({ type: 'SW_ACTIVATED', version: VERSION }));
  })());
});

// Mensajes desde la página
self.addEventListener('message', (ev) => {
  const msg = ev.data || {};
  if (msg.type === 'WARMUP') {
    // precalienta algo si querés
  }
  if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch: GET en scope -> SWR; Navegación -> network-first
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo intervenimos GET del mismo origen o navegaciones
  const isNavigation = req.mode === 'navigate';
  const isSame = url.origin === self.location.origin;

  if (isNavigation && isSame) {
    event.respondWith(navHandler(req));
    return;
  }

  if (req.method === 'GET' && isSame && url.pathname.startsWith(SCOPE)) {
    event.respondWith(swrHandler(req));
    return;
  }

  // Para Apps Script (otro origen) dejamos pasar tal cual.
});

// Network-first para HTML (navegación) con fallback a cache core
async function navHandler(request) {
  try {
    const net = await fetch(request);
    const clone = net.clone();
    const cache = await caches.open(CACHE_CORE);
    cache.put(`${SCOPE}index.html`, clone); // mantener fresco el shell
    return net;
  } catch {
    const cache = await caches.open(CACHE_CORE);
    return (await cache.match(`${SCOPE}index.html`)) || Response.error();
  }
}

// Stale-While-Revalidate para estáticos
async function swrHandler(request) {
  const cache = await caches.open(CACHE_STATIC);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((net) => {
    cache.put(request, net.clone());
    return net;
  }).catch(() => null);
  return cached || fetchPromise || Response.error();
}

// Background Sync: cuando el navegador lo dispare, avisamos al cliente
self.addEventListener('sync', (event) => {
  if (event.tag === 'flush-pend') {
    event.waitUntil(notifyClients({ type: 'TRY_FLUSH_PEND' }));
  }
});

async function notifyClients(msg) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(c => c.postMessage(msg));
}
