/* ── ui.js ── router, rendering, field binding ─────────────────────── */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let stack = [{ v:'now' }], PLAN = null, planDK = null;

/* ── field binding ─────────────────────────────────────────────────── */
let BIND = {}, bn = 0;
const bind = fn => { const k = 'b' + (bn++); BIND[k] = fn; return k; };
const fRow  = (l, inp) => `<div class="f"><label>${esc(l)}</label>${inp}</div>`;
const fNum  = (l, v, fn, mn = 0, mx = 999) =>
  fRow(l, `<input type="number" inputmode="numeric" min="${mn}" max="${mx}" value="${v}" data-b="${bind(x => fn(+x))}">`);
const fTime = (l, v, fn) =>
  fRow(l, `<input type="time" value="${m2hm(v)}" data-b="${bind(x => fn(hm2m(x)))}">`);
const fText = (l, v, fn) =>
  fRow(l, `<input type="text" value="${esc(v)}" data-b="${bind(fn)}">`);
const fWide = (l, v, fn) =>
  `<div class="f wide"><label>${esc(l)}</label><input type="text" value="${esc(v)}" data-b="${bind(fn)}"></div>`;
const fChk  = (l, v, fn) =>
  fRow(l, `<input type="checkbox" ${v ? 'checked' : ''} data-b="${bind(x => fn(x))}">`);
