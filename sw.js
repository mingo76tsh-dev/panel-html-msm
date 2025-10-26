/* sw.js — HSM v7 móvil (prod) */
const SCOPE   = '/panel-html-msm/';
const VERSION = 'v7.8.0';                     // ⟵ Bumpeá este string para forzar update
const STATIC  = `static-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;

// Precargamos solo lo esencial y estable (sin query-strings)
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((n) => n !== STATIC && n !== RUNTIME)
        .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

// Estrategias:
// - Navegaciones (HTML): networkFirst → fallback a index (offline)
// - Precarga/estáticos del mismo origen: cacheFirst → revalida en background
// - Terceros: pasa directo (sin cache)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo GET
  if (req.method !== 'GET') return;

  // Navegaciones (SPA/hash): mantenerlas vivas offline
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstHTML(req));
    return;
  }

  // Solo mismo origen para cachear recursos estáticos
  if (url.origin === self.location.origin) {
    // Si es algo del scope panel-html-msm, usamos cacheFirst
    if (url.pathname.startsWith(SCOPE)) {
      event.respondWith(cacheFirst(req));
      return;
    }
  }

  // Resto: por red sin interferir
  return;
});

async function networkFirstHTML(request) {
  const cache = await caches.open(RUNTIME);
  try {
    const res = await fetch(request, { credentials: 'same-origin' });
    // Guardar sólo si es OK (200) y del mismo origen
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    // Offline fallback: index.html precacheado
    const cached = await caches.match(`${SCOPE}index.html`, { ignoreSearch: true });
    if (cached) return cached;
    // Respuesta mínima si algo salió muy mal
    return new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' }});
  }
}

async function cacheFirst(request) {
  // Ignoramos el querystring para que /icons/x.png?v=… resuelva al mismo asset
  const urlNoQS = new Request(request.url.split('?')[0], { headers: request.headers, method: request.method, mode: request.mode, credentials: request.credentials, redirect: request.redirect, referrer: request.referrer, integrity: request.integrity, cache: request.cache });
  const cached = await caches.match(urlNoQS, { ignoreSearch: true });
  if (cached) {
    // Revalidación en background (SW no bloquea la respuesta)
    revalidate(urlNoQS);
    return cached;
  }
  const res = await fetch(request).catch(() => null);
  if (res && res.ok) {
    const cache = await caches.open(RUNTIME);
    cache.put(urlNoQS, res.clone());
  }
  return res || new Response('', { status: 504 });
}

async function revalidate(request) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const cache = await caches.open(RUNTIME);
      await cache.put(request, res.clone());
    }
  } catch { /* silencioso */ }
}
