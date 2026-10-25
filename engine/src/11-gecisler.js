/* ---------- geçişler ---------- */
// Satır değişiminde (yeni satırın ilk karesinde) bir geçiş seçilir: nakarata giriş/çıkışta renk bloğu silme, düet/arka vokalde
// bölünmüş ekran. Geçişler eski karenin görüntüsünü (SNAP) kullanır.
const SNAP = document.createElement('canvas'), sng = SNAP.getContext('2d');
// ekran geçişi: saat ↔ sözler ya da yeni şarkı. Eski kare (XS) hareketle ekrandan çıkar, yeni ekran (canlı kare, NS)
// hafif büyükten yerine oturur. Türler: bol (ekran ikiye bölünüp ayrılır), zoom (eskinin içine dalış), jaluzi (şeritler),
// kayma (yeni ekran eskisini iter), sade (eski yumuşak söner). Geçiş sürerken gelen yeni tetik görmezden gelinir:
// eski ekran gerçek eski ekran kalır, alttaki yeni ekran zaten canlı güncellenir (art arda iki geçiş olmaz).
const XS = document.createElement('canvas'), xsg = XS.getContext('2d');
const NS = document.createElement('canvas'), nsg = NS.getContext('2d');
const TRANS = ['bol', 'zoom', 'jaluzi', 'kayma'];
let FADE = null, lastTrans = '';
const trIO = q => q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;   // yavaş başla, hızlan, yavaş otur
const trOut = q => q >= 1 ? 1 : 1 - Math.pow(2, -9 * q);                      // hızlı gel, yumuşak otur
function screenFade(){
  if (!last || !cv.width) return; // henüz hiç kare çizilmedi
  if (FADE && nowS() - FADE.t0 < FADE.dur * .7) return;
  if (XS.width !== cv.width || XS.height !== cv.height){ XS.width = cv.width; XS.height = cv.height; }
  xsg.setTransform(1, 0, 0, 1, 0, 0); xsg.clearRect(0, 0, XS.width, XS.height); xsg.drawImage(cv, 0, 0);
  let k = S.trans || 'oto';
  if (k === 'oto'){ const c = TRANS.filter(x => x !== lastTrans); k = c[Math.floor(Math.random() * c.length)]; }
  lastTrans = k;
  // bölme çizgisi: dikey, yatay ya da çapraz
  const ang = [Math.PI / 2, 0, .38, -.38][Math.floor(Math.random() * 4)];
  FADE = {t0: nowS(), k, ang, dir: Math.random() < .5 ? 1 : -1, ac: pre().ac,
    dur: k === 'sade' ? .9 : k === 'jaluzi' ? 1.25 : k === 'bol' ? 1.15 : k === 'zoom' ? .95 : 1.05};
}
function drawFade(){
  if (!FADE) return;
  const VW = cv.width, VH = cv.height, q = (nowS() - FADE.t0) / FADE.dur, k = FADE.k;
  if (q >= 1 || q < 0 || XS.width !== VW || XS.height !== VH){ FADE = null; return; }
  const sc = (s, ox, oy) => g.setTransform(s, 0, 0, s, VW / 2 * (1 - s) + (ox || 0), VH / 2 * (1 - s) + (oy || 0));
  g.save(); g.globalAlpha = 1;
  if (k === 'sade'){
    const e = q * q * (3 - 2 * q); sc(1 + .04 * e); g.globalAlpha = 1 - e; g.drawImage(XS, 0, 0); g.restore(); return;
  }
  // yeni ekranın kopyası (bu karede çizilmiş hâli); altta büyükten oturur
  if (NS.width !== VW || NS.height !== VH){ NS.width = VW; NS.height = VH; }
  nsg.setTransform(1, 0, 0, 1, 0, 0); nsg.drawImage(cv, 0, 0);
  if (k === 'bol'){
    // önce ortada vurgu renginde ince bir çatlak açılır, sonra iki yarı birbirinden uzaklaşıp hafifçe döner
    const p = clamp((q - .14) / .86, 0, 1), e = trIO(p);
    sc(1 + .1 * (1 - trOut(p))); g.drawImage(NS, 0, 0);
    const a = FADE.ang, nx = -Math.sin(a), ny = Math.cos(a), R = Math.hypot(VW, VH), cx = VW / 2, cy = VH / 2;
    const tx = Math.cos(a) * R, ty = Math.sin(a) * R, m = Math.min(VW, VH);
    const crack = q < .14 ? Math.sin(q / .14 * Math.PI / 2) * m * .006 : m * .006;
    const dist = crack + e * R * .62;
    for (const sd of [1, -1]){
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.translate(cx + nx * dist * sd, cy + ny * dist * sd); g.rotate(sd * .06 * e * FADE.dir); g.translate(-cx, -cy);
      g.save();
      g.beginPath(); g.moveTo(cx - tx, cy - ty); g.lineTo(cx + tx, cy + ty);
      g.lineTo(cx + tx + nx * R * sd, cy + ty + ny * R * sd); g.lineTo(cx - tx + nx * R * sd, cy - ty + ny * R * sd); g.closePath();
      g.clip(); g.drawImage(XS, 0, 0);
      // kesik kenarı vurgu renginde (yarıya kırpıldığı için her parçada ince bir şerit kalır)
      g.strokeStyle = FADE.ac; g.lineWidth = m * .012; g.beginPath(); g.moveTo(cx - tx, cy - ty); g.lineTo(cx + tx, cy + ty); g.stroke();
      g.restore();
    }
  } else if (k === 'zoom'){
    // eski ekranın içine dalış: eski hızla büyüyüp saydamlaşır (iki kat hayalet = hız hissi), yeni büyükten oturur
    sc(1.18 - .18 * trOut(q)); g.drawImage(NS, 0, 0);
    const o = q * q, al = clamp(1 - q * 1.5, 0, 1);
    sc(1 + .9 * o); g.globalAlpha = al; g.drawImage(XS, 0, 0);
    sc(1 + 1.15 * o); g.globalAlpha = al * .35; g.drawImage(XS, 0, 0);
  } else if (k === 'jaluzi'){
    // eski ekran dikey şeritlere ayrılır, şeritler sırayla (bir yandan öbür yana) aşağı-yukarı kayıp çıkar
    sc(1.07 - .07 * trOut(q)); g.drawImage(NS, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const n = VW > VH * 1.1 ? 9 : 6, w = VW / n, st = .045;
    for (let i = 0; i < n; i++){
      const j = FADE.dir > 0 ? i : n - 1 - i, p = clamp((q - j * st) / (1 - st * (n - 1)), 0, 1);
      if (p >= 1) continue;
      const off = (i % 2 ? 1 : -1) * trIO(p) * VH * 1.05, x0 = Math.floor(i * w), x1 = Math.ceil((i + 1) * w);
      g.drawImage(XS, x0, 0, x1 - x0, VH, x0, off, x1 - x0, VH);
    }
  } else {
    // kayma: yeni ekran yandan gelip eskisini iter; eski geri çekilirken biraz küçülür, arada vurgu renginde ince şerit
    const e = trIO(q), d = FADE.dir, bw = Math.min(VW, VH) * .012;
    const s = 1 - .08 * e;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = mixHex(pre().bg, '#000000', .35); g.fillRect(0, 0, VW, VH);
    g.setTransform(s, 0, 0, s, VW / 2 * (1 - s) - d * e * VW, VH / 2 * (1 - s)); g.drawImage(XS, 0, 0);
    const nxp = d * (1 - e) * (VW + bw);
    g.setTransform(1, 0, 0, 1, nxp, 0); g.drawImage(NS, 0, 0);
    g.fillStyle = FADE.ac; g.fillRect(d > 0 ? -bw : VW, 0, bw, VH);
  }
  g.restore();
}
function snapshot(){ if (SNAP.width !== cv.width || SNAP.height !== cv.height){ SNAP.width = cv.width; SNAP.height = cv.height; } sng.setTransform(1, 0, 0, 1, 0, 0); sng.drawImage(cv, 0, 0); }
let RLI = -1, WP = null, SPL = null, SPLlast = -99;
const BC = {n: 0, last: -9, cut: -9};

// renk bloğu silme: eğik iki renkli bant ekranı süpürür; bandın önünde eski kare, arkasında yeni (ters renkli) sahne
function drawWipe(T, P){
  const q = clamp((T - WP.t0) / WP.dur, 0, 1); if (q >= 1 || T < WP.t0 - .1){ WP = null; return; }
  const VW = cv.width, VH = cv.height, s = VH * .35, b1 = VW * .16, b2 = VW * .05;
  const e2 = q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2, xL = lerp(-s, VW + s + b1 + b2, e2);
  const poly = (xa, xb) => { g.beginPath(); g.moveTo(xa + s, 0); g.lineTo(xb + s, 0); g.lineTo(xb, VH); g.lineTo(xa, VH); g.closePath(); };
  g.save(); g.globalAlpha = 1;
  if (WP.dir < 0) g.setTransform(-1, 0, 0, 1, VW, 0); else g.setTransform(1, 0, 0, 1, 0, 0);
  g.save(); poly(xL, VW + s + 10); g.clip(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(SNAP, 0, 0); g.restore();
  g.fillStyle = P.ac; poly(xL - b1, xL); g.fill();
  g.fillStyle = P.fg; poly(xL - b1 - b2, xL - b1); g.fill();
  g.restore();
}
// bölünmüş ekran: arka vokal cevabı, düette konuşan değişimi ya da hızlı kısa karşılıklı satırlar.
// Sol panelde önceki satır (ters renklerle, kendi kamerasıyla), sağda yeni satır; ayraç eğik vurgu çizgisi.
function splitWanted(pb, cb, T){
  if (!S.split || cv.width < cv.height * 1.2 || POSTER > 0) return false;
  if (STYLES[pb.style].whole || STYLES[cb.style].whole || STYLES[pb.style].dom || STYLES[cb.style].dom) return false;
  const a = pb.words, c = cb.words;
  if (c[0].paren && !a[0].paren) return true;
  if (a[0].spk && c[0].spk && a[0].spk !== c[0].spk) return true;
  return a.length <= 4 && c.length <= 4 && cb.t0 - pb.t0 < 2.6 && T - SPLlast > 20 && Math.random() < .35;
}
function splitAmt(T){
  if (!SPL) return 0;
  let s = easeOut(clamp((T - SPL.t0) / .45, 0, 1));
  if (SPL.endT != null){ const c = clamp((T - SPL.endT) / .45, 0, 1); if (c >= 1 || T < SPL.t0){ SPL = null; return 0; } s *= 1 - easeOut(c); }
  return s;
}
function drawSplit(T, P, e){
  const A = blocks[SPL.a]; if (!A) return;
  const VW = cv.width, VH = cv.height, sl = VH * .12, xd = lerp(-sl - VW * .01, VW / 2, SPLS), Pi = invPal(P);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(xd + sl, 0); g.lineTo(xd - sl, VH); g.lineTo(0, VH); g.closePath(); g.clip();
  g.fillStyle = Pi.bg; g.fillRect(0, 0, VW, VH);
  // geçici kamera: blok sol panele sığar ve tam karşıdan görünür
  const keep = [CAM.eye, CAM.f, CAM.r, CAM.up, CAM.zoom, VOX, SX, SY];
  const tan = Math.tan(FOV / 2), asp = VW / 2 / VH, d = Math.max(W / 2 / asp, A.h / 2) / tan * 1.3, f = A.N, r = vnorm(vcross(f, vmul(A.V, -1)));
  CAM.eye = vsub(A.C, vmul(f, d)); CAM.f = f; CAM.r = r; CAM.up = vcross(r, f); CAM.zoom = 1 + L.beat * .015;
  VOX = xd / 2 - VW / 2 - VW * .25 * (1 - SPLS); SX = SY = 0;
  for (const w of STYLES[A.style].single ? [A.words[A.words.length - 1]] : A.words){ w.chorus = A.chorus; drawWord(A, w, T, Pi, 1, 1, e, 0, null); PX = PY = 0; }
  [CAM.eye, CAM.f, CAM.r, CAM.up, CAM.zoom, VOX, SX, SY] = keep;
  g.restore();
  const lw = VW * .005; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = P.ac;
  g.beginPath(); g.moveTo(xd + sl - lw, 0); g.lineTo(xd + sl + lw, 0); g.lineTo(xd - sl + lw, VH); g.lineTo(xd - sl - lw, VH); g.closePath(); g.fill();
}
// vuruşa kesme: tempo güvenilirken, sıradaki satır 0.3 sn içinde başlayacaksa ve vuruş geldiyse satır vuruşa çekilir,
// kamera yolculuk yerine sert kesmeyle yeni satıra geçer (klip montajı). Art arda iki kesme olmaz, enerjik bölümde ya da nakaratta.
function beatSure(){
  if (L.ivs.length < 6) return false;
  const s = [...L.ivs].sort((a, b) => a - b), med = s[s.length >> 1];
  return (s[(s.length * 3) >> 2] - s[s.length >> 2]) / med < .2;
}
function beatCut(T, ai){
  if (ai < 0 || POSTER > 0) return;
  const nx = words[ai + 1]; if (!nx || nx.wi !== 0) return;
  const dn = nx.t - T; if (dn <= 0 || dn > .3) return;
  if (BC.last === nx.li - 1 || !beatSure() || (energy() < .5 && !isChorusLi(nx.li)) || Math.random() > .6) return;
  nx.t = Math.max(T, words[ai].t + .01); if (blocks[nx.li]) blocks[nx.li].t0 = nx.t;
  BC.last = nx.li; BC.cut = nx.li; L.beat = 1;
}
function lineChange(pb, cb, T){
  if (BC.cut === cb.li) snapCam = true; // vuruşa kesme
  // düet/arka vokal: bölünmüş ekran (renk bloğundan önce gelir; nakarat sınırına denk gelse de konuşan değişimi gösterilir)
  if (splitWanted(pb, cb, T)){ SPL = {a: pb.li, b: cb.li, t0: SPL && SPL.endT == null ? SPL.t0 : T, endT: null}; SPLlast = T; return; }
  // nakarata giriş/çıkış: paletler değişir, değişim renk bloğuyla süpürülür
  if (S.wipe && pb.chorus !== cb.chorus){ snapshot(); WP = {t0: T, dur: .6, dir: cb.chorus ? 1 : -1}; if (SPL && SPL.endT == null) SPL.endT = T; return; }
  if (SPL && SPL.endT == null) SPL.endT = T;
}
