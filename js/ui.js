/* ── ui.js ── router, rendering, field binding ─────────────────────── */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let stack = [{ v:'now' }], PLAN = null, planDK = null;
let WEEKROWS = [];                 // строки календаря текущего рендера
let FLASH = '';                    // короткое пояснение к последнему действию
let VAULT_NEW = false;             // в репозитории лежит расписание свежее нашего
let EDITING = { refs: [] };        // какие занятия правит открытый редактор
let WEEKDATE = new Date();         // с какого дня показан календарь

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

const TITLES = { now:'', who:'Кто вы', vault:'Код', week:'Календарь', cls:'Занятие', kid:'Ребёнок',
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
  nav.hidden = !((t.v === 'now') || (t.v === 'week' && isParent()));
  nav.innerHTML = t.v === 'now' ? ICON.cal : t.v === 'week' ? ICON.cfg : '';
  $('#crumb').textContent = t.v === 'now' ? dateLine() : TITLES[t.v] || '';
  ({ now:renderNow, who:renderWho, vault:renderVault, week:renderWeek, cls:renderCls, kid:renderKid,
     assume:renderAssume, settings:renderSettings, place:renderPlace,
     notes:renderNotes })[t.v](t.p);
}

const dateLine = () => { const d = new Date();
  return `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`; };
const dur = m => { m = Math.round(m);
  return m < 60 ? m + ' мин' : (m / 60 | 0) + ' ч ' + String(m % 60).padStart(2, '0') + ' м'; };

/* ── роли ──────────────────────────────────────────────────────────
   Взрослый видит весь день. Ребёнок — только то, что касается его: свои
   занятия и свои поездки. Это удобство, а не защита: данные всё равно
   лежат на устройстве целиком.                                        */
const isParent = () => S.me.role === 'dad' || S.me.role === 'mom';
const meKid    = () => S.me.role === 'kid' ? kid(S.me.kidId) : null;
const mineOnly = ids => { const k = meKid(); return !k || ids.includes(k.id); };

function myTrips(p) {
  const k = meKid();
  return k ? p.trips.filter(t => t.kidIds.includes(k.id)) : p.trips;
}

function renderWho() {
  const rows = [
    { role:'dad', kidId:'', label:'Папа', sub:'полный доступ' },
    { role:'mom', kidId:'', label:'Мама', sub:'полный доступ' },
    ...S.kids.filter(k => (k.maxAlone || 0) > 0).map(k =>
      ({ role:'kid', kidId:k.id, label:kidLabel(k), sub:'только свои занятия и поездки' }))
  ];
  $('#who-list').innerHTML = rows.map(r =>
    `<button class="row two" data-act="who-set" data-role="${r.role}" data-kid="${esc(r.kidId)}">
       <span class="n">${r.label}${
         S.me.role === r.role && S.me.kidId === r.kidId ? '<span class="badge">это я</span>' : ''}</span>
       <span class="s">${esc(r.sub)}</span></button>`).join('');
}

/* имя ребёнка всегда со своей картинкой */
const kidLabel = k => `${k.icon ? k.icon + ' ' : ''}${esc(k.name)}`;
const namesOf = ids => ids.map(i => { const k = kid(i); return k ? kidLabel(k) : ''; })
                          .filter(Boolean).join(', ');

/* ── план на сегодня ───────────────────────────────────────────────── */
function dayOverrides() {
  const dk = dayKey();
  return { force:  new Set((S.cache.pickUp   || {})[dk] || []),
           skip:   new Set((S.cache.skipPick || {})[dk] || []),
           onFoot: new Set((S.cache.onFoot   || {})[dk] || []),
           waitOk: new Set((S.cache.stayOut  || {})[dk] || []) };
}

/* ── предложения ──────────────────────────────────────────────────────
   На каждое событие — не больше одного вопроса, и только там, где у него
   правда есть вторая осмысленная развязка. Галочка значит «так и делай»,
   крестик — «нет» и сразу перестраивает день.                          */
