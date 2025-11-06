// Cachea solo GET del mismo origen. No toca POST ni cross-origin.
const CACHE = 'hsm-v7-v1';
const ASSETS = ['./','./index.html','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e=>{
  const req=e.request;
  const same = new URL(req.url).origin===self.location.origin;
  if(req.method!=='GET' || !same) return;               // ← evita romper CORS/preflight
  e.respondWith(
    caches.match(req).then(c=>c || fetch(req).then(r=>{
      const copy=r.clone(); caches.open(CACHE).then(ch=>ch.put(req,copy)); return r;
    }).catch(()=> c || new Response('Offline',{status:503})))
  );
});
