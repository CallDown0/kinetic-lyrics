/* ---------- ses spektrumu (ayar spektrum: kapali | cubuk | dalga) ----------
   Wallpaper Engine'in 128 bantlık sesi 32 banda indirilir (sol + sağ), kendi tepe değerine göre normalize edilir.
   Ekranın alt ortasında, ortadan iki yana aynalı çizilir (bas ortada). Düz renk: zemin ile yazı renginin karışımı,
   tepe çizgileri vurgu renginde. Sözler ekranında ve saat ekranında görünür; ses yokken kendiliğinden söner. */
const SPN = 32, SP = {raw: new Float32Array(SPN), v: new Float32Array(SPN), pk: new Float32Array(SPN), bp: new Float32Array(SPN).fill(.03), peak: .05, at: -9};
function spAudio(a){
  let mx = 0;
  for (let b = 0; b < SPN; b++){
    const v = ((a[2 * b] || 0) + (a[2 * b + 1] || 0) + (a[64 + 2 * b] || 0) + (a[65 + 2 * b] || 0)) / 4;
    SP.raw[b] = v; if (v > mx) mx = v; SP.bp[b] = Math.max(v, SP.bp[b] * .9993, .015);
  }
  SP.peak = Math.max(mx, SP.peak * .999, .03); SP.at = nowS();
}
function drawSpectrum(P, VW, VH, dt){
  if (S.spec === 'kapali' || !S.spec) return;
  const live = nowS() - SP.at < .5; let any = false;
  for (let b = 0; b < SPN; b++){
    // yüksek bantlar doğal olarak zayıf: her bant kısmen kendi tepesine, kısmen genel tepeye göre ölçeklenir; hızlı çıkar, yavaş iner
    const tg = live ? Math.min(1, Math.pow(SP.raw[b] / (SP.bp[b] * .65 + SP.peak * .35), 1.3)) : 0;
    SP.v[b] += (tg - SP.v[b]) * Math.min(1, dt * (tg > SP.v[b] ? 30 : 7));
    SP.pk[b] = Math.max(SP.v[b], SP.pk[b] - dt * .35);
    if (SP.pk[b] > .01) any = true;
  }
  if (!any) return;
  const m = Math.min(VW, VH), wAll = Math.min(VW * .5, m * .9), base = VH - m * .022, hMax = m * .075;
  const body = mixHex(P.bg, P.fg, .34);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  if (S.spec === 'dalga'){
    // iki yana aynalı yumuşak eğri; altı düz renkle dolu, üst çizgisi vurgu renginde
    const pts = []; for (let i = -SPN + 1; i < SPN; i++){ const b = Math.abs(i); pts.push([VW / 2 + i / (SPN - 1) * wAll / 2, base - Math.max(m * .002, SP.v[b] * hMax)]); }
    const path = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length - 1; i++){ const p = pts[i], q = pts[i + 1]; g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); } g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); };
    path(); g.lineTo(pts[pts.length - 1][0], base); g.lineTo(pts[0][0], base); g.closePath(); g.fillStyle = mixHex(P.bg, P.fg, .12); g.fill();
    path(); g.strokeStyle = mixHex(P.bg, P.ac, .85); g.lineWidth = Math.max(1.5, m * .003); g.lineJoin = 'round'; g.stroke();
    return;
  }
  const n = SPN * 2, step = wAll / n, bw = Math.max(1, step * .62), th = Math.max(1, m * .0025);
  for (let i = 0; i < n; i++){
    const b = i < SPN ? SPN - 1 - i : i - SPN, x = VW / 2 - wAll / 2 + i * step + (step - bw) / 2;
    const h = Math.max(th, SP.v[b] * hMax);
    g.fillStyle = body; g.fillRect(x, base - h, bw, h);
    if (SP.pk[b] > SP.v[b] + .02){ g.fillStyle = P.ac; g.fillRect(x, base - SP.pk[b] * hMax - th, bw, th); }
  }
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
