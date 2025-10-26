/* sw.js — HSM v7 móvil (prod) */
const SCOPE = '/panel-html-msm/';
const VERSION = 'v7.8';                 // bump para forzar update
const STATIC_CACHE  = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

const PRECACHE = [
  `${SCOPE}`,
  `${SCOPE}index.html`,
  `${SCOPE}manifest.json`,
  `${SCOPE}icons/icon-96.png`,
  `${SCOPE}icons/icon-192.png`,
  `${SCOPE}icons/icon-512.png`,
  `${SCOPE}icons/maskable-192.png`,
  `${SCOPE}icons/maskable-512.png`,
  `${SCOPE}icons/apple-touch-icon.png`,
  `${SCOPE}icons/favicon-32.png`,
  `${SCOPE}icons/favicon-16.png`
];

// Util: abrir cache seguro
async function openStatic()  { return caches.open(STATIC_CACHE); }
async function openRuntime() { return caches.open(RUNTIME_CACHE); }

// Install: precache y activar al toque
self.addEventListener('install', (event) => {
  event.waitUntil(
    openStatic()
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate: limpiar versiones viejas
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('static-') || k.startsWith('runtime-'))
          .filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Mensajes desde la página (skip waiting)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Fetch strategy:
// - Solo misma-origen GET → cache-first para PRECACHE y stale-while-revalidate para el resto.
// - POST / requests externos → passthrough.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;

  if (!sameOrigin) {
    // Requests a terceros: passthrough (sin cache)
    return;
  }

  // Si está en PRECACHE → cache-first
  if (PRECACHE.some(path => url.pathname === path || url.pathname === path.replace(`${SCOPE}`, '/panel-html-msm/'))) {
    event.respondWith(
      caches.match(req).then(res => res || fetch(req))
    );
    return;
  }

  // Para el resto de /panel-html-msm → stale-while-revalidate
  if (url.pathname.startsWith(SCOPE)) {
    event.respondWith((async () => {
      const cache = await openRuntime();
      const cached = await cache.match(req);
      const netFetch = fetch(req).then(resp => {
        // Cachear sólo 200/opaque simples
        if (resp && (resp.status === 200 || resp.type === 'opaque')) {
          cache.put(req, resp.clone());
        }
        return resp;
      }).catch(() => cached || Response.error());
      return cached || netFetch;
    })());
  }
});
