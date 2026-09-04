/* ── travel.js ── geocoding, free-flow matrix, traffic model ───────── */

/* Moscow weekday congestion multiplier over free-flow, by hour. */
const TRAFFIC = [1.00,1.00,1.00,1.00,1.00,1.05,1.15,1.35,1.55,1.50,1.30,1.20,
                 1.20,1.25,1.30,1.40,1.50,1.65,1.75,1.60,1.35,1.15,1.05,1.00];

function trafficFactor(min, dow) {
  if (!S.cfg.traffic) return 1;
  const h = Math.floor(((min % 1440) + 1440) % 1440 / 60);
  const t = (min % 60) / 60;
  let f = TRAFFIC[h] * (1 - t) + TRAFFIC[(h + 1) % 24] * t;
  if (dow === 0 || dow === 6) f = 1 + (f - 1) * 0.45;   // weekends are calmer
  return f;
}

const R = 6371;
function haversine(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat/2)**2 +
            Math.cos(a.lat*r) * Math.cos(b.lat*r) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* fallback when no routing service answered: crow-flies × detour factor */
function lineMinutes(a, b) { return haversine(a, b) * 1.38 / 26 * 60; }

const matKey = () => S.places.map(p => p.id + p.lat.toFixed(5) + p.lon.toFixed(5)).join('|');

/* ── providers ─────────────────────────────────────────────────────── */
async function fetchOSRM(ps) {
  const coords = ps.map(p => `${p.lon},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`;
  const r = await fetch(url); if (!r.ok) throw 0;
  const j = await r.json();
  if (j.code !== 'Ok') throw 0;
  return { d: j.durations.map(row => row.map(s => s / 60)), live: false };
}

const YURL = (k, pts) =>
  `https://api.routing.yandex.net/v2/distancematrix?apikey=${encodeURIComponent(k)}`
  + `&origins=${encodeURIComponent(pts)}&destinations=${encodeURIComponent(pts)}&mode=driving`;

const secOf = v => (v && typeof v === 'object') ? v.value : v;

async function fetchYandex(ps) {
  const k = (S.cfg.yandexKey || '').trim();
  if (!k) throw new Error('нет ключа');
  const r = await fetch(YURL(k, ps.map(p => `${p.lat},${p.lon}`).join('|')));
  if (!r.ok) throw new Error('Яндекс ' + r.status + ': ' + (await r.text()).slice(0, 140));
  const j = await r.json();
  const n = ps.length, d = [];
  let sawTraffic = false;
  for (let i = 0; i < n; i++) {
    d.push([]);
    for (let x = 0; x < n; x++) {
      const c = (j.rows && j.rows[i] && j.rows[i].elements && j.rows[i].elements[x]) || {};
      const live = c.duration_in_traffic ?? c.durationInTraffic;
      if (live != null) sawTraffic = true;
      const sec = secOf(live ?? c.duration);
      if (sec == null) throw new Error('в ответе нет duration');
      d[i].push(sec / 60);
    }
  }
  /* if Yandex already accounts for traffic, our own curve must NOT be applied */
  const mode = S.cfg.yandexTraffic;
  return { d, live: mode === 'yes' ? true : mode === 'no' ? false : sawTraffic };
}

async function fetchTomTom(ps) {
  const k = (S.cfg.tomtomKey || '').trim();
  if (!k) throw new Error('нет ключа TomTom');
  const n = ps.length, d = ps.map(() => ps.map(() => 0));
  const jobs = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) jobs.push([i, j]);
  let delay = 0;
  await Promise.all(jobs.map(async ([i, j]) => {
    const a = ps[i], b = ps[j];
    const u = `https://api.tomtom.com/routing/1/calculateRoute/${a.lat},${a.lon}:${b.lat},${b.lon}/json`
            + `?key=${encodeURIComponent(k)}&travelMode=car&traffic=true&computeTravelTimeFor=all`;
    const r = await fetch(u);
    if (!r.ok) throw new Error('TomTom ' + r.status + ': ' + (await r.text()).slice(0, 140));
    const sum = ((await r.json()).routes || [{}])[0].summary;
    if (!sum) throw new Error('TomTom: маршрут не построен');
    d[i][j] = sum.travelTimeInSeconds / 60;
    delay += sum.trafficDelayInSeconds || 0;
  }));
  return { d, live: true, delay };          // traffic=true → своя кривая не нужна
}

