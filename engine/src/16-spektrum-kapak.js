/* ---------- ses spektrumu (ayar spektrum: kapali | tel | izler | cetvel | yarimton | halka) ----------
   Wallpaper Engine'in 128 bantlık sesi (sol + sağ ortalaması, 64 kutu) 48 banda yayılır: baslara daha çok yer verilir
   (tizler çoğu şarkıda boş), her kutu kendi tepe değerine göre normalize edilir. Ses ~30/sn gelir; bantlar her karede
   hedefe doğru akar (hızlı çıkar, yavaş iner). SP.v ham bantlar, SP.s komşularıyla yumuşatılmış eğri, SP.pk yavaş inen zarf.
   Tasarım dili ekolayzır değil baskı/çizim: ince çizgiler, tek mürekkep (yazı rengi), vurgu rengi yalnız zarfta ve tek
   noktada. Ekranın alt ortasında, şarkı kartı ile durum yazısının arasındaki ölçüde durur; yazının arkasında çizilir.
   Aynı veri 3D arka plan 'spektrum' sahnesini de besler (14-arka3d.js). Boyut: ayar spektrumboy (S.specSize). */
const SPB = 64, SPN = 48, SPH = 9, SPK = ['tel', 'izler', 'cetvel', 'yarimton', 'halka'];
const SP = {raw: new Float32Array(SPB), bp: new Float32Array(SPB).fill(.03), nr: new Float32Array(SPB), tg: new Float32Array(SPN), v: new Float32Array(SPN),
  s: new Float32Array(SPN), tmp: new Float32Array(SPN), pk: new Float32Array(SPN), peak: .05, at: -9, stamp: -9, any: false, hist: [], hAcc: 0, dom: 8};
