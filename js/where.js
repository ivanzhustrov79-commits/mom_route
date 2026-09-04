/* ── where.js ── «мама ещё дома или уже едет» ──────────────────────────
   Веб-приложению фоновая геолокация недоступна: пока оно закрыто, никто
   ничего не знает. Зато открыто оно ровно тогда, когда это и нужно — в
   прихожей и в машине. Поэтому местоположение используется только как
   подсказка: подтвердить, что выехали, и закрыть шаг по прибытии.
   Всё то же самое можно сделать двумя кнопками, если разрешения нет.   */

let GEO = null, geoWatch = null, geoNative = false;

const took = c => { GEO = { lat: c.latitude, lon: c.longitude,
                            acc: c.accuracy, at: Date.now() }; };

/* В нативной оболочке WKWebView сам по себе координат не отдаёт — их даёт
   плагин. Если звать navigator.geolocation, всё молча перестанет работать
   именно там, где нужнее всего.                                        */
async function geoStart() {
  if (geoWatch != null) return;
  const P = (window.Capacitor && window.Capacitor.Plugins) || null;

  if (P && P.Geolocation) {
    geoNative = true;
    try {
      const perm = await P.Geolocation.requestPermissions();
      if (perm && perm.location === 'denied') { GEO = null; return; }
      geoWatch = await P.Geolocation.watchPosition(
        { enableHighAccuracy: false, timeout: 20000, maximumAge: 30000 },
        pos => { if (pos && pos.coords) took(pos.coords); else GEO = null; });
    } catch { geoWatch = null; GEO = null; }
    return;
  }

  if (!('geolocation' in navigator)) return;
  geoNative = false;
  geoWatch = navigator.geolocation.watchPosition(
    p => took(p.coords), () => { GEO = null; },
    { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 });
}

function geoStop() {
  const P = (window.Capacitor && window.Capacitor.Plugins) || null;
  if (geoWatch != null) {
    if (geoNative && P && P.Geolocation) P.Geolocation.clearWatch({ id: geoWatch });
    else navigator.geolocation.clearWatch(geoWatch);
  }
  geoWatch = null; GEO = null;
}

/* координаты старше пяти минут ничего не говорят о «сейчас» */
const geoFresh = () => (GEO && Date.now() - GEO.at < 300000) ? GEO : null;

/* сколько метров до места; null — если не знаем */
function metersTo(placeId) {
  const g = geoFresh(), p = place(placeId);
  if (!g || !p) return null;
  return Math.round(haversine(g, p) * 1000);
}

/* Порог берём с запасом на погрешность самого приёмника: на телефоне в
   доме она легко достигает сотни метров, и жёсткие 100 м врали бы. */
function nearPlace(placeId, m = 200) {
  const d = metersTo(placeId);
  if (d == null) return null;
  const g = geoFresh();
  return d <= m + Math.min(g.acc || 0, 150);
}

const geoOn = () => !!geoWatch;
