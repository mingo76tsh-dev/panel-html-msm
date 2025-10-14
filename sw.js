// sw.js — HSM Móvil (pro) — v1.4.0
// Mejora sobre tu v1.3.2: navegación offline más sólida, normalización de keys,
// listas "no cache", avisos de update, límites coherentes y mejores fallbacks.

const VERSION = 'v1.4.0';
const PREFIX  = 'hsm-cache';
const STATIC_CACHE  = `${PREFIX}-static-${VERSION}`;
const RUNTIME_CACHE = `${PREFIX}-runtime-${VERSION}`;
const IMG_CACHE     = `${PREFIX}-img-${VERSION}`;

const LIMITS = {
  runtime: 120,  // respuestas varias
  images:  100,  // imágenes/íconos
  json:     60   // .json / manifest
};

// ===== Helpers de rutas (soporta GitHub Pages con subcarpeta)
const SCOPE = self.registration.scope; // ej: https://usuario.github.io/panel-html-msm/
const P = (rel) => new URL(rel, SCOPE).toString();

// Archivos mínimos para arrancar offline
const STATIC_ASSETS = [
  P('./'),
  P('index.html'),
  P('manifest.json'),
  P('icons/icon-192.png'),
  P('icons/icon-512.png'),
];

// Dominios/patrones que NO queremos cachear nunca (APIs dinámicas, Apps Script)
const NEVER_CACHE_REGEX = [
  /\/macros\/s\/[^/]+\/exec/i, // Google Apps Script WebApp
  /\/macros\/s\/[^/]+\/dev/i,
  /\/api\//i
];

// --- Utils
const sameOrigin = (url) => new URL(url, self.location.href).origin === self.location.origin;

const isHTML = (req, evt) =>
  req.mode === 'navigate' ||
  (req.method === 'GET' &&
   req.headers.get('accept') &&
   req.headers.get('accept').includes('text/html')) ||
  (evt && evt.request && evt.request.destination === 'document');

// Normaliza requests para que /index.html?x=y cachee como /index.html
function normalizeRequestForCache(req) {
  try {
    const url = new URL(req.url);
    // Si es navegación o document/html, cachear por index.html “limpio”
    if (req.destination === 'document' || isHTML(req)) {
      url.search = '';
      url.hash = '';
      url.pathname = url.pathname.endsWith('/') ? url.pathname : url.pathname.replace(/[^/]+$/, 'index.html');
      return new Request(url.toString(), { method: 'GET', headers: req.headers, mode: 'same-origin', credentials: 'same-origin' });
    }
    // Para archivos estáticos, ignorar querystring común de cache-busting (?v=...)
    if (/\.(?:css|js|png|jpg|jpeg|gif|svg|webp|ico|json)$/i.test(url.pathname)) {
      url.hash = '';
      if (url.search && /(^|\?)v=\w+/.test(url.search)) url.search = '';
      return new Request(url.toString(), req);
    }
  } catch (e) { /* noop */ }
  return req;
}

async function putInCache(cacheName, request, response, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
    if (maxEntries) {
      const keys = await cache.keys();
      if (keys.length > maxEntries) {
        // FIFO simple: borramos las más viejas
        await cache.delete(keys[0]);
      }
    }
  } catch (_) { /* noop */ }
}

async function cleanOldCaches() {
  const names = await caches.keys();
  const alive = [STATIC_CACHE, RUNTIME_CACHE, IMG_CACHE];
  await Promise.all(
    names.map((n) => (n.startsWith(PREFIX) && !alive.includes(n) ? caches.delete(n) : Promise.resolve()))
  );
}

function timeoutFetch(request, ms = 10000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(id));
}

function matchesNeverCache(urlStr) {
  return NEVER_CACHE_REGEX.some(rx => rx.test(urlStr));
}

function safeJSONResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj || {}), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

// --- Install: precache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// --- Activate: claim & limpiar viejos + navigation preload
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await cleanOldCaches();
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    await self.clients.claim();

    // Notifica a las páginas que hay nueva versión
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    for (const c of clients) {
      c.postMessage({ type: 'SW_ACTIVATED', version: VERSION });
    }
  })());
});

