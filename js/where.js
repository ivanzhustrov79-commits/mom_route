/* ── where.js ── «мама ещё дома или уже едет» ──────────────────────────
   Веб-приложению фоновая геолокация недоступна: пока оно закрыто, никто
   ничего не знает. Зато открыто оно ровно тогда, когда это и нужно — в
   прихожей и в машине. Поэтому местоположение используется только как
   подсказка: подтвердить, что выехали, и закрыть шаг по прибытии.
   Всё то же самое можно сделать двумя кнопками, если разрешения нет.   */

let GEO = null, geoWatch = null;

function geoStart() {
  if (!('geolocation' in navigator) || geoWatch != null) return;
  geoWatch = navigator.geolocation.watchPosition(
    p => { GEO = { lat: p.coords.latitude, lon: p.coords.longitude,
                   acc: p.coords.accuracy, at: Date.now() }; },
    () => { GEO = null; },
    { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 });
}

function geoStop() {
  if (geoWatch != null) navigator.geolocation.clearWatch(geoWatch);
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
