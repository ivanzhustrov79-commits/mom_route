/* node tools/stamp.js — отметить версию перед пушем.
   Пишет version.json и подставляет ?v=… ко всем скриптам и стилям, чтобы
   браузер не мог отдать старый файл по старому адресу.                  */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

const v = new Date().toISOString().slice(0, 16).replace('T', ' ');
const tag = v.replace(/\D/g, '');                       // 202609040618

fs.writeFileSync(path.join(root, 'version.json'),
                 JSON.stringify({ v, tag }, null, 2) + '\n');

const idx = path.join(root, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
html = html
  .replace(/(src="js\/[a-z]+\.js)(\?v=\d+)?"/g,  `$1?v=${tag}"`)
  .replace(/(href="style\.css)(\?v=\d+)?"/g,     `$1?v=${tag}"`);
fs.writeFileSync(idx, html);

const n = (html.match(/\?v=/g) || []).length;
console.log(`version.json → ${v}  (${n} ссылок помечено ?v=${tag})`);
