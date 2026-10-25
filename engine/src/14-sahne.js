/* ---------- sahne ---------- */
let RDT = .016; // son kare süresi (halka gibi kare-zamanlı yumuşatmalar için)
function render(T, dt){
  XFL = XF; XF = 0;
  const VW = cv.width, VH = cv.height;
  RDT = dt;
  energyTick(dt);
  const ai = activeIndex(T), aw = ai >= 0 ? words[ai] : null;
  if (L.beatN !== BC.n){ BC.n = L.beatN; if (S.beatcut && mode === 'lyrics') beatCut(T, ai); }
  // sıradaki kelimenin satırı LEAD sn önceden sahnede hazır olur (kelime görünmez, yalnız yer ve kamera hazırlanır)
  const pi = ai + 1 < words.length && T >= words[ai + 1].t - LEAD ? ai + 1 : -1;
  const fw = pi >= 0 ? words[pi] : aw || words[0], li = fw ? fw.li : 0;
  // sıradaki satır 1 sn kala kurulur (o anki enerjiyle)
  if (aw){ ensureBlock(li); const nx = words.find(w => w.li > li); if (nx && nx.t - T < 1) ensureBlock(nx.li); }
  else if (words.length) ensureBlock(li);
  curLine = li;
  const P = CLK_HOLD && mode === 'idle' ? CLK_HOLD : pal(li), kick = clamp((L.low - L.lowSlow) * 2.4, 0, 1), e = energy();
  if (P.bg !== lastBg){ lastBg = P.bg; applyLook(); }
  const cb = blocks[li];
  // satır değişimi: geçiş seçimi (tuval hâlâ önceki kareyi tutuyor, kamera da önceki karede)
  if (li !== RLI){ const was = RLI; RLI = li; if (mode === 'lyrics' && li === was + 1 && blocks[was] && cb && T - cb.t0 < 1) lineChange(blocks[was], cb, T); }
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  B3.want = false;
  if (mode === 'idle' && S.clock){ drawIdleClock(T, dt, P, VW, VH); return; }
  B3.want = bg3Want(); // 3D arka plan: 2D tuval zemin boyamaz, şeffaf kalır
  // zemin: Pop'ta yeni satır rengi ortadan daire; dev stilinde vuruşta zemin/yazı rengi yer değiştirir
  let bgCol = P.bg, fgSwap = false;
  if (cb && cb.style === 'dev' && aw && aw.li === li && e > .45 && aw.wi % 2 === 1){ bgCol = P.ac; fgSwap = true; }
  const tr = cb ? clamp((T - cb.t0) / .45, 0, 1) : 1;
  if (B3.want){ g.clearRect(0, 0, VW, VH); B3.bgCol = bgCol; }
  else if (TH.perLine && tr < 1 && li > 0){
    g.fillStyle = pal(li - 1).bg; g.fillRect(0, 0, VW, VH);
    g.fillStyle = bgCol; g.beginPath(); g.arc(VW / 2, VH / 2, Math.hypot(VW, VH) / 2 * easeOut(tr), 0, Math.PI * 2); g.fill();
  } else { g.fillStyle = bgCol; g.fillRect(0, 0, VW, VH); }
  let flash = 0; for (const d of L.drops){ const x = T - d; if (x >= 0 && x < .25) flash = Math.max(flash, 1 - x / .25); }
  // nakarat girişi: kısa vurgu rengi parlaması
  if (!S.wipe && cb && cb.chorus && mode === 'lyrics' && !(blocks[li - 1] && blocks[li - 1].chorus)){ const x = T - cb.t0; if (x >= 0 && x < .3) flash = Math.max(flash, (1 - x / .3) * .7); }
  if (flash){ g.globalAlpha = flash * .45; g.fillStyle = P.ac; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1; }
  L.beat *= Math.exp(-dt * 7);
  // nefes: vokal bölgesi (orta) + bas; hızlı yükselir, yavaş iner
  { const tg = clamp(L.mid * .55 + L.low * .45, 0, 1); BRE += (tg - BRE) * Math.min(1, dt * (tg > BRE ? 14 : 5)); }
  fqTick(dt);
  // ara bölüm ekranı (şarkı adı + ses çubukları) kullanıcı isteğiyle kaldırıldı: sözsüz kısımda son satır kalır
  if (!words.length || !cb){ drawTranslation(T, ai, P, VW, VH); return; }
  // şarkı sonu posteri: son sözden 3 sn sonra (en az 3 satır kurulduysa)
  const lastT = words[words.length - 1].t;
  POSTER = S.poster && mode === 'lyrics' && ai === words.length - 1 && blocks.filter(Boolean).length >= 3 ? clamp((T - lastT - 3) / 1.5, 0, 1) : 0;
  SPLS = POSTER > 0 ? 0 : splitAmt(T); VOX = SPLS * VW / 4;
  const trOn = S.translate && TR && TR.key === M.key && mode === 'lyrics'; VOY = trOn ? -VH * .06 : 0;
  camStep(T, dt, VW, VH);
  // vuruş: yakınlaşma darbesi (nakaratta daha güçlü); sert stillerde kamera sarsıntısı
  const hard = cb.style === 'dev' || cb.style === 'dusen' || cb.style === 'patlama' || cb.style === 'rap';
  CAM.zoom = 1 + (kick * (.02 + .04 * e) + L.beat * (cb.chorus ? .05 : .022)) * (.4 + S.shake);
  const amp = (hard ? 1 : .25) * S.shake * kick * e * VW * .006 + IMP * VW * .012 * (.3 + S.shake);
  IMP *= Math.exp(-dt * 6);
  SX = noise1(T * 11) * amp; SY = noise1(T * 13 + 5) * amp;
  const Pd = fgSwap ? {bg: P.ac, fg: P.bg, ac: P.bg} : P;
  if (!B3.want){ drawBackground(T, dt, Pd, VW, VH, li, cb, e); drawDots(fgSwap ? {fg: P.bg} : P, kick); }
  // destek efektleri: yeni kelimede parçacık patlaması, vuruşta kıvılcım (yılan çizgiler denendi, kullanıcı beğenmedi)
  if (aw && aw.idx !== FX.last){ FX.last = aw.idx; const b = blocks[aw.li]; if (b && !STYLES[b.style].whole && b.style !== 'sarmal' && T - aw.t < .4) fxWord(b, aw, e); }
  if (aw && L.beatN !== FX.beatN){ FX.beatN = L.beatN; const b = blocks[aw.li]; if (b && !STYLES[b.style].whole && b.style !== 'sarmal' && S.particles) burst(b, aw, 4 + Math.round(8 * e), .5); }
  fxStep(dt);
  for (const b of POSTER > 0 ? blocks.filter(Boolean) : [blocks[li - 1], cb]){
    if (!b || b.t0 > T + LEAD + .01) continue;
    const back = li - b.li;
    // bölünmüş ekranın sol panelindeki satır ana sahnede çizilmez
    if (back !== 0 && POSTER === 0 && SPL && b.li === SPL.a) continue;
    // posterde eski satırlar son hâlleriyle (bütün kelimeler yerinde) belirir
    if (POSTER > 0 && back > 1){ if (!STYLES[b.style].whole && !STYLES[b.style].dom) drawPosterBlock(b, T, TH.perLine ? pal(b.li) : Pd, e); continue; }
    // önceki satır son kelimesi bitene dek tam görünür; yeni satır başlayınca 1 sn içinde söner (kamera yoldayken ikisi de görünür)
    // dikey ekranda önceki satır tamamen sönmez, soluk kalarak üst boşluğu doldurur
    const ba = Math.max(POSTER, back === 0 ? 1 : Math.max(VH > VW * 1.1 ? .22 : 0, 1 - clamp((T - cb.t0) / 1, 0, 1)));
    if (ba < .01) continue;
    const Pb = back === 0 ? Pd : (TH.perLine ? pal(b.li) : P);
    // dönüş stili: blok 3D kart gibi dikey eksende dönerek gelir
    if (STYLES[b.style].dom) continue; // 3D yazı katmanında çizilir (g3Frame)
    if (STYLES[b.style].whole){ if (b.style === 'halka') drawRing(b, T, Pb, ai, ba, e, kick); else drawBands(b, T, Pb, ai, ba, e); continue; }
    // çıkış efekti: yeni satırın ilk kelimesi gelince eski satır gösteriyle gider (dikey ekranda soluk kalma sürer)
    // kamera kalkmadan görünsün diye sıradaki satırdan EXL sn önce başlar (uzatılan son hecenin sonuna denk gelir)
    const nb = blocks[b.li + 1], es = nb ? nb.t0 - EXL : 1e9;
    if (POSTER === 0 && b.exit && T >= es && VH <= VW * 1.1 && !(b.style === 'rap')){ const q = (T - es) / EXD; if (q < 1) drawExit(b, T, q, Pb); continue; }
    let swing = null;
    if (b.style === 'perspektif'){
      // geriye yatma: dik başlar, okunur ama belirgin bir eğimde kalır
      const q = clamp((T - b.t0 + LEAD) / .9, 0, 1), ang = -(1.25 - .4 * easeOut(q));
      swing = {U: b.U, V: vrot(b.V, b.U, ang), N: vrot(b.N, b.U, ang)};
    }
    if (b.style === 'donus' && back === 0){
      const q = clamp((T - b.t0 + LEAD) / .75, 0, 1), ang = (1 - easeOut(q)) * 1.25 * (b.li % 2 ? 1 : -1);
      if (ang) swing = {U: vrot(b.U, b.V, ang), V: b.V, N: vrot(b.N, b.V, ang)};
    }
    for (const w of b.words){
      const st = w.idx === ai ? 2 : w.t <= T + EARLY ? 1 : 0;
      if (STYLES[b.style].single){
        // tek dev kelime; öncekisi kameraya doğru büyüyüp geçer.
        // önceki satırın söylenmekte olan kelimesi, yeni satırın ilk kelimesi gelene dek kalır (kamera erken kalkınca boş kare olmasın)
        if (back !== 0 && st !== 2) continue;
        if (st === 1){
          if (b.style === 'rap') continue; // sert kesme: önceki kelime anında gider
          const nx = words[w.idx + 1], x = nx ? T - nx.t : 9;
          if (x > .28 || x < 0) continue;
          const q = x / .28, A2 = vadd(bpt(b, w.lx, w.base), vmul(b.N, -q * 900));
          if (!setXform(A2, b.U, b.V, w.s, w.w100 / 2, (w.desc - w.asc) / 2)) continue;
          g.font = w.font; g.globalAlpha = (1 - q) * .8; g.fillStyle = Pb.fg; g.fillText(w.text, 0, 0);
          continue;
        }
        if (st === 0) continue;
      } else if (st === 0 && b.style !== 'dolan') continue;
      if (st === 0 && back !== 0) continue;
      w.chorus = b.chorus;
      mousePush(b, w); drawWord(b, w, T, Pb, st, ba, e, kick, swing); PX = PY = 0;
    }
    // kilit imzası: satır başlarken yavaşça belirir
    if (b.cap && setXform(bpt(b, b.cap.x, b.cap.base), b.U, b.V, b.cap.s, 0, 0)){
      g.font = fontStr(false); g.globalAlpha = ba * .85 * clamp((T - b.t0 - .3) / .8, 0, 1); g.fillStyle = Pb.fg; g.fillText(b.cap.text, 0, 0);
    }
  }
  drawIcons(T, li, Pd, cb);
  drawParticles(Pd);
  if (SPL && SPLS > 0) drawSplit(T, P, e);
  if (WP) drawWipe(T, P);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  drawTranslation(T, ai, P, VW, VH);
}

