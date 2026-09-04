/* ── notify.js ── 30 / 10 / 0 minute warnings ─────────────────────── */
const FKEY = 'momroute.fired';

function firedSet() {
  try { const o = JSON.parse(localStorage.getItem(FKEY) || '{}');
        if (o.d !== dayKey()) return { d: dayKey(), s: [] };
        return o; } catch { return { d: dayKey(), s: [] }; }
}
function markFired(tag) {
  const o = firedSet(); if (o.s.includes(tag)) return false;
  o.s.push(tag); localStorage.setItem(FKEY, JSON.stringify(o)); return true;
}

let swReg = null;
async function initSW() {
  if (!('serviceWorker' in navigator)) return;
  /* на localhost воркер только мешает разработке — правки не доезжают */
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    return;
  }
  try { swReg = await navigator.serviceWorker.register('sw.js'); } catch {}
}

async function askPerm() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return await Notification.requestPermission();
}

async function fire(title, body, tag) {
  const opts = { body, tag, renotify:true, requireInteraction:false,
                 icon:'icon.png', badge:'icon.png', vibrate:[120,60,120] };
  try {
    if (swReg) await swReg.showNotification(title, opts);
    else if ('Notification' in window && Notification.permission === 'granted') new Notification(title, opts);
  } catch {}
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
}

function tripLine(t) {
  const dest = t.stops.map(s => place(s.placeId)?.name || '?').join(' → ');
  const who  = t.kidIds.map(k => kid(k)?.name).filter(Boolean).join(', ');
  return dest + (who ? ' · ' + who : '');
}

/* Вызывается на каждом тике и при каждом открытии приложения.
   Окно не «две минуты в момент срабатывания», а «порог уже пройден, а выезд
   ещё нет» — иначе всё, что случилось, пока приложение было закрыто, немо
   пропадало. Заодно это делает рабочим сценарий с автоматизацией Быстрых
   команд: открыли приложение — и оно тут же досказало пропущенное.        */
function checkAlerts(plan) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const t = nowMin();
  for (const trip of plan.trips) {
    if (t >= trip.depart + 2) continue;                  // уже уехали
    for (const a of S.cfg.alerts) {
      if (t < trip.depart - a) continue;                 // ещё рано
      if (!markFired(trip.id + '@' + a)) continue;       // уже говорили
      const left = Math.round(trip.depart - t);
      const verb = trip.mode === 'walk' ? 'выходить' : 'выезжать';
      fire(left <= 0 ? 'Пора ' + verb : `Через ${left} мин — ${verb}`,
           tripLine(trip) + ' · к ' + m2hm(trip.stops[0].arrive),
           trip.id);
    }
  }
}

/* keep the screen alive while the app is open in the foreground */
let wl = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wl) wl = await navigator.wakeLock.request('screen');
    if (!on && wl) { wl.release(); wl = null; }
  } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(true); });
