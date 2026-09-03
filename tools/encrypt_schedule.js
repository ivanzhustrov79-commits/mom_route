/* node tools/encrypt_schedule.js "кодовая фраза"
   schedule.json  →  data.enc.json  (его и коммитим)

   Шифротекст попадёт в ОТКРЫТЫЙ репозиторий и останется там навсегда:
   форки, кэши, история git. Стойкость держится только на кодовой фразе,
   поэтому короткий пин здесь не годится — нужна длинная фраза.          */
const fs = require('fs'), path = require('path');
const { webcrypto: crypto } = require('crypto');

const root = path.join(__dirname, '..');
/* ── подсказка: случайная кодовая фраза ────────────────────────────────
   Слова берутся честным случайным выбором из списка, а не «придумываются».
   Осмысленная фраза подбирается перебором на порядки быстрее.           */
const WORDS = 'азот акула алмаз арбуз бабочка бархат берёза блин бочка вагон ветер вихрь волна ворон гитара гном горн гранит гриб дельфин долото дорога дуб дым ежевика ель енот ерш жгут желудь жемчуг жираф жёлудь закат звезда зебра зерно зонт игла изюм икра индюк ирис камень кит ключ клён кофе лампа ландыш лиса лось луна магнит маяк мост муравей мёд нарцисс невод нитка нора носорог облако перо овраг олень омут остров парус пирог плот поле ракета рожь ручей рысь рябина смола снег сова сокол сталь терем топор тропа туман туча угол ужин улитка утёс ухо фазан факел филин флаг фонарь хлеб холм хомяк храм хребет цапля цветок цепь цирк цоколь чайник часы чердак черёмуха чиж шалаш шарф шишка шмель шпиль щавель щегол щука щётка эльф эстамп эфир эхо юла юноша юрта ябеда якорь ясень ястреб яхта ёрш'.split(' ');

if (process.argv[2] === '--suggest') {
  const pick = n => Array.from(crypto.getRandomValues(new Uint32Array(n)))
                         .map(x => WORDS[x % WORDS.length]);
  const bits = Math.round(5 * Math.log2(WORDS.length) + Math.log2(10000));
  const digits = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');
  console.log('\n  ' + pick(5).join(' ') + ' ' + digits);
  console.log(`\n  ~${bits} бит энтропии. Запишите фразу, прежде чем шифровать.\n`);
  process.exit(0);
}

const code = process.argv.slice(2).join(' ').trim();

if (!code) {
  console.error('Использование: node tools/encrypt_schedule.js "несколько слов подряд"');
  process.exit(1);
}

/* грубая оценка: сколько независимых «кусков» в фразе */
const words = code.split(/\s+/).filter(Boolean).length;
if (code.length < 16 || words < 3) {
  console.error(`\nКодовая фраза слишком короткая: ${code.length} символов, слов ${words}.`);
  console.error('Файл ляжет в публичный репозиторий, подбор идёт офлайн и без ограничений.');
  console.error('Нужно минимум 16 символов и хотя бы 3 слова.');
  console.error('');
  console.error('И слова должны быть СЛУЧАЙНЫМИ, а не осмысленной фразой:');
  console.error('  «кактус ржавый пельмень выборы» — годится;');
  console.error('  «маша и медведь пошли гулять»  — подбирается перебором.');
  console.error('Проще всего сгенерировать парольную фразу в менеджере паролей.');
  console.error('');
  process.exit(1);
}

const ITER = 600000;   // PBKDF2-SHA256, рекомендация OWASP

(async () => {
  const plain = fs.readFileSync(path.join(root, 'schedule.json'));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));

  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations: ITER, hash:'SHA-256' },
    base, { name:'AES-GCM', length:256 }, false, ['encrypt']);

  const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, plain);
  const b64 = b => Buffer.from(b).toString('base64');

  fs.writeFileSync(path.join(root, 'data.enc.json'), JSON.stringify({
    v: 1, kdf: 'PBKDF2-SHA256', iter: ITER,
    salt: b64(salt), iv: b64(iv), ct: b64(ct)
  }, null, 2));

  console.log(`data.enc.json записан — ${plain.length} байт → ${Buffer.from(ct).length} байт`);
  console.log(`PBKDF2-SHA256, ${ITER.toLocaleString('ru-RU')} итераций, AES-GCM-256.`);
  console.log('\nТеперь: git add data.enc.json && git commit && git push');
  console.log('Код передайте голосом или в мессенджере — не через этот репозиторий.');
  console.log('Сменить код = перешифровать и запушить заново; старый файл');
  console.log('останется в истории git и расшифровывается старым кодом навсегда.');
})();
