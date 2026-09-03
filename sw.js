/* minimal service worker: offline shell + notification click focus */
const C = 'momroute-3';
const FILES = ['./','./index.html','./style.css','./manifest.webmanifest',
  './js/state.js','./js/travel.js','./js/planner.js','./js/notes.js','./js/secret.js','./js/notify.js','./js/ui.js'];
self.addEventListener('install', e => { self.skipWaiting();
  e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).catch(()=>{})); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;             // never cache API calls
  // сеть всегда в приоритете и мимо HTTP-кэша, иначе правки не доезжают
  e.respondWith(fetch(e.request, { cache: 'no-store' })
    .catch(() => fetch(e.request)).catch(() => caches.match(e.request)));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(ws => {
    for (const w of ws) if ('focus' in w) return w.focus();
    return clients.openWindow('./');
  }));
});
