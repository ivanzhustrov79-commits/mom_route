/* ── state.js ── data model, defaults, persistence ─────────────────── */
const KEY = 'momroute.v1';
const DOW = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
const MON = ['января','февраля','марта','апреля','мая','июня','июля',
             'августа','сентября','октября','ноября','декабря'];

const uid = p => p + Math.random().toString(36).slice(2, 8);

/* time helpers — everything internal is "minutes since local midnight" */
const hm2m = s => { const m = /^(\d{1,2})\D(\d{2})$/.exec((s||'').trim());
                    return m ? (+m[1]) * 60 + (+m[2]) : null; };
const m2hm = v => { if (v == null) return ''; v = Math.round(((v % 1440) + 1440) % 1440);
                    return String(v / 60 | 0).padStart(2,'0') + ':' + String(v % 60).padStart(2,'0'); };
const nowMin = (d = new Date()) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
const dayKey = (d = new Date()) =>
  d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');

/* ── defaults ──────────────────────────────────────────────────────────
   Пустая заготовка. Своё расписание заводят руками в настройках либо
   загружают файлом: Настройки → Данные → Импорт JSON.                  */
function defaults() {
  const WD = [1,2,3,4,5];
  const school = {
    placeId: 'school', title: 'Школа', days: WD,
    start: 8*60+30, end: 13*60+15,
    drop: { on:false, leadMin:5, modes:['car'] },
    pick: { on:true, must:false, earliest:13*60+30, latest:13*60+40,
            serviceMin:5, modes:['car','walk'] }
  };
  const kg = {
    placeId: 'kg', title: 'Садик', days: WD,
    start: 9*60, end: 18*60+20,
    drop: { on:false, leadMin:5, modes:['car'] },
    pick: { on:true, must:true, earliest:18*60+20, latest:18*60+50,
            serviceMin:8, modes:['car','walk'] }
  };
  const mk = (name, tpl) => ({ id: uid('k_'), name,
                               activities: [ { id: uid('a_'), ...structuredClone(tpl) } ] });

  /* координаты — центр Москвы, пока не задан настоящий адрес */
  const blank = (id, name) => ({ id, name, address:'',
                                 lat:55.7558, lon:37.6176, approx:true, needsGeo:true });

  return {
    v: 3,
    places: [ { ...blank('home', 'Дом'), home:true },
              blank('school', 'Школа'),
              blank('kg', 'Садик') ],
    kids: [ mk('Старший', school), mk('Младший', kg) ],
    cfg: {
      seats: 5,             // мест в машине (не считая взрослого)
      tripPenalty: 22,      // «стоимость» одного лишнего выезда, мин
      maxWait: 40,          // дольше ждать — лучше съездить домой
      maxRide: 45,          // дольше катать ребёнка за один выезд нельзя
      skipPenalty: 35,      // штраф за пропуск необязательного заезда
      parkFriction: 10,     // парковка + подход к двери, мин на заезд
      walkKmh: 4.6,
      walkMaxMin: 28,       // дальше пешком не рассматриваем
      alerts: [30, 10, 0],
      provider: 'osrm',     // osrm | tomtom | yandex | line
      tomtomKey: '',
      yandexKey: '',
      yandexTraffic: 'auto',
      traffic: true,
      syncUrl: '',
      syncHours: 2
    },
    cache: { matrix: {}, syncedAt: 0, note: '', okNotes: [], rideOk: {} }
  };
}

/* ── persistence ───────────────────────────────────────────────────── */
function deepMerge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const k in over) out[k] = (k in base) ? deepMerge(base[k], over[k]) : over[k];
  return out;
}
let S;
const FIRST_RUN = !localStorage.getItem(KEY);
function migrate() {
  if (S.v < 3) { S.v = 3; S.cache.matrix = {}; save(); }
}
function load() {
  try { S = deepMerge(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch { S = defaults(); }
  migrate();
  return S;
}
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

/* ── lookups ───────────────────────────────────────────────────────── */
const place = id => S.places.find(p => p.id === id);
const homePlace = () => S.places.find(p => p.home) || S.places[0];
const kid = id => S.kids.find(k => k.id === id);
const findAct = id => { for (const k of S.kids) { const a = k.activities.find(a => a.id === id); if (a) return [k, a]; } return []; };

load();
