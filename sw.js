// sw.js — cache básico y BYPASS para Apps Script

const CACHE = 'hsm-v1';
const ASSETS = [
  // Precache mínimo; el resto se cachea on-demand
  './',
  './index.html',
  './manifest.json'
];

const BYPASS = (url) =>
  url.startsWith('https://script.google.com/') ||
  url.startsWith('https://script.googleapis.com/');

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(()=> self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    // Notificar actualización
    const all = await self.clients.matchAll({ includeUncontrolled: true });
    all.forEach(c => c.postMessage('sw:updated'));
  })());
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // >>> No interceptar Apps Script (evita CORS raros y respuestas vacías)
  if (BYPASS(url)) return;

  // Cache-first para GET del mismo origen
  if (event.request.method === 'GET') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(event.request);
      if (cached) return cached;

      const resp = await fetch(event.request);
      try {
        const sameOrigin = new URL(url).origin === location.origin;
        if (sameOrigin && resp.ok) cache.put(event.request, resp.clone());
      } catch {}
      return resp;
    })());
  }
  // Para POST/otros métodos: dejar pasar a la red (no respondWith)
});

