/* ---------- nesne çizimleri: para, altın, su, ateş… kelimelerinin yanında küçük çizim ----------
   Kelime ekli hâlleriyle de tanınır (Türkçe harfler sadeleştirilip kök kalıbına bakılır; İngilizce karşılıklar da).
   Dizilişte kelimenin sağında çizime yer ayrılır (w.ix, 100 px yazı biriminde), çizim kelimenin dönüşüne uyar.
   Çizimler 0..100 kutusunda; vurgu renginde, kelimeyle birlikte pop ederek gelir, vuruşta hafif nabız atar. */
const icPoly = (pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };
const icLine = (...seg) => { g.beginPath(); for (let i = 0; i < seg.length; i += 2) i ? g.lineTo(seg[i], seg[i + 1]) : g.moveTo(seg[i], seg[i + 1]); g.stroke(); };
const icCirc = (x, y, r) => { g.moveTo(x + r, y); g.arc(x, y, r, 0, 6.2832); };
const icCloud = () => { g.beginPath(); icCirc(30, 58, 18); icCirc(52, 44, 24); icCirc(74, 58, 18); g.rect(30, 52, 44, 24); g.fill('nonzero'); };
const ICONS = [
  ['para', /^(para|paralar\w*|paray\w*|paran\w*|parada\w*|paramiz|dolar\w*|money|cash|dollars?|bucks?|zengin\w*|rich)$/, () => {
    g.lineWidth = 10; g.beginPath(); g.moveTo(72, 26); g.bezierCurveTo(62, 12, 28, 12, 28, 32); g.bezierCurveTo(28, 52, 72, 46, 72, 68); g.bezierCurveTo(72, 90, 34, 90, 26, 74); g.stroke(); icLine(50, 4, 50, 96); }],
  ['altin', /^(altin|altinlar\w*|altini|altinim|altinin|gold|golden)$/, () => {
    icPoly([[8, 92], [48, 92], [42, 70], [14, 70]]); g.fill(); icPoly([[52, 92], [92, 92], [86, 70], [58, 70]]); g.fill(); icPoly([[30, 66], [70, 66], [64, 44], [36, 44]]); g.fill();
    g.lineWidth = 5; icLine(80, 12, 80, 32); icLine(70, 22, 90, 22); }],
  ['damla', /^(su|suyu|suyun|sular\w*|suda|sudan|suya|water|waters|damla\w*|gozyas\w*|tears?|teardrops?)$/, () => {
    g.beginPath(); g.moveTo(50, 4); g.bezierCurveTo(64, 28, 84, 46, 84, 66); g.bezierCurveTo(84, 86, 68, 96, 50, 96); g.bezierCurveTo(32, 96, 16, 86, 16, 66); g.bezierCurveTo(16, 46, 36, 28, 50, 4); g.fill(); }],
  ['ates', /^(ates\w*|alev\w*|fire|flames?|burn\w*)$/, () => {
    g.beginPath(); g.moveTo(52, 2); g.bezierCurveTo(60, 26, 86, 40, 84, 66); g.bezierCurveTo(82, 88, 66, 98, 50, 98); g.bezierCurveTo(30, 98, 16, 86, 18, 66); g.bezierCurveTo(20, 50, 32, 46, 36, 30); g.bezierCurveTo(44, 40, 46, 46, 46, 54); g.bezierCurveTo(56, 40, 56, 20, 52, 2); g.fill(); }],
  ['kalp', /^(kalp\w*|kalb\w*|sevda\w*|heart\w*|love|loved|lover)$/, () => {
    g.beginPath(); g.moveTo(50, 90); g.bezierCurveTo(10, 62, 4, 36, 24, 22); g.bezierCurveTo(37, 13, 48, 21, 50, 32); g.bezierCurveTo(52, 21, 63, 13, 76, 22); g.bezierCurveTo(96, 36, 90, 62, 50, 90); g.fill(); }],
  ['kalp', /^(ask|aski|askim\w*|askin\w*|aska|askla)$/, null, 'tr'],
  ['yildiz', /^(yildiz\w*|stars?|starlight)$/, () => {
    g.beginPath(); for (let i = 0; i < 10; i++){ const r = i % 2 ? 19 : 46, a = -1.5708 + i * .62832; i ? g.lineTo(50 + r * Math.cos(a), 54 + r * Math.sin(a)) : g.moveTo(50 + r * Math.cos(a), 54 + r * Math.sin(a)); } g.closePath(); g.fill(); }],
  ['ay', /^(ay|aya|ayin|ayi|mehtap\w*|moon\w*|gece\w*|night\w*|tonight)$/, () => {
    g.beginPath(); g.arc(50, 50, 42, -1, 1, true); g.arc(88, 50, 38.5, 1.98, 4.3, false); g.closePath(); g.fill();
    g.lineWidth = 5; icLine(82, 18, 82, 34); icLine(74, 26, 90, 26); }],
  ['gunes', /^(gunes\w*|sun|sunshine|sunlight|sunny)$/, () => {
    g.beginPath(); icCirc(50, 50, 20); g.fill(); g.lineWidth = 8; for (let i = 0; i < 8; i++){ const a = i * .7854; icLine(50 + 31 * Math.cos(a), 50 + 31 * Math.sin(a), 50 + 45 * Math.cos(a), 50 + 45 * Math.sin(a)); } }],
  ['yagmur', /^(yagmur\w*|rain\w*)$/, () => { g.save(); g.translate(0, -12); icCloud(); g.restore(); g.lineWidth = 7; icLine(32, 76, 26, 94); icLine(52, 76, 46, 94); icLine(72, 76, 66, 94); }],
  ['bulut', /^(bulut\w*|clouds?)$/, () => icCloud()],
  ['deniz', /^(deniz\w*|okyanus\w*|sea|seas|ocean\w*|waves?|dalga\w*)$/, () => {
    g.lineWidth = 8; for (let k = 0; k < 3; k++){ const y = 30 + k * 22; g.beginPath(); g.moveTo(6, y); g.quadraticCurveTo(17, y - 10, 28, y); g.quadraticCurveTo(39, y + 10, 50, y); g.quadraticCurveTo(61, y - 10, 72, y); g.quadraticCurveTo(83, y + 10, 94, y); g.stroke(); } }],
  ['cicek', /^(cicek\w*|gul|gulum|guller\w*|gulu|roses?|flowers?)$/, (c, bg) => {
    g.lineWidth = 7; icLine(50, 66, 50, 98); g.beginPath(); for (let i = 0; i < 5; i++){ const a = -1.5708 + i * 1.2566; icCirc(50 + 20 * Math.cos(a), 42 + 20 * Math.sin(a), 15); } g.fill('nonzero');
    g.fillStyle = bg; g.beginPath(); icCirc(50, 42, 9); g.fill(); }],
  ['kus', /^(kus|kuslar\w*|kusum|kusun|birds?)$/, () => { g.lineWidth = 8; g.beginPath(); g.moveTo(8, 42); g.quadraticCurveTo(30, 22, 50, 50); g.quadraticCurveTo(70, 22, 92, 42); g.stroke(); }],
  ['goz', /^(goz|gozler\w*|gozum\w*|gozun\w*|gozu|eyes?)$/, () => {
    g.lineWidth = 8; g.beginPath(); g.moveTo(6, 50); g.quadraticCurveTo(50, 6, 94, 50); g.quadraticCurveTo(50, 94, 6, 50); g.stroke(); g.beginPath(); icCirc(50, 50, 15); g.fill(); }],
  ['ev', /^(ev|evim\w*|eve|evde|evden|evin|home|house)$/, () => { g.lineWidth = 8; icLine(10, 48, 50, 12, 90, 48); g.strokeRect(22, 46, 56, 46); g.fillRect(42, 64, 16, 28); }],
  ['araba', /^(araba\w*|car|cars)$/, (c, bg) => {
    icPoly([[6, 72], [6, 56], [24, 52], [36, 32], [66, 32], [80, 52], [94, 56], [94, 72]]); g.fill();
    g.beginPath(); icCirc(28, 74, 11); icCirc(72, 74, 11); g.fill(); g.fillStyle = bg; g.beginPath(); icCirc(28, 74, 4); icCirc(72, 74, 4); g.fill(); }],
  ['telefon', /^(telefon\w*|phone\w*)$/, () => { g.lineWidth = 8; g.beginPath(); if (g.roundRect) g.roundRect(28, 6, 44, 88, 9); else g.rect(28, 6, 44, 88); g.stroke(); icLine(44, 80, 56, 80); }],
  ['muzik', /^(muzik\w*|sarki\w*|nota\w*|music|songs?|melod\w*)$/, () => {
    g.lineWidth = 8; icLine(36, 22, 36, 74); icLine(80, 12, 80, 66); icPoly([[36, 18], [80, 8], [80, 24], [36, 34]]); g.fill();
    g.beginPath(); g.ellipse(25, 76, 13, 9, -.4, 0, 6.2832); g.fill(); g.beginPath(); g.ellipse(69, 68, 13, 9, -.4, 0, 6.2832); g.fill(); }],
  ['saat', /^(saat\w*|zaman\w*|time|times|clock\w*)$/, () => { g.lineWidth = 8; g.beginPath(); g.arc(50, 50, 42, 0, 6.2832); g.stroke(); icLine(50, 26, 50, 50, 68, 60); }],
  ['tac', /^(kral\w*|krali\w*|tac|taci\w*|king\w*|queen\w*|crown\w*|prens\w*)$/, () => { icPoly([[10, 76], [14, 28], [32, 50], [50, 18], [68, 50], [86, 28], [90, 76]]); g.fill(); g.fillRect(10, 81, 80, 11); }],
  ['elmas', /^(elmas\w*|pirlanta\w*|diamonds?)$/, () => {
    g.lineWidth = 7; icPoly([[18, 38], [33, 16], [67, 16], [82, 38], [50, 90]]); g.stroke(); g.lineWidth = 4; icLine(18, 38, 82, 38); icLine(33, 16, 42, 38, 50, 90, 58, 38, 67, 16); }],
  ['simsek', /^(simsek\w*|yildirim\w*|lightning|thunder\w*)$/, () => { icPoly([[60, 2], [20, 56], [46, 56], [36, 98], [82, 40], [55, 40], [68, 2]]); g.fill(); }],
  ['kar', /^(kar|kari|karlar\w*|snow\w*)$/, () => { g.lineWidth = 8; for (let i = 0; i < 3; i++){ const a = i * 1.0472; icLine(50 - 44 * Math.cos(a), 50 - 44 * Math.sin(a), 50 + 44 * Math.cos(a), 50 + 44 * Math.sin(a)); } }],
  ['anahtar', /^(anahtar\w*|keys?)$/, () => { g.lineWidth = 8; g.beginPath(); g.arc(26, 50, 17, 0, 6.2832); g.stroke(); icLine(43, 50, 94, 50); icLine(78, 50, 78, 66); icLine(91, 50, 91, 62); }],
  ['dunya', /^(dunya\w*|world\w*|earth)$/, () => { g.lineWidth = 7; g.beginPath(); g.arc(50, 50, 42, 0, 6.2832); g.stroke(); g.beginPath(); g.ellipse(50, 50, 17, 42, 0, 0, 6.2832); g.stroke(); icLine(8, 50, 92, 50); }],
  ['sehir', /^(sehir|sehre|sehri\w*|sehrin\w*|sehirde|city|town)$/, () => { g.fillRect(6, 46, 18, 50); g.fillRect(28, 22, 20, 74); g.fillRect(52, 40, 16, 56); g.fillRect(72, 12, 20, 84); }],
  ['dag', /^(dag|daglar\w*|dagin\w*|dagi|mountains?)$/, () => { icPoly([[2, 94], [38, 28], [58, 60], [70, 42], [98, 94]]); g.fill(); }],
  ['agac', /^(agac\w*|trees?|orman\w*|forest)$/, () => { icPoly([[50, 4], [88, 70], [12, 70]]); g.fill(); g.fillRect(43, 70, 14, 26); }],
  ['kahve', /^(kahve\w*|coffee)$/, () => {
    icPoly([[14, 40], [72, 40], [66, 90], [20, 90]]); g.fill(); g.lineWidth = 7; g.beginPath(); g.arc(74, 60, 12, -1.3, 1.3); g.stroke();
    g.lineWidth = 5; g.beginPath(); g.moveTo(34, 32); g.bezierCurveTo(26, 22, 42, 16, 34, 4); g.stroke(); g.beginPath(); g.moveTo(52, 32); g.bezierCurveTo(44, 22, 60, 16, 52, 4); g.stroke(); }],
  ['sarap', /^(sarap\w*|kadeh\w*|wine|raki\w*)$/, () => {
    g.beginPath(); g.moveTo(24, 6); g.lineTo(76, 6); g.quadraticCurveTo(78, 52, 50, 56); g.quadraticCurveTo(22, 52, 24, 6); g.fill(); g.lineWidth = 7; icLine(50, 56, 50, 88); icLine(30, 92, 70, 92); }]
];
// duygu yüzleri: kelimenin anına göre canlı (t = kelime girişinden beri geçen sn). Yüz çemberi + gözler + ağız;
// gülümseme ağzı kıvrılır ve göz kırpar, şaşırma zıplar ve ağzı O olur, kahkaha sallanır, ağlama gözyaşı akıtır…
const faceRing = () => { g.lineWidth = 7; g.beginPath(); g.arc(50, 52, 40, 0, 6.2832); g.stroke(); };
const blinkK = t => { const ph = (t + .6) % 2.8; return ph < .12 ? Math.abs(ph - .06) / .06 : 1; }; // 1 açık, 0 kapalı
const eyes = (t, r) => { const k = blinkK(t); g.beginPath(); g.ellipse(36, 44, r, Math.max(1, r * k), 0, 0, 6.2832); g.ellipse(64, 44, r, Math.max(1, r * k), 0, 0, 6.2832); g.fill(); };
const EMO = [
  ['gulumse', /^(gulumse\w*|gulus\w*|tebessum\w*|smil\w*|happy|mutlu\w*|sevin\w*)$/, (c, bg, t) => {
    const k = easeBack(clamp(t / .55, 0, 1)), bob = Math.sin(t * 3.2) * 2 * Math.min(1, t);
    g.translate(0, bob); faceRing(); eyes(t, 5.5);
    g.lineWidth = 7; g.beginPath(); g.moveTo(31, 62); g.quadraticCurveTo(50, 62 + 22 * k, 69, 62); g.stroke(); }],
  ['kahkaha', /^(gul(uyor|dum|dun|du|duk|duler|mek|meye|elim|eriz|uyorum|uyorsun|uyoruz|unce)\w*|kahkaha\w*|haha\w*|laugh\w*|lol)$/, (c, bg, t) => {
    const sh = Math.sin(t * 18) * 4 * Math.max(.25, 1 - t * .6);
    g.translate(0, -Math.abs(sh)); g.rotate(sh * .012); faceRing();
    g.lineWidth = 6; g.beginPath(); g.moveTo(28, 46); g.quadraticCurveTo(36, 36, 44, 46); g.moveTo(56, 46); g.quadraticCurveTo(64, 36, 72, 46); g.stroke();
    const o = clamp(t / .3, 0, 1); g.beginPath(); g.moveTo(28, 58); g.lineTo(72, 58); g.quadraticCurveTo(70, 58 + 26 * o, 50, 58 + 26 * o); g.quadraticCurveTo(30, 58 + 26 * o, 28, 58); g.fill(); }],
  ['sasir', /^(sasir\w*|saski\w*|hayret\w*|vay|vay+|wow+|surpris\w*|shock\w*|amanin)$/, (c, bg, t) => {
    const j = t < .45 ? Math.sin(t / .45 * Math.PI) * 14 : 0; g.translate(0, -j); faceRing();
    const k = easeBack(clamp(t / .35, 0, 1));
    g.beginPath(); icCirc(36, 44, 6.5); icCirc(64, 44, 6.5); g.fill();
    g.lineWidth = 5; const br = 8 * k; icLine(28, 32 - br, 42, 30 - br); icLine(58, 30 - br, 72, 32 - br);
    g.lineWidth = 6; g.beginPath(); g.ellipse(50, 70, 3 + 6 * k, 3 + 9 * k, 0, 0, 6.2832); g.stroke();
    if (t > .15){ g.globalAlpha *= Math.min(1, (t - .15) * 4); g.lineWidth = 7; icLine(94, 6, 94, 22); g.beginPath(); icCirc(94, 31, 3.5); g.fill(); } }],
  ['aglama', /^(agla\w*|cry\w*|crie[sd]|sad|uzgun\w*|huzun\w*)$/, (c, bg, t) => {
    faceRing(); g.lineWidth = 5; icLine(28, 40, 42, 36); icLine(58, 36, 72, 40); eyes(t, 4.5);
    const k = easeOut(clamp(t / .5, 0, 1)); g.lineWidth = 7; g.beginPath(); g.moveTo(33, 76); g.quadraticCurveTo(50, 76 - 18 * k, 67, 76); g.stroke();
    // gözyaşı: iki gözden sırayla süzülen damlalar
    for (const [x, ph] of [[36, 0], [64, .5]]){ const q = ((t * 1.1 + ph) % 1), y = 50 + q * 34; g.globalAlpha *= 1; g.beginPath(); g.moveTo(x, y - 7); g.quadraticCurveTo(x + 5, y, x, y + 4); g.quadraticCurveTo(x - 5, y, x, y - 7); g.fill(); } }],
  ['kizgin', /^(kiz(gin|di|dim|dik|iyor|iyorum|arim)\w*|ofke\w*|sinir\w*|angry|mad|rage)$/, (c, bg, t) => {
    g.translate(Math.sin(t * 45) * 3 * Math.max(0, 1 - t * 1.2), 0); faceRing();
    g.lineWidth = 6; icLine(26, 32, 44, 40); icLine(56, 40, 74, 32); g.beginPath(); icCirc(37, 48, 4.5); icCirc(63, 48, 4.5); g.fill();
    g.lineWidth = 7; g.beginPath(); g.moveTo(34, 74); g.quadraticCurveTo(50, 64, 66, 74); g.stroke(); }],
  ['asik', /^(asik\w*|asig\w*|vurgun\w*|crush\w*|inlove)$/, (c, bg, t) => {
    faceRing(); const p = 1 + .18 * Math.max(0, Math.sin(t * 7)) * Math.min(1, t * 2);
    for (const x of [36, 64]){ g.save(); g.translate(x, 44); g.scale(.17 * p, .17 * p); g.translate(-50, -55); g.beginPath(); g.moveTo(50, 90); g.bezierCurveTo(10, 62, 4, 36, 24, 22); g.bezierCurveTo(37, 13, 48, 21, 50, 32); g.bezierCurveTo(52, 21, 63, 13, 76, 22); g.bezierCurveTo(96, 36, 90, 62, 50, 90); g.fill(); g.restore(); }
    g.lineWidth = 7; g.beginPath(); g.moveTo(33, 64); g.quadraticCurveTo(50, 80, 67, 64); g.stroke(); }],
  ['uyku', /^(uyku\w*|uyu(du|dum|yor|mak|yamam|yamiyorum|yan)\w*|uykusuz\w*|sleep\w*|tired|yorgun\w*|dream\w*|ruya\w*)$/, (c, bg, t) => {
    g.save(); g.translate(-8, 6); g.scale(.82, .82); faceRing(); g.lineWidth = 6; icLine(28, 46, 44, 46); icLine(56, 46, 72, 46); g.beginPath(); g.ellipse(50, 68, 5, 4, 0, 0, 6.2832); g.fill(); g.restore();
    // havaya süzülen Z'ler
    g.lineWidth = 4;
    for (let i = 0; i < 3; i++){ const q = ((t * .55 + i / 3) % 1), x = 74 + q * 16, y = 40 - q * 38, z = 6 + q * 6, a = g.globalAlpha;
      g.globalAlpha = a * Math.sin(q * Math.PI); icLine(x, y, x + z, y, x, y + z, x + z, y + z); g.globalAlpha = a; } }]
];
ICONS.unshift(...EMO);
// kalp için Türkçe "aşk" (İngilizce "ask" ile karışmasın): çizimi yukarıdaki kalpten al
ICONS.forEach(e => { if (!e[2]) e[2] = ICONS.find(x => x[0] === e[0] && x[2])[2]; });
function iconOf(raw){
  // şapka ve işaretler ayrılıp atılır (â→a, ş→s, ü→u…); harf dışı her şey silinir
  const k = fold((raw || '').toLocaleLowerCase(UPL)).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  if (!k) return mlIcon(raw) || null; // Latin dışı yazı (Rusça, Arapça, Korece, Japonca): yalnız çok dilli kökler
  // "para" (İsp./Port. için), "su" (İsp./İt. onun), "ay" (İsp. ünlem)… Türkçe olmayan şarkıda çizim yapmaz
  const trOnly = UPL !== 'tr' && UPL !== 'az' && /^(ay|aya|ayi|ayin|su|suda|suya|suyu|para|paran\w*|parada|ev|eve|evde|kar|kari|gul|gulu|gulum|dag|dagi|tac|ates)$/.test(k);
  if (!trOnly) for (const [name, re, draw, lang] of ICONS) if ((!lang || lang === UPL) && re.test(k)) return name;
  return mlIcon(raw) || null;
}
const iconDraw = name => ICONS.find(x => x[0] === name)[2];
function drawIcons(T, li, P, cb){
  if (!S.icons || POSTER > 0) return;
  const col = contrast(P.ac, P.bg) >= 2.5 ? P.ac : P.fg;
  for (const b of [blocks[li - 1], cb]){
    if (!b || STYLES[b.style].noIcon) continue;
    const ba = b === cb ? 1 : Math.max(0, 1 - clamp((T - cb.t0) / 1, 0, 1));
    if (ba < .02) continue;
    for (const w of b.words){
      if (!w.icOn || !w.icon) continue;
      const age = T - w.t + EARLY; if (age < 0) continue;
      const p = clamp(age / .45, 0, 1), sz = w.asc * w.s * 1.05;
      WR = w.rot ? {ang: w.rot, c: w.rcx != null ? bpt(b, w.rcx, w.rcy) : bpt(b, w.lx + w.w / 2, w.y + w.h / 2)} : null;
      const ok = setXform(bpt(b, w.lx + w.w + 14 * w.s, w.base - sz * .98), b.U, b.V, sz / 100, 50, 50);
      WR = null;
      if (!ok) continue;
      const sc = easeBack(p) * (1 + L.beat * .1), bob = Math.sin(T * 2.3 + w.idx) * 3 * p;
      g.translate(50, 50 + bob); g.rotate((1 - easeOut(p)) * -.7); g.scale(sc, sc); g.translate(-50, -50);
      g.globalAlpha = ba * Math.min(1, p * 3); g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
      iconDraw(w.icon)(col, P.bg, age, T);
    }
  }
  g.globalAlpha = 1; g.lineCap = 'butt'; g.lineJoin = 'miter';
}