/* one-shot key check: is the key valid, and does the browser get past CORS? */
async function testProvider() {
  const p = S.cfg.provider;
  if (p === 'line') return { ok: true, msg: 'выбран расчёт по прямой — ключ не нужен' };
  const fn = p === 'yandex' ? fetchYandex : p === 'tomtom' ? fetchTomTom : fetchOSRM;
  const ps = S.places.slice(0, 2);
  let last;
  for (let try_ = 0; try_ < 2; try_++) {          // первый запрос бывает холостым
    try {
      const r = await fn(ps);
      return { ok: true, who: p, live: r.live, delay: r.delay,
               mins: r.d[0][1].toFixed(1), from: ps[0].name, to: ps[1].name };
    } catch (e) { last = e; await new Promise(s => setTimeout(s, 600)); }
  }
  return { ok: false, msg: String(last && last.message || last) };
}

/* ── matrix ────────────────────────────────────────────────────────── */
let matStatus = 'idle';
async function ensureMatrix(force) {
  const key = matKey();
  if (!force && S.cache.matrix.key === key && S.cache.matrix.d) {
    matStatus = S.cache.matrix.est ? 'estimate' : S.cache.matrix.live ? 'live' : 'route';
    return S.cache.matrix;
  }
  const ps = S.places;
  let res = null;
  matStatus = 'loading';
  const order = { yandex: [fetchYandex, fetchOSRM],
                  tomtom: [fetchTomTom, fetchOSRM],
                  osrm:   [fetchOSRM],
                  line:   [] }[S.cfg.provider] || [fetchOSRM];
  for (const fn of order) { try { res = await fn(ps); break; } catch { /* next */ } }
  if (!res) {
    res = { d: ps.map(a => ps.map(b => lineMinutes(a, b))), live: false, est: true };
    matStatus = 'estimate';
  } else matStatus = res.live ? 'live' : 'route';
  S.cache.matrix = { key, ids: ps.map(p => p.id), ...res, at: Date.now() };
  save();
  return S.cache.matrix;
}

/* minutes of driving from place A to B, departing at `atMin` on weekday `dow` */
function drive(aId, bId, atMin, dow) {
  if (aId === bId) return 0;
  const m = S.cache.matrix, a = place(aId), b = place(bId);
  let base;
  if (m && m.ids && m.d) {
    const i = m.ids.indexOf(aId), j = m.ids.indexOf(bId);
    base = (i >= 0 && j >= 0) ? m.d[i][j] : lineMinutes(a, b);
  } else base = lineMinutes(a, b);
  const f = m && m.live ? 1 : trafficFactor(atMin, dow);   // live data already includes traffic
  return base * f;
}

function walk(aId, bId) {
  if (aId === bId) return 0;
  return haversine(place(aId), place(bId)) * 1.30 / S.cfg.walkKmh * 60;
}

/* ── geocoding (OpenStreetMap Nominatim — free, no key) ────────────── */
/* Несколько подсказок по тому, что человек набрал — выбрать глазами
   надёжнее, чем угадывать за него.                                    */
async function suggest(q) {
  if (!q || q.trim().length < 4) return [];
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q='
            + encodeURIComponent(q);
  try {
    const r = await fetch(url, { headers: { 'Accept-Language':'ru' },
                                 signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    return (await r.json())
      .sort((a, b) => (b.place_rank || 0) - (a.place_rank || 0))
      .map(x => ({ label: x.display_name, lat:+x.lat, lon:+x.lon,
                   exact: (x.place_rank || 0) >= 30 }));
  } catch { return []; }
}

async function geocode(address) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q='
            + encodeURIComponent(address);
  const r = await fetch(url, { headers: { 'Accept-Language': 'ru' },
                               signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('geocoder ' + r.status);
  const j = await r.json();
  if (!j.length) throw new Error('не найдено');
  /* place_rank 30 = конкретное здание, 26 = улица целиком.
     Индекс в строке адреса резко повышает шанс попасть в дом. */
  const best = j.slice().sort((a, b) => (b.place_rank || 0) - (a.place_rank || 0))[0];
  return { lat: +best.lat, lon: +best.lon, approx: (best.place_rank || 0) < 30 };
}