function spAudio(a){
  let mx = 0;
  for (let i = 0; i < SPB; i++){
    const v = ((a[i] || 0) + (a[i + 64] || 0)) / 2;
    SP.raw[i] = v; if (v > mx) mx = v; SP.bp[i] = Math.max(v, SP.bp[i] * .9993, .015);
  }
  SP.peak = Math.max(mx, SP.peak * .999, .03); SP.at = nowS();
}
// bantları bir kare ilerletir (karede bir kez; 2D çizim ve 3D sahne aynı kareyi paylaşır); görünür bir şey kalmadıysa false
function spStep(dt){
  const t = nowS(); if (t - SP.stamp < .002) return SP.any; SP.stamp = t;
  const live = t - SP.at < .5; let any = false;
  // yüksek kutular doğal olarak zayıf: her kutu çoğunlukla kendi tepesine, biraz da genel tepeye göre ölçeklenir
  for (let i = 0; i < SPB; i++) SP.nr[i] = live ? Math.min(1, Math.pow(SP.raw[i] / (SP.bp[i] * .85 + SP.peak * .15), 1.1)) : 0;
  for (let b = 0; b < SPN; b++){ const f = Math.pow(b / (SPN - 1), 1.45) * 50, i = Math.floor(f), k = f - i; SP.tg[b] = SP.nr[i] * (1 - k) + SP.nr[i + 1] * k; }
  for (let b = 0; b < SPN; b++) SP.v[b] += (SP.tg[b] - SP.v[b]) * Math.min(1, dt * (SP.tg[b] > SP.v[b] ? 24 : 5));
  // yumuşak eğri: iki tur komşu ortalaması (çizgi tasarımları titremesin, aksın)
  const blur = (a, o) => { for (let b = 0; b < SPN; b++) o[b] = a[b] * .4 + (a[b ? b - 1 : 0] + a[b < SPN - 1 ? b + 1 : SPN - 1]) * .3; };
  blur(SP.v, SP.tmp); blur(SP.tmp, SP.s);
  let mb = 0;
  for (let b = 0; b < SPN; b++){
    SP.pk[b] = Math.max(SP.s[b], SP.pk[b] - dt * .22);
    if (SP.pk[b] > .008) any = true;
    if (SP.s[b] > SP.s[mb]) mb = b;
  }
  SP.dom += (mb - SP.dom) * Math.min(1, dt * 5);
  // geçmiş: 'izler' tasarımı için 0.11 sn'de bir eğrinin kopyası (en yeni başta)
  SP.hAcc += dt / .11;
  if (SP.hAcc >= 1){ SP.hAcc = Math.min(SP.hAcc - 1, .99); const r = SP.hist.length > SPH ? SP.hist.pop() : new Float32Array(SPN); r.set(SP.s); SP.hist.unshift(r); }
  return SP.any = any;
}
// kesirli banttaki değer
const spAt = (a, f) => { const i = Math.min(SPN - 2, Math.max(0, Math.floor(f))), k = clamp(f - i, 0, 1); return a[i] * (1 - k) + a[i + 1] * k; };
// [x0, y0, x1, y1, …] noktalarından yumuşak eğri (orta noktalardan geçen ikinci derece yaylar); kapalı = halka
function spPath(p, closed){
  const n = p.length;
  if (closed){
    g.moveTo((p[n - 2] + p[0]) / 2, (p[n - 1] + p[1]) / 2);
    for (let i = 0; i < n; i += 2){ const j = (i + 2) % n; g.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[j]) / 2, (p[i + 1] + p[j + 1]) / 2); }
    g.closePath(); return;
  }
  g.moveTo(p[0], p[1]);
  for (let i = 2; i < n - 2; i += 2) g.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
  g.lineTo(p[n - 2], p[n - 1]);
}
function drawSpectrum(P, VW, VH, dt){
  if (S.spec === 'kapali' || !S.spec) return;
  if (!spStep(dt)) return;
  const m = Math.min(VW, VH), k = S.specSize || 1, wide = VW >= VH;
  const x0 = VW * (wide ? .15 : .07), w = VW - 2 * x0, y0 = VH - m * .05; // şarkı kartı (sol alt) ile durum yazısının (sağ alt) arası
  const hair = Math.max(1, m * .0015), main = Math.max(1.5, m * .0027);
  const ink = mixHex(P.bg, P.fg, .72), dim = mixHex(P.bg, P.fg, .2), acc = mixHex(P.bg, P.ac, .92);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.lineCap = 'round'; g.lineJoin = 'round';
  if (S.spec === 'izler'){
    // üst üste dizili geçmiş çizgileri: öndeki şimdi, arkadakiler birer adım önce; her çizgi arkasındakini örter, eskidikçe solar ve daralır
    const mid = SPN - 1, n = mid * 2 + 1, gap = m * .013 * k, amp = m * .075 * k, fr = SP.hAcc, rows = SP.hist.length, pts = new Array(n * 2);
    for (let h = rows; h >= 0; h--){
      const arr = h ? SP.hist[h - 1] : SP.s, age = h ? h - 1 + fr : 0, t = 1 - age / (SPH + 1); if (t <= 0) continue;
      const ww = w * (1 - age * .03), xx = VW / 2 - ww / 2, yb = y0 - age * gap;
      for (let i = 0; i < n; i++){ const u = i / (n - 1); pts[i * 2] = xx + ww * u; pts[i * 2 + 1] = yb - arr[Math.abs(i - mid)] * amp * Math.sin(Math.PI * u) * (1 - age * .04); }
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); spPath(pts); g.closePath(); g.fill();
      g.globalCompositeOperation = 'source-over'; g.beginPath(); spPath(pts);
      g.strokeStyle = mixHex(P.bg, P.fg, .06 + .66 * t * t); g.lineWidth = h ? hair : main; g.stroke();
    }
  } else if (S.spec === 'cetvel'){
    // cetvel: sık ve çok ince çentikler (bas solda, tiz sağda); her on altıncısı uzun; zarf, çentiğin üstünde vurgu renginde kısa bir iz
    const cnt = (SPN - 1) * 4 + 1, step = w / (cnt - 1), amp = m * .085 * k;
    const len = i => m * (i % 16 ? .006 : .013) + spAt(SP.v, i / 4) * amp;
    g.lineCap = 'butt'; g.lineWidth = hair;
    g.beginPath(); for (let i = 0; i < cnt; i++){ const x = Math.round(x0 + i * step) + .5; g.moveTo(x, y0); g.lineTo(x, y0 - len(i)); } g.strokeStyle = ink; g.stroke();
    g.beginPath();
    for (let i = 0; i < cnt; i++){
      const pk = spAt(SP.pk, i / 4); if (pk < spAt(SP.v, i / 4) + .05) continue;
      const x = Math.round(x0 + i * step) + .5, y = y0 - m * .006 - pk * amp - m * .006; g.moveTo(x, y); g.lineTo(x, y - m * .004);
    }
    g.strokeStyle = acc; g.stroke();
  } else if (S.spec === 'yarimton'){
    // yarım ton baskı: sabit kafeste noktalar; ses noktaları yakmaz, büyütür — yukarı doğru küçülerek kaybolur
    const cols = Math.max(24, Math.round(w / (m * .017))), st = w / cols, rows = Math.max(3, Math.round(7 * k));
    g.beginPath();
    for (let j = 0; j < rows; j++) for (let c = 0; c < cols - (j & 1); c++){
      const u = (c + .5 + (j & 1) * .5) / cols, lv = spAt(SP.s, u * (SPN - 1)) * (rows + .6);
      const r = st * .42 * Math.max(j ? 0 : .12, clamp((lv - j * .8) / (rows * .55), 0, 1)); if (r < .4) continue;
      const x = x0 + u * w, y = y0 - st * .5 - j * st * .87; g.moveTo(x + r, y); g.arc(x, y, r, 0, 6.2832);
    }
    g.fillStyle = mixHex(P.bg, P.fg, .6); g.fill();
  } else if (S.spec === 'halka'){
    // titreşen halka: ekranın ortasında, yazının (ya da saatin) çevresinde tek ince çizgi; bas tepede, iki yana aynalı;
    // içinde sabit silik bir daire, dışında vurgu renginde zarf
    const cx = VW / 2, cy = VH / 2, R = m * .37, amp = m * .06 * k, cnt = SPN * 2 - 2, a = new Array(cnt * 2), b = new Array(cnt * 2);
    for (let i = 0; i < cnt; i++){
      const bi = i < SPN ? i : cnt - i, q = -1.5708 + i / cnt * 6.2832, c = Math.cos(q), s = Math.sin(q);
      const r1 = R + SP.s[bi] * amp, r2 = R + SP.pk[bi] * amp + m * .008;
      a[i * 2] = cx + c * r1; a[i * 2 + 1] = cy + s * r1; b[i * 2] = cx + c * r2; b[i * 2 + 1] = cy + s * r2;
    }
    g.beginPath(); g.arc(cx, cy, R - m * .012, 0, 6.2832); g.strokeStyle = dim; g.lineWidth = hair; g.stroke();
    g.beginPath(); spPath(b, true); g.strokeStyle = acc; g.lineWidth = hair; g.stroke();
    g.beginPath(); spPath(a, true); g.strokeStyle = ink; g.lineWidth = main; g.stroke();
  } else {
    // tel: gergin tek çizgi (bas solda, tiz sağda), uçları sabit; üstünde vurgu renginde ince zarf, en güçlü sesin üstünde tek nokta
    const amp = m * .13 * k, a = new Array(SPN * 2), b = new Array(SPN * 2), win = u => Math.pow(Math.sin(Math.PI * u), .6);
    for (let i = 0; i < SPN; i++){ const u = i / (SPN - 1), x = x0 + w * u, wn = win(u); a[i * 2] = b[i * 2] = x; a[i * 2 + 1] = y0 - SP.s[i] * amp * wn; b[i * 2 + 1] = y0 - SP.pk[i] * amp * wn; }
    g.beginPath(); g.moveTo(x0, y0 + .5); g.lineTo(x0 + w, y0 + .5); g.strokeStyle = dim; g.lineWidth = hair; g.stroke();
    g.beginPath(); spPath(b); g.strokeStyle = acc; g.lineWidth = hair; g.stroke();
    g.beginPath(); spPath(a); g.strokeStyle = ink; g.lineWidth = main; g.stroke();
    const du = clamp(SP.dom / (SPN - 1), 0, 1), dv = spAt(SP.s, SP.dom);
    if (dv > .08){ g.beginPath(); g.arc(x0 + w * du, y0 - dv * amp * win(du), m * .0055, 0, 6.2832); g.fillStyle = acc; g.fill(); }
  }
  g.restore();
}

