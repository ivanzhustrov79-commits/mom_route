/* node tools/vapid.js            — создать пару ключей (один раз)
   node tools/vapid.js --private  — выдать закрытый ключ в поток, для wrangler

   Открытый ключ вписывается сам: в js/push.js и в worker/wrangler.toml.
   Закрытый пишется в worker/.vapid.json — он в .gitignore и на экран не
   выводится, чтобы не осесть в истории консоли и не уехать в переписку. */
const fs = require('fs'), path = require('path');
const { webcrypto: crypto } = require('crypto');

const root = path.join(__dirname, '..');
const FILE = path.join(root, 'worker', '.vapid.json');

const b64u = buf => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

(async () => {
  /* режим для конвейера: только закрытый ключ, без единого лишнего слова */
  if (process.argv[2] === '--private') {
    if (!fs.existsSync(FILE)) {
      process.stderr.write('Сначала: node tools/vapid.js\n');
      process.exit(1);
    }
    process.stdout.write(JSON.parse(fs.readFileSync(FILE, 'utf8')).private);
    return;
  }

  if (fs.existsSync(FILE)) {
    const pub = JSON.parse(fs.readFileSync(FILE, 'utf8')).public;
    console.log('\nКлючи уже созданы. Открытый ключ:\n  ' + pub);
    console.log('\nПересоздать — удалить worker/.vapid.json (старые подписки отвалятся).\n');
    return;
  }

  const kp = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub  = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
  const priv = JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey));

  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ public: pub, private: priv }, null, 2));

  /* открытый ключ не секрет — сразу расставим его по местам */
  const push = path.join(root, 'js', 'push.js');
  fs.writeFileSync(push, fs.readFileSync(push, 'utf8')
    .replace(/const VAPID_PUBLIC = '[^']*'/, `const VAPID_PUBLIC = '${pub}'`));

  const wt = path.join(root, 'worker', 'wrangler.toml');
  fs.writeFileSync(wt, fs.readFileSync(wt, 'utf8')
    .replace(/VAPID_PUBLIC = "[^"]*"/, `VAPID_PUBLIC = "${pub}"`));

  console.log('\nГотово.');
  console.log('  открытый ключ вписан в js/push.js и worker/wrangler.toml');
  console.log('  закрытый лежит в worker/.vapid.json (в git не попадёт)');
  console.log('\nОткрытый ключ, если понадобится:\n  ' + pub + '\n');
})();
