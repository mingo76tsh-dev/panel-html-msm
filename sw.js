/* HSM v7 • SW “excelencia” */
const SCOPE = '/panel-html-msm/';
const VERSION = 'v7.2.' + (self.registration ? self.registration.scope.length : '') + '.20251022';
const CACHE_APP   = `app-${VERSION}`;
const CACHE_ASSET = `asset-${VERSION}`;

const APP_SHELL = [
  `${SCOPE}`,
  `${SCOPE}index.html`,
  `${SCOPE}manifest.json`,
  `${SCOPE}sw.js`,
  `${SCOPE}icons/icon-192.png`,
  `${SCOPE}icons/icon-512.png`,
  `${SCOPE}icons/apple-touch-icon.png`
];

/* Utilidades */
const isGET = req => req.method === 'GET';
const sameOrigin = url => new URL(url, self.location.href).origin === self.location.origin;
const isNav = req => req.mode === 'navigate';

/* Instalación: pre-cache del shell */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_APP).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

/* Activación: limpia versiones viejas y avisa a clientes */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![CACHE_APP, CACHE_ASSET].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: 'SW_ACTIVATED', version: VERSION });
    }
  })());
});

/* Estrategias:
   - Navegación: network-first (timeout) → cache → /index.html
   - Estáticos same-origin: stale-while-revalidate
   - Apps Script (Google): network-first con fallback 503 JSON */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!isGET(request)) return;

  // Navegaciones
  if (isNav(request)) {
    event.respondWith(navNetworkFirst(request));
    return;
  }

  const url = new URL(request.url);

  // Apps Script (API backend)
  if (/^https:\/\/script\.google(usercontent)?\.com/.test(url.origin) ||
      url.hostname === 'script.google.com') {
    event.respondWith(apiNetworkFirst(request));
    return;
  }

  // Estáticos same-origin
  if (sameOrigin(request.url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Cross-origin estáticos: cache primero, si no → red
  event.respondWith(staleWhileRevalidate(request));
});

/* Mensajes desde la página */
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'WARMUP') {
    caches.open(CACHE_APP).then(c => c.addAll(APP_SHELL).catch(()=>{}));
  }
  if (msg.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ------------------ Estrategias concretas ------------------ */

async function navNetworkFirst(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(request, { signal: controller.signal });
    clearTimeout(timeout);
    if (res && res.ok) return res;
    throw 0;
  } catch {
    const cache = await caches.open(CACHE_APP);
    return (await cache.match(`${SCOPE}index.html`)) ||
           (await cache.match('/index.html')) ||
           Response.error();
  }
}

async function apiNetworkFirst(request) {
  try {
    const res = await fetch(request, { cache: 'no-store' });
    if (res && res.ok) return res;
    throw 0;
  } catch {
    // Fallback JSON amable cuando no hay red
    return new Response(JSON.stringify({ ok:false, offline:true, code:'OFFLINE' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_ASSET);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}