/* ---------- albüm kapağından arka plan (arka plan türü 'kapak') ----------
   Kapak 24 piksele küçültülüp ekrana yayılır (büyütme onu bulanık renk lekelerine çevirir), üstüne tema zemini yarı
   saydam biner: yazı okunur kalır. Yavaşça kayar, basla hafif büyür. Kapak yoksa düz zemin kalır. */
const COV = {src: '', cnv: null};
function coverCanvas(){
  if (!M.thumb){ COV.src = ''; COV.cnv = null; return null; }
  if (COV.src !== M.thumb){
    const src = COV.src = M.thumb; COV.cnv = null;
    const im = new Image();
    im.onload = () => { if (COV.src !== src) return; const c = document.createElement('canvas'); c.width = c.height = 24; c.getContext('2d').drawImage(im, 0, 0, 24, 24); COV.cnv = c; COV.t0 = nowS(); };
    im.src = src.startsWith('data:') ? src : 'data:image/png;base64,' + src;
  }
  return COV.cnv;
}
function drawCover(T, P, VW, VH){
  const c = coverCanvas(); if (!c) return;
  const k = Math.max(VW, VH) * (1.35 + .05 * Math.sin(T * .11) + L.lowSlow * .03), a = clamp((nowS() - COV.t0) / 1.2, 0, 1);
  g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.translate(VW / 2 + Math.sin(T * .07) * VW * .04, VH / 2 + Math.cos(T * .09) * VH * .04); g.rotate(Math.sin(T * .05) * .12);
  g.globalAlpha = a; g.drawImage(c, 1, 1, 22, 22, -k / 2, -k / 2, k, k); // kenar pikselleri dışarıda: kenarda renk şeridi olmasın
  g.restore();
  // okunurluk perdesi: zemin rengi (yazıyla kontrastı tema belirler)
  g.globalAlpha = .58 * a; g.fillStyle = P.bg; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1;
}

/* ---------- şarkı kartı: ilerleme çizgisi ve dönen kapak ---------- */
setInterval(() => {
  const pg = $('pg'), im = $('art'); if (!pg || !im) return;
  const has = M.dur > 0 && !M.stopped;
  pg.hidden = !has;
  if (has) $('pgi').style.width = (clamp(songT() / M.dur, 0, 1) * 100).toFixed(2) + '%';
  im.classList.toggle('plak', !!S.record); im.classList.toggle('dur', !M.playing);
}, 500);
