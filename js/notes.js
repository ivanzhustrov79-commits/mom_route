/* ── notes.js ── parse the shared-note text into activities ───────────
   Understood shapes (day context carries down from a heading line):
     Понедельник
       16:00-17:30 Аня бассейн, Тверская улица 10
     Пн, Ср 15:30–17:00 Боря + Вера карате @ улица Арбат, 20
     Будни 08:30-13:15 Аня/Боря/Вера школа, Тверская улица 10          */

const DAYW = { 'вс':0,'воскресенье':0,'sun':0,
               'пн':1,'понедельник':1,'mon':1, 'вт':2,'вторник':2,'tue':2,
               'ср':3,'среда':3,'wed':3,     'чт':4,'четверг':4,'thu':4,
               'пт':5,'пятница':5,'fri':5,   'сб':6,'суббота':6,'sat':6 };
const ADDR_HINT = /(ул\.?|улица|просп|пр-т|проспект|аллея|шоссе|бульвар|пер\.?|переулок|наб\.?|д\.\s*\d|,\s*\d+[а-яa-z]?\s*$)/i;

const STOPW = new Set(['будни','будние','дни','день','ежедневно','каждый','daily','weekday','weekdays']);
const norm = s => s.toLowerCase().replace(/ё/g,'е').replace(/[^\wа-я0-9]+/gi,' ').trim();

function daysIn(text) {
  const found = new Set();
  if (/будн|weekday|пн\s*[-–—]\s*пт/i.test(text)) [1,2,3,4,5].forEach(d => found.add(d));
  if (/ежеднев|каждый день|daily/i.test(text)) [1,2,3,4,5,6,0].forEach(d => found.add(d));
  for (const w of text.toLowerCase().replace(/ё/g,'е').split(/[^a-zа-я]+/)) {
    const d = DAYW[w];
    if (d !== undefined) found.add(d);
  }
  return [...found].sort();
}

function parseNote(text) {
  const rows = [], warn = [];
  let ctx = [];
  const names = S.kids.map(k => ({ id:k.id, n:norm(k.name) }));

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const times = [...line.matchAll(/\b(\d{1,2})[:.](\d{2})\b/g)].map(m => +m[1]*60 + +m[2]);
    const dd = daysIn(line);

    if (!times.length) { if (dd.length) ctx = dd; continue; }      // heading line

    const days = dd.length ? dd : ctx;
    if (!days.length) { warn.push(line); continue; }

    /* kids */
    const nl = ' ' + norm(line) + ' ';
    const kidIds = names.filter(k => nl.includes(' ' + k.n + ' ') ||
                                     nl.includes(' ' + k.n + 'а ') ||
                                     nl.includes(' ' + k.n + 'у ')).map(k => k.id);
    if (!kidIds.length) { warn.push(line); continue; }

    /* address = last comma/@ chunk that looks like an address */
    let addr = '', rest = line;
    const at = line.split(/\s@\s|\s@|@/);
    if (at.length > 1 && ADDR_HINT.test(at[at.length-1])) { addr = at.pop().trim(); rest = at.join(' '); }
    else {
      const parts = line.split(/\s*,\s*/);
      for (let i = parts.length - 1; i >= 1; i--)
        if (ADDR_HINT.test(parts.slice(i).join(', '))) { addr = parts.slice(i).join(', ').trim(); rest = parts.slice(0,i).join(', '); break; }
    }

    /* title = words left after stripping times, days and kid names */
    let title = rest
      .replace(/\b\d{1,2}[:.]\d{2}\b/g,' ')
      .replace(/[-–—]/g,' ')
      .split(/\s+/)
      .filter(w => { const x = norm(w);
        return x && DAYW[x] === undefined && !STOPW.has(x) && !names.some(k => x.startsWith(k.n)); })
      .join(' ').replace(/^[\s,./]+|[\s,./]+$/g,'');
    if (!title) title = 'Занятие';

    rows.push({ days, start: times[0], end: times[1] ?? times[0],
                kidIds, title: title[0].toUpperCase() + title.slice(1), addr });
  }
  return { rows, warn };
}

/* pick an existing place with a similar address, else make a new one */
function placeFor(addr) {
  if (!addr) return null;
  const a = norm(addr).replace(/\b(москва|ул|улица|дом|д)\b/g,' ').replace(/\s+/g,' ').trim();
  for (const p of S.places) {
    const b = norm(p.address).replace(/\b(москва|ул|улица|дом|д)\b/g,' ').replace(/\s+/g,' ').trim();
    if (a === b || b.includes(a) || a.includes(b)) return p.id;
  }
  const id = uid('p_');
  S.places.push({ id, name: addr.split(',')[0].slice(0, 22), address: addr,
                  lat: homePlace().lat, lon: homePlace().lon, approx:true, needsGeo:true });
  return id;
}

/* replace every note-sourced activity with the freshly parsed set */
function applyNote(rows) {
  for (const k of S.kids) k.activities = k.activities.filter(a => a.src !== 'note');
  let n = 0;
  for (const r of rows) {
    const pid = placeFor(r.addr);
    if (!pid) continue;
    for (const kidId of r.kidIds) {
      const k = kid(kidId); if (!k) continue;
      k.activities.push({
        id: uid('a_'), src:'note', title:r.title, placeId:pid, days:r.days,
        start:r.start, end:r.end,
        drop:{ on:false, leadMin:5, modes:['car'] },
        pick:{ on:true, must:true, earliest:r.end, latest:r.end + 30,
               serviceMin:5, modes:['car','walk'] }
      });
      n++;
    }
  }
  S.cache.syncedAt = Date.now();
  save();
  return n;
}

/* optional pull from a URL that returns the note as plain text */
async function syncNote(force) {
  const u = (S.cfg.syncUrl || '').trim();
  if (!u) return { skip:'нет источника' };
  const age = (Date.now() - (S.cache.syncedAt || 0)) / 36e5;
  if (!force && age < S.cfg.syncHours) return { skip:'свежо' };
  try {
    const r = await fetch(u, { cache:'no-store' });
    const txt = await r.text();
    if (txt.trim() === (S.cache.note || '').trim()) { S.cache.syncedAt = Date.now(); save(); return { same:true }; }
    S.cache.note = txt;
    const { rows } = parseNote(txt);
    const n = applyNote(rows);
    return { imported:n };
  } catch (e) { return { error:String(e.message || e) }; }
}
