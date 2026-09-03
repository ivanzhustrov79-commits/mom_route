/* ── secret.js ── зашифрованное расписание в репозитории ───────────────
   В открытый репозиторий кладётся только `data.enc.json`: AES-GCM-256,
   ключ выводится из кодовой фразы через PBKDF2-SHA256.

   ВАЖНО: шифротекст публичен и остаётся публичным навсегда — его уже
   скачали, форкнули, закэшировали. Вся защита держится ТОЛЬКО на длине
   кодовой фразы. Четырёхзначный пин подбирается за секунды. Нужна длинная
   фраза из нескольких слов.                                             */

const VAULT = 'data.enc.json';
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64e = b => btoa(String.fromCharCode(...new Uint8Array(b)));

async function vaultKey(code, salt, iter) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations: iter, hash:'SHA-256' },
    base, { name:'AES-GCM', length:256 }, false, ['encrypt', 'decrypt']);
}

/* лежит ли рядом с приложением зашифрованный файл */
async function vaultExists() {
  try {
    const r = await fetch(VAULT, { cache:'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    return !!(j && j.ct && j.salt && j.iv);
  } catch { return false; }
}

/* код верный → расписание уезжает в localStorage и приложение перезапускается */
async function vaultOpen(code) {
  let j;
  try {
    const r = await fetch(VAULT, { cache:'no-store' });
    if (!r.ok) throw new Error('файл не найден');
    j = await r.json();
  } catch (e) { return { ok:false, msg:'не удалось получить файл: ' + (e.message || e) }; }

  let plain;
  try {
    const key = await vaultKey(code, b64d(j.salt), j.iter || 600000);
    plain = await crypto.subtle.decrypt({ name:'AES-GCM', iv: b64d(j.iv) }, key, b64d(j.ct));
  } catch { return { ok:false, msg:'код не подошёл' }; }

  try {
    const text = new TextDecoder().decode(plain);
    JSON.parse(text);                       // проверяем, что это действительно наш формат
    localStorage.setItem(KEY, text);
    localStorage.removeItem(FKEY);
    return { ok:true };
  } catch { return { ok:false, msg:'файл расшифровался, но внутри не расписание' }; }
}
