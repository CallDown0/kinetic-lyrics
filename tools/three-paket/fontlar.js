// fonts/*.ttf → fonts.js: window.KKFONTS = {'aile-ağırlık[-i]': 'data:font/ttf;base64,…'}
// 3D yazı (troika) fontu fetch ile yükler; WE sayfayı file:// ile açtığı için dosyadan çekemez, veri adresi her yerde çalışır.
// Yeniden üretmek için: npm run fontlar  (sonra fonts.js'i duvar kâğıdı klasörüne kopyala)
const fs = require('fs'), path = require('path'), dir = path.join(__dirname, 'fonts');
const o = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.ttf')).sort()) o[f.slice(0, -4)] = 'data:font/ttf;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64');
fs.writeFileSync(path.join(__dirname, 'fonts.js'), '// Kinetik Klip 3D yazı fontları (üretilir: npm run fontlar)\nwindow.KKFONTS = ' + JSON.stringify(o) + ';\n');
console.log(Object.keys(o).length + ' font, ' + (fs.statSync(path.join(__dirname, 'fonts.js')).size / 1048576).toFixed(1) + ' MB');
