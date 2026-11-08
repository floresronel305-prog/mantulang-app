const C='mantulang-v16',A=['./','index.html','style.css','app.js','firebase-config.js','manifest.webmanifest','icon-192.png','icon-512.png','lgu-logo.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(A)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||!r.url.startsWith(self.location.origin))return;
if(r.mode==='navigate'){e.respondWith(fetch(r).then(x=>{const c=x.clone();caches.open(C).then(y=>y.put(r,c));return x}).catch(()=>caches.match(r).then(m=>m||caches.match('index.html'))));return}
e.respondWith(caches.match(r).then(m=>{const f=fetch(r).then(x=>{if(x.ok){const c=x.clone();caches.open(C).then(y=>y.put(r,c))}return x}).catch(()=>m);return m||f}))});
