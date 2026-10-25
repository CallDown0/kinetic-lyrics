/* ---------- kelime çizimi ---------- */
function assignAnim(w, fresh){ w.kick = fresh ? clamp((L.low - L.lowSlow) * 2.4, 0, 1) : 0; }
// değişken yazı tiplerinde harfler üst üste binen parçalardan oluşur; düz strokeText iç çizgileri de gösterir.
// Çift kalın kontur ayrı bir tuvale çizilir, harfin içi oradan silinir (destination-out) ve sonuç ana tuvale basılır:
// yalnızca dış hat kalır, harfin içi gerçekten boş olur (arka plan efektleri içinden görünür; zemin renkli dolgu yok).
const OL = document.createElement('canvas'), olg = OL.getContext('2d');
function outline(text, x, y, color, bg, lw, alpha){
  const m = g.getTransform(), tm = g.measureText(text), pad = lw * 2 + 4;
  const x0 = x - pad, x1 = x + tm.width + pad, y0 = y - (tm.actualBoundingBoxAscent || 80) - pad, y1 = y + (tm.actualBoundingBoxDescent || 20) + pad;
  // yerel kutunun ekrandaki sınırları
  let sx0 = 1e9, sy0 = 1e9, sx1 = -1e9, sy1 = -1e9;
  for (const [px, py] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]){ const X = m.a * px + m.c * py + m.e, Y = m.b * px + m.d * py + m.f; sx0 = Math.min(sx0, X); sy0 = Math.min(sy0, Y); sx1 = Math.max(sx1, X); sy1 = Math.max(sy1, Y); }
  sx0 = Math.max(0, Math.floor(sx0)); sy0 = Math.max(0, Math.floor(sy0)); sx1 = Math.min(cv.width, Math.ceil(sx1)); sy1 = Math.min(cv.height, Math.ceil(sy1));
  const w = sx1 - sx0, h = sy1 - sy0; if (w < 1 || h < 1) return;
  if (OL.width < w || OL.height < h){ OL.width = Math.max(OL.width, w); OL.height = Math.max(OL.height, h); }
  olg.setTransform(1, 0, 0, 1, 0, 0); olg.globalCompositeOperation = 'source-over'; olg.clearRect(0, 0, w, h);
  olg.setTransform(m.a, m.b, m.c, m.d, m.e - sx0, m.f - sy0); olg.font = g.font;
  olg.lineWidth = lw * 2; olg.lineJoin = 'round'; olg.strokeStyle = color; olg.strokeText(text, x, y);
  olg.globalCompositeOperation = 'destination-out'; olg.fillStyle = '#000'; olg.fillText(text, x, y);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = alpha; g.drawImage(OL, 0, 0, w, h, sx0, sy0, w, h); g.restore();
}
/* ---------- anlam efektleri: kelimenin anlamı hareketine yansır ---------- */
// Türkçe ekler kökün arkasına geldiği için kök başlangıcıyla eşlenir (düştüm, düşerken, düşüyor…); İngilizce de var.
const SEM = [
  ['dus',    /^(düş(?!ün)|yıkıl|çök|fall|fell|drop|down$)/],
  ['yuksel', /^(yüksel|uç(?!ak|urum)|uçu|havalan|gökyüz|göğe|fly|flying|rise|rising|high$|sky)/],
  ['don',    /^(dön(?!em)|çevir|döndür|spin|turn|around$|round$)/],
  ['kir',    /^(kırıl|kırdı|kırar|kırma|kırık|paramparça|parçala|dağıl|break|broke|shatter|crash)/],
  ['yan',    /^(yanıyor|yandı|yanar|yanma|yangın|yaktı|yakar|yakıyor|ateş|alev|burn|fire|flame)/],
  ['titre',  /^(titre|kork|sarsıl|deprem|shake|shaking|shiver|trembl|scared|fear)/],
  ['sus',    /^(sus(?!a)|sessiz|fısıl|whisper|quiet|silence|silent)/],
  ['bagir',  /^(bağır|çığlık|haykır|isyan|scream|shout|yell|loud)/],
  ['kalp',   /^(kalp|kalb|sev(?!iye)|aşk|aşık|love|heart)/],
  ['kos',    /^(koş|kaçıyor|kaçtı|kaçar|hızlı|acele|run|running|fast|speed|rush)/],
  ['agla',   /^(ağla|gözyaş|yağmur|cry|crying|tears|rain)/]
];
function semOf(raw){
  const s = (raw || '').toLocaleLowerCase('tr').replace(/[^\p{L}]/gu, '');
  if (s.length < 3) return '';
  for (const [k, re] of SEM) if (re.test(s)) return k;
  return mlSem(raw) || '';
}
let IMP = 0; // bağırma: kamera sarsıntısı darbesi
function drawSem(b, w, age, P, active, a, U, V, N, anchor, col, kick, e){
  const A = w.asc, D = w.desc, H = A + D, n = w.chars.length, cx = w.w100 / 2, cy = (D - A) / 2, sg = w.idx % 2 ? 1 : -1;
  const expo = q => q >= 1 ? 1 : 1 - Math.pow(2, -10 * q);
  let off = [0, 0, 0], sc = 1, rot = 0, sy = 1, skew = 0, c = col;
  const k = w.sem;
  if (k === 'dus'){ const q = clamp(age / .5, 0, 1); off = vmul(V, -(1 - easeBounce(q)) * H * w.s * 1.6); rot = sg * .07 * easeOut(clamp((age - .5) / .3, 0, 1)); } // okunurluk: kısa düşüş, üst satırın üstünden geçmez
  else if (k === 'don'){ const q = clamp(age / .5, 0, 1); rot = (1 - easeOut(q)) * Math.PI * 2 * sg; sc = .45 + .55 * easeOut(q); }
  else if (k === 'sus'){ sc = .62; c = mixHex(P.bg, col, .55); a *= clamp(age / .6, 0, 1); }
  else if (k === 'bagir'){ const q = clamp(age / .35, 0, 1); sc = 1.6 - .6 * easeOut(q); if (!w.shouted){ w.shouted = true; IMP = 1; } c = P.ac; }
  else if (k === 'kalp'){ const ph = (age * 1.25) % 1, pulse = Math.pow(Math.max(0, Math.sin(ph * Math.PI * 2)), 6) + .6 * Math.pow(Math.max(0, Math.sin((ph - .18) * Math.PI * 2)), 6); sc = (.7 + .3 * easeBack(clamp(age / .4, 0, 1))) * (1 + .1 * pulse); c = P.ac; }
  else if (k === 'kos'){ const q = expo(clamp(age / .4, 0, 1)); off = vmul(U, -(1 - q) * W * 1.3); skew = -.4 * (1 - q); }
  const A2 = vadd(anchor, off);
  if (!setXform(A2, vmul(U, sc), vmul(V, sc * sy), w.s, cx, cy)) return;
  g.font = w.font; g.fillStyle = c; g.globalAlpha = a;
  if (rot || skew){ g.translate(cx, cy); if (rot) g.rotate(rot); if (skew) g.transform(1, 0, skew, 1, 0, 0); g.translate(-cx, -cy); }
  if (k === 'yuksel'){
    // harfler sırayla aşağıdan süzülür; sonra kelime çok hafif yukarı doğru uçmaya devam eder
    const drift = Math.min(age, 3) * H * .06;
    for (let i = 0; i < n; i++){ const qi = clamp((age - i * .025) / .4, 0, 1); if (qi <= 0) continue; g.globalAlpha = a * Math.min(1, qi * 3); g.fillText(w.chars[i], w.offs[i], (1 - expo(qi)) * H * 1.6 - drift); }
    return;
  }
  if (k === 'kir'){
    // önce bütün belirir, 0.35 sn sonra çapraz çatlaktan iki parçaya ayrılıp hafifçe kayar
    const q = easeOut(clamp((age - .35) / .5, 0, 1)), tilt = H * .3, L2 = -30, R2 = w.w100 + 30, T2 = -A - 14, B2 = D + 14, m = (T2 + B2) / 2;
    const half = (top, dx, dy, r) => { g.save(); g.translate(cx, cy); g.rotate(r); g.translate(-cx, -cy); g.beginPath();
      if (top){ g.moveTo(L2, T2); g.lineTo(R2, T2); g.lineTo(R2, m - tilt); g.lineTo(L2, m + tilt); } else { g.moveTo(L2, m + tilt); g.lineTo(R2, m - tilt); g.lineTo(R2, B2); g.lineTo(L2, B2); }
      g.closePath(); g.clip(); g.fillText(w.text, dx, dy); g.restore(); };
    g.globalAlpha = a * Math.min(1, age * 8);
    half(true, -w.w100 * .03 * q, -H * .12 * q, -.04 * q); half(false, w.w100 * .03 * q, H * .12 * q, .04 * q);
    return;
  }
  if (k === 'yan'){
    // alev: harfler titreşir, yukarı doğru kıpırdar, bazıları vurgu renginde parlar
    const fr = Math.floor(age * 16);
    for (let i = 0; i < n; i++){ const h = hash01(w.idx * 37 + i * 11 + fr); g.globalAlpha = a * (.65 + .35 * h); g.fillStyle = h < .35 ? P.ac : c; g.fillText(w.chars[i], w.offs[i], -Math.abs(noise1(age * 9 + i * 1.7)) * H * .07); }
    return;
  }
  if (k === 'titre'){
    // korku: her harf ayrı ayrı sarsılır (söylenirken güçlü, sonra hafif)
    const amp = (active ? 1 : .35) * H * .05;
    for (let i = 0; i < n; i++){ g.save(); const mx = w.offs[i]; g.translate(noise1(age * 41 + i * 3) * amp, noise1(age * 37 + i * 5 + 2) * amp); g.fillText(w.chars[i], mx, 0); g.restore(); }
    return;
  }
  if (k === 'agla'){
    // gözyaşı: bazı harfler yavaşça aşağı akar ve hafif solar
    for (let i = 0; i < n; i++){ const h = hash01(w.idx * 19 + i * 7), q = h < .4 ? clamp((age - .4 - h * .6) / 1.4, 0, 1) : 0; g.globalAlpha = a * (1 - q * .45); g.fillText(w.chars[i], w.offs[i], q * q * H * .4); }
    return;
  }
  g.fillText(w.text, 0, 0);
}

