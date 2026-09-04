/* Service worker нужен ровно для одного: показывать уведомления, когда
   приложение добавлено на домашний экран. Кэшированием он не занимается —
   именно оно раз за разом подсовывало старую версию после деплоя.
   Свежесть файлов держится на ?v=… в index.html и на version.json.     */
self.addEventListener('install',  () => self.skipWaiting());

self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);   // выносим старое
  await self.clients.claim();
})()));

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type:'window', includeUncontrolled:true }).then(ws => {
    for (const w of ws) if ('focus' in w) return w.focus();
    return clients.openWindow('./');
  }));
});
