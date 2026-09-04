/* ── native.js ── когда приложение запущено в нативной оболочке ────────
   Единственное, ради чего вообще нужна оболочка: локальные уведомления.
   Их планирует сама iOS, поэтому они срабатывают при закрытом приложении,
   без сервера, без ключей и без чужих глаз. Всё остальное — тот же самый
   веб, который уже работает.

   iOS держит не больше 64 отложенных уведомлений на приложение, поэтому
   берём ближайшие и перезаписываем их при каждом запуске.              */

const CAP = () => (window.Capacitor && window.Capacitor.Plugins) || null;
const isNative = () => !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function'
                          && window.Capacitor.isNativePlatform());

async function nativeSchedule() {
  const P = CAP();
  if (!P || !P.LocalNotifications) return { ok: false, msg: 'нет плагина уведомлений' };

  try {
    const perm = await P.LocalNotifications.requestPermissions();
    if (perm && perm.display !== 'granted') return { ok: false, msg: 'нет разрешения' };

    const pending = await P.LocalNotifications.getPending();
    if (pending && pending.notifications && pending.notifications.length)
      await P.LocalNotifications.cancel({ notifications: pending.notifications });

    const items = pushAlerts(7).slice(0, 60);
    if (!items.length) return { ok: true, count: 0 };

    await P.LocalNotifications.schedule({
      notifications: items.map((a, i) => ({
        id: i + 1, title: a.title, body: a.body,
        schedule: { at: new Date(a.at), allowWhileIdle: true }
      }))
    });
    S.cache.nativeAt = Date.now();
    S.cache.nativeCount = items.length;
    save();
    return { ok: true, count: items.length };
  } catch (e) { return { ok: false, msg: String(e && e.message || e) }; }
}

/* Расписание меняется — значит, и будильники надо переложить. Делаем это
   при каждом возвращении в приложение: дешевле, чем гадать.            */
function nativeInit() {
  if (!isNative()) return;
  nativeSchedule();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') nativeSchedule();
  });
}