function propHtml(pr) {
  if (!pr || ((S.cache.okProp || {})[dayKey()] || []).includes(pr.id)) return '';
  return `<div class="prop"><span>${esc(pr.text)}</span>
      <span class="pb">
        <button data-act="prop-yes" data-id="${esc(pr.id)}" title="так и делаем">✓</button>
        <button data-act="prop-no" data-id="${esc(pr.id)}"
                data-do="${pr.act}" data-arg="${esc(pr.arg)}" title="нет, иначе">✗</button>
      </span></div>`;
}

function tripProposal(t) {
  const acts = [...new Set(t.stops.flatMap(s => s.actIds || []))];
  const picks = t.stops.filter(s => s.kind === 'pick');
  if (!acts.length) return null;

  if (t.mode === 'walk' && picks.length)
    return { id: 'walk|' + acts.join(','), act: 'skip-pick', arg: acts.join(','),
             text: 'Я предложил идти пешком — может, дети дойдут сами?' };

  if (t.mode === 'car' && t.stops.length === 1 && t.stops[0].modes.includes('walk'))
    return { id: 'car|' + acts.join(','), act: 'on-foot', arg: acts.join(','),
             text: 'Я предложил ехать на машине — может, дойти пешком?' };

  return null;
}

const spareProposal = g => ({
  id: 'gap|' + g.key, act: 'stay', arg: g.key,
  text: g.away ? 'Я предложил подождать на месте — может, съездить домой?'
               : 'Я предложил вернуться домой — может, подождать у следующего места?' });

const aloneProposal = r => ({
  id: 'alone|' + r.actIds.join(','), act: 'collect', arg: r.actIds.join(','),
  text: 'Я предложил, что доберутся сами — может, забрать?' });

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
  const long = worst && worst.ride > rideCap(worst.rideKid);

  if (said === true) return long ? { ...loose, longRide: worst } : strict;

  const saved = strict.trips.length - loose.trips.length;
  if (saved > 0 && long) {
    /* если один и тот же ответ повторился трижды — больше не спрашиваем */
    const L = (S.cache.learn || {})[worst.rideKid] || { yes:0, no:0 };
    if (L.yes >= 3 && L.no === 0) return { ...loose, longRide: worst, learned:'yes' };
    if (L.no  >= 3 && L.yes === 0) return { ...strict, learned:'no' };
    return { ...strict, offer: { saved, ride: worst.ride, kid: kid(worst.rideKid) } };
  }
  return strict;
}

function plan(force) {
  if (force || !PLAN || planDK !== dayKey()) { PLAN = buildPlan(); planDK = dayKey(); }
  return PLAN;
}
const invalidate = () => { PLAN = null; };

/* Шаги, которые мама отметила сама: «выехали» и «на месте». */
const stepMarks = () => (S.cache.steps || {})[dayKey()] || {};
const stepDone  = () => new Set(Object.entries(stepMarks())
                          .filter(([, v]) => v && v.arrived).map(([k]) => k));

function markStep(key, field) {
  const dk = dayKey();
  S.cache.steps = S.cache.steps || {};
  const day = S.cache.steps[dk] = S.cache.steps[dk] || {};
  const cur = day[key] = day[key] || {};
  cur[field] = cur[field] ? 0 : Math.round(nowMin());   // повторное нажатие снимает
  const old = dayKey(new Date(Date.now() - 3 * 864e5));
  for (const k of Object.keys(S.cache.steps)) if (k < old) delete S.cache.steps[k];
  save(); invalidate(); render();
}

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
    (x.ride > rideCap(x.rideKid) && x.rideKid
      ? ` · ${kidLabel(kid(x.rideKid) || {name:''})} в машине ${dur(x.ride)}` : '');
  return `<div class="trip ${now != null && x.depart < now - 2 ? 'done' : ''}">
      <div class="th">
        <span class="t">${m2hm(x.depart)}</span>
        <span class="ic">${x.mode === 'walk' ? ICON.walk : ICON.car}</span>
        <span class="lbl">из дома${extra ? ' · ' + extra : ''}</span>
      </div>
      ${legsHtml(x)}
      ${propHtml(tripProposal(x))}
    </div>`;
}

/* свободное окно: где мама и до какого часа. Нажатие меняет место. */
function spareCard(g) {
  return `<div class="trip spare">
      <div class="th"><span class="t">${m2hm(g.from)}</span>
        <span class="lbl">свободно ${dur(g.to - g.from)} · до ${m2hm(g.to)}</span></div>
      <div class="leg"><b></b><div><span>${esc(place(g.placeId)?.name || '')}</span></div></div>
      ${propHtml(spareProposal(g))}
    </div>`;
}

