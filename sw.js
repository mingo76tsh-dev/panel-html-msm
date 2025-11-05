/* sw.js — HSM v7 móvil (cache básico + offline) */
const CACHE_VER = 'hsmv7-prod-2025-11-01';
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
  // Cache first para recursos del mismo origen y dentro del scope
  if(req.method==='GET' && url.origin===location.origin && url.pathname.startsWith('/panel-html-msm/')){
    e.respondWith((async()=>{
      const cache=await caches.open(CACHE_VER);
      const hit=await cache.match(req);
      if(hit){
        // update silencioso en segundo plano
        fetch(req).then(res=>{ if(res.ok) cache.put(req,res.clone()); }).catch(()=>{});
        return hit;
      }
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
  // Otros GET: red primero, fallback cache si existiera
  if(req.method==='GET'){
    e.respondWith((async()=>{
      try{ return await fetch(req); }
      catch(_){ const c=await caches.open(CACHE_VER); return await c.match(req) || new Response('',{status:504}); }
    })());
  }
});