/* ---------- çok dilli kelime kökleri (çizimler, duygu yüzleri, anlam efektleri) ----------
   Türkçe/İngilizce kalıplar yukarıda; burada İspanyolca, Portekizce, Fransızca, Almanca, İtalyanca, Rusça, Azerice, Kürtçe,
   Arapça, Korece, Japonca kökler. Kelime ve kök aynı biçimde sadeleştirilir (küçük harf, aksan/işaret silinir, ı→i).
   "kök" ile başlayan kelime eşleşir; sonunda = olan kök yalnız tam kelime (kısa ya da başka anlamı olan kelimeler için).
   Latin dışı yazılarda (Arapça, Korece, Japonca, Rusça) kök kelimenin içinde geçerse eşleşir (Japoncada boşluk yok). */
const mlNorm = s => (s || '').toLocaleLowerCase(UPL).replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
const ML_ICON = {
  gulumse: 'sonri feliz alegr sorri sourir heureu joie= lachel glucklich froh= sorris sorrid felic улыб счаст рад= gulumsə xosbəxt ابتسام سعيد 미소 행복 笑顔 幸せ',
  kahkaha: 'reir riendo risa jaja rir= rindo riso= rire= rient lachen lacht lachte ridere rido= risata смех смея смеш хаха ضحك ههه 웃 ㅋㅋ 笑',
  sasir: 'sorpres asombr surpres espant surpris etonn uberrasch staun stupi удивл вау= təəccub مفاجأ 놀라 驚',
  aglama: 'llor chor= chora choro chorar chorando triste pleur weine weint traurig piang плак плач груст печал kədər بكاء يبكي حزين 슬프 슬픔 泣 悲し',
  kizgin: 'enfad enoj furia rabia raiva colere furieu wut= wutend zorn arrabbi злой злост злюсь гнев ярост qəzəb hirs غضب 화나 분노 怒',
  asik: 'enamor apaixon amoureu verliebt innamor влюбл asiq عاشق 반했 恋',
  uyku: 'dormi sueno cansad dormir dorme duerm sono= sonho sommeil reve= reves fatigu schlaf mude traum sonno sogno stanco stanca сон= сна= спать сплю спит устал мечт yuxu نوم نائم حلم 잠= 자고 꿈 眠 夢 寝',
  para: 'dinero plata= dinheiro grana= argent= fric= geld soldi denaro деньг бабк pul= pullar pere= مال= فلوس 돈= お金',
  altin: 'oro= ouro= золот qizil zer= ذهب 금= 黄金',
  damla: 'agua lagrim eau= larme wasser trane acqua lacrim вода= воды= воду= слез hesir ماء دموع 물= 눈물 水= 涙',
  ates: 'fuego fogo chama= feu= flamme feuer flamm fuoco fiamm огон огн пламя atəs alov agir= نار 불= 火 炎',
  kalp: 'corazon amor coracao coeur cœur amour herz liebe cuore amore сердц любов люблю urək urəy sevgi قلب حب حبيب 사랑 마음 愛 心 好き',
  yildiz: 'estrell estrel etoile sterne sternen stell звезд ulduz ster= نجم نجوم 별= 星',
  ay: 'luna= lua= lune= mond luna= луна луну луны hiv= heyv قمر 달= 月 noche noite nuit nacht notte ночь ночи gecə ليل 밤= 夜',
  gunes: 'sol= soleil sonne солнц gunəs roj= شمس 태양 太陽',
  yagmur: 'lluvia llov chuva chov pluie pleu regen pioggia piov дожд yagis baran مطر 비= 雨',
  bulut: 'nube nuvem nuage wolke nuvol облак туч bulud ewr غيم سحاب 구름 雲',
  deniz: 'mar= oceano ola= olas= onda mer= ocean meer ozean welle море океан волн dəniz derya behr بحر 바다 海',
  cicek: 'flor rosa= fleur blume fiore fiori цветок цветы роза gul= وردة ورد زهرة 꽃 장미 花 薔薇',
  kus: 'pajaro ave= aves= passaro oiseau vogel uccell птиц qus teyr طير عصفور 새= 鳥',
  goz: 'ojo= ojos= olho yeux= oeil œil auge= augen occhi occhio глаз cav= عين عيون 瞳',
  ev: 'casa= hogar lar= maison haus= heim= zuhause дом= дома= домой بيت 집= 家',
  araba: 'coche carro voiture wagen macchina машин masin سيارة 車',
  telefon: 'telefono movil telefone celular telephone телефон هاتف 전화 電話',
  muzik: 'musica cancion cancao musique chanson musik canzon музык песн musiqi mahni stran موسيق أغني 노래 음악 音楽 歌',
  saat: 'tiempo reloj hora= tempo= relogio temps= heure horloge zeit= uhr= orologio время часы= vaxt وقت ساعة 시간 時間 時計',
  tac: 'rey= reina corona rei= rainha coroa roi= reine couronne konig koenig krone regina корол царь корон ملك تاج 왕= 여왕 女王',
  elmas: 'diamante diamant алмаз бриллиант almaz ماس 다이아 ダイヤ',
  simsek: 'rayo= trueno relampago raio= trovao eclair tonnerre foudre blitz donner fulmine tuono молни гром= ildirim simsək برق رعد 번개 雷',
  kar: 'nieve neve neige schnee снег qar= berf ثلج 雪',
  anahtar: 'llave chave cle= clef schlussel chiave ключ acar مفتاح 열쇠 鍵',
  dunya: 'mundo tierra terra monde terre welt= erde= mondo мир= мира= земл dinya cihan عالم دنيا 세상 세계 世界',
  sehir: 'ciudad cidade ville= cite= stadt citta город səhər bajar مدينة 도시 都市',
  dag: 'montana montanha montagne berg= berge= montagn гор= горы= ciya جبل 산= 山',
  agac: 'arbol bosque arvore floresta arbre foret baum= baume wald= albero alberi bosco foresta дерев лес= леса= məsə شجر غابة 나무 숲 森 木=',
  kahve: 'cafe= caffe kaffee кофе qəhvə قهوة 커피 コーヒー',
  sarap: 'vino= vinho vin= wein= вино вина= sərab نبيذ 와인 ワイン'
};
const ML_SEM = {
  dus: 'caer cae= caigo cayo cair cai= caiu tomb fallen sturz cade cadere caduto пада упал yixil',
  yuksel: 'volar vuelo cielo voar voo= ceu= voler ciel= envol flieg himmel vola cielo лета небо неба goy سماء',
  don: 'girar gira= vuelta volta tourn dreh круж верт',
  kir: 'romp roto= quebr casse briser brise brech bricht kaputt zerbro rotto spezz слом разбит ломат qir',
  yan: 'quem arde brul brenn brucia горит сгора',
  titre: 'tembl miedo treme tremer tremo medo= peur= zitter angst= paura дрож страх боюсь',
  sus: 'silencio calla cala= tais chut= leise ruhe= silenzio zitto тиш молч',
  bagir: 'grita gritar grito cri= cris= crie= hurl schrei grida gridare urla крич крик',
  kalp: 'corazon amor coracao coeur cœur amour herz liebe cuore amore сердц любов люблю urək urəy sevgi قلب حب 사랑 愛',
  kos: 'corre corri correr courir cours= lauf renn бег беж',
  agla: 'llor lluvia chor= chora choro chorar chorando chuva pleur pluie weine regen piang pioggia плак плач дожд'
};
const mlPrep = o => Object.keys(o).map(k => [k, o[k].split(/\s+/).filter(Boolean).map(t => { const ex = t.endsWith('='), st = mlNorm(ex ? t.slice(0, -1) : t); return {st, ex, latin: /^[a-z0-9]+$/.test(st)}; })]);
let MLI = null, MLS = null;
function mlFind(raw, table){
  const k = mlNorm(raw); if (!k) return '';
  for (const [key, stems] of table) for (const s of stems){
    if (s.ex ? k === s.st : s.latin ? (s.st.length >= 3 && k.startsWith(s.st)) : k.includes(s.st)) return key;
  }
  return '';
}
const mlIcon = raw => { if (!MLI) MLI = mlPrep(ML_ICON); return mlFind(raw, MLI); };
const mlSem = raw => { if (!MLS) MLS = mlPrep(ML_SEM); return mlFind(raw, MLS); };
