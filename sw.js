/* Service Worker für den Nährstoff-Planer: Die App startet damit auch ohne Internet.
   Bei jeder neuen Version der App VERSION erhöhen, dann holt sich jedes Gerät die neuen Dateien. */
const VERSION = 'np-6.4';
const FIREBASE_VERSION = '10.14.1';   // muss zu FIREBASE_VERSION in index.html passen
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon.png'];
const FIREBASE = ['firebase-app.js', 'firebase-auth.js', 'firebase-database.js']
  .map(f => `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/${f}`);

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE);
    await Promise.all(FIREBASE.map(u => c.add(new Request(u, { mode: 'cors' })).catch(() => { })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

/* Firebase-Bibliotheken und die Schrift ändern sich nie: aus dem Speicher */
const isStatic = url => (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))
  || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
  else if (isStatic(url)) e.respondWith(cacheFirst(req));
  /* Alles andere (Datenbank, Anmeldung) geht ganz normal ins Netz */
});

/* Eigene Dateien: zuerst aus dem Netz (damit Updates sofort ankommen), offline oder nach 4 Sekunden aus dem Speicher */
async function networkFirst(req) {
  const c = await caches.open(VERSION);
  const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; });
  const cached = async () => (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? c.match('./') : undefined);
  try {
    return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('langsam')), 4000))]);
  } catch {
    const hit = await cached();
    if (hit) return hit;
    try { return await net; } catch { return Response.error(); }
  }
}

async function cacheFirst(req) {
  const c = await caches.open(VERSION);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') c.put(req, res.clone());
  return res;
}
