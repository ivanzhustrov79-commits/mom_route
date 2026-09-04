/* ── appleroute.js ── настоящие пробки от Apple Карт ───────────────────
   Замысел: дешёвый поиск, точный ответ.

   Оптимизатор перебирает сотни вариантов дня — гонять на каждый шаг запрос
   в Карты бессмысленно и Apple такого не простит. Поэтому перебор идёт на
   OSRM с модельной кривой, а потом мы спрашиваем Карты только про те
   перегоны, которые в итоге выбраны, и ровно на то время, когда мама
   действительно поедет. Ответы ложатся в кэш, план пересчитывается — и
   дальше всё считается уже по реальным числам.

   Ключ кэша включает дату и час: пробки в 13:00 и в 18:00 — разные пробки,
   а вчерашние сегодня ничего не значат.                                  */

const appleReady = () => !!(window.Capacitor && window.Capacitor.Plugins
                            && window.Capacitor.Plugins.AppleRoute);

const appleKey = (a, b, dk, hour) => `${a}>${b}@${dk}@${hour}`;

async function appleEta(aId, bId, whenMs) {
  const a = place(aId), b = place(bId);
  const r = await window.Capacitor.Plugins.AppleRoute.eta({
    from: { lat: a.lat, lon: a.lon },
    to:   { lat: b.lat, lon: b.lon },
    departAt: whenMs
  });
  return r.seconds / 60;
}

/* Спрашиваем Карты про перегоны сегодняшнего плана, которых ещё нет в кэше.
   Возвращает, сколько новых ответов получили: если ноль, перерисовывать
   нечего.                                                               */
async function appleRefresh(p, date = new Date()) {
  if (!appleReady()) return 0;
  const dk = dayKey(date);
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  S.cache.apple = S.cache.apple || {};

  const want = new Map();
  for (const st of daySteps(p, date)) {
    if (st.mode === 'walk' || st.from === st.to) continue;
    const k = appleKey(st.from, st.to, dk, Math.floor(st.leave / 60));
    if (!(k in S.cache.apple))
      want.set(k, { from: st.from, to: st.to, at: midnight + Math.round(st.leave) * 60000 });
  }

  /* Пересчёт плана может сдвинуть выезд в соседний час — тогда нужен ещё
     один ответ. Это сходится за пару проходов, но потолок на всякий случай
     держим: Карты не любят, когда их дёргают пачками.                    */
  let got = 0, budget = 12;
  for (const [k, v] of want) {
    if (budget-- <= 0) break;
    try { S.cache.apple[k] = await appleEta(v.from, v.to, v.at); got++; }
    catch { S.cache.apple[k] = null; }        // помним и отказ, чтобы не долбить
    await new Promise(r => setTimeout(r, 250));   // Карты не любят очередей
  }

  for (const k of Object.keys(S.cache.apple))   // чужие дни держать незачем
    if (!k.includes('@' + dk + '@')) delete S.cache.apple[k];

  if (got) save();
  return got;
}

/* сколько перегонов сегодня посчитано по настоящим пробкам */
function appleCount() {
  const dk = dayKey();
  return Object.entries(S.cache.apple || {})
    .filter(([k, v]) => typeof v === 'number' && k.includes('@' + dk + '@')).length;
}
