/* HSM v7 • SW (DEV) – scope ./ */
const CACHE_VER = "hsmv7-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.dev.json",
  "./icons/favicon-16.png",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/screen-1080x1920.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_VER).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_VER).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Helpers */
const timeoutFetch = (req, ms=3500) =>
  Promise.race([
    fetch(req),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))
  ]);

const putRuntime = async (req, resClone) => {
  try {
    const cache = await caches.open(CACHE_VER);
    await cache.put(req, resClone);
  } catch {}
};

/* Estrategias:
   - Navegaciones: network-first c/timeout -> fallback index.html
   - GET estáticos same-origin: cache-first + revalidate
   - POST/otros métodos: pasa directo
*/
self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // No tocamos POST/PUT/etc
  if (request.method !== "GET") return;

  // Navegaciones (SPA)
  if (request.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const net = await timeoutFetch(request, 4000);
        // Si viene bien, cacheamos index también (opcional)
        putRuntime("./index.html", net.clone());
        return net;
      } catch {
        const cache = await caches.open(CACHE_VER);
        const cached = await cache.match("./index.html");
        return cached || new Response("Offline", {status:503, headers:{'Content-Type':'text/plain'}});
      }
    })());
    return;
  }

  // Estáticos same-origin -> cache-first + revalidate
  if (sameOrigin && (
      url.pathname.startsWith("/icons/") ||
      url.pathname.endsWith(".png") ||
      url.pathname.endsWith(".jpg") ||
      url.pathname.endsWith(".svg") ||
      url.pathname.endsWith(".webp") ||
      url.pathname.endsWith(".json") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".js"))
    ) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_VER);
      const hit = await cache.match(request);
      if (hit) {
        // Revalidamos en segundo plano
        timeoutFetch(request, 6000)
          .then(r => r.ok && putRuntime(request, r.clone()))
          .catch(()=>{});
        return hit;
      }
      const net = await fetch(request);
      if (net.ok) putRuntime(request, net.clone());
      return net;
    })());
    return;
  }

  // Resto GET -> network-first con fallback a cache si existiera
  e.respondWith((async () => {
    try {
      const net = await fetch(request);
      if (sameOrigin && net.ok) putRuntime(request, net.clone());
      return net;
    } catch {
      const cache = await caches.open(CACHE_VER);
      const cached = await cache.match(request);
      if (cached) return cached;
      // Si es recurso navegable no-encontrado, damos index
      if (request.headers.get("accept")?.includes("text/html")) {
        const fallback = await cache.match("./index.html");
        if (fallback) return fallback;
      }
      return new Response("Offline", {status:503});
    }
  })());
});

/* Mensajes desde la app para actualizar SW sin recargar varias veces */
self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});
