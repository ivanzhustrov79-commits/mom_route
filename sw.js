/* Service worker нужен ровно для одного: показывать уведомления, когда
   приложение добавлено на домашний экран. Кэшированием он не занимается —
   именно оно раз за разом подсовывало старую версию после деплоя.
   Свежесть файлов держится на ?v=… в index.html и на version.json.     */
importScripts('js/idb.js');   /* тексты уведомлений лежат на устройстве */

self.addEventListener('install',  () => self.skipWaiting());

self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);   // выносим старое
  await self.clients.claim();
})()));

/* Пуш приходит пустым — это просто «проснись». Что показать, знает только
   само устройство, поэтому текст достаём из IndexedDB. */
self.addEventListener('push', e => e.waitUntil((async () => {
  let due = [];
  try { due = await idbDue(); } catch {}
  if (!due.length) return;                       // нечего сказать — молчим
  for (const a of due)
    await self.registration.showNotification(a.title, {
      body: a.body, tag: a.tag, renotify: true,
      icon: 'icon.png', badge: 'icon.png', vibrate: [120, 60, 120]
    });
})()));

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(ws => {
    for (const w of ws) if ('focus' in w) return w.focus();
    return clients.openWindow('./');
  }));
});