/* ребёнок добирается домой сам — это всегда решение, а не мелочь */
function aloneCard(r) {
  return `<div class="trip alone">
      <div class="th"><span class="t">${m2hm(r.at)}</span>
        <span class="ic">${ICON.warn}</span>
        <span class="lbl">${esc(place(r.placeId)?.name || '')} — домой сами</span></div>
      <div class="leg"><b></b><div><span>${r.kids.map(kidLabel).join(', ')}</span>
        <i>после «${esc(r.title)}»</i></div></div>
      ${propHtml(aloneProposal(r))}
    </div>`;
}

/* ребёнок остаётся дома один дольше, чем ему можно */
function aloneCardHome(r) {
  return `<div class="trip alone">
      <div class="th"><span class="t">${m2hm(r.from)}</span>
        <span class="ic">${ICON.warn}</span>
        <span class="lbl">дома один до ${m2hm(r.to)}</span></div>
      <div class="leg"><b></b><div><span>${kidLabel(r.kid)}</span>
        <i>${dur(r.span)} без взрослых, разрешено ${dur(r.cap)}</i></div></div>
    </div>`;
}

function renderNow() {
  const full = plan(), t = nowMin();
  const p = meKid() ? { ...full, trips: myTrips(full), skipped: [] } : full;
  const done = stepDone();
  const st = nextStep(p, t, new Date(), done);
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
    const mark = stepMarks()[st.key] || {};
    const mins = Math.round(stepMinutes(st));
    const big = n => n < 90 ? `<span>${n}</span><i>мин</i>`
                            : `<span>${(n / 60 | 0)}:${String(n % 60).padStart(2, '0')}</span><i>ч</i>`;

    /* Уехали или нет — вопрос факта, а не расписания. Верим отметке, потом
       геолокации, и только потом часам.                                   */
    const atStart = isParent() ? nearPlace(st.from) : null;
    const gone = mark.left ? true : (atStart === true ? false : null);
    const late = t - st.leave;
    let eta = st.arrive;

    if (gone === true) {                       // точно в пути
      eta = (mark.left || t) + mins;
      $('#hero-label').textContent = onFoot ? 'В пути пешком, придём в' : 'В пути, приедем в';
      $('#hero-num').innerHTML = `<span>${m2hm(eta)}</span>`;
      if (eta > st.arrive + 5) hero.classList.add('hot');
    } else if (late > 1 && gone === false) {   // стоим дома, а пора бы ехать
      hero.classList.add('hot');
      eta = t + mins;
      $('#hero-label').textContent = 'Опаздываем на';
      $('#hero-num').innerHTML = big(Math.round(late));
    } else if (late > 1) {                     // время вышло, но факта не знаем
      hero.classList.add('hot');
      eta = t + mins;
      $('#hero-label').textContent = onFoot ? 'Пора выходить' : 'Пора выезжать';
      $('#hero-num').innerHTML = `<span>сейчас</span>`;
    } else {
      if (late > -10) hero.classList.add('hot');
      $('#hero-label').textContent = onFoot ? 'Выход через' : 'Выезд через';
      $('#hero-num').innerHTML = big(Math.round(-late));
    }

    const slip = Math.round(eta - st.arrive);
    const lead = `${onFoot ? 'выход' : 'выезд'} ${fromHome ? 'из дома' : 'от «' + esc(place(st.from)?.name || '') + '»'}` +
                 ` в ${m2hm(st.leave)} · ${mins} мин ${onFoot ? 'пешком' : 'в пути'}`;
    const body = st.kind === 'home'
      ? `<div class="leg home"><b>${m2hm(eta)}</b><div><span>дом</span>
           ${slip > 4 ? `<i class="slip">на ${slip} мин позже плана (${m2hm(st.arrive)})</i>` : ''}
         </div></div>`
      : `<div class="leg"><b>${m2hm(eta)}</b><div>
           <span>${esc(place(st.to)?.name || '?')}</span>
           <i>${st.kind === 'drop' ? 'отвезти' : 'забрать'}: ${namesOf(st.kidIds)}</i>
           ${st.teacher ? `<i>${esc(st.teacher)}</i>` : ''}
           ${slip > 4 ? `<i class="slip">на ${slip} мин позже плана (${m2hm(st.arrive)})</i>` : ''}
         </div></div>`;

    $('#hero-sub').innerHTML =
      `<div class="hlead"><span class="ic">${onFoot ? ICON.walk : ICON.car}</span><span>${lead}</span></div>` +
      `<div class="legs">${body}</div>` +
      `<div class="qb steps">
         <button data-act="step-left" data-key="${esc(st.key)}">${
           mark.left ? '↺ не выехали' : (onFoot ? 'вышли' : 'выехали')}</button>
         <button data-act="step-here" data-key="${esc(st.key)}">на месте</button>
       </div>`;
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
      `если ${o.kid ? kidLabel(o.kid) : 'ребёнок'} поедет кататься с мамой — ${dur(o.ride)} в машине.</div>` +
      `<div class="qb"><button data-act="ride-yes">Да, поедет</button>` +
      `<button data-act="ride-no">Нет, домой</button></div>`;
  }

  /* весь день одной лентой: выезды, свободные окна, «дойдут сами» */
  const items = [];
  for (const x of p.trips) if (x.home > t - 3) items.push({ at: x.depart, html: tripRow(x, t) });
  if (isParent()) {
    for (const r of unattended(p, new Date())) if (r.at > t - 3) items.push({ at: r.at, html: aloneCard(r) });
    for (const g of spareBlocks(p, new Date())) if (g.to > t) items.push({ at: g.from, html: spareCard(g) });
    for (const r of aloneAtHome(p, new Date())) if (r.to > t) items.push({ at: r.from, html: aloneCardHome(r) });
  }
  items.sort((a, b) => a.at - b.at);

  /* всё, что мама сегодня решила вручную, откатывается одной строкой */
  const dk = dayKey();
  const edits = ['pickUp', 'skipPick', 'onFoot', 'stayOut', 'okProp']
    .reduce((n, b) => n + (((S.cache[b] || {})[dk] || []).length), 0)
    + (((S.cache.rideOk || {})[dk] === undefined) ? 0 : 1);
  $('#trips').innerHTML = items.map(i => i.html).join('') +
    (FLASH ? `<div class="flash">${esc(FLASH)}</div>` : '') +
    (edits ? `<button class="undo" data-act="day-reset">мои правки на сегодня: ${
      edits} — вернуть как было</button>` : '');

  const src = { live:'Яндекс, с пробками', route:'OSRM + модель пробок',
               estimate:'оценка по прямой', loading:'считаю маршруты…', idle:'' }[matStatus] || '';
  const sy = S.cache.syncedAt
    ? 'заметка: ' + new Date(S.cache.syncedAt).toLocaleString('ru-RU',
        { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    : 'заметка не подключена';
  $('#notes-strip').textContent = [src, sy].filter(Boolean).join(' · ');

  $('#update-strip').innerHTML = VAULT_NEW
    ? `<button data-act="vault">Расписание обновилось — загрузить по коду →</button>` : '';

  $('#assume-strip').innerHTML = p.learned
    ? `<span>${p.learned === 'yes' ? 'Запомнил: катаемся вместе — не переспрашиваю.'
                                   : 'Запомнил: развозим по домам — не переспрашиваю.'}</span>` : '';
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
    if (!mineOnly([k.id])) continue;
    if (m) { m.kids.push(k); m.refs.push(a.id); }
    else rows.push({ key, title:a.title, teacher:a.teacher, placeId:a.placeId,
                     start:a.start, end:a.end, once:a.once, note:a.note, remark:a.remark,
                     kids:[k], refs:[a.id] });
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

/* допущение показываем на самом событии, а не отдельным списком внизу */
function noteOf(c) {
  const done = S.cache.okNotes || [];
  if (!c.note || !/ЗАМЕТКА/.test(c.note)) return '';
  if (c.refs.every(id => done.includes(id))) return '';
  return c.note.replace(/^ЗАМЕТКА:\s*/, '');
}

function renderWeek() {
  WEEKDATE = new Date();
  const t0 = WEEKDATE, out = [];
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
          <div><span>${esc(c.title)}${c.once ? ' <span class="badge">разово</span>' : ''}</span>
            <i>${c.kids.map(kidLabel).join(', ')}${
              (place(c.placeId)?.name || '') === c.title ? ''
                : ' · ' + esc(place(c.placeId)?.name || '?')}</i>
            ${c.remark ? `<span class="crem">${esc(c.remark)}</span>` : ''}
            ${noteOf(c) ? `<span class="cnote">${esc(noteOf(c))}</span>` : ''}</div>
        </button>`;
    }).join('') || '<div class="wempty">занятий нет</div>');

  }
  $('#week').innerHTML = out.join('');
  $('#fab').hidden = !isParent();
  $('#kid-strip').innerHTML = !isParent() ? '' : S.kids.map(k =>
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

  const understood = a.remark ? applyRemark({ ...a, drop:{...a.drop}, pick:{...a.pick} }) : [];

  const done = S.cache.okNotes || [];
  const openNote = (a.note && /ЗАМЕТКА/.test(a.note) && !refs.every(id => done.includes(id)))
    ? a.note.replace(/^ЗАМЕТКА:\s*/, '') : '';

  $('#cls-form').innerHTML =
    (openNote ? `<div class="grp"><div class="cap">Я это домыслил</div>
        <div class="hint" style="color:var(--warn)">${esc(openNote)}</div>
        <button class="row add" data-act="note-ok">Понятно, так и есть</button></div>` : '') +
    fWide('Название', a.title, v => setAll(x => x.title = v)) +
    fWide('Педагог', a.teacher || '', v => setAll(x => x.teacher = v)) +
    fSel('Место', a.placeId, opts, v => setAll(x => x.placeId = v)) +
    `<button class="row add" data-act="add-place-here">+ новый адрес</button>` +
    (a.once
      ? fRow('Дата', `<input type="date" value="${esc(a.once)}"
              data-b="${bind(v => setAll(x => x.once = v))}">`)
      : `<div class="days">${DOW.map((d, i) =>
          `<button data-day="${i}" class="${a.days.includes(i) ? 'on' : ''}">${d}</button>`).join('')}</div>`) +
    fTime('Начало', a.start, v => setAll(x => x.start = v)) +
    fTime('Конец', a.end, v => setAll(x => { x.end = v; if (x.pick.earliest < v) x.pick.earliest = v; })) +

    `<div class="grp"><div class="cap">Пожелания</div>` +
      fWide('Своими словами', a.remark || '',
            v => { setAll(x => x.remark = v); setAll(x => applyRemark(x)); render(); }) +
      `<div class="hint">${understood.length
         ? 'Понял так: ' + understood.map(esc).join('; ') + '.'
         : 'Например: «приезжать за 20 минут до начала», «забирать не позже 18:40», «сами дойдут».'}</div>` +
    `</div>` +

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
    fNum('Один дома не дольше, мин', k.maxAlone == null ? 180 : k.maxAlone,
         v => { k.maxAlone = v; }, 0, 600) +
    fNum('В машине не дольше, мин (0 — без границы)',
         k.maxRide == null ? S.cfg.maxRide : k.maxRide, v => { k.maxRide = v; }, 0, 600) +
    `<div class="hint">${k.icon || '—'} ${esc(k.name)}${
       (k.maxAlone === 0) ? ' · одного дома не оставляем' : ''}${
       (k.maxRide === 0) ? ' · кататься может сколько угодно' : ''}</div>`;
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
  const meLabel = S.me.role === 'kid' ? (kid(S.me.kidId)?.name || 'ребёнок')
                : S.me.role === 'dad' ? 'папа' : S.me.role === 'mom' ? 'мама' : 'не выбрано';
  if ($('#who-st')) $('#who-st').textContent = meLabel;
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
    fNum('Шаг закрывается сам через, мин', c.graceMin == null ? 25 : c.graceMin,
         v => c.graceMin = v, 5, 120) +
    /* Местоположение — только для того, кто за рулём, и только на его
       телефоне. Детям не предлагаем вовсе: за ними следит «Локатор», а не
       это приложение.                                                    */
    (isParent()
      ? fChk('Подсказывать по местоположению', c.geo,
             v => { c.geo = v; v ? geoStart() : geoStop(); }) +
        `<div class="hint">Включается на каждом телефоне отдельно и никуда не
         передаётся: нужно только чтобы понять, выехали вы уже или ещё нет.
         Детям эта настройка не показывается.</div>`
      : '') +
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
  notifyReport();

  const c2 = S.cfg;
  $('#push-cfg').innerHTML =
    fWide('Адрес воркера', c2.pushUrl, v => c2.pushUrl = v.trim()) +
    fWide('Общий пароль', c2.pushSecret, v => c2.pushSecret = v.trim()) +
    `<button class="row add" data-act="push-on">Включить и передать расписание</button>
     <button class="row add" data-act="push-test">Проверить доставку</button>
     <button class="row add" data-act="push-off">Отключить</button>
     <div class="hint" id="push-st">${S.cache.pushAt
        ? 'передано будильников: ' + (S.cache.pushCount || 0) + ' · ' +
          new Date(S.cache.pushAt).toLocaleString('ru-RU',
            { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
        : 'пока не подключено'}</div>`;
  $('#ver').textContent = 'Маршрут ' + (S.cache.appVersion || '') +
    ' · данные хранятся только на устройстве';
}

/* Уведомления на айфоне включаются только при совпадении нескольких условий.
   Показываем каждое отдельно — иначе непонятно, что именно не так.       */
async function notifyReport() {
  const box = $('#notify-st'); if (!box) return;
  const standalone = matchMedia('(display-mode: standalone)').matches ||
                     navigator.standalone === true;
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
  let regs = 0;
  try { regs = (await navigator.serviceWorker.getRegistrations()).length; } catch {}
  let sub = null;
  try { const r = await navigator.serviceWorker.getRegistration();
        sub = r && await r.pushManager.getSubscription(); } catch {}
  const m = navigator.userAgent.match(/OS (\d+)[._](\d+)/);
  const iosVer = m ? +m[1] + +m[2] / 10 : null;

  const rows = [
    ['защищённое соединение (https)', isSecureContext],
    ['браузер умеет уведомления', 'Notification' in window],
    ['браузер умеет веб-пуш', 'PushManager' in window],
    [ios ? `iOS ${iosVer || '?'} — нужен 16.4 и новее` : 'версия системы', !ios || (iosVer >= 16.4)],
    ['разрешение выдано', ('Notification' in window) && Notification.permission === 'granted'],
    ['служебный работник зарегистрирован', regs > 0],
    [ios ? 'запущено с домашнего экрана' : 'открыто как приложение', standalone],
    ['подписка на фоновые пуши создана', !!sub]
  ];
  box.innerHTML = rows.map(([t, ok]) =>
      `<div class="chk ${ok ? 'y' : 'n'}">${ok ? '✓' : '✗'} ${esc(t)}</div>`).join('') +
    `<p class="hint">Пока приложение открыто, напоминания приходят. Закрытое
     приложение iOS не будит — это ограничение веб-приложений, а не настройка.
     ${ios && !standalone ? '<b>Сейчас главное: «Поделиться» → «На экран Домой».</b>' : ''}</p>`;
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
    `<div class="f wide"><label>Поиск на карте</label>
        <input type="text" id="pl-q" placeholder="как вы называете это место"
               value="${esc(p.address || '')}" autocomplete="off"></div>
     <div id="pl-hits"></div>` +
    `<button class="row add" data-act="geo">Определить по адресу</button>` +
    (p.home ? '' : fChk('Это дом', false,
       () => { S.places.forEach(x => x.home = false); p.home = true; save(); render(); })) +
    `<div class="hint" id="geo-st">${p.approx ? 'координаты приблизительные — уточните' : ''}</div>`;
}

/* поиск адреса: набираем как удобно, выбираем из найденного */
let plTimer = null;
document.addEventListener('input', e => {
  if (e.target.id !== 'pl-q') return;
  clearTimeout(plTimer);
  const q = e.target.value;
  const box = $('#pl-hits');
  plTimer = setTimeout(async () => {
    box.innerHTML = '<div class="hint">ищу…</div>';
    const hits = await suggest(q);
    PLHITS = hits;
    box.innerHTML = hits.length
      ? hits.map((h, i) => `<button class="row two" data-act="pl-pick" data-i="${i}">
            <span class="n">${esc(h.label.split(',').slice(0, 3).join(','))}</span>
            <span class="s">${h.exact ? 'точный дом' : 'примерно'} · ${
              h.lat.toFixed(5)}, ${h.lon.toFixed(5)}</span></button>`).join('')
      : '<div class="hint">ничего не нашлось — попробуйте иначе или вбейте координаты</div>';
  }, 600);
});
let PLHITS = [];

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

/* Полная зачистка: старый воркер мог остаться с тех времён, когда он ещё
   кэшировал файлы, и продолжать отдавать вчерашний код. */
async function hardRefresh() {
  await dropCaches();
  location.reload();
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
function pruneDays(bucket) {
  const old = dayKey(new Date(Date.now() - 3 * 864e5));
  for (const k of Object.keys(S.cache[bucket] || {})) if (k < old) delete S.cache[bucket][k];
}

function toggleIds(bucket, ids) {
  const dk = dayKey();
  S.cache[bucket] = S.cache[bucket] || {};
  const set = new Set(S.cache[bucket][dk] || []);
  ids.every(i => set.has(i)) ? ids.forEach(i => set.delete(i)) : ids.forEach(i => set.add(i));
  S.cache[bucket][dk] = [...set];
  pruneDays(bucket);
}

/* «подожду на месте» имеет смысл, только если выездов станет меньше.
   Если детям пришлось бы сидеть в машине дольше разрешённого — откат. */
function toggleStay(key) {
  const dk = dayKey();
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
  pruneDays('stayOut');
  save(); render();
}

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
  if (act === 'step-left') return markStep(b.dataset.key, 'left');
  if (act === 'step-here') return markStep(b.dataset.key, 'arrived');

  if (act === 'prop-yes') {                       // «так и делай»
    const dk = dayKey();
    S.cache.okProp = S.cache.okProp || {};
    S.cache.okProp[dk] = [...new Set([...(S.cache.okProp[dk] || []), b.dataset.id])];
    S.cache.learn = S.cache.learn || {};
    const kind = b.dataset.id.split('|')[0];
    const L = S.cache.learn[kind] || (S.cache.learn[kind] = { yes:0, no:0 });
    L.yes++;
    pruneDays('okProp'); save(); return render();
  }
  if (act === 'prop-no') {                        // «нет, иначе» — сразу перестраиваем
    const kind = b.dataset.id.split('|')[0];
    S.cache.learn = S.cache.learn || {};
    const L = S.cache.learn[kind] || (S.cache.learn[kind] = { yes:0, no:0 });
    L.no++;
    const arg = b.dataset.arg, ids = arg.split(',').filter(Boolean);
    if (b.dataset.do === 'skip-pick') toggleIds('skipPick', ids);
    if (b.dataset.do === 'on-foot')   toggleIds('onFoot',  ids);
    if (b.dataset.do === 'collect')   toggleIds('pickUp',  ids);
    if (b.dataset.do === 'stay')      return toggleStay(arg);
    save(); invalidate(); return render();
  }

  if (act === 'stay') return toggleStay(b.dataset.key);

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
  if (act === 'day-reset') {
    const dk = dayKey();
    for (const bkt of ['pickUp', 'skipPick', 'onFoot', 'stayOut', 'okProp'])
      if (S.cache[bkt]) delete S.cache[bkt][dk];
    if (S.cache.rideOk) delete S.cache.rideOk[dk];
    FLASH = ''; save(); invalidate(); return render();
  }
  if (act === 'ride-yes' || act === 'ride-no') {
    const dk = dayKey();
    /* запоминаем не только ответ на сегодня, но и привычку */
    const yes = act === 'ride-yes';
    S.cache.learn = S.cache.learn || {};
    const kidId = (plan().offer && plan().offer.kid && plan().offer.kid.id) || 'all';
    const L = S.cache.learn[kidId] || (S.cache.learn[kidId] = { yes:0, no:0 });
    yes ? L.yes++ : L.no++;
    S.cache.rideOk = S.cache.rideOk || {};
    S.cache.rideOk[dk] = yes;
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
  if (act === 'add-menu')   { $('#add-menu').hidden = false; return; }
  if (act === 'add-cancel') { $('#add-menu').hidden = true;  return; }
  if (act === 'add-once' || act === 'add-weekly') {
    $('#add-menu').hidden = true;
    const k = S.kids[0];
    if (!k) { FLASH = 'Сначала добавьте ребёнка'; return render(); }
    const d = new Date();
    const a = { id: uid('a_'), title: act === 'add-once' ? 'Разовое событие' : 'Новое занятие',
      teacher:'', remark:'',
      placeId: (S.places.find(p => !p.home) || S.places[0]).id,
      days: [d.getDay()], start: 16 * 60, end: 17 * 60,
      drop: { on:true, leadMin:10, modes:['car'] },
      pick: { on:true, must:true, earliest:17 * 60, latest:17 * 60 + 20,
              serviceMin:5, modes:['car'] } };
    if (act === 'add-once') a.once = dayKey(d);
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
  if (act === 'pl-pick') {
    const h = PLHITS[+b.dataset.i]; if (!h) return;
    const p = place(cur().p);
    Object.assign(p, { lat:h.lat, lon:h.lon, approx: !h.exact, needsGeo:false,
                       address: p.address || h.label });
    save(); await ensureMatrix(true); invalidate(); return render();
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
  if (act === 'note-ok') {
    S.cache.okNotes = [...(S.cache.okNotes || []), ...editRefs()];
    save(); return render();
  }
  if (act === 'assume-ok') {
    S.cache.okNotes = [...(S.cache.okNotes || []), b.dataset.id];
    save(); return render();
  }
  if (act === 'assume-clear') {
    S.cache.okNotes = assumptions().map(a => a.id).concat(S.cache.okNotes || []);
    save(); return back();
  }

  /* — заметка — */
  if (act === 'who') return go('who');
  if (act === 'who-set') {
    S.me = { role: b.dataset.role, kidId: b.dataset.kid || '' };
    save(); invalidate();
    stack = [{ v:'now' }];
    return render();
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
  if (act === 'push-on' || act === 'push-test' || act === 'push-off') {
    const o = $('#push-st'); o.textContent = 'секунду…';
    try {
      if (act === 'push-off') { await pushForget(); o.textContent = 'отключено'; }
      else if (act === 'push-test') {
        const r = await pushTest();
        o.textContent = r.status >= 200 && r.status < 300
          ? `служба доставки приняла (${r.status}) — уведомление придёт за несколько секунд`
          : `служба доставки ответила ${r.status}${r.detail ? ': ' + r.detail : ''}`;
      } else {
        const r = await pushSync();
        o.textContent = `передано будильников: ${r.queued}`;
      }
    } catch (e) { o.textContent = 'не вышло: ' + (e.message || e); }
    return;
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

addEventListener('scroll', () => {
  document.body.classList.toggle('scrolled', scrollY > 4);
}, { passive: true });

/* На айфоне высота шапки зависит от «чёлки» и от того, свёрнута ли адресная
   строка. Меряем её и отдаём в CSS, иначе заголовки дней липнут не туда. */
function measureBar() {
  const h = Math.round($('#bar').getBoundingClientRect().height);
  document.documentElement.style.setProperty('--bartop', h + 'px');
}
addEventListener('resize', measureBar);
addEventListener('orientationchange', () => setTimeout(measureBar, 250));
if (window.visualViewport) visualViewport.addEventListener('resize', measureBar);

/* ── старт ─────────────────────────────────────────────────────────── */
(async function boot() {
  if (FIRST_RUN && await vaultExists()) stack = [{ v:'vault' }];
  else if (!S.me.role && S.kids.length) stack = [{ v:'who' }];
  render();
  measureBar();
  if (S.cfg.geo && isParent()) geoStart();

  checkAppUpdate();
  /* установленное приложение просыпается, а не запускается — проверим и тут */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkAppUpdate();
  });

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

  setInterval(() => { if (S.cfg.pushUrl && S.cache.pushAt) pushSync().catch(() => {}); }, 3600e3);

  setInterval(() => syncNote().then(r => { if (r && r.imported) { invalidate(); render(); } }), 10 * 60000);
  setInterval(() => ensureMatrix(true).then(() => { invalidate(); if (cur().v === 'now') renderNow(); }), 30 * 60000);
})();