// kelime girişleri (konum kayması, ölçek, saydamlık); age harf gecikmesiyle de çağrılır
const STAG = {sakin: 1, poster: 1, dusen: 1, donus: 1, derin: 1, hiz: 1}, STG = .02;
// okunurluk: giriş kelimenin söylenme anından bu kadar önce başlar (söylendiğinde kelime okunur hâldedir)
const EARLY = .2;
function entr(style, w, age, dur, e, U, V, N, H){
  const p = clamp(age / dur, 0, 1), ep = easeOut(p);
  let off = [0, 0, 0], sc = 1, a = 1;
  switch (style){
    case 'sakin': off = vmul(V, (1 - ep) * H * w.s * .35); a = ep; break;
    case 'poster': off = vmul(U, (w.idx % 2 ? 1 : -1) * (1 - ep) * W * (.35 + .4 * e)); a = Math.min(1, p * 2); break;
    case 'dusen': { const q = clamp(age / (dur * 1.6), 0, 1); off = vmul(V, -(1 - easeBounce(q)) * H * w.s * 2.6); a = Math.min(1, q * 5); break; }
    case 'donus': sc = .55 + .45 * easeBack(p); a = Math.min(1, p * 2.5); break;
    case 'dev': sc = 1 + .5 * Math.pow(1 - ep, 2); a = Math.min(1, p * 4); break;
    case 'derin': { const q = clamp(age / (dur * 1.3), 0, 1); off = vmul(N, Math.pow(1 - easeOut(q), 2) * W * 3.2); a = Math.min(1, q * 4); break; }
    case 'rap': sc = 1 + .3 * Math.pow(1 - clamp(age / .14, 0, 1), 2); break; // geçişsiz, kısa çakma darbesi
    case 'hiz': { const q = clamp(age / (dur * .9), 0, 1), x = q >= 1 ? 1 : 1 - Math.pow(2, -10 * q); off = vmul(U, (w.idx % 2 ? 1 : -1) * (1 - x) * W * 1.4); a = Math.min(1, q * 6); break; }
  }
  return {off, sc, a};
}
function drawWord(b, w, T, P, st, alpha, e, kick, swing){ try { return drawWord0(b, w, T, P, st, alpha, e, kick, swing); } finally { WR = null; } }
function drawWord0(b, w, T, P, st, alpha, e, kick, swing){
  const age = T - w.t + EARLY, style = w.anim || b.style, A = w.asc, D = w.desc, H = A + D, n = w.chars.length;
  const dur = lerp(.42, .28, e) * (w.chorus ? .85 : 1), p = clamp(age / dur, 0, 1), ep = easeOut(p);
  let U = swing ? swing.U : b.U, V = swing ? swing.V : b.V, N = swing ? swing.N : b.N;
  WR = w.rot ? {ang: w.rot, c: w.rcx != null ? bpt(b, w.rcx, w.rcy, U, V) : bpt(b, w.lx + w.w / 2, w.y + w.h / 2, U, V)} : null;
  const anchor = bpt(b, w.lx, w.base, U, V);
  let off = [0, 0, 0], sc = 1, a = alpha;
  const active = st === 2, future = st === 0;
  // fosforlu kalem: yazı kalemin üstünde okunmuyorsa (kapak renklerinde olabilir) zemin rengine döner
  // söylenen kelime vurgu renginde; vurgu zeminden yeterince ayrışmıyorsa (kapak renklerinde olur) normal yazı rengi.
  // Fosforlu kalem kutusu kaldırıldı: koyu kapak renklerinde kutu ile yazı aynı tona düşüp okunmuyordu.
  let col = w.colk != null ? mcol(P, w.colk) : active && contrast(P.ac, P.bg) >= 2.5 ? P.ac : P.fg;
  // frekans tepkisi: vokal (orta bant) yükselince söylenen kelimenin rengi parlar (koyu zeminde beyaza, açıkta siyaha doğru)
  if (active && S.freq && FQ.mi > .55) col = mixHex(col, lum(P.bg) < .4 ? '#FFFFFF' : '#000000', Math.min(.4, (FQ.mi - .55) * .7));
  // anlamlı kelime (düş, uç, dön, kırıl, yan…): stilin girişi yerine anlamını taşıyan hareket
  if (w.sem === undefined) w.sem = semOf(w.raw);
  if (w.sem && S.semantic && !future && !STYLES[style].whole && style !== 'kilit' && style !== 'rap'){
    drawSem(b, w, age, P, active, a, U, V, N, anchor, col, kick, e); return;
  }
  // girişler
  if (!future){ const r = entr(style, w, age, dur, e, U, V, N, H); off = r.off; sc = r.sc; a *= r.a; }
  // harf harf kademeli giriş (GSAP stagger gibi): hareketli girişlerde her harf kendi gecikmesiyle gelir, bitince bütün kelime çizilir
  const stg = Math.min(STG, .1 / Math.max(1, n));
  if (!future && STAG[style] && age < dur * 1.7 + n * stg){
    g.font = w.font; g.fillStyle = col; const cy = (D - A) / 2;
    for (let i = 0; i < n; i++){
      const ag = age - i * stg; if (ag <= 0) continue;
      const r = entr(style, w, ag, dur, e, U, V, N, H), ad = (i + 1 < n ? w.offs[i + 1] : w.w100) - w.offs[i];
      if (!setXform(vadd(anchor, r.off), vmul(U, r.sc), vmul(V, r.sc), w.s, w.offs[i] + ad / 2, cy)) continue;
      g.globalAlpha = alpha * r.a; g.fillText(w.chars[i], w.offs[i], 0);
    }
    return;
  }
  // vurgu: etkin kelime vuruşta büyür (enerjiyle orantılı)
  if (active) sc *= 1 + kick * (.03 + .07 * e) * (.4 + S.shake);
  // frekans tepkisi: bas seviyesi kelimeyi büyütür, tizler hafifçe titretir
  if (active && S.freq){
    sc *= 1 + clamp(FQ.lo - .35, 0, 1) * .07;
    const jit = H * w.s * .018 * clamp(FQ.hi - .45, 0, 1);
    if (jit > 0) off = vadd(off, vadd(vmul(U, noise1(T * 47 + w.idx) * jit), vmul(V, noise1(T * 53 + w.idx * 3) * jit)));
  }
  const A2 = vadd(anchor, off), cx = w.w100 / 2, cy = (D - A) / 2;
  const scr = setXform(A2, vmul(U, sc), vmul(V, sc), w.s, cx, cy); if (!scr) return;
  g.font = w.font;
  // kontrast teması: fosforlu kalem
  g.globalAlpha = a; g.fillStyle = col;
  if (style === 'dolan'){
    // karaoke: boş kontur, söylenen kısım soldan dolar
    outline(w.text, 0, 0, P.fg, P.bg, 2.2 / Math.max(.05, scr), alpha * (future ? .55 : .9));
    if (!future){
      const nx = words[w.idx + 1], span = nx && nx.li === w.li ? Math.max(.15, nx.t - w.t) : .5;
      const fw = w.w100 * clamp(age / span, 0, 1);
      g.save(); g.beginPath(); g.rect(-6, -A - 10, fw + 6, H + 20); g.clip(); g.globalAlpha = alpha; g.fillStyle = active ? P.ac : P.fg; g.fillText(w.text, 0, 0); g.restore();
    }
    return;
  }
  if (style === 'sakin' && p < 1){
    // bulanıklıktan belirme: iki soluk, büyük kopya içe doğru toplanır
    for (const k of [1, 2]){ const s2 = 1 + (1 - ep) * .12 * k; g.save(); g.translate(cx, cy); g.scale(s2, s2); g.translate(-cx, -cy); g.globalAlpha = a * .22 * (1 - ep); g.fillText(w.text, 0, 0); g.restore(); }
    g.globalAlpha = a;
  }
  if (style === 'daktilo' && p < 1){
    const c = Math.min(n, Math.ceil(p * n * 1.1));
    for (let i = 0; i < c; i++) g.fillText(w.chars[i], w.offs[i], 0);
    g.fillRect((c < n ? w.offs[c] : w.w100) + 4, -A, 8, H);
    return;
  }
  if (style === 'bukum'){
    // zarf bükülmesi: her harf tabanından, ortaya doğru artan oranda uzar; giriş yayla açılır
    const amt = (.55 + .25 * e) * (p < 1 ? easeBack(p) : 1);
    for (let i = 0; i < n; i++){
      const env = Math.sin(Math.PI * (i + .5) / n), k = Math.max(.05, 1 + amt * (env - .45));
      const ach = vadd(bpt(b, w.lx + w.offs[i] * w.s, w.base, U, V), off);
      if (!setXform(ach, vmul(U, sc), vmul(V, k * sc), w.s, 0, 0)) continue;
      g.globalAlpha = a; g.fillStyle = col; g.fillText(w.chars[i], 0, 0);
    }
    return;
  }
  if (style === 'kontur'){
    // içi boş kontur; söylenince alttan yukarı dolar
    outline(w.text, 0, 0, col, P.bg, 2.4 / Math.max(.05, scr), a);
    const q = easeOut(clamp(age / .5, 0, 1));
    g.save(); g.beginPath(); g.rect(-8, D + 6 - (H + 12) * q, w.w100 + 16, (H + 12) * q); g.clip();
    g.fillStyle = col; g.fillText(w.text, 0, 0); g.restore();
    return;
  }
  if (style === 'tekrar'){
    // üstte ve altta konturlar: giriş anında kelimeden açılır, vuruşta hafifçe aralanır
    const gap = (H + 14) * (p < 1 ? ep : 1) * (1 + kick * .08);
    for (let k = 3; k >= 1; k--){
      const ka = a * (.62 - k * .16), lw = 1.8 / Math.max(.05, scr);
      outline(w.text, 0, -gap * k, col, P.bg, lw, ka); outline(w.text, 0, gap * k, col, P.bg, lw, ka);
    }
    g.globalAlpha = a; g.fillStyle = col; g.fillText(w.text, 0, 0);
    return;
  }
  if (style === 'kesik' && p < 1){
    // çapraz kesik: üst yarı soldan, alt yarı sağdan gelir; kesik çizgisi boyunca kayar
    const sh = (1 - ep) * w.w100 * .7, tilt = H * .35, L2 = -30, R2 = w.w100 + 30, T2 = -A - 12, B2 = D + 12, m = (T2 + B2) / 2;
    const half = (top, dx) => {
      g.save(); g.beginPath();
      if (top){ g.moveTo(L2, T2); g.lineTo(R2, T2); g.lineTo(R2, m - tilt); g.lineTo(L2, m + tilt); }
      else { g.moveTo(L2, m + tilt); g.lineTo(R2, m - tilt); g.lineTo(R2, B2); g.lineTo(L2, B2); }
      g.closePath(); g.clip(); g.fillText(w.text, dx, 0); g.restore();
    };
    g.globalAlpha = a * Math.min(1, p * 3); g.fillStyle = col;
    half(true, -sh); half(false, sh);
    return;
  }
  if (style === 'glitch' && p < 1){
    // yatay dilimler sağa sola kayar; iki renk kanalı ayrık başlayıp üst üste oturur
    const sl = 7, hs = (H + 16) / sl, jit = (1 - ep) * w.w100 * .35, rgb = (1 - ep) * 18;
    for (let j = 0; j < sl; j++){
      const dx = (hash01(w.idx * 31 + j * 7 + Math.floor(age * 24)) - .5) * 2 * jit;
      g.save(); g.beginPath(); g.rect(-20, -A - 8 + j * hs, w.w100 + 40, hs + .5); g.clip();
      g.globalAlpha = a * .55; g.fillStyle = P.ac; g.fillText(w.text, dx - rgb, 0);
      g.fillStyle = P.fg; g.fillText(w.text, dx + rgb, 0);
      g.globalAlpha = a; g.fillStyle = col; g.fillText(w.text, dx, 0);
      g.restore();
    }
    return;
  }
  if (style === 'tabela' && p < 1){
    // havaalanı tabelası: her harf yatay ekseni etrafında döner (gerçek perspektif)
    for (let i = 0; i < n; i++){
      const pi = clamp((age - i * .035) / .3, 0, 1); if (pi <= 0) continue;
      const ang = -Math.PI / 2 * (1 - easeBack(pi));
      const V2 = vrot(V, U, ang), cw = (i + 1 < n ? w.offs[i + 1] : w.w100) - w.offs[i];
      const ach = bpt(b, w.lx + w.offs[i] * w.s, w.base, U, V);
      if (!setXform(ach, U, V2, w.s, cw / 2, cy)) continue;
      g.globalAlpha = a * (.35 + .65 * Math.cos(ang)); g.fillStyle = col;
      g.fillText(w.chars[i], 0, 0);
    }
    return;
  }
  const cwOf = i => (i + 1 < n ? w.offs[i + 1] : w.w100) - w.offs[i];
  if (style === 'kilit'){
    // akıcı giriş: ana kelimenin harfleri tabandaki maskenin altından sırayla süzülür (üstel yavaşlama),
    // nokta en son düşer; küçük kelimeler yumuşakça yükselip belirir
    const expo = q => q >= 1 ? 1 : 1 - Math.pow(2, -10 * q);
    if (w.big){
      g.save(); g.beginPath(); g.rect(-40, -A - 60, w.w100 + 80, A + D + 60); g.clip();
      for (let i = 0; i < n; i++){
        const dot = w.chars[i] === '.', pi = clamp((age - i * .05 - (dot ? .12 : 0)) / (dot ? .45 : .7), 0, 1); if (pi <= 0) continue;
        const q = dot ? easeBounce(pi) : expo(pi), y = dot ? -(1 - q) * H * .9 : (1 - q) * (H + 30);
        g.globalAlpha = a * Math.min(1, pi * 3); g.fillText(w.chars[i], w.offs[i], y);
      }
      g.restore();
    } else {
      const q = expo(clamp(age / .55, 0, 1));
      g.globalAlpha = a * q; g.fillText(w.text, 0, (1 - q) * H * .7);
    }
    return;
  }
  if (style === 'esnek' && age < 1.2){
    // ezilip uzama: tabandan basık başlar, sönümlü yayla salınıp oturur
    const k = Math.exp(-age * 6.5) * Math.cos(age * 21), sy = Math.max(.05, 1 - k * .85), sx = 1 + k * .45;
    g.save(); g.translate(cx, D); g.scale(sx, sy); g.translate(-cx, -D); g.globalAlpha = a * Math.min(1, age * 10); g.fillText(w.text, 0, 0); g.restore();
    return;
  }
  if (style === 'kabarcik' && p < 1.6){
    // harfler sırayla sıfırdan şişer (hafif yana yatmış başlar)
    for (let i = 0; i < n; i++){
      const pi = clamp((age - i * .045) / .32, 0, 1); if (pi <= 0) continue;
      const k = easeBack(pi), mx = w.offs[i] + cwOf(i) / 2, my = -A * .4, r = (hash01(w.idx * 17 + i) - .5) * .8 * (1 - pi);
      g.save(); g.translate(mx, my); g.rotate(r); g.scale(k, k); g.translate(-mx, -my);
      g.globalAlpha = a * Math.min(1, pi * 3); g.fillText(w.chars[i], w.offs[i], 0); g.restore();
    }
    return;
  }
  if (style === 'rulet' && age < .2 + n * .035){
    // slot makarası: her harfin üstünde rastgele harfler kayar, soldan sağa sırayla kilitlenir
    const step = H + 14, ABC = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ0123456789';
    for (let i = 0; i < n; i++){
      const pi = clamp(age / (.2 + i * .035), 0, 1), shift = (1 - easeOut(pi)) * step * 4;
      g.save(); g.beginPath(); g.rect(w.offs[i] - 4, -A - 7, cwOf(i) + 8, H + 14); g.clip();
      for (let k = 0; k < 5; k++){
        const y = shift - k * step; if (y < -step || y > step) continue;
        const ch = k === 0 ? w.chars[i] : ABC[Math.floor(hash01(w.idx * 131 + i * 17 + k) * ABC.length)];
        g.globalAlpha = a * (k === 0 ? 1 : .5); g.fillText(k === 0 ? ch : up(ch), w.offs[i], y);
      }
      g.restore();
    }
    return;
  }
  if (style === 'sarkac' && age < 2){
    // sol üst köşeden asılı: sönümlü sarkaç salınımı
    const sg = w.idx % 2 ? 1 : -1, ang = sg * .75 * Math.exp(-age * 3.2) * Math.cos(age * 9);
    g.save(); g.translate(0, -A); g.rotate(ang); g.translate(0, A); g.globalAlpha = a * Math.min(1, age * 8); g.fillText(w.text, 0, 0); g.restore();
    return;
  }
  if (style === 'dilim' && p < 1){
    // dikey dilimler: sırayla bir yukarıdan bir aşağıdan kayıp birleşir
    const sl = Math.max(4, Math.min(9, n * 2)), sw = (w.w100 + 20) / sl;
    for (let j = 0; j < sl; j++){
      const pj = easeOut(clamp((age - j * .025) / (dur * .9), 0, 1)); if (pj <= 0) continue;
      const dy = (1 - pj) * (H + 30) * 1.3 * (j % 2 ? 1 : -1);
      g.save(); g.beginPath(); g.rect(-10 + j * sw, -A - 12, sw + .6, H + 24); g.clip();
      g.globalAlpha = a * Math.min(1, pj * 2); g.fillText(w.text, 0, dy); g.restore();
    }
    return;
  }
  if (style === 'neon' && age < .32){
    // neon tabela: düzensiz yanıp söner, sonra sabit yanar
    const on = hash01(w.idx * 7 + Math.floor(age * 22)) < .45 + age * 2.5;
    g.globalAlpha = a * (on ? 1 : .12); g.fillText(w.text, 0, 0);
    if (on){ g.globalAlpha = a * .25; g.fillStyle = P.ac; g.fillText(w.text, -3, -3); g.fillText(w.text, 3, 3); }
    return;
  }
  if (style === 'coz' && age < .12 + n * .025){
    // şifre çözme: henüz çözülmemiş harfler her karede değişen rastgele harfler (vurgu renginde)
    const ABC = 'ABCDEFGHIJKLMNOPRSTUVYZ#%&@$*+=?<>', fr = Math.floor(age * 18);
    for (let i = 0; i < n; i++){
      const done = age > .06 + i * .025;
      if (done){ g.globalAlpha = a; g.fillStyle = col; g.fillText(w.chars[i], w.offs[i], 0); }
      else if (age > i * .01){ g.globalAlpha = a * .8; g.fillStyle = P.ac; g.fillText(ABC[Math.floor(hash01(w.idx * 53 + i * 11 + fr * 7) * ABC.length)], w.offs[i], 0); }
    }
    return;
  }
  if (style === 'patlama' && p < 1){
    // harfler dağınık 3D konumlardan (öne/arkaya, yana) dönerek yerine toplanır; her harf biraz gecikmeli
    for (let i = 0; i < n; i++){
      const pi = clamp((age - i * .025) / (dur * 1.2), 0, 1), q = 1 - easeOut(pi);
      const h1 = hash01(w.idx * 97 + i * 13), h2 = hash01(w.idx * 57 + i * 29 + 5), h3 = hash01(w.idx * 31 + i * 41 + 9);
      const cw = (i + 1 < n ? w.offs[i + 1] : w.w100) - w.offs[i];
      const sp = H * w.s * (2.2 + 2 * e);
      const ach = vadd(bpt(b, w.lx + w.offs[i] * w.s, w.base, U, V), vadd(vmul(U, (h1 - .5) * sp * 1.6 * q), vadd(vmul(V, (h2 - .5) * sp * q), vmul(N, (h3 - .35) * sp * 3 * q))));
      const ang = (h1 - .5) * 5 * q, U2 = vrot(U, N, ang), V2 = vrot(V, N, ang);
      if (!setXform(ach, U2, V2, w.s, cw / 2, cy)) continue;
      g.globalAlpha = a * Math.min(1, pi * 3); g.fillStyle = col; g.fillText(w.chars[i], 0, 0);
    }
    return;
  }
  if (style === 'maske'){
    // görünmez çizginin (taban + alt boşluk) arkasından yükselir; altta vurgu çizgisi soldan çekilir
    const q = clamp(age / (dur * 1.1), 0, 1), rise = (1 - easeBack(q)) * (H + 20);
    g.save(); g.beginPath(); g.rect(-30, -A - 40, w.w100 + 60, H + 40 + D * .2 + 10); g.clip();
    g.fillText(w.text, 0, rise); g.restore();
    const lq = easeOut(clamp((age - .05) / .35, 0, 1));
    if (!future){ g.globalAlpha = a * (active ? 1 : .35); g.fillStyle = P.ac; g.fillRect(0, D + 10, w.w100 * lq, Math.max(4, H * .06)); }
    return;
  }
  if (style === 'rap'){
    // her kelime farklı eğim ve boyda; her üç kelimeden biri vurgu renginde
    const r = (hash01(w.idx * 13 + 5) - .5) * .32, s2 = .85 + hash01(w.idx * 7 + 1) * .25;
    g.save(); g.translate(cx, cy); g.rotate(r); g.scale(s2, s2); g.translate(-cx, -cy);
    g.fillStyle = w.idx % 3 === 0 ? P.ac : P.fg; g.fillText(w.text, 0, 0); g.restore();
    return;
  }
  if (style === 'hiz' && age < dur * .9){
    // çizgi film hız izi: hızlıyken kelime hareket yönünde uzar ve eğilir, arkasında vurgu renginde hız çizgileri
    const q = clamp(age / (dur * .9), 0, 1), spd = Math.pow(2, -10 * q), sg = w.idx % 2 ? 1 : -1;
    if (spd > .02){
      g.fillStyle = P.ac;
      for (let k = 0; k < 5; k++){
        const h1 = hash01(w.idx * 29 + k * 7), len = spd * w.w100 * (1.4 + h1 * 1.6), y = -A + (k + .5) * H / 5 + (h1 - .5) * H * .08, th = H * (.025 + h1 * .02);
        const x0 = sg > 0 ? w.w100 + H * .1 : -H * .1 - len;
        g.globalAlpha = a * Math.min(1, spd * 3); g.fillRect(x0, y - th / 2, len, th);
      }
    }
    g.save(); g.translate(cx, cy); g.transform(1, 0, sg * spd * .45, 1, 0, 0); g.scale(1 + spd * 1.1, 1 - spd * .2); g.translate(-cx, -cy);
    g.globalAlpha = a; g.fillStyle = col; g.fillText(w.text, 0, 0); g.restore();
    return;
  }
  if (style === 'origami' && age < .35 + n * .025){
    // kâğıt katlama: her harfin alt yarısı tabandan yatık hâlden kalkar, üst yarısı ortadan katlanmışken açılır;
    // kâğıdın arka yüzü görünürken renk zemine doğru koyulaşır
    const mid = (D - A) / 2;
    for (let i = 0; i < n; i++){
      const pi = clamp((age - i * .025) / .32, 0, 1); if (pi <= 0) continue;
      const cw = cwOf(i), base = vadd(bpt(b, w.lx + w.offs[i] * w.s, w.base, U, V), off);
      const angB = (1 - easeOut(clamp(pi / .45, 0, 1))) * 1.35, Vb = vrot(V, U, angB);
      g.globalAlpha = a * Math.min(1, pi * 5);
      if (setXform(base, U, Vb, w.s, cw / 2, mid)){
        g.save(); g.beginPath(); g.rect(-6, mid, cw + 12, D - mid + 14); g.clip();
        g.fillStyle = mixHex(P.bg, col, .55 + .45 * Math.cos(angB)); g.fillText(w.chars[i], 0, 0); g.restore();
      }
      const angT = (1 - easeOut(clamp((pi - .3) / .7, 0, 1))) * Math.PI * .97, Vt = vrot(Vb, U, -angT);
      const midW = vadd(base, vmul(Vb, mid * w.s)), At = vsub(midW, vmul(Vt, mid * w.s));
      if (setXform(At, U, Vt, w.s, cw / 2, mid)){
        g.save(); g.beginPath(); g.rect(-6, -A - 14, cw + 12, mid + A + 14); g.clip();
        g.fillStyle = mixHex(P.bg, col, .3 + .7 * Math.abs(Math.cos(angT)) * (Math.cos(angT) > 0 ? 1 : .6)); g.fillText(w.chars[i], 0, 0); g.restore();
      }
    }
    return;
  }
  if (active && drawHold(w, age, b)) return;
  if (active && breathe(w, cx)) return;
  g.fillText(w.text, 0, 0);
}
