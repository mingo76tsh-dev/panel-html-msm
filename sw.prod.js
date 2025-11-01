/* HSM v7 • SW (PROD) – scope /panel-html-msm/ */
const BASE = "/panel-html-msm/";
const CACHE_VER = "hsmv7-v1";
const path = (p) => (p.startsWith("/") ? p : BASE + p.replace(/^\.?\//,""));
const INDEX = path("index.html");

const APP_SHELL = [
  path("./"),
  INDEX,
  path("manifest.json"),
  path("icons/favicon-16.png"),
  path("icons/favicon-32.png"),
  path("icons/icon-192.png"),
  path("icons/icon-512.png"),
  path("icons/maskable-192.png"),
  path("icons/maskable-512.png"),
  path("icons/apple-touch-icon.png"),
  path("icons/screen-1080x1920.png")
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_VER).then(c => c.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_VER).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

const timeoutFetch = (req, ms=3500) =>
  Promise.race([fetch(req), new Promise((_, rej)=>setTimeout(()=>rej(new Error("timeout")), ms))]);

const putRuntime = async (req, resClone) => {
  try { const cache = await caches.open(CACHE_VER); await cache.put(req, resClone); } catch {}
};

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (request.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const preload = await e.preloadResponse;
        if (preload) { putRuntime(INDEX, preload.clone()); return preload; }
        const net = await timeoutFetch(request, 4000);
        putRuntime(INDEX, net.clone());
        return net;
      } catch {
        const cache = await caches.open(CACHE_VER);
        const cached = await cache.match(INDEX);
        return cached || new Response("Offline", {status:503, headers:{'Content-Type':'text/plain'}});
      }
    })());
    return;
  }

  if (sameOrigin && url.pathname.startsWith(BASE)) {
    e.respondWith((async ()=>{
      const cache = await caches.open(CACHE_VER);
      const hit = await cache.match(request);
      if (hit) {
        timeoutFetch(request, 6000).then(r=>r.ok && putRuntime(request, r.clone())).catch(()=>{});
        return hit;
      }
      const net = await fetch(request);
      if (net.ok) putRuntime(request, net.clone());
      return net;
    })());
    return;
  }

  e.respondWith((async ()=>{
    try {
      const net = await fetch(request);
      if (sameOrigin && net.ok) putRuntime(request, net.clone());
      return net;
    } catch {
      const cache = await caches.open(CACHE_VER);
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.headers.get("accept")?.includes("text/html")) {
        const fallback = await cache.match(INDEX);
        if (fallback) return fallback;
      }
      return new Response("Offline", {status:503});
    }
  })());
});

self.addEventListener("message", (e) => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });

