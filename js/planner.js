/* ── planner.js ── build today's stops, then find the cheapest set of outings
   Cost model:  minutes behind the wheel  +  tripPenalty per separate outing.
   The optimiser therefore merges errands into one outing whenever the time
   windows allow it, which is exactly "as few trips as possible".          */

/* 1 ── turn the weekly settings into concrete stops for one date ─────── */
function buildStops(date) {
  const dow = date.getDay(), out = [];
  const dk = dayKey(date);
  const onDay = a => a.days.includes(dow) && !(a.from && dk < a.from) && !(a.until && dk > a.until);
  for (const k of S.kids) {
    const today = k.activities.filter(onDay).sort((x, y) => x.start - y.start);
    for (let i = 0; i < today.length; i++) {
    const a = today[i];
    /* если раньше в этот день ребёнок был на другом занятии, отвезти его
       на следующее можно только после того, как его оттуда забрали */
    const prev = today.slice(0, i).filter(x => x.end <= a.start).map(x => x.end);
    const freeFrom = prev.length ? Math.max(...prev) + 10 : -Infinity;
    if (a.drop && a.drop.on) {
      const by = a.start - (a.drop.leadMin || 0);
      out.push({ kind:'drop', placeId:a.placeId, kidIds:[k.id], title:a.title,
                 w0: Math.min(by, Math.max(by - 30, freeFrom)), w1: by,
                 service:a.drop.leadMin || 0,
                 must:true, modes:a.drop.modes || ['car'] });
    }
    if (a.pick && a.pick.on) {
      out.push({ kind:'pick', placeId:a.placeId, kidIds:[k.id], title:a.title,
                 w0:a.pick.earliest, w1:a.pick.latest, service:a.pick.serviceMin || 0,
                 must:!!a.pick.must, modes:a.pick.modes || ['car'] });
    }
    }
  }
  /* merge identical errands (three kids leaving the same school at 13:15) */
  const merged = [];
  for (const s of out) {
    const m = merged.find(x => x.placeId === s.placeId && x.kind === s.kind &&
                               s.w0 <= x.w1 && x.w0 <= s.w1);
    if (m) {
      m.kidIds = [...new Set([...m.kidIds, ...s.kidIds])];   // never count a kid twice
      m.w0 = Math.max(m.w0, s.w0); m.w1 = Math.min(m.w1, s.w1);
      m.service = Math.max(m.service, s.service);
      m.must = m.must || s.must;
      m.modes = m.modes.filter(x => s.modes.includes(x));
      if (m.title !== s.title) m.title = m.title + ' / ' + s.title;
    } else merged.push({ ...s, kidIds:[...s.kidIds] });
  }
  merged.sort((a, b) => (a.w0 - b.w0) || (a.w1 - b.w1));
  return merged;
}

/* потолок «сколько ребёнок едет с мамой»: обычно из настроек, но planDay умеет
   пересчитать день без него — чтобы предложить маме выбор */
let RIDE_CAP = null;
const rideCap = () => RIDE_CAP == null ? S.cfg.maxRide : RIDE_CAP;

/* 2 ── is stops[i..j] doable as ONE outing from home?  ─────────────────
   Schedule shape: the LAST stop as early as its window allows (nobody waits
   at the door), every earlier stop pushed as late as it can go (nobody sits
   in the car).  Infeasible → null.                                       */
function outing(stops, i, j, dow) {
  const home = homePlace().id, n = j - i + 1;
  const seg = stops.slice(i, j + 1);
  const hop = (x, at) => drive(seg[x].placeId, seg[x + 1].placeId, at, dow);

  /* forward: earliest arrival that still respects every window */
  const e = new Array(n);
  e[0] = seg[0].w0;
  for (let x = 1; x < n; x++) {
    const t0 = e[x - 1] + seg[x - 1].service;
    e[x] = Math.max(seg[x].w0, t0 + hop(x - 1, t0));
  }
  for (let x = 0; x < n; x++) if (e[x] > seg[x].w1 + 0.01) return null;

  /* backward: squeeze the waiting out of the earlier stops (two passes,
     because the travel time itself depends on when you set off) */
  const a = e.slice();
  /* забрать — как можно раньше (никто не ждёт у дверей);
     отвезти  — как можно позже (никто не сидит там лишние полчаса) */
  const last = seg[n - 1];
  if (last.kind === 'drop') a[n - 1] = Math.max(e[n - 1], last.w1);
  for (let pass = 0; pass < 2; pass++)
    for (let x = n - 2; x >= 0; x--) {
      const at = pass === 0 ? a[x + 1] - 20 : a[x] + seg[x].service;
      const cand = a[x + 1] - seg[x].service - hop(x, at);
      a[x] = Math.max(e[x], Math.min(seg[x].w1, cand));
    }

  /* hanging around longer than maxWait → going home is the better shape */
  let inner = 0;
  for (let x = 0; x < n - 1; x++) {
    const leg = hop(x, a[x] + seg[x].service);
    inner += leg;
    if (a[x + 1] - a[x] - seg[x].service - leg > S.cfg.maxWait) return null;
  }

  /* нельзя завезти ребёнка на кружок раньше, чем забрал его с прошлого места */
  const firstPick = new Map();
  for (let x = 0; x < n; x++) if (seg[x].kind === 'pick')
    for (const id of seg[x].kidIds) if (!firstPick.has(id)) firstPick.set(id, x);
  for (let x = 0; x < n; x++) if (seg[x].kind === 'drop')
    for (const id of seg[x].kidIds) {
      const p = firstPick.get(id);
      if (p !== undefined && p > x) return null;
    }

  /* seats: kids to be dropped off ride from home, picked-up kids join later */
  let occ = 0;
  for (const s of seg) if (s.kind === 'drop') occ += s.kidIds.length;
  let peak = occ;
  for (const s of seg) {
    occ += (s.kind === 'pick' ? 1 : -1) * s.kidIds.length;
    peak = Math.max(peak, occ);
  }
  let walkOnly = false;
  if (peak > S.cfg.seats) {
    /* too many for the car — but one nearby pickup can simply be walked */
    const w = n === 1 && seg[0].kind === 'pick' && seg[0].modes.includes('walk')
            ? walk(home, seg[0].placeId) : Infinity;
    if (w > S.cfg.walkMaxMin * 1.5) return null;
    walkOnly = true;
  }

  const out0 = drive(home, seg[0].placeId, a[0] - 15, dow);
  const back = drive(seg[n - 1].placeId, home, a[n - 1] + seg[n - 1].service, dow);
  const driveMin = walkOnly ? 2 * walk(home, seg[0].placeId) : out0 + inner + back;
  const depart = a[0] - (walkOnly ? walk(home, seg[0].placeId) : out0);
  const homeT = a[n - 1] + seg[n - 1].service + (walkOnly ? walk(home, seg[0].placeId) : back);

  /* сколько каждый ребёнок просидит в машине за этот выезд */
  const aboard = new Map();
  let ride = 0, rideKid = null;
  const mark = (id, mins) => { if (mins > ride) { ride = mins; rideKid = id; } };
  for (let x = 0; x < n; x++) {
    const s = seg[x], t = a[x] + s.service;
    for (const id of s.kidIds) {
      if (s.kind === 'drop') {
        mark(id, t - (aboard.has(id) ? aboard.get(id) : depart));
        aboard.delete(id);
      } else aboard.set(id, t);
    }
  }
  for (const [id, t] of aboard) mark(id, homeT - t);
  if (ride > rideCap()) return null;

  return {
    depart, ride, rideKid,
    driveMin, back, walkOnly, home: homeT,
    stops: seg.map((s, x) => ({ ...s, arrive: a[x] }))
  };
}

/* 3 ── DP over an ordered stop list → cheapest segmentation ──────────── */
function segment(stops, dow) {
  const n = stops.length;
  if (!n) return { cost: 0, trips: [] };
  const best = new Array(n + 1).fill(Infinity), from = new Array(n + 1).fill(null);
  best[0] = 0;
  for (let j = 0; j < n; j++) {
    if (best[j] === Infinity) continue;
    for (let k = j; k < n && k - j < 8; k++) {
      const o = outing(stops, j, k, dow);
      if (!o) continue;
      const c = best[j] + o.driveMin + S.cfg.tripPenalty;
      if (c < best[k + 1]) { best[k + 1] = c; from[k + 1] = { j, o }; }
    }
  }
  if (best[n] === Infinity) return null;
  const trips = [];
  for (let x = n; x > 0;) { const f = from[x]; trips.unshift(f.o); x = f.j; }
  return { cost: best[n], trips };
}

/* 4 ── a lone errand nearby is often nicer on foot ───────────────────── */
function maybeWalk(t) {
  if (t.stops.length !== 1) return t;
  const s = t.stops[0];
  if (!s.modes.includes('walk')) return t;
  const w = walk(homePlace().id, s.placeId);
  if (!t.walkOnly) {
    if (w > S.cfg.walkMaxMin) return t;
    if (2 * w > t.driveMin + S.cfg.parkFriction) return t;   // round trip vs round trip
  }
  return { ...t, mode:'walk', depart: s.arrive - w, driveMin: 0, walkMin: 2 * w,
           back: w, home: s.arrive + s.service + w };
}

/* 5 ── the plan for one date ─────────────────────────────────────────── */
function planDay(date = new Date(), opts = {}) {
  RIDE_CAP = opts.maxRide == null ? null : opts.maxRide;
  try { return planDayInner(date); } finally { RIDE_CAP = null; }
}

function planDayInner(date) {
  const dow = date.getDay();
  const all = buildStops(date);
  const opt = all.map((s, i) => (s.must ? -1 : i)).filter(i => i >= 0).slice(0, 6);

  let bestRes = null;
  for (let mask = 0; mask < (1 << opt.length); mask++) {
    const skip = new Set(opt.filter((_, b) => mask & (1 << b)));
    const sub = all.filter((_, i) => !skip.has(i));
    const r = segment(sub, dow);
    if (!r) continue;
    const cost = r.cost + skip.size * S.cfg.skipPenalty;
    if (!bestRes || cost < bestRes.cost)
      bestRes = { cost, trips: r.trips, skipped: [...skip].map(i => all[i]) };
  }
  if (!bestRes) {                       // windows genuinely clash — one outing each
    bestRes = { cost: 0, skipped: [],
                trips: all.map((_, i) => outing(all, i, i, dow)).filter(Boolean) };
  }

  const dk = dayKey(date);
  const trips = bestRes.trips
    .map(t => maybeWalk({ mode:'car', ...t }))
    .sort((a, b) => a.depart - b.depart)
    .map((t, i) => ({
      ...t,
      id: dk + '#' + i + '|' + t.stops.map(s => s.placeId + s.kind).join(','),
      kidIds: [...new Set(t.stops.flatMap(s => s.kidIds))]
    }));

  return { date, dk, trips, skipped: bestRes.skipped, stops: all };
}

/* 6 ── физически невозможные места в расписании ──────────────────────
   Никакой оптимизатор это не чинит: если между двумя занятиями ребёнка
   меньше времени, чем дорога между ними, виновато расписание.          */
function dayConflicts(date = new Date()) {
  const dow = date.getDay(), dk = dayKey(date), out = [];
  const onDay = a => a.days.includes(dow) && !(a.from && dk < a.from) && !(a.until && dk > a.until);
  for (const k of S.kids) {
    const t = k.activities.filter(onDay).sort((x, y) => x.start - y.start);
    for (let i = 1; i < t.length; i++) {
      const A = t[i - 1], B = t[i];
      if (A.placeId === B.placeId) continue;
      const road = drive(A.placeId, B.placeId, A.end, dow);
      const need = road + (B.drop && B.drop.on ? (B.drop.leadMin || 0) : 0);
      const slack = B.start - A.end - need;
      if (slack < 0) out.push({ kid: k, from: A, to: B, road, short: -slack });
    }
  }
  return out;
}

/* the next outing that hasn't departed yet */
function nextTrip(plan, t = nowMin()) {
  return plan.trips.find(x => x.depart > t - 3) || null;
}
