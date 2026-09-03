/* ── ui.js ── router, rendering, field binding ─────────────────────── */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let stack = [{ v:'now' }], PLAN = null, planDK = null;
let WEEKROWS = [];                 // строки календаря текущего рендера
let FLASH = '';                    // короткое пояснение к последнему действию
let VAULT_NEW = false;             // в репозитории лежит расписание свежее нашего
let EDITING = { refs: [] };        // какие занятия правит открытый редактор

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

const TITLES = { now:'', vault:'Код', week:'Календарь', cls:'Занятие', kid:'Ребёнок',
                 assume:'Допущения', settings:'Настройки', place:'Адрес',
                 notes:'Расписание из заметки' };

const SVG = (d) => `<svg viewBox="0 0 20 20" width="19" height="19" fill="none"
  stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  cal:  SVG('<rect x="2.7" y="4.2" width="14.6" height="13.1" rx="1.6"/><path d="M2.7 8.2h14.6M6.8 2.6v3.2M13.2 2.6v3.2"/>'),
  cfg:  SVG('<path d="M3 6.7h14M3 13.3h14"/><circle cx="7.6" cy="6.7" r="2.1" fill="var(--bg)"/><circle cx="12.6" cy="13.3" r="2.1" fill="var(--bg)"/>'),
  walk: SVG('<circle cx="10.2" cy="3.4" r="1.7"/><path d="M10.2 6v5.2M10.2 11.2L7.4 17M10.2 11.2L13 17M7.1 8.1l6.2-1.1"/>'),
  car:  SVG('<path d="M3.4 13.6v-2.3l1.8-3.5a1.5 1.5 0 011.3-.8h7a1.5 1.5 0 011.3.8l1.8 3.5v2.3"/><path d="M3.4 11.3h13.2"/><circle cx="6.6" cy="13.6" r="1.5"/><circle cx="13.4" cy="13.6" r="1.5"/>'),
  warn: SVG('<path d="M10 3.4 2.8 16.2h14.4L10 3.4z"/><path d="M10 8v3.6M10 13.9v.1"/>')
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
  ({ now:renderNow, vault:renderVault, week:renderWeek, cls:renderCls, kid:renderKid,
     assume:renderAssume, settings:renderSettings, place:renderPlace,
     notes:renderNotes })[t.v](t.p);
}

const dateLine = () => { const d = new Date();
  return `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`; };
const dur = m => { m = Math.round(m);
  return m < 60 ? m + ' мин' : (m / 60 | 0) + ' ч ' + String(m % 60).padStart(2, '0') + ' м'; };

/* имя ребёнка всегда со своей картинкой */
const kidLabel = k => `${k.icon ? k.icon + ' ' : ''}${esc(k.name)}`;
const namesOf = ids => ids.map(i => { const k = kid(i); return k ? kidLabel(k) : ''; })
                          .filter(Boolean).join(', ');

/* ── план на сегодня ───────────────────────────────────────────────── */
function dayOverrides() {
  const dk = dayKey();
  return { force:  new Set((S.cache.pickUp  || {})[dk] || []),
           waitOk: new Set((S.cache.stayOut || {})[dk] || []) };
}

/* Долгая поездка с мамой — это не запрет, а вопрос. Считаем день дважды:
   строго по настройке и без потолка. Если без потолка выездов меньше —
   предлагаем маме выбрать; ответ помним на этот день.                    */
function buildPlan() {
  const d = new Date(), dk = dayKey(d), o = dayOverrides();
  const said = (S.cache.rideOk || {})[dk];
  const strict = planDay(d, o);
  if (said === false) return strict;

  const loose = planDay(d, { ...o, maxRide: 24 * 60 });
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

/* ── карточки дня ──────────────────────────────────────────────────── */
/* Выезд показываем как маршрут: из дома → остановки с действием → домой.
   Педагога называем только у ближайшего события, чтобы не шуметь.      */
function legsHtml(t, teach) {
  const rows = t.stops.map(s =>
    `<div class="leg"><b>${m2hm(s.arrive)}</b><div>
       <span>${esc(place(s.placeId)?.name || '?')}</span>
       <i>${s.kind === 'drop' ? 'отвезти' : 'забрать'}: ${namesOf(s.kidIds)}${
         teach && s.teacher ? ' · ' + esc(s.teacher) : ''}</i>
     </div></div>`);
  rows.push(`<div class="leg home"><b>${m2hm(t.home)}</b><div><span>дом</span></div></div>`);
  return rows.join('');
}

function tripRow(x, now) {
  const extra = (x.mode === 'walk' ? '' : `${Math.round(x.driveMin)} мин за рулём`) +
    (x.ride > S.cfg.maxRide && x.rideKid
      ? ` · ${kidLabel(kid(x.rideKid) || {name:''})} в машине ${dur(x.ride)}` : '');
  return `<div class="trip ${now != null && x.depart < now - 2 ? 'done' : ''}">
      <div class="th">
        <span class="t">${m2hm(x.depart)}</span>
        <span class="ic">${x.mode === 'walk' ? ICON.walk : ICON.car}</span>
        <span class="lbl">из дома${extra ? ' · ' + extra : ''}</span>
      </div>
      ${legsHtml(x)}
    </div>`;
}

/* свободное окно: где мама и до какого часа. Нажатие меняет место. */
function spareCard(g) {
  return `<button class="trip spare" data-act="stay" data-key="${esc(g.key)}">
      <div class="th"><span class="t">${m2hm(g.from)}</span>
        <span class="lbl">свободно ${dur(g.to - g.from)} · до ${m2hm(g.to)}</span></div>
      <div class="leg"><b></b><div><span>${esc(place(g.placeId)?.name || '')}</span>
        <i>${g.away ? 'ждём на месте — нажмите, чтобы вернуться домой'
                    : 'дома — нажмите, чтобы ждать у следующего места'}</i></div></div>
    </button>`;
}

/* ребёнок добирается домой сам — это всегда решение, а не мелочь */
function aloneCard(r) {
  return `<button class="trip alone" data-act="pick-self" data-key="${esc(r.actIds.join(','))}">
      <div class="th"><span class="t">${m2hm(r.at)}</span>
        <span class="ic">${ICON.warn}</span>
        <span class="lbl">${esc(place(r.placeId)?.name || '')} — домой сами</span></div>
      <div class="leg"><b></b><div><span>${r.kids.map(kidLabel).join(', ')}</span>
        <i>после «${esc(r.title)}» · нажмите — заберу сама</i></div></div>
    </button>`;
}

function renderNow() {
  const p = plan(), t = nowMin(), st = nextStep(p, t);
  const hero = $('#hero');
  hero.className = '';

  if (!st) {
    hero.classList.add('idle');
    $('#hero-label').textContent = 'Сегодня';
    $('#hero-num').innerHTML = p.trips.length ? 'Все выезды позади' : 'Выездов нет';
    $('#hero-sub').innerHTML = p.trips.length
      ? `<span>Последний в ${m2hm(p.trips[p.trips.length - 1].depart)}</span>` : '';
  } else {
    const onFoot = st.mode === 'walk';
    const fromHome = !!place(st.from)?.home;
    const toLeave = st.leave - t, toArrive = st.arrive - t;
    const big = n => n < 90 ? `<span>${n}</span><i>мин</i>`
                            : `<span>${(n / 60 | 0)}:${String(n % 60).padStart(2, '0')}</span><i>ч</i>`;

    if (toLeave > 0.5) {                       // ещё дома
      if (toLeave <= 10) hero.classList.add('hot');
      $('#hero-label').textContent = onFoot ? 'Выход через' : 'Выезд через';
      $('#hero-num').innerHTML = big(Math.round(toLeave));
    } else if (toLeave > -2) {                 // ровно сейчас
      hero.classList.add('hot');
      $('#hero-label').textContent = onFoot ? 'Пора выходить' : 'Пора выезжать';
      $('#hero-num').innerHTML = `<span>сейчас</span>`;
    } else {                                   // уже в пути
      $('#hero-label').textContent = onFoot ? 'В пути пешком, дойдём через'
                                            : 'В пути, приедем через';
      $('#hero-num').innerHTML = big(Math.max(0, Math.round(toArrive)));
    }

    const mins = Math.round(stepMinutes(st));
    const lead = `${onFoot ? 'выход' : 'выезд'} ${fromHome ? 'из дома' : 'от «' + esc(place(st.from)?.name || '') + '»'}` +
                 ` в ${m2hm(st.leave)} · ${mins} мин ${onFoot ? 'пешком' : 'в пути'}`;
    const body = st.kind === 'home'
      ? `<div class="leg home"><b>${m2hm(st.arrive)}</b><div><span>дом</span></div></div>`
      : `<div class="leg"><b>${m2hm(st.arrive)}</b><div>
           <span>${esc(place(st.to)?.name || '?')}</span>
           <i>${st.kind === 'drop' ? 'отвезти' : 'забрать'}: ${namesOf(st.kidIds)}</i>
           ${st.teacher ? `<i>${esc(st.teacher)}</i>` : ''}
         </div></div>`;
    $('#hero-sub').innerHTML =
      `<div class="hlead"><span class="ic">${onFoot ? ICON.walk : ICON.car}</span><span>${lead}</span></div>` +
      `<div class="legs">${body}</div>`;
  }

  const ahead = p.trips.filter(x => x.home > t - 3).length;
  $('#hero-more').textContent = ahead ? 'дальше сегодня ↓' : '';

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
      `если ${o.kid ? kidLabel(o.kid) : 'ребёнок'} поедет кататься с мамой — ${dur(o.ride)} в машине.</div>` +
      `<div class="qb"><button data-act="ride-yes">Да, поедет</button>` +
      `<button data-act="ride-no">Нет, домой</button></div>`;
  }

  /* весь день одной лентой: выезды, свободные окна, «дойдут сами» */
  const items = [];
  for (const x of p.trips) if (x.home > t - 3) items.push({ at: x.depart, html: tripRow(x, t) });
  for (const r of unattended(p, new Date())) if (r.at > t - 3) items.push({ at: r.at, html: aloneCard(r) });
  for (const g of spareBlocks(p, new Date())) if (g.to > t) items.push({ at: g.from, html: spareCard(g) });
  items.sort((a, b) => a.at - b.at);

  const forced = ((S.cache.pickUp || {})[dayKey()] || []).length;
  $('#trips').innerHTML = items.map(i => i.html).join('') +
    (FLASH ? `<div class="flash">${esc(FLASH)}</div>` : '') +
    (forced ? `<button class="undo" data-act="pick-reset">забираю сама: ${forced} — вернуть как было</button>` : '');

  const src = { live:'Яндекс, с пробками', route:'OSRM + модель пробок',
               estimate:'оценка по прямой', loading:'считаю маршруты…', idle:'' }[matStatus] || '';
  const sy = S.cache.syncedAt
    ? 'заметка: ' + new Date(S.cache.syncedAt).toLocaleString('ru-RU',
        { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    : 'заметка не подключена';
  $('#notes-strip').textContent = [src, sy].filter(Boolean).join(' · ');

  $('#update-strip').innerHTML = VAULT_NEW
    ? `<button data-act="vault">Расписание обновилось — загрузить по коду →</button>` : '';

  const as = assumptions();
  $('#assume-strip').innerHTML = as.length
    ? `<button data-act="assume">Я кое-что домыслил при разборе заметки — ${as.length} ${
        as.length === 1 ? 'место' : as.length < 5 ? 'места' : 'мест'}. Проверить →</button>` : '';
}

/* ── VAULT ─────────────────────────────────────────────────────────── */
function renderVault() {
  $('#vault-msg').textContent = '';
  $('#vault-msg').className = 'hint';
  setTimeout(() => $('#vault-code').focus(), 60);
}

/* ── КАЛЕНДАРЬ — только занятия, без развоза ───────────────────────── */
function classesOn(date) {
  const dow = date.getDay(), dk = dayKey(date), rows = [];
  for (const k of S.kids) for (const a of k.activities) {
    if (!a.days.includes(dow)) continue;
    if (a.from && dk < a.from) continue;
    if (a.until && dk > a.until) continue;
    const key = a.title + '|' + a.placeId + '|' + a.start + '|' + a.end;
    const m = rows.find(r => r.key === key);
    if (m) { m.kids.push(k); m.refs.push(a.id); }
    else rows.push({ key, title:a.title, teacher:a.teacher, placeId:a.placeId,
                     start:a.start, end:a.end, kids:[k], refs:[a.id] });
  }
  rows.sort((x, y) => (x.start - y.start) || (x.end - y.end));
  /* раскладка по колонкам: занятие уходит вправо, если идёт поверх другого */
  const busy = [];
  for (const r of rows) {
    let col = busy.findIndex(end => end <= r.start);
    if (col < 0) { col = busy.length; busy.push(0); }
    busy[col] = r.end;
    r.col = Math.min(col, 3);
  }
  return rows;
}

function renderWeek() {
  const t0 = new Date(), out = [];
  WEEKROWS = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + i);
    out.push(`<div class="wd ${i === 0 ? 'today' : ''}">${
      i === 0 ? 'сегодня · ' : ''}${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}</div>`);
    for (const c of dayConflicts(d))
      out.push(`<div class="wconf">${esc(c.kid.name)}: «${esc(c.from.title)}» до ${m2hm(c.from.end)},
        «${esc(c.to.title)}» с ${m2hm(c.to.start)}, дорога ${Math.round(c.road)} мин —
        не хватает ${Math.round(c.short)} мин</div>`);
    const rows = classesOn(d);
    out.push(rows.map(c => {
      const idx = WEEKROWS.push(c) - 1;
      return `<button class="cls${c.col ? ' over' : ''}" style="--col:${c.col}"
                data-act="edit-cls" data-idx="${idx}">
          <b>${m2hm(c.start)}<br>${m2hm(c.end)}</b>
          <div><span>${esc(c.title)}</span>
            <i>${c.kids.map(kidLabel).join(', ')}${
              (place(c.placeId)?.name || '') === c.title ? ''
                : ' · ' + esc(place(c.placeId)?.name || '?')}</i></div>
        </button>`;
    }).join('') || '<div class="wempty">занятий нет</div>');
    out.push(`<button class="wadd" data-act="add-cls" data-dow="${d.getDay()}">+ занятие</button>`);
  }
  $('#week').innerHTML = out.join('');
  $('#kid-strip').innerHTML = S.kids.map(k =>
    `<button class="row" data-go="kid" data-id="${k.id}">${kidLabel(k)}<i>${
      k.activities.length} зан.</i></button>`).join('');
}

/* ── РЕДАКТОР ЗАНЯТИЯ ──────────────────────────────────────────────── */
const editRefs = () => EDITING.refs.filter(id => findAct(id)[1]);
const setAll = fn => { for (const id of editRefs()) { const [, a] = findAct(id); fn(a); } };

function toggleKidOnClass(kidId, on) {
  const [, master] = findAct(editRefs()[0]) || [];
  const k = kid(kidId); if (!k || !master) return;
  if (on) {
    const copy = { ...structuredClone(master), id: uid('a_') };
    delete copy.note;
    k.activities.push(copy);
    EDITING.refs = [...editRefs(), copy.id];
  } else {
    const mine = k.activities.filter(a => EDITING.refs.includes(a.id)).map(a => a.id);
    k.activities = k.activities.filter(a => !mine.includes(a.id));
    EDITING.refs = editRefs().filter(id => !mine.includes(id));
  }
  save(); invalidate();
  if (!editRefs().length) return back();
  render();
}

function renderCls() {
  const refs = editRefs();
  if (!refs.length) return back();
  const [, a] = findAct(refs[0]);
  const opts = S.places.map(p => [p.id, p.name]);

  $('#cls-form').innerHTML =
    fWide('Название', a.title, v => setAll(x => x.title = v)) +
    fWide('Педагог', a.teacher || '', v => setAll(x => x.teacher = v)) +
    fSel('Место', a.placeId, opts, v => setAll(x => x.placeId = v)) +
    `<button class="row add" data-act="add-place-here">+ новый адрес</button>` +
    `<div class="days">${DOW.map((d, i) =>
       `<button data-day="${i}" class="${a.days.includes(i) ? 'on' : ''}">${d}</button>`).join('')}</div>` +
    fTime('Начало', a.start, v => setAll(x => x.start = v)) +
    fTime('Конец', a.end, v => setAll(x => { x.end = v; if (x.pick.earliest < v) x.pick.earliest = v; })) +

    `<div class="grp"><div class="cap">Кто ходит</div>` +
      S.kids.map(k => fChk((k.icon ? k.icon + ' ' : '') + k.name,
        k.activities.some(x => refs.includes(x.id)),
        v => toggleKidOnClass(k.id, v))).join('') +
    `</div>` +

    `<div class="grp"><div class="cap">Отвезти</div>` +
      fChk('Нужен отвоз', a.drop.on, v => { setAll(x => x.drop.on = v); render(); }) +
      (a.drop.on ? fNum('Быть на месте за, мин', a.drop.leadMin,
                        v => setAll(x => x.drop.leadMin = v), 0, 60) : '') +
    `</div>` +

    `<div class="grp"><div class="cap">Забрать</div>` +
      fChk('Нужен забор', a.pick.on, v => { setAll(x => x.pick.on = v); render(); }) +
      (a.pick.on
        ? fChk('Обязательно (сами не дойдут)', a.pick.must, v => setAll(x => x.pick.must = v)) +
          fTime('Не раньше', a.pick.earliest, v => setAll(x => x.pick.earliest = v)) +
          fTime('Не позже',  a.pick.latest,   v => setAll(x => x.pick.latest = v)) +
          fNum('На забор, мин', a.pick.serviceMin, v => setAll(x => x.pick.serviceMin = v), 0, 40) +
          fChk('Можно пешком', a.pick.modes.includes('walk'),
               v => setAll(x => x.pick.modes = v ? ['car', 'walk'] : ['car']))
        : '') +
    `</div>`;
}

/* ── РЕБЁНОК ───────────────────────────────────────────────────────── */
function renderKid(id) {
  const k = kid(id); if (!k) return back();
  $('#kid-form').innerHTML =
    fWide('Имя', k.name, v => { k.name = v; }) +
    fWide('Картинка (эмодзи)', k.icon || '', v => { k.icon = v.trim().slice(0, 4); }) +
    `<div class="hint">${k.icon || '—'} ${esc(k.name)}</div>`;
}

/* ── ДОПУЩЕНИЯ ─────────────────────────────────────────────────────── */
function assumptions() {
  const done = S.cache.okNotes || [];
  const out = [];
  for (const k of S.kids) for (const a of k.activities)
    if (a.note && /ЗАМЕТКА/.test(a.note) && !done.includes(a.id))
      out.push({ id: a.id, who: k.name + ' · ' + a.title,
                 text: a.note.replace(/^ЗАМЕТКА:\s*/, '') });
  for (const p of S.places) {
    if (done.includes('place:' + p.id)) continue;
    if (!p.address)
      out.push({ id: 'place:' + p.id, who: p.name, text: 'адрес не задан' });
    else if (p.approx)
      out.push({ id: 'place:' + p.id, who: p.name,
                 text: 'точка на карте приблизительная — ' + p.address });
  }
  return out;
}

function renderAssume() {
  const list = assumptions();
  $('#assume-list').innerHTML = list.length
    ? list.map(a => `<div class="arow"><button data-act="assume-ok" data-id="${esc(a.id)}">✓</button>
        <div><b>${esc(a.who)}</b><br>${esc(a.text)}</div></div>`).join('')
    : '<div class="wempty">всё проверено</div>';
}

/* ── НАСТРОЙКИ — только техника ────────────────────────────────────── */
function renderSettings() {
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
  $('#ver').textContent = 'Маршрут ' + (S.cache.appVersion || '') +
    ' · данные хранятся только на устройстве';
}

/* ── АДРЕС ─────────────────────────────────────────────────────────── */
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

/* ── ЗАМЕТКА ───────────────────────────────────────────────────────── */
function renderNotes() {
  $('#note-text').value = S.cache.note || '';
  $('#sync-cfg').innerHTML =
    fWide('URL источника', S.cfg.syncUrl, v => S.cfg.syncUrl = v) +
    fNum('Опрашивать раз в, ч', S.cfg.syncHours, v => S.cfg.syncHours = v, 1, 24) +
    `<button class="row add" data-act="sync">Синхронизировать сейчас</button>`;
}

/* ── обновление приложения ─────────────────────────────────────────
   Установленный на телефон PWA сам за кодом не следит. Сверяем версию
   с той, что лежит на сайте, и один раз перезагружаемся начисто.     */
async function dropCaches() {
  try {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  } catch {}
}

async function liveVersion() {
  try { return (await (await fetch('version.json?' + Date.now(), { cache:'no-store' })).json()).v; }
  catch { return null; }
}

async function checkAppUpdate() {
  const v = await liveVersion();
  if (!v) return;
  if (!S.cache.appVersion) { S.cache.appVersion = v; save(); return; }
  if (v === S.cache.appVersion) return;
  if (sessionStorage.getItem('mr-upd') === v) return;   // уже пробовали в этой сессии
  sessionStorage.setItem('mr-upd', v);
  S.cache.appVersion = v; save();
  await dropCaches();
  location.reload();
}

/* ── решения мамы на сегодня ───────────────────────────────────────── */
function toggleDay(bucket, key) {
  const dk = dayKey();
  S.cache[bucket] = S.cache[bucket] || {};
  const set = new Set(S.cache[bucket][dk] || []);
  set.has(key) ? set.delete(key) : set.add(key);
  S.cache[bucket][dk] = [...set];
  const old = dayKey(new Date(Date.now() - 3 * 864e5));
  for (const k of Object.keys(S.cache[bucket])) if (k < old) delete S.cache[bucket][k];
  save(); invalidate(); render();
}

/* ── события ───────────────────────────────────────────────────────── */
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
    const d = +b.dataset.day;
    setAll(a => { a.days = a.days.includes(d) ? a.days.filter(x => x !== d) : [...a.days, d].sort(); });
    save(); invalidate(); return render();
  }

  const act = b.dataset.act;
  if (!act) return;

  /* — сегодняшние решения — */
  if (act === 'stay') {
    /* «подожду на месте» имеет смысл, только если выездов станет меньше.
       Если детям пришлось бы сидеть в машине дольше разрешённого — откат. */
    const dk = dayKey(), key = b.dataset.key;
    const before = plan().trips.length;
    S.cache.stayOut = S.cache.stayOut || {};
    const set = new Set(S.cache.stayOut[dk] || []);
    const adding = !set.has(key);
    adding ? set.add(key) : set.delete(key);
    S.cache.stayOut[dk] = [...set];
    invalidate();
    if (adding && plan().trips.length >= before) {
      set.delete(key); S.cache.stayOut[dk] = [...set]; invalidate();
      FLASH = 'Ждать на месте не получится: кто-то из детей просидел бы в машине ' +
              'дольше, чем разрешено в настройках.';
    } else FLASH = '';
    const old = dayKey(new Date(Date.now() - 3 * 864e5));
    for (const k of Object.keys(S.cache.stayOut)) if (k < old) delete S.cache.stayOut[k];
    save(); return render();
  }
  if (act === 'pick-self') {                    // ключ — список id занятий
    FLASH = '';
    const dk = dayKey();
    S.cache.pickUp = S.cache.pickUp || {};
    const set = new Set(S.cache.pickUp[dk] || []);
    const ids = b.dataset.key.split(',');
    ids.every(i => set.has(i)) ? ids.forEach(i => set.delete(i)) : ids.forEach(i => set.add(i));
    S.cache.pickUp[dk] = [...set];
    const old = dayKey(new Date(Date.now() - 3 * 864e5));
    for (const k of Object.keys(S.cache.pickUp)) if (k < old) delete S.cache.pickUp[k];
    save(); invalidate(); return render();
  }
  if (act === 'pick-reset') {
    (S.cache.pickUp || {})[dayKey()] = [];
    save(); invalidate(); return render();
  }
  if (act === 'ride-yes' || act === 'ride-no') {
    const dk = dayKey();
    S.cache.rideOk = S.cache.rideOk || {};
    S.cache.rideOk[dk] = (act === 'ride-yes');
    for (const k of Object.keys(S.cache.rideOk))
      if (k < dayKey(new Date(Date.now() - 3 * 864e5))) delete S.cache.rideOk[k];
    save(); invalidate(); return render();
  }

  /* — календарь — */
  if (act === 'edit-cls') {
    const row = WEEKROWS[+b.dataset.idx]; if (!row) return;
    EDITING = { refs: [...row.refs] };
    return go('cls');
  }
  if (act === 'add-cls') {
    const k = S.kids[0];
    if (!k) { alert('Сначала добавьте ребёнка'); return; }
    const a = { id: uid('a_'), title:'Новое занятие', teacher:'',
      placeId: (S.places.find(p => !p.home) || S.places[0]).id,
      days: [+b.dataset.dow], start: 16 * 60, end: 17 * 60,
      drop: { on:true, leadMin:10, modes:['car'] },
      pick: { on:true, must:true, earliest:17 * 60, latest:17 * 60 + 20,
              serviceMin:5, modes:['car'] } };
    k.activities.push(a); save(); invalidate();
    EDITING = { refs: [a.id] };
    return go('cls');
  }
  if (act === 'del-cls') {
    const ids = editRefs();
    for (const kk of S.kids) kk.activities = kk.activities.filter(x => !ids.includes(x.id));
    EDITING = { refs: [] }; save(); invalidate(); return back();
  }
  if (act === 'add-place-here') {
    const p = { id: uid('p_'), name:'Новый адрес', address:'',
                lat: homePlace().lat, lon: homePlace().lon, approx:true, needsGeo:true };
    S.places.push(p); setAll(a => a.placeId = p.id); save(); return go('place', p.id);
  }

  /* — дети — */
  if (act === 'add-kid') {
    const k = { id: uid('k_'), name:'Новый', icon:'🙂', activities: [] };
    S.kids.push(k); save(); return go('kid', k.id);
  }
  if (act === 'del-kid') {
    S.kids = S.kids.filter(k => k.id !== cur().p); save(); invalidate(); return back();
  }

  /* — адреса — */
  if (act === 'add-place') {
    const p = { id: uid('p_'), name:'Новый адрес', address:'',
                lat: homePlace().lat, lon: homePlace().lon, approx:true };
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

  /* — код — */
  if (act === 'vault-open') {
    const code = $('#vault-code').value.trim();
    const msg = $('#vault-msg');
    if (!code) { msg.textContent = 'введите код'; msg.className = 'hint bad'; return; }
    msg.className = 'hint'; msg.textContent = 'расшифровываю…';
    const r = await vaultOpen(code);
    if (!r.ok) { msg.textContent = r.msg; msg.className = 'hint bad'; return; }
    load();
    S.cache.vaultTag = r.tag; save();      // запомним версию, чтобы заметить следующую
    VAULT_NEW = false; invalidate();
    stack = [{ v:'now' }];
    await ensureMatrix(true);
    return render();
  }
  if (act === 'vault') return go('vault');

  /* — допущения — */
  if (act === 'assume') return go('assume');
  if (act === 'assume-ok') {
    S.cache.okNotes = [...(S.cache.okNotes || []), b.dataset.id];
    save(); return render();
  }
  if (act === 'assume-clear') {
    S.cache.okNotes = assumptions().map(a => a.id).concat(S.cache.okNotes || []);
    save(); return back();
  }

  /* — заметка — */
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
    for (const p of todo) {
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

  /* — техника — */
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
  if (act === 'app-update') {
    b.textContent = 'обновляю…';
    const v = await liveVersion();
    S.cache.appVersion = v || S.cache.appVersion; save();
    await dropCaches();
    return location.reload();
  }
  if (act === 'perm') { await askPerm(); return render(); }
  if (act === 'test') { return fire('Проверка', 'Уведомления работают', 'test'); }

  if (act === 'export') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type:'application/json' }));
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
    load(); invalidate(); stack = [{ v:'now' }]; return render();
  }
});

/* ── старт ─────────────────────────────────────────────────────────── */
(async function boot() {
  if (FIRST_RUN && await vaultExists()) stack = [{ v:'vault' }];
  render();

  checkAppUpdate();

  /* расписание в репозитории могли перешифровать — заметим это сами */
  if (!FIRST_RUN && S.cache.vaultTag) vaultTag().then(tag => {
    if (tag && tag !== S.cache.vaultTag) { VAULT_NEW = true; if (cur().v === 'now') renderNow(); }
  });

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
