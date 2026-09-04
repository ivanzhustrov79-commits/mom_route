/* node tools/vapid.js — одноразово: пара ключей для веб-пуша.

   Открытый ключ    → в приложение (js/push.js). Он и должен быть публичным.
   Закрытый ключ    → в секреты Cloudflare, командой wrangler secret put.
                      В репозиторий он не попадает никогда.
   Токен Cloudflare → вообще не нужен, если войти через `wrangler login`.   */
const { webcrypto: crypto } = require('crypto');

const b64u = buf => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

(async () => {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);

  const pub  = await crypto.subtle.exportKey('raw', kp.publicKey);   // 65 байт
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);

  console.log('\n── Открытый ключ — вставить в js/push.js ──────────────────');
  console.log(b64u(pub));
  console.log('\n── Закрытый ключ — только в секреты Cloudflare ────────────');
  console.log('cd worker && npx wrangler secret put VAPID_PRIVATE');
  console.log('и вставить одной строкой:\n');
  console.log(JSON.stringify(priv));
  console.log('\n── Общий пароль приложения и воркера ─────────────────────');
  console.log('npx wrangler secret put APP_SECRET');
  console.log('и придумать любую длинную строку; её же ввести в Настройках.\n');
})();