/* ---------- arka plan efektleri (ekran uzayında, opak; kelimelerin çevresi boş bırakılır) ---------- */
// türler: cizgi (incelip kalınlaşan düz çizgiler), halka (vuruşta büyüyen halkalar), sekil (süzülen geometrik şekiller),
// izgara (kayan ızgara), serit (kayan çapraz şeritler). Otomatikte her şarkıda biri rastgele seçilir.
// Saydamlık yok: soluk görünmesi gerekenler zemin ile yazı renginin karışımı olan düz renkle çizilir; kaybolurken
// incelir/küçülür/geri çekilir.
const BG_KINDS = ['cizgi', 'halka', 'sekil', 'izgara', 'serit'];
const BR = {list: [], timer: .5, lastLi: -1, kind: '', key: null, beatN: 0, t: 0};
function mixHex(a, b, t){
  const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return b;
  const x = p(a), y = p(b), c = i => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0');
  return '#' + c(0) + c(1) + c(2);
}
function inQuad(q, x, y){
  // dışbükey dörtgen içinde mi (kenar çarpımlarının işareti aynı)
  let s = 0;
  for (let i = 0; i < 4; i++){ const a = q[i], b = q[(i + 1) % 4], c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]); if (c){ const sg = c > 0 ? 1 : -1; if (s && sg !== s) return false; s = sg; } }
  return true;
}
function wordHoles(b, pad){
  // kelime kutularının ekran dörtgenleri (pad: kelime yüksekliğine oranla boşluk)
  const out = [], whole = STYLES[b.style].whole || b.style === 'tekrar'; // tekrar: üst/alt kopyalarla tüm blok
  const quad = (x0, y0, x1, y1) => { const q = [bpt(b, x0, y0), bpt(b, x1, y0), bpt(b, x1, y1), bpt(b, x0, y1)].map(proj); if (q.every(Boolean)) out.push(q); };
  if (whole){ const m = b.h * .25; quad(-W * .35, -m - b.h * .5, W * 1.35, b.h * 1.5 + m); return out; }
  for (const w of b.words){ const p = w.h * pad; quad(w.lx - p, w.y - p, w.lx + w.w + p, w.y + w.h + p); }
  return out;
}
function bgKind(){
  if (S.bg !== 'oto') return S.bg;
  // otomatik: şarkı değişince rastgele yeni tür (bir önceki şarkınınkinden farklı)
  if (BR.key !== M.key){ BR.key = M.key; const c = BG_KINDS.filter(k => k !== BR.kind); BR.kind = c[Math.floor(Math.random() * c.length)]; BR.list.length = 0; BR.timer = .3; }
  return BR.kind;
}