// --- Mensajes: permitir skipWaiting desde la UI (opcional)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// --- Fetch strategies
self.addEventListener('fetch', (event) => {
  const reqOrig = event.request;

  // Pasar HEAD/OPTIONS tal cual
  if (reqOrig.method === 'HEAD' || reqOrig.method === 'OPTIONS') {
    event.respondWith(fetch(reqOrig));
    return;
  }

  // No cachear POST/PUT/PATCH/DELETE (Apps Script /exec, etc.)
  if (reqOrig.method !== 'GET') {
    event.respondWith(
      fetch(reqOrig).catch(() => new Response(null, { status: 503 }))
    );
    return;
  }

  // No cachear endpoints dinámicos marcados
  if (matchesNeverCache(reqOrig.url)) {
    event.respondWith(
      fetch(reqOrig).catch(() => new Response(null, { status: 504 }))
    );
    return;
  }

  // Navegaciones/HTML: network-first + preload + fallback a index precacheado
  if (isHTML(reqOrig, event)) {
    event.respondWith((async () => {
      try {
        // 1) Navigation Preload si está disponible
        const preload = await event.preloadResponse;
        if (preload && preload.ok) {
          const norm = normalizeRequestForCache(reqOrig);
          putInCache(RUNTIME_CACHE, norm, preload.clone(), LIMITS.runtime);
          return preload;
        }

        // 2) Red normal con timeout
        const net = await timeoutFetch(reqOrig, 8000);
        if (net && net.ok) {
          const norm = normalizeRequestForCache(reqOrig);
          putInCache(RUNTIME_CACHE, norm, net.clone(), LIMITS.runtime);
          return net;
        }
        throw new Error('net-fail');
      } catch {
        // 3) Fallback offline: servimos el index del precache
        const cached = await caches.match(P('index.html'));
        return cached || new Response('<h1>Offline</h1>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // Resto de GET
  const url = new URL(reqOrig.url);

  // Recursos de otro origen
  if (!sameOrigin(url)) {
    // Imágenes externas: cache-first con límite
    if (reqOrig.destination === 'image') {
      event.respondWith((async () => {
        const cached = await caches.match(reqOrig);
        if (cached) return cached;
        try {
          // Para CORS estrictos, dejamos que sea opaca si hace falta
          const net = await fetch(reqOrig, { mode: 'no-cors' });
          // Sólo cacheamos si algo vino (opaque o ok)
          await putInCache(IMG_CACHE, reqOrig, net.clone(), LIMITS.images);
          return net;
        } catch {
          return new Response('', { status: 504 });
        }
      })());
    }
    // Otros externos: passthrough
    return;
  }

  // Misma-origen: normalizamos la request para mejorar hit-ratio
  const req = normalizeRequestForCache(reqOrig);

  // 1) JS / CSS → stale-while-revalidate
  if (req.destination === 'script' || req.destination === 'style') {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const fetchAndUpdate = fetch(req)
        .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      return cached || (await fetchAndUpdate) || new Response('', { status: 504 });
    })());
    return;
  }

  // 2) Imágenes / íconos → cache-first con límite
  if (req.destination === 'image' || url.pathname.includes('/icons/')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        if (net && (net.ok || net.type === 'opaque')) await putInCache(IMG_CACHE, req, net.clone(), LIMITS.images);
        return net;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // 3) JSON/manifest → cache-first (con fallback JSON vacío)
  if (req.destination === 'manifest' || url.pathname.endsWith('.json')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        if (net && net.ok) await putInCache(RUNTIME_CACHE, req, net.clone(), LIMITS.json);
        return net;
      } catch {
        return cached || safeJSONResponse({}, 200);
      }
    })());
    return;
  }

  // 4) Resto (misma-origen) → cache-first con actualización en segundo plano
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const netPromise = fetch(req)
      .then((res) => { if (res && res.ok) putInCache(RUNTIME_CACHE, req, res.clone(), LIMITS.runtime); return res; })
      .catch(() => null);
    return cached || (await netPromise) || new Response('', { status: 504 });
  })());
});
