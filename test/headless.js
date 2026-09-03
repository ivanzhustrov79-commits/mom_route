/* node test/headless.js — exercise the planner without a browser */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');

const store = {};
const ctx = {
  console,
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => store[k] = v, removeItem: k => delete store[k] },
  structuredClone, Math, Date, JSON, Set, Map, Array, Object, Number, String, isFinite,
  fetch: async () => { throw new Error('offline'); }
};
vm.createContext(ctx);
for (const f of ['js/state.js', 'js/travel.js', 'js/planner.js', 'js/notes.js'])
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });

const run = src => vm.runInContext(src, ctx);

/* --- 1. distances (no network → crow-flies estimate) ----------------- */
console.log('\n— расстояния (оценка) —');
run(`S.places.forEach(a => S.places.forEach(b => { if (a.id < b.id)
  console.log(a.id, '→', b.id, (haversine(a,b)).toFixed(2)+' км',
    lineMinutes(a,b).toFixed(1)+' мин своб.',
    (walk(a.id,b.id)).toFixed(0)+' мин пешком'); }))`);

/* --- 2. traffic curve ------------------------------------------------ */
console.log('\n— коэффициент пробок (будни) —');
run(`[8*60+30, 13*60+15, 18*60+20, 22*60].forEach(m =>
  console.log(m2hm(m), trafficFactor(m, 3).toFixed(2)))`);

/* --- 3. plan a normal Wednesday -------------------------------------- */
console.log('\n— план на среду —');
run(`
const d = new Date(2026, 8, 2, 7, 0);        // Wed 2 Sep 2026
const st = buildStops(d);
console.log('заездов после слияния:', st.length);
st.forEach(s => console.log('  ', s.kind, place(s.placeId).name,
  m2hm(s.w0)+'–'+m2hm(s.w1), s.kidIds.map(k=>kid(k).name).join('/'),
  s.must ? 'обязательно' : 'необязательно'));
const p = planDay(d);
console.log('выездов:', p.trips.length, '| пропущено:', p.skipped.length);
p.trips.forEach(t => console.log('  ', t.mode, 'выезд', m2hm(t.depart),
  '→', t.stops.map(s => place(s.placeId).name + ' ' + m2hm(s.arrive)).join(' → '),
  '→ дом ' + m2hm(t.home), '| руль', t.driveMin.toFixed(1), 'мин',
  '|', t.kidIds.map(k=>kid(k).name).join(',')));
p.skipped.forEach(s => console.log('   пропуск:', place(s.placeId).name, m2hm(s.w0)));
`);

/* --- 4. a busy day: two extra classes that should merge into one trip -- */
console.log('\n— день с кружками (проверка склейки) —');
run(`
S.places.push({ id:'pool', name:'Бассейн', address:'', lat:55.7650, lon:37.6050, approx:true });
S.places.push({ id:'art',  name:'Рисование', address:'', lat:55.7480, lon:37.6300, approx:true });
const a1 = S.kids[0], a2 = S.kids[1];
a1.activities.push({ id:'x1', title:'Бассейн', placeId:'pool', days:[3],
  start:15*60, end:16*60+30,
  drop:{ on:true, leadMin:10, modes:['car'] },
  pick:{ on:true, must:true, earliest:16*60+30, latest:17*60, serviceMin:5, modes:['car'] } });
a2.activities.push({ id:'x2', title:'Рисование', placeId:'art', days:[3],
  start:15*60+15, end:16*60+45,
  drop:{ on:true, leadMin:10, modes:['car'] },
  pick:{ on:true, must:true, earliest:16*60+45, latest:17*60+15, serviceMin:5, modes:['car'] } });
const p2 = planDay(new Date(2026, 8, 2, 7, 0));
console.log('выездов:', p2.trips.length);
p2.trips.forEach(t => console.log('  ', t.mode, m2hm(t.depart), '→',
  t.stops.map(s => s.kind + ' ' + place(s.placeId).name + ' ' + m2hm(s.arrive)).join(' → '),
  '→ дом ' + m2hm(t.home), '| руль', t.driveMin.toFixed(1)));
`);

/* --- 5. seat limit --------------------------------------------------- */
console.log('\n— лимит мест (2 места) —');
run(`
S.cfg.seats = 2;
const p3 = planDay(new Date(2026, 8, 2, 7, 0));
console.log('выездов:', p3.trips.length, '| пропущено:', p3.skipped.length);
p3.trips.forEach(t => console.log('  ', m2hm(t.depart),
  t.stops.map(s => place(s.placeId).name).join(' → '), '|', t.kidIds.length, 'детей'));
S.cfg.seats = 7;
`);

/* --- 6. note parser -------------------------------------------------- */
console.log('\n— разбор заметки —');
run(`
const txt = [
  'Среда',
  '  16:00-17:30 Старший бассейн, Тверская улица 10',
  'Пн, Чт 15:30-17:00 Старший + Младший карате @ улица Арбат, 20',
  'Будни 08:30-13:15 Старший/Младший школа, Тверская улица, 10',
  'купить молоко'
].join('\\n');
const r = parseNote(txt);
r.rows.forEach(x => console.log('  ', x.days.map(d=>DOW[d]).join(''),
  m2hm(x.start)+'-'+m2hm(x.end), x.kidIds.map(i=>kid(i).name).join('/'),
  '|', x.title, '|', x.addr || 'НЕТ АДРЕСА'));
console.log('   не разобрано:', r.warn.length);
`);

console.log('\nok');