/* çizgi: kenar şeritlerinde kıvrımlı, kalınlığı incelip kalınlaşan düz çizgi; baştan çizilir, sonda geri çekilir */
function linePath(VW, VH, e){
  const r = Math.random, side = r() < (VH > VW ? .45 : .28);
  let ang, len, cx, cy;
  if (!side){ ang = (r() - .5) * .5 + (r() < .5 ? 0 : Math.PI); len = VW * (.7 + r() * .6); cx = VW * (.2 + r() * .6); cy = r() < .5 ? VH * (.08 + r() * .12) : VH * (.8 + r() * .12); }
  else { ang = Math.PI / 2 + (r() - .5) * .5; len = VH * (.6 + r() * .4); cy = VH * (.3 + r() * .4); cx = r() < .5 ? VW * (.04 + r() * .08) : VW * (.88 + r() * .08); }
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, m = Math.min(VW, VH);
  const bend = (r() - .5) * m * .14, wav = m * (.015 + r() * .03), wf = 1.5 + r() * 2.5, ph = r() * 6, pts = [];
  for (let i = 0; i <= 80; i++){
    const t = i / 80, u = (t - .5) * len, o = Math.sin(t * Math.PI) * bend + Math.sin(t * Math.PI * wf + ph) * wav;
    pts.push([cx + dx * u + nx * o, cy + dy * u + ny * o]);
  }
  return {pts, base: m * (.008 + r() * .014) * (.8 + .5 * e), k: 1.5 + r() * 2.5, ph: r() * 6, age: 0, life: 6 + r() * 4, draw: 1 + r() * .6, ac: r() < .6};
}
function lineWidthAt(s, t){
  // incelip kalınlaşan (yumuşak) gövde, uçlarda kısa sivrilme
  const end = Math.min(1, t / .06, (1 - t) / .06);
  return s.base * (.35 + .65 * (.5 + .5 * Math.sin(t * Math.PI * s.k + s.ph))) * Math.max(0, end);
}
function drawLineItem(s, P){
  const n = s.pts.length - 1, head = easeOut(clamp(s.age / s.draw, 0, 1)) * n;
  const tail = easeOut(clamp((s.age - (s.life - s.draw)) / s.draw, 0, 1)) * n; // sonda geri çekilir
  if (head - tail < 1) return;
  const L2 = [], R2 = [];
  for (let i = Math.floor(tail); i <= Math.ceil(head); i++){
    const a = s.pts[Math.max(0, i - 1)], c = s.pts[Math.min(n, i + 1)], p = s.pts[Math.min(n, i)];
    let tx = c[0] - a[0], ty = c[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    // uçlar (çizilen baş ve çekilen kuyruk) yuvarlak incelir
    const edge = Math.min(1, (head - i) / 3, (i - tail) / 3), wv = lineWidthAt(s, i / n) * Math.max(.15, edge) / 2;
    L2.push([p[0] - ty * wv, p[1] + tx * wv]); R2.push([p[0] + ty * wv, p[1] - tx * wv]);
  }
  g.fillStyle = s.ac ? P.ac : mixHex(P.bg, P.fg, .45);
  g.beginPath(); g.moveTo(L2[0][0], L2[0][1]);
  for (const p of L2) g.lineTo(p[0], p[1]);
  for (let i = R2.length - 1; i >= 0; i--) g.lineTo(R2[i][0], R2[i][1]);
  g.closePath(); g.fill();
}

/* şekil: kenarlarda süzülen daire, kare, üçgen, artı; pop ile girer, küçülerek çıkar, vuruşta nabız */
function shapeItem(VW, VH, e){
  const r = Math.random, m = Math.min(VW, VH), band = r();
  const x = band < .5 ? VW * (.05 + r() * .9) : (r() < .5 ? VW * (.03 + r() * .12) : VW * (.85 + r() * .12));
  const y = band < .5 ? (r() < .5 ? VH * (.06 + r() * .16) : VH * (.78 + r() * .16)) : VH * (.2 + r() * .6);
  return {x, y, size: m * (.02 + r() * .045) * (.8 + .4 * e), type: Math.floor(r() * 4), rot: r() * 6, vr: (r() - .5) * 1.2,
    vx: (r() - .5) * m * .02, vy: (r() - .5) * m * .02, fill: r() < .55, ac: r() < .6, age: 0, life: 6 + r() * 5};
}
function drawShapeItem(s, P, VW){
  const pin = easeBack(clamp(s.age / .5, 0, 1)), pout = 1 - easeOut(clamp((s.age - s.life + .6) / .6, 0, 1));
  const sz = s.size * pin * pout * (1 + L.beat * .15); if (sz < .5) return;
  const col = s.ac ? P.ac : mixHex(P.bg, P.fg, .4);
  g.save(); g.translate(s.x + s.vx * s.age, s.y + s.vy * s.age); g.rotate(s.rot + s.vr * s.age);
  g.beginPath();
  if (s.type === 0) g.arc(0, 0, sz, 0, 6.2832);
  else if (s.type === 1) g.rect(-sz * .85, -sz * .85, sz * 1.7, sz * 1.7);
  else if (s.type === 2){ for (let k = 0; k < 3; k++){ const a = k * 2.0944 - 1.5708; k ? g.lineTo(Math.cos(a) * sz, Math.sin(a) * sz) : g.moveTo(Math.cos(a) * sz, Math.sin(a) * sz); } g.closePath(); }
  else { const t = sz * .32; g.rect(-sz, -t, sz * 2, t * 2); g.rect(-t, -sz, t * 2, sz * 2); }
  if (s.fill || s.type === 3){ g.fillStyle = col; g.fill('nonzero'); }
  else { g.strokeStyle = col; g.lineWidth = Math.max(2, sz * .18); g.stroke(); }
  g.restore();
}
