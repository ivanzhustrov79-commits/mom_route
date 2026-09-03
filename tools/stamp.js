/* node tools/stamp.js — отметить версию перед пушем.
   Телефон сравнивает её с той, что уже запущена, и сам перезагружается. */
const fs = require('fs'), path = require('path');
const v = new Date().toISOString().slice(0, 16).replace('T', ' ');
fs.writeFileSync(path.join(__dirname, '..', 'version.json'),
                 JSON.stringify({ v }, null, 2) + '\n');
console.log('version.json →', v);