const fSel  = (l, v, opts, fn) =>
  fRow(l, `<select data-b="${bind(fn)}">${opts.map(([k, t]) =>
    `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`);

/* ── router ────────────────────────────────────────────────────────── */
const cur = () => stack[stack.length - 1];
function go(v, p) { stack.push({ v, p }); render(); }
function back() { if (stack.length > 1) stack.pop(); render(); }

const TITLES = { now:'', week:'Неделя', assume:'Допущения', settings:'Настройки',
                 kid:'Ребёнок', act:'Занятие', place:'Адрес', notes:'Расписание из заметки' };

const SVG = (d, extra = '') => `<svg viewBox="0 0 20 20" width="19" height="19" fill="none"
  stroke="currentColor" stroke-width="1.4" stroke-linecap="round">${d}${extra}</svg>`;
const ICON = {
  cal:  SVG('<rect x="2.7" y="4.2" width="14.6" height="13.1" rx="1.6"/><path d="M2.7 8.2h14.6M6.8 2.6v3.2M13.2 2.6v3.2"/>'),
  cfg:  SVG('<path d="M3 6.7h14M3 13.3h14"/><circle cx="7.6" cy="6.7" r="2.1" fill="var(--bg)"/><circle cx="12.6" cy="13.3" r="2.1" fill="var(--bg)"/>')
};

function render() {
  BIND = {}; bn = 0;
  const t = cur();
  $$('.view').forEach(s => s.hidden = true);
  $('#v-' + t.v).hidden = false;
  $('#back').hidden = stack.length < 2;
  const nav = $('#nav');
  nav.hidden = !(t.v === 'now' || t.v === 'week');
  nav.innerHTML = t.v === 'now' ? ICON.cal : t.v === 'week' ? ICON.cfg : '';
  $('#crumb').textContent = t.v === 'now' ? dateLine() : TITLES[t.v] || '';
  ({ now:renderNow, week:renderWeek, assume:renderAssume, settings:renderSettings,
     kid:renderKid, act:renderAct, place:renderPlace, notes:renderNotes })[t.v](t.p);
}

/* Пн Вт Ср Чт Пт → «Пн–Пт»,  Пн Чт → «Пн Чт» */
function daysLabel(days) {
  if (!days.length) return '—';
  const d = [...days].sort((a, b) => (a || 7) - (b || 7));
  const run = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  return run && d.length > 2 ? DOW[d[0]] + '–' + DOW[d[d.length - 1]]
                             : d.map(x => DOW[x]).join(' ');
}

/* one-line summary of what an activity asks of mom */
function actLine(a) {
  const p = place(a.placeId)?.name || '?';
  const bits = [];
  if (a.drop?.on) bits.push('отвезти к ' + m2hm(a.start - (a.drop.leadMin || 0)));
  if (a.pick?.on) bits.push('забрать ' + m2hm(a.pick.earliest) + '–' + m2hm(a.pick.latest) +
                            (a.pick.must ? '' : ', могут сами') +
                            (a.pick.modes.includes('walk') ? ', можно пешком' : ''));
  if (!bits.length) bits.push('без развоза');
  return `${daysLabel(a.days)} · ${m2hm(a.start)}–${m2hm(a.end)} · ${p}<br>${bits.join(' · ')}`;
}

const dateLine = () => { const d = new Date();
  return `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`; };

/* ── plan cache ────────────────────────────────────────────────────── */
const dur = m => { m = Math.round(m);
  return m < 60 ? m + ' мин' : (m / 60 | 0) + ' ч ' + String(m % 60).padStart(2, '0') + ' м'; };

/* Долгая поездка с мамой — это не запрет, а вопрос. Считаем день дважды:
   строго по настройке и без потолка. Если без потолка выездов меньше —
   предлагаем маме выбрать; ответ помним на этот день.                    */
function buildPlan() {
  const d = new Date(), dk = dayKey(d);
  const said = (S.cache.rideOk || {})[dk];
  const strict = planDay(d);
  if (said === false) return strict;

  const loose = planDay(d, { maxRide: 24 * 60 });
  const worst = loose.trips.reduce((a, b) => (b.ride > (a ? a.ride : -1) ? b : a), null);
  const long = worst && worst.ride > S.cfg.maxRide;

  if (said === true) return long ? { ...loose, longRide: worst } : strict;

  const saved = strict.trips.length - loose.trips.length;
  if (saved > 0 && long)
    return { ...strict, offer: { saved, ride: worst.ride, kid: kid(worst.rideKid) } };
  return strict;
}

function plan(force) {
  if (force || !PLAN || planDK !== dayKey()) { PLAN = buildPlan(); planDK = dayKey(); }
  return PLAN;
}
const invalidate = () => { PLAN = null; };

/* ── NOW ───────────────────────────────────────────────────────────── */
const kidsOf = t => t.kidIds.map(k => kid(k)?.name).filter(Boolean).join(', ');
const destOf = t => t.stops.map(s => place(s.placeId)?.name || '?').join(' → ');

function renderNow() {
  const p = plan(), t = nowMin(), nx = nextTrip(p, t);
  const hero = $('#hero');
  hero.className = '';

  if (!nx) {
    hero.classList.add('idle');
    $('#hero-label').textContent = 'Сегодня';
    $('#hero-num').innerHTML = p.trips.length ? 'Все выезды позади' : 'Выездов нет';
    $('#hero-sub').innerHTML = p.trips.length
      ? `<span>Последний в ${m2hm(p.trips[p.trips.length - 1].depart)}</span>` : '';
  } else {
    const left = Math.max(0, Math.round(nx.depart - t));
    if (left <= 10) hero.classList.add('hot');
    $('#hero-label').textContent = left <= 0
      ? (nx.mode === 'walk' ? 'Пора выходить' : 'Пора выезжать')
      : (nx.mode === 'walk' ? 'Выход через' : 'Выезд через');
    $('#hero-num').innerHTML = left <= 0
      ? `<span>сейчас</span>`
      : left < 90 ? `<span>${left}</span><i>мин</i>`
                  : `<span>${(left / 60 | 0)}:${String(left % 60).padStart(2, '0')}</span><i>ч</i>`;
    $('#hero-sub').innerHTML =
      `<b>${esc(destOf(nx))}</b><br><span>${esc(kidsOf(nx))}</span><br>` +
      `<span>${nx.mode === 'walk' ? 'выход' : 'выезд'} ${m2hm(nx.depart)} · на месте ${m2hm(nx.stops[0].arrive)}` +
      (nx.mode === 'walk' ? ' · пешком' : ` · ${Math.round(nx.driveMin)} мин за рулём`) + `</span>`;
  }

  const cf = dayConflicts(new Date());
  const wn = $('#warn');
  wn.hidden = !cf.length;
  if (cf.length) wn.innerHTML = '<div class="t">Расписание не сходится</div>' +
    cf.map(c => `<p>${esc(c.kid.name)}: «${esc(c.from.title)}» до ${m2hm(c.from.end)}, ` +
      `«${esc(c.to.title)}» с ${m2hm(c.to.start)}, а дорога ${Math.round(c.road)} мин — ` +
      `не хватает ${Math.round(c.short)} мин.</p>`).join('') +
    '<p>План на сегодня в этой части ненадёжен.</p>';

  const off = $('#offer');
  off.hidden = !p.offer;
  if (p.offer) {
    const o = p.offer;
    off.innerHTML =
      `<div class="q">Можно обойтись <b>на ${o.saved} ${
        o.saved === 1 ? 'выезд' : o.saved < 5 ? 'выезда' : 'выездов'} меньше</b>, ` +
      `если ${esc(o.kid ? o.kid.name : 'ребёнок')} поедет кататься с мамой — ${dur(o.ride)} в машине.</div>` +
      `<div class="qb"><button data-act="ride-yes">Да, поедет</button>` +
      `<button data-act="ride-no">Нет, домой</button></div>`;
  }

  $('#trips').innerHTML = p.trips.map(x => tripRow(x, t)).join('')
    + p.skipped.map(s => `
    <div class="trip done">
      <div class="t">${m2hm(s.w0)}</div>
      <div class="b"><div class="d">${esc(place(s.placeId)?.name || '')}</div>
      <div class="m">дойдут сами — отдельный выезд не окупается</div></div>
    </div>`).join('');

  const st = { live:'Яндекс, с пробками', route:'OSRM + модель пробок',
               estimate:'оценка по прямой', loading:'считаю маршруты…', idle:'' }[matStatus] || '';
  const sy = S.cache.syncedAt
    ? 'заметка: ' + new Date(S.cache.syncedAt).toLocaleString('ru-RU',
        { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    : 'заметка не подключена';
  $('#notes-strip').textContent = [st, sy].filter(Boolean).join(' · ');

  const as = assumptions();
  $('#assume-strip').innerHTML = as.length
    ? `<button data-act="assume">Я кое-что домыслил при разборе заметки — ${as.length} ${
        as.length === 1 ? 'место' : as.length < 5 ? 'места' : 'мест'}. Проверить →</button>` : '';
}

/* ── WEEK ──────────────────────────────────────────────────────────── */
function tripRow(x, now) {
  return `<div class="trip ${now != null && x.depart < now - 2 ? 'done' : ''}">
      <div class="t">${m2hm(x.depart)}</div>
      <div class="b">
        <div class="d">${esc(destOf(x))} <span style="color:var(--mut)">${esc(kidsOf(x))}</span></div>
        <div class="m">на месте ${m2hm(x.stops[0].arrive)} · дома ${m2hm(x.home)}${
          x.mode === 'walk' ? '' : ` · ${Math.round(x.driveMin)} мин за рулём`}${
          x.ride > S.cfg.maxRide && x.rideKid
            ? ` · ${esc(kid(x.rideKid)?.name || '')} в машине ${dur(x.ride)}` : ''}</div>
      </div>
      ${x.mode === 'walk' ? '<div class="w">пешком</div>' : ''}
    </div>`;
}

function renderWeek() {
  const t0 = new Date(), out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + i);
    const p = planDay(d), cf = dayConflicts(d);
    out.push(`<div class="wd ${i === 0 ? 'today' : ''}">${
      i === 0 ? 'сегодня · ' : ''}${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}</div>`);
    if (cf.length) out.push(cf.map(c =>
      `<div class="wconf">${esc(c.kid.name)}: «${esc(c.from.title)}» до ${m2hm(c.from.end)},
       «${esc(c.to.title)}» с ${m2hm(c.to.start)}, дорога ${Math.round(c.road)} мин —
       не хватает ${Math.round(c.short)} мин</div>`).join(''));
    out.push(p.trips.length
      ? p.trips.map(x => tripRow(x, i === 0 ? nowMin() : null)).join('')
      : '<div class="wempty">выездов нет</div>');
  }
  $('#week').innerHTML = out.join('');
}

/* ── ASSUMPTIONS ───────────────────────────────────────────────────── */
function assumptions() {
  const done = S.cache.okNotes || [];
  const out = [];
  for (const k of S.kids) for (const a of k.activities)
    if (a.note && /ЗАМЕТКА/.test(a.note) && !done.includes(a.id))
      out.push({ id: a.id, who: k.name + ' · ' + a.title,
                 text: a.note.replace(/^ЗАМЕТКА:\s*/, '') });
  for (const p of S.places)
    if (p.approx && !done.includes('place:' + p.id))
      out.push({ id: 'place:' + p.id, who: p.name,
                 text: 'точка на карте приблизительная' + (p.address ? ' — ' + p.address : '') });
  return out;
}

function renderAssume() {
  const list = assumptions();
  $('#assume-list').innerHTML = list.length
    ? list.map(a => `<div class="arow"><button data-act="assume-ok" data-id="${esc(a.id)}">✓</button>
        <div><b>${esc(a.who)}</b><br>${esc(a.text)}</div></div>`).join('')
    : '<div class="wempty">всё проверено</div>';
}

/* ── SETTINGS ──────────────────────────────────────────────────────── */
function renderSettings() {
  $('#kid-list').innerHTML = S.kids.map(k => {
    const sum = k.activities.length
      ? k.activities.map(a => `${esc(a.title)} · ${daysLabel(a.days)} ${m2hm(a.start)}–${m2hm(a.end)}`).join('<br>')
      : 'занятий нет';
    return `<button class="row two" data-go="kid" data-id="${k.id}">
      <span class="n">${esc(k.name)}</span><span class="s">${sum}</span></button>`;
  }).join('');
  $('#place-list').innerHTML = S.places.map(p =>
    `<button class="row" data-go="place" data-id="${p.id}">${esc(p.name)}${
      p.home ? '<span class="badge">дом</span>' : ''}<i>${p.approx ? '≈ ' : ''}${
      p.lat.toFixed(3)}, ${p.lon.toFixed(3)}</i></button>`).join('');
  $('#notes-when').textContent = S.cache.syncedAt
    ? new Date(S.cache.syncedAt).toLocaleDateString('ru-RU') : '—';

  const c = S.cfg;
  $('#gen').innerHTML =
    fNum('Мест в машине (кроме мамы)', c.seats, v => c.seats = v, 1, 8) +
    fNum('Цена лишнего выезда, мин', c.tripPenalty, v => c.tripPenalty = v, 0, 120) +
    fNum('Максимум ожидания, мин', c.maxWait, v => c.maxWait = v, 0, 180) +
    fNum('Ребёнок в машине не дольше, мин', c.maxRide, v => c.maxRide = v, 10, 240) +
    fNum('Штраф за пропуск, мин', c.skipPenalty, v => c.skipPenalty = v, 0, 240) +
    fNum('Парковка и подход, мин', c.parkFriction, v => c.parkFriction = v, 0, 30) +
    fNum('Пешком не дальше, мин', c.walkMaxMin, v => c.walkMaxMin = v, 0, 90) +
    fText('Напоминания, мин', c.alerts.join(', '),
          v => c.alerts = v.split(/\D+/).filter(Boolean).map(Number).sort((a, b) => b - a)) +
    fSel('Маршруты', c.provider,
         [['osrm','OSRM — бесплатно, без пробок'],
          ['tomtom','TomTom — ключ, есть пробки'],
          ['yandex','Яндекс — платный ключ'],
          ['line','по прямой']],
         v => { c.provider = v; ensureMatrix(true).then(() => render()); }) +
    fChk('Учитывать пробки', c.traffic, v => c.traffic = v) +
    /* поля ключей показываем только для выбранного платного источника */
    (c.provider === 'tomtom' ? fWide('Ключ TomTom', c.tomtomKey, v => c.tomtomKey = v) : '') +
    (c.provider === 'yandex'
      ? fWide('Ключ Яндекса', c.yandexKey, v => c.yandexKey = v) +
        fSel('Пробки уже в ответе Яндекса', c.yandexTraffic,
             [['auto','определить самому'], ['yes','да, не множить'], ['no','нет, множить на кривую']],
             v => { c.yandexTraffic = v; ensureMatrix(true).then(() => render()); })
      : '') +
    `<button class="row add" data-act="ytest">Проверить источник маршрутов</button>
     <div class="hint" id="ytest-out"></div>`;

  $('#perm-st').textContent = ('Notification' in window) ? Notification.permission : 'нет';
  $('#ver').textContent = 'Маршрут · данные хранятся только на устройстве';
}

/* ── KID ───────────────────────────────────────────────────────────── */
function renderKid(id) {
  const k = kid(id); if (!k) return back();
  $('#kid-head').innerHTML = fWide('Имя', k.name, v => { k.name = v; });
  $('#act-list').innerHTML = k.activities.map(a =>
    `<button class="row two" data-go="act" data-id="${a.id}">
       <span class="n">${esc(a.title)}${a.src === 'note' ? '<span class="badge">заметка</span>' : ''}</span>
       <span class="s">${actLine(a)}</span></button>`).join('')
    || '<div class="hint">пока пусто</div>';
}

/* ── ACTIVITY ──────────────────────────────────────────────────────── */
function renderAct(id) {
  const [, a] = findAct(id); if (!a) return back();
  const opts = S.places.map(p => [p.id, p.name]);

  $('#act-form').innerHTML =
    fWide('Название', a.title, v => a.title = v) +
    fSel('Место', a.placeId, opts, v => a.placeId = v) +
    `<div class="days">${DOW.map((d, i) =>
       `<button data-day="${i}" class="${a.days.includes(i) ? 'on' : ''}">${d}</button>`).join('')}</div>` +
    fTime('Начало', a.start, v => a.start = v) +
    fTime('Конец', a.end, v => { a.end = v; if (a.pick.earliest < v) a.pick.earliest = v; }) +

    `<div class="grp"><div class="cap">Отвезти</div>` +
      fChk('Нужен отвоз', a.drop.on, v => { a.drop.on = v; render(); }) +
      (a.drop.on ? fNum('Быть на месте за, мин', a.drop.leadMin, v => a.drop.leadMin = v, 0, 60) : '') +
    `</div>` +

    `<div class="grp"><div class="cap">Забрать</div>` +
      fChk('Нужен забор', a.pick.on, v => { a.pick.on = v; render(); }) +
      (a.pick.on
        ? fChk('Обязательно (сами не дойдут)', a.pick.must, v => a.pick.must = v) +
          fTime('Не раньше', a.pick.earliest, v => a.pick.earliest = v) +
          fTime('Не позже',  a.pick.latest,   v => a.pick.latest = v) +
          fNum('На забор, мин', a.pick.serviceMin, v => a.pick.serviceMin = v, 0, 40) +
          fChk('Можно пешком', a.pick.modes.includes('walk'),
               v => a.pick.modes = v ? ['car', 'walk'] : ['car'])
        : '') +
    `</div>`;
}

/* ── PLACE ─────────────────────────────────────────────────────────── */
function renderPlace(id) {
  const p = place(id); if (!p) return back();
  const coordBind = bind(v => {
    const [a, b] = v.split(/\s*,\s*/).map(Number);
    if (isFinite(a) && isFinite(b)) {
      p.lat = a; p.lon = b; p.approx = false;
      save(); ensureMatrix(true).then(() => { invalidate(); render(); });
    }
  });
  $('#place-form').innerHTML =
    fWide('Название', p.name, v => p.name = v) +
    fWide('Адрес', p.address, v => { p.address = v; p.approx = true; }) +
    fRow('Координаты', `<input type="text" value="${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}" data-b="${coordBind}">`) +
    `<button class="row add" data-act="geo">Определить по адресу</button>` +
    (p.home ? '' : fChk('Это дом', false,
       () => { S.places.forEach(x => x.home = false); p.home = true; save(); render(); })) +
    `<div class="hint" id="geo-st">${p.approx ? 'координаты приблизительные — уточните' : ''}</div>`;
}

/* ── NOTES ─────────────────────────────────────────────────────────── */
function renderNotes() {
  $('#note-text').value = S.cache.note || '';
  $('#sync-cfg').innerHTML =
    fWide('URL источника', S.cfg.syncUrl, v => S.cfg.syncUrl = v) +
    fNum('Опрашивать раз в, ч', S.cfg.syncHours, v => S.cfg.syncHours = v, 1, 24) +
    `<button class="row add" data-act="sync">Синхронизировать сейчас</button>`;
}

/* ── events ────────────────────────────────────────────────────────── */
document.addEventListener('change', e => {
  const el = e.target.closest('[data-b]'); if (!el) return;
  const fn = BIND[el.dataset.b]; if (!fn) return;
  fn(el.type === 'checkbox' ? el.checked : el.value);
  save(); invalidate();
  if (cur().v === 'now') render();
});

document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;

  if (b.id === 'nav') return go(cur().v === 'now' ? 'week' : 'settings');
  if (b.id === 'back') return back();
  if (b.dataset.go) return go(b.dataset.go, b.dataset.id);

  if (b.dataset.day !== undefined) {
    const [, a] = findAct(cur().p); if (!a) return;
    const d = +b.dataset.day;
    a.days = a.days.includes(d) ? a.days.filter(x => x !== d) : [...a.days, d].sort();
    save(); invalidate(); return render();
  }

  const act = b.dataset.act;
  if (!act) return;

  if (act === 'add-kid') {
    const k = { id: uid('k_'), name: 'Новый', activities: [] };
    S.kids.push(k); save(); return go('kid', k.id);
  }
  if (act === 'del-kid') {
    S.kids = S.kids.filter(k => k.id !== cur().p); save(); invalidate(); return back();
  }

  if (act === 'add-activity') {
    const k = kid(cur().p);
    const a = { id: uid('a_'), title: 'Занятие', placeId: S.places[1]?.id || S.places[0].id,
      days: [1, 2, 3, 4, 5], start: 16 * 60, end: 17 * 60,
      drop: { on: true, leadMin: 5, modes: ['car'] },
      pick: { on: true, must: true, earliest: 17 * 60, latest: 17 * 60 + 30,
              serviceMin: 5, modes: ['car', 'walk'] } };
    k.activities.push(a); save(); invalidate(); return go('act', a.id);
  }
  if (act === 'del-activity') {
    const [k] = findAct(cur().p); if (!k) return back();
    k.activities = k.activities.filter(a => a.id !== cur().p);
    save(); invalidate(); return back();
  }

  if (act === 'add-place') {
    const p = { id: uid('p_'), name: 'Новый адрес', address: '',
                lat: homePlace().lat, lon: homePlace().lon, approx: true };
    S.places.push(p); save(); return go('place', p.id);
  }
  if (act === 'del-place') {
    S.places = S.places.filter(p => p.id !== cur().p); save(); invalidate(); return back();
  }

  if (act === 'geo') {
    const p = place(cur().p), st = $('#geo-st'); st.textContent = 'ищу…';
    try {
      Object.assign(p, await geocode(p.address), { needsGeo: false });
      save(); await ensureMatrix(true); invalidate(); render();
    } catch (err) { st.textContent = 'не нашлось: ' + err.message; }
    return;
  }

  if (act === 'ride-yes' || act === 'ride-no') {
    const dk = dayKey();
    S.cache.rideOk = S.cache.rideOk || {};
    S.cache.rideOk[dk] = (act === 'ride-yes');
    for (const k of Object.keys(S.cache.rideOk))          // храним только свежие ответы
      if (k < dayKey(new Date(Date.now() - 3 * 864e5))) delete S.cache.rideOk[k];
    save(); invalidate(); return render();
  }

  if (act === 'assume') return go('assume');
  if (act === 'assume-ok') {
    S.cache.okNotes = [...(S.cache.okNotes || []), b.dataset.id];
    save(); return render();
  }
  if (act === 'assume-clear') {
    S.cache.okNotes = assumptions().map(a => a.id).concat(S.cache.okNotes || []);
    save(); return back();
  }

  if (act === 'notes') return go('notes');

  if (act === 'parse') {
    S.cache.note = $('#note-text').value; save();
    const { rows, warn } = parseNote(S.cache.note);
    $('#parse-out').innerHTML = rows.length
      ? rows.map(r => `${r.days.map(d => DOW[d]).join(' ')} ${m2hm(r.start)}–${m2hm(r.end)} · ` +
          `${r.kidIds.map(i => kid(i)?.name).join(', ')} · ${esc(r.title)}` +
          (r.addr ? ` · ${esc(r.addr)}` : ' · <b>адрес не найден</b>')).join('<br>') +
        `<br><br><button class="row add" data-act="apply">Применить: ${rows.length}</button>` +
        (warn.length ? `не разобрано строк: ${warn.length}` : '')
      : 'ничего не распознано';
    return;
  }
  if (act === 'apply') {
    const { rows } = parseNote($('#note-text').value);
    const n = applyNote(rows);
    invalidate();
    const todo = S.places.filter(p => p.needsGeo);
    $('#parse-out').textContent = `добавлено занятий: ${n}` +
      (todo.length ? ` · ищу ${todo.length} адрес(а)…` : '');
    for (const p of todo) {                       // Nominatim asks for ≤1 req/sec
      try { Object.assign(p, await geocode(p.address), { needsGeo: false }); }
      catch { p.approx = true; }
      save();
      await new Promise(r => setTimeout(r, 1100));
    }
    await ensureMatrix(true); invalidate();
    const bad = S.places.filter(p => p.needsGeo).length;
    $('#parse-out').textContent = `добавлено занятий: ${n}` +
      (bad ? ` · ${bad} адрес(а) не найдено — задайте вручную` : ' · адреса найдены');
    return;
  }
  if (act === 'sync') {
    const r = await syncNote(true); invalidate();
    $('#parse-out').textContent = r.imported != null ? `импортировано: ${r.imported}`
      : r.same ? 'без изменений' : r.error ? 'ошибка: ' + r.error : r.skip;
    return;
  }

  if (act === 'ytest') {
    const o = $('#ytest-out'); o.textContent = 'проверяю…';
    const r = await testProvider();
    o.innerHTML = !r.ok ? esc(r.msg)
      : r.msg ? esc(r.msg)
      : `работает · ${esc(r.from)} → ${esc(r.to)}: <b>${r.mins} мин</b><br>` +
        (r.live ? 'пробки приходят от сервиса — своя кривая отключена'
                : 'время свободного потока — применяется кривая пробок') +
        (r.delay ? `<br>задержка из-за пробок: ${Math.round(r.delay / 60)} мин` : '');
    return;
  }

  if (act === 'perm') { await askPerm(); return render(); }
  if (act === 'test') { return fire('Проверка', 'Уведомления работают', 'test'); }

  if (act === 'export') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
    a.download = 'marshrut.json'; a.click();
    return;
  }
  if (act === 'import') {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json';
    i.onchange = async () => {
      try { localStorage.setItem(KEY, await i.files[0].text()); load(); invalidate(); render(); } catch {}
    };
    i.click(); return;
  }
  if (act === 'reset') {
    localStorage.removeItem(KEY); localStorage.removeItem(FKEY);
    load(); invalidate(); stack = [{ v: 'now' }]; return render();
  }
});

/* ── boot ──────────────────────────────────────────────────────────── */
(async function boot() {
  render();
  initSW();
  keepAwake(true);

  await ensureMatrix();
  invalidate(); render();
  syncNote().then(r => { if (r && r.imported) { invalidate(); render(); } });

  setInterval(() => {
    if (planDK !== dayKey()) invalidate();
    checkAlerts(plan());
    if (cur().v === 'now') renderNow();
  }, 10000);

  setInterval(() => syncNote().then(r => { if (r && r.imported) { invalidate(); render(); } }), 10 * 60000);
  setInterval(() => ensureMatrix(true).then(() => { invalidate(); if (cur().v === 'now') renderNow(); }), 30 * 60000);
})();
