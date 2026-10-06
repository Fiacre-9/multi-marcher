/* BoutiquePro – service worker
   - Coquille de l'application disponible hors ligne (l'écran s'ouvre même sans réseau).
   - Les appels /api ne sont JAMAIS mis en cache : les ventes et stocks restent toujours à jour et sécurisés. */
const V = 'bp-v4';
const SHELL = ['/', '/style.css', '/app.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-32.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  const imgs = u.pathname.startsWith('/icons/') || u.pathname.startsWith('/uploads/');
  e.respondWith(imgs ? cacheFirst(r) : networkFirst(r));
});
async function cacheFirst(r) {
  const c = await caches.open(V), hit = await c.match(r);
  if (hit) return hit;
  const res = await fetch(r);
  if (res.ok) c.put(r, res.clone());
  return res;
}
async function networkFirst(r) {
  const c = await caches.open(V);
  try {
    const res = await fetch(r);
    if (res.ok) c.put(r.mode === 'navigate' ? '/' : r, res.clone());
    return res;
  } catch (err) {
    return (await c.match(r)) || (r.mode === 'navigate' ? c.match('/') : Response.error());
  }
}

/* notifications push : s'affichent même application fermée */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'BoutiquePro', {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/favicon-32.png', tag: d.tag || 'bp', renotify: true, vibrate: [120, 60, 120],
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((l) => (l.length ? l[0].focus() : self.clients.openWindow('/'))));
});
