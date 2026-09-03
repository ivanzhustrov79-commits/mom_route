/* node tools/encrypt_schedule.js "кодовая фраза"
   schedule.json  →  data.enc.json  (его и коммитим)

   Шифротекст попадёт в ОТКРЫТЫЙ репозиторий и останется там навсегда:
   форки, кэши, история git. Стойкость держится только на кодовой фразе,
   поэтому короткий пин здесь не годится — нужна длинная фраза.          */
const fs = require('fs'), path = require('path');
const { webcrypto: crypto } = require('crypto');

const root = path.join(__dirname, '..');
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
