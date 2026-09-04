/* ── push.js ── фоновые напоминания через свой воркер ──────────────────
   Замысел: воркер работает будильником, а не почтальоном. Телефон отдаёт
   ему только моменты времени; пуш приходит пустой, а текст берётся здесь
   же, из IndexedDB. Ни Cloudflare, ни Apple содержимого не видят.

   Открытый ключ ниже — публичный по своей природе, ему тут и место.
   Закрытый лежит в секретах Cloudflare, общий пароль — в настройках.   */

const VAPID_PUBLIC = 'BGwyDgzyRf7sqTQSwMZOM0_hTI_iEDZCd662WIDPWI9n922fHbCqVJa7IqcPxQganLM1lyA31_K-bBGxAxSuBRU';

const b64ToU8 = s => {
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
};

const pushCfg = () => ({ url: (S.cfg.pushUrl || '').replace(/\/+$/, ''),
                         secret: S.cfg.pushSecret || '' });

async function pushCall(path, body) {
  const { url, secret } = pushCfg();
  if (!url) throw new Error('не задан адрес воркера');
  const r = await fetch(url + path, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, secret }),
    signal: AbortSignal.timeout(10000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}

/* подписка живёт в служебном работнике, поэтому без него никак */
async function pushSubscribe() {
  if (!swReg) throw new Error('приложение не установлено на домашний экран');
  if (Notification.permission !== 'granted') {
    if (await askPerm() !== 'granted') throw new Error('нет разрешения на уведомления');
  }
  return await swReg.pushManager.getSubscription()
      || await swReg.pushManager.subscribe(
           { userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUBLIC) });
}

/* будильники на неделю вперёд: текст — сюда, одни лишь времена — воркеру */
function pushAlerts(days = 7) {
  const now = Date.now(), out = [];
  const base = new Date();
  for (let d = 0; d < days; d++) {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + d);
    const midnight = day.getTime();
    const p = planDay(day, d === 0 ? dayOverrides() : {});
    for (const trip of p.trips) {
      const dest = trip.stops.map(s => place(s.placeId)?.name || '?').join(' → ');
      const who  = trip.kidIds.map(k => kid(k)?.name).filter(Boolean).join(', ');
      const verb = trip.mode === 'walk' ? 'выходить' : 'выезжать';
      for (const a of S.cfg.alerts) {
        const at = midnight + Math.round(trip.depart - a) * 60000;
        if (at <= now + 60000) continue;
        out.push({ at,
          title: a === 0 ? 'Пора ' + verb : `Через ${a} мин — ${verb}`,
          body: dest + (who ? ' · ' + who : '') + ' · к ' + m2hm(trip.stops[0].arrive),
          tag: trip.id + '@' + a });
      }
    }
  }
  return out.sort((x, y) => x.at - y.at).slice(0, 200);
}

/* полный цикл: подписаться, разложить будильники, отдать воркеру времена */
async function pushSync() {
  const sub = await pushSubscribe();
  const items = pushAlerts();
  await idbReplace(items);
  const r = await pushCall('/schedule',
    { sub: sub.toJSON(), times: items.map(i => i.at) });
  S.cache.pushAt = Date.now();
  S.cache.pushCount = r.queued;
  save();
  return r;
}

async function pushTest() {
  const sub = await pushSubscribe();
  await idbReplace([{ at: Date.now() + 15000, title: 'Проверка',
                      body: 'Фоновое уведомление доехало', tag: 'test' }]);
  return await pushCall('/test', { sub: sub.toJSON() });
}

async function pushForget() {
  const sub = swReg && await swReg.pushManager.getSubscription();
  if (sub) { try { await pushCall('/forget', { sub: sub.toJSON() }); } catch {} await sub.unsubscribe(); }
  S.cache.pushAt = 0; S.cache.pushCount = 0; save();
}
