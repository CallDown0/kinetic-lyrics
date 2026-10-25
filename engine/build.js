// src/*.js dosyalarını ad sırasıyla tek kapsamda (IIFE) birleştirip wallpaper/kinetik.js'i üretir.
// Hem Wallpaper Engine (wallpaper/index.html) hem tarayıcı oynatıcısı (web/index.html) bu tek dosyayı yükler.
// Düzenleme src/ içinde yapılır, sonra: node engine/build.js
// Dosyalar aynı kapsamı paylaşır, sıra önemlidir: üst düzeyde hemen çalışan kod yalnız kendinden önceki dosyalara dayanabilir.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const dir = path.join(__dirname, 'src'), out = path.join(__dirname, '..', 'wallpaper', 'kinetik.js');
const parts = fs.readdirSync(dir).filter(f => /^\d\d-.+\.js$/.test(f)).sort();
let js = '﻿' + fs.readFileSync(path.join(dir, '_bas.js'), 'utf8') + "(function(){\n'use strict';\n";
for (const f of parts) js += `// ===== src/${f} =====\n` + fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '') + '\n';
js += '})();\n';
const tmp = out.replace(/\.js$/, '.yeni.js');
fs.writeFileSync(tmp, js);
try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'inherit' }); }
catch (e) { fs.unlinkSync(tmp); console.error('Sözdizimi hatası: kinetik.js değiştirilmedi.'); process.exit(1); }
fs.renameSync(tmp, out); // WE yarım dosya görmesin diye tek adımda yerine konur
console.log(`kinetik.js: ${parts.length} dosya, ${js.split('\n').length} satır`);
