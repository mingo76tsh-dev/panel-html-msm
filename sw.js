/* sw.js — HSM v7 móvil (cache básico + offline seguro, PROD) */
const CACHE_VER = 'hsmv7-prod-2025-10-31';
const CORE = [
  '/panel-html-msm/',
  '/panel-html-msm/index.html',
  '/panel-html-msm/manifest.json',
  '/panel-html-msm/icons/icon-192.png',
  '/panel-html-msm/icons/icon-512.png',
  '/panel-html-msm/icons/maskable-192.png',
  '/panel-html-msm/icons/maskable-512.png',
  '/panel-html-msm/icons/favicon-16.png',
  '/panel-html-msm/icons/favicon-32.png',
  '/panel-html-msm/icons/apple-touch-icon.png'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE_VER).then(c=>c.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_VER).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e=>{
  const req=e.request, url=new URL(req.url);

  // Cacheamos GET del mismo origen
  if(req.method==='GET' && url.origin===location.origin){
    e.respondWith((async()=>{
      const cache=await caches.open(CACHE_VER);
      const hit=await cache.match(req);
      if(hit) return hit;
      try{
        const net=await fetch(req);
        if(net.ok) cache.put(req, net.clone());
        return net;
      }catch(_){
        if(req.headers.get('accept')?.includes('text/html')) return cache.match('/panel-html-msm/index.html');
        return new Response('',{status:504,statusText:'offline'});
      }
    })());
    return;
  }

  // Para GET externos: red primero, fallback cache
  if(req.method==='GET'){
    e.respondWith((async()=>{
      try{ return await fetch(req); }
      catch(_){ const c=await caches.open(CACHE_VER); return await c.match(req) || new Response('',{status:504}); }
    })());
  }
});
