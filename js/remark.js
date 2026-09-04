/* ── remark.js ── свободная приписка к занятию превращается в настройки
   «Кирилл любит приезжать на карате минимум за 20 минут до начала» —
   и время выезда сдвигается само. Никакой нейросети для этого не нужно:
   людям свойственно писать такие вещи десятком одинаковых оборотов.
   Что не разобралось — честно показываем, а не делаем вид.            */

const RULES = [
  { re: /(?:за|заранее)\s+(\d{1,3})\s*(?:мин|минут)/,
    hit: (a, m) => { a.drop.on = true; a.drop.leadMin = +m[1];
                     return `приезжать за ${m[1]} мин до начала`; } },

  { re: /не\s+раньше\s+(\d{1,2})[:.](\d{2})/,
    hit: (a, m) => { a.pick.on = true; a.pick.earliest = +m[1] * 60 + +m[2];
                     return `забирать не раньше ${m[1]}:${m[2]}`; } },

  { re: /не\s+позже\s+(\d{1,2})[:.](\d{2})/,
    hit: (a, m) => { a.pick.on = true; a.pick.latest = +m[1] * 60 + +m[2];
                     return `забирать не позже ${m[1]}:${m[2]}`; } },

  { re: /забира\w*\s+сразу|сразу\s+(?:после|же)/,
    hit: a => { a.pick.on = true; a.pick.latest = a.end + 10;
                return 'забирать сразу после окончания'; } },

  { re: /(?:сам|сама|сами)\s*(?:дойд|доход|добер|придут|придет)/,
    hit: a => { a.pick.must = false;
                a.pick.modes = [...new Set([...a.pick.modes, 'walk'])];
                return 'могут добраться сами'; } },

  { re: /можно\s+пешком|пешком\s+можно|встреч\w*\s+пешком/,
    hit: a => { a.pick.modes = [...new Set([...a.pick.modes, 'walk'])];
                return 'можно встречать пешком'; } },

  { re: /только\s+на\s+машине|пешком\s+нельзя/,
    hit: a => { a.pick.modes = ['car']; return 'только на машине'; } },

  { re: /(?:везти|возить|отвозить)\s+не\s+надо|сам\w*\s+добирается/,
    hit: a => { a.drop.on = false; return 'отвозить не надо'; } },

  { re: /обязательно\s+забира|забира\w*\s+обязательно/,
    hit: a => { a.pick.on = true; a.pick.must = true; return 'забирать обязательно'; } }
];

/* Возвращает список того, что поняли. Пустой — значит ничего не тронули. */
function applyRemark(a) {
  const t = (a.remark || '').toLowerCase().replace(/ё/g, 'е');
  const done = [];
  for (const r of RULES) {
    const m = r.re.exec(t);
    if (m) done.push(r.hit(a, m));
  }
  if (a.pick && a.pick.latest < a.pick.earliest) a.pick.latest = a.pick.earliest + 20;
  return done;
}
