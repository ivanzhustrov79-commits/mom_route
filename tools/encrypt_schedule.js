/* node tools/encrypt_schedule.js            — спросит фразу, не показывая её
   node tools/encrypt_schedule.js "фраза"    — то же, но фраза видна в истории
   node tools/encrypt_schedule.js --suggest  — сгенерировать случайную фразу

   schedule.json → data.enc.json (его и коммитим).

   Шифротекст попадёт в ОТКРЫТЫЙ репозиторий и останется там навсегда:
   форки, кэши, история git. Стойкость держится только на кодовой фразе. */
const fs = require('fs'), path = require('path'), readline = require('readline');
const { webcrypto: crypto } = require('crypto');

const root = path.join(__dirname, '..');
const VAULT = path.join(root, 'data.enc.json');
const ITER = 600000;                 // PBKDF2-SHA256, рекомендация OWASP

/* ── подсказка: случайная кодовая фраза ──────────────────────────────
   Слова берутся честным случайным выбором, а не «придумываются».
   Осмысленная фраза подбирается перебором на порядки быстрее.        */
const WORDS = ('азот акула алмаз арбуз бабочка бархат берёза блин бочка вагон ветер вихрь волна '
 + 'ворон гитара гном горн гранит гриб дельфин долото дорога дуб дым ежевика ель енот ерш жгут '
 + 'желудь жемчуг жираф жёлудь закат звезда зебра зерно зонт игла изюм икра индюк ирис камень кит '
 + 'ключ клён кофе лампа ландыш лиса лось луна магнит маяк мост муравей мёд нарцисс невод нитка '
 + 'нора носорог облако перо овраг олень омут остров парус пирог плот поле ракета рожь ручей рысь '
 + 'рябина смола снег сова сокол сталь терем топор тропа туман туча угол ужин улитка утёс ухо '
 + 'фазан факел филин флаг фонарь хлеб холм хомяк храм хребет цапля цветок цепь цирк цоколь чайник '
 + 'часы чердак черёмуха чиж шалаш шарф шишка шмель шпиль щавель щегол щука щётка эльф эстамп эфир '
 + 'эхо юла юноша юрта ябеда якорь ясень ястреб яхта ёрш').split(' ');

function suggest() {
  const pick = n => Array.from(crypto.getRandomValues(new Uint32Array(n)))
                         .map(x => WORDS[x % WORDS.length]);
  const digits = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');
  const bits = Math.round(5 * Math.log2(WORDS.length) + Math.log2(10000));
  console.log('\n  ' + pick(5).join(' ') + ' ' + digits);
  console.log('\n  ~' + bits + ' бит энтропии. Запишите фразу, прежде чем шифровать.\n');
}

/* Никаких требований к фразе — пусть будет любая, какую удобно помнить.
   Но честно скажем, насколько она держит удар.                        */
function strength(pw) {
  const words = pw.split(/\s+/).filter(Boolean).length;
  let pool = 0;
  if (/[a-zа-яё]/.test(pw)) pool += 33;
  if (/[A-ZА-ЯЁ]/.test(pw)) pool += 33;
  if (/[0-9]/.test(pw))     pool += 10;
  if (/[^\wа-яёА-ЯЁ]/.test(pw)) pool += 15;
  const raw = pw.length * Math.log2(pool || 26);
  return { bits: Math.round(words > 1 ? Math.min(raw, words * 10) : raw * 0.5), words };
}

const deriveKey = async (code, salt, iter, usage) => {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations: iter, hash:'SHA-256' },
    base, { name:'AES-GCM', length:256 }, false, usage);
};

/* Фраза вводится здесь и никуда не уезжает: ни в аргументы команды,
   ни в историю оболочки, ни в чей-то чат. Эхо выключено.            */
function askHidden(q) {
  return new Promise(res => {
    const rl = readline.createInterface(
      { input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = str => { if (str.startsWith(q)) rl.output.write(q); };
    rl.question(q, a => { rl.close(); process.stdout.write('\n'); res(a); });
  });
}

/* Открывает ли эта фраза тот data.enc.json, что уже лежит рядом */
async function opensCurrent(code) {
  if (!fs.existsSync(VAULT)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(VAULT, 'utf8'));
    const key = await deriveKey(code, Buffer.from(j.salt, 'base64'), j.iter || ITER, ['decrypt']);
    await crypto.subtle.decrypt({ name:'AES-GCM', iv: Buffer.from(j.iv, 'base64') },
                                key, Buffer.from(j.ct, 'base64'));
    return true;
  } catch { return false; }
}

(async () => {
  if (process.argv[2] === '--suggest') return suggest();

  const code = process.argv.length > 2
    ? process.argv.slice(2).join(' ').trim()
    : (await askHidden('Кодовая фраза (ввод не отображается): ')).trim();

  if (!code) { console.error('Пустая фраза — ничего не делаю.'); process.exit(1); }

  const st = strength(code);
  console.log(`\nФраза: ${code.length} символов, слов ${st.words}, примерно ${st.bits} бит.`);
  if (st.bits < 45) {
    console.log('Это немного. Файл лежит в открытом репозитории, и подбор идёт');
    console.log('офлайн, без ограничений по числу попыток. Более длинная или менее');
    console.log('предсказуемая фраза заметно надёжнее — но решать вам.');
    console.log('Готовый вариант: node tools/encrypt_schedule.js --suggest');
  }

  const same = await opensCurrent(code);
  if (same === true)  console.log('Фраза та же, что у нынешнего data.enc.json — на телефоне ничего не меняется.');
  if (same === false) console.log('ВНИМАНИЕ: это ДРУГАЯ фраза. Прежнюю на телефоне придётся заменить новой.');

  const plain = fs.readFileSync(path.join(root, 'schedule.json'));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(code, salt, ITER, ['encrypt']);
  const ct   = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, plain);
  const b64  = b => Buffer.from(b).toString('base64');

  fs.writeFileSync(VAULT, JSON.stringify({
    v: 1, kdf: 'PBKDF2-SHA256', iter: ITER,
    salt: b64(salt), iv: b64(iv), ct: b64(ct)
  }, null, 2));

  console.log(`\ndata.enc.json записан — ${plain.length} байт → ${Buffer.from(ct).length} байт`);
  console.log(`PBKDF2-SHA256, ${ITER.toLocaleString('ru-RU')} итераций, AES-GCM-256.`);
  console.log('\nТеперь: git add data.enc.json && git commit -m "schedule" && git push');
  console.log('Сменить фразу = перешифровать и запушить заново; старый файл');
  console.log('останется в истории git и открывается старой фразой навсегда.');
})();
