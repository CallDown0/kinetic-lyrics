/* ---------- kamera (3D, tek düğüm, kritik sönümlü yay) ---------- */
const CAM = {p: null, t: null, u: null, vp: [0,0,0], vt: [0,0,0], vu: [0,0,0], f: [0,0,1], r: [1,0,0], up: [0,-1,0], F: 1000, pull: 0};
const FOV = .9;
function activeIndex(T){
  let a = 0, b = words.length - 1, r = -1;
  while (a <= b){ const m = (a + b) >> 1; if (words[m].t <= T){ r = m; a = m + 1; } else b = m - 1; }
  return r;
}
// en fazla bir kelime önden hazırlık: sıradaki kelimenin satırı LEAD sn önce kurulur ve kamera yola çıkar;
// kelime yine tam zamanında belirir, eski satır kamera giderken ekranda kalır (boş ekran yok)
const LEAD = .28; // kamera vuruşa otursun diye çok az erken kalkar; fazlası eski satır çıkıp yeni gelmeden boş kare yapar
function frontIdx(T){ const ai = activeIndex(T), n = ai + 1; return n < words.length && T >= words[n].t - LEAD ? n : Math.max(0, ai); }
// şarkı sonu posteri: kamera bütün satırları tek kadraja alacak kadar geri çekilir (hafif yörüngeyle)
let POSTER = 0;
function posterGoal(T, VW, VH){
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const b of blocks) if (b){ x0 = Math.min(x0, b.cx - b.hw); x1 = Math.max(x1, b.cx + b.hw); y0 = Math.min(y0, b.cy - b.hh); y1 = Math.max(y1, b.cy + b.hh); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, asp = VW / VH;
  const d = Math.max((x1 - x0) / 2 / asp, (y1 - y0) / 2) / Math.tan(FOV / 2) * 1.12;
  const yo = Math.sin(T * .15) * .08, back = vrot([0, 0, -1], [0, 1, 0], yo);
  return {p: vadd([cx, cy, 0], vmul(back, d)), t: [cx, cy, 0], u: [0, -1, 0]};
}
function camGoal(T, VW, VH){
  if (POSTER > 0) return posterGoal(T, VW, VH);
  // sesten biraz önce kalk: hedef 0.12 sn ileriden seçilir
  // satır içinde kamera sıradaki kelimeye CAMLEAD sn önce döner (kelime söylenirken kadrajda olsun); satır geçişi LEAD ile
  let ai = frontIdx(T); { const a0 = activeIndex(T), nx = words[a0 + 1]; if (a0 >= 0 && nx && nx.li === words[a0].li && T >= nx.t - CAMLEAD) ai = a0 + 1; }
  const w = words[ai], b = ensureBlock(w.li);
  const single = STYLES[b.style].single || STYLES[b.style].whole || STYLES[b.style].dom || b.style === 'kilit';
  let f = mode === 'idle' || single ? 0 : .15 + .35 * S.move, fk = .5, dW = W / 2;
  // kelime kelime kamera: her kelimeye tam odak; satırın son kelimesinden biraz sonra geri çekilip bütün kompozisyon
  CAMK = b.layout === 'kamera' && mode !== 'idle' ? 2.2 : 1.45; // okunurluk: kamera kelimeye/satıra çabuk varır
  if (b.layout === 'kamera' && mode !== 'idle'){ f = w.wi === b.words.length - 1 && T - w.t > .7 ? 0 : 1; fk = 1; dW = Math.max(w.w * .62, W * .2); }
  // merdiven uzun bir çapraz: kamera basamakları izler (söylenen kelime ve çevresi kadrajda), satır sonunda bütün merdiven
  else if (b.layout === 'dikey' && mode !== 'idle') f = .1;
  else if (b.layout === 'satir' && mode !== 'idle' && b.words.length > 1) f = Math.min(f, .24); // kilit bir bütün: sıraya fazla yakınlaşıp üst/alt sırayı kesme
  else if (b.layout === 'merdiven' && mode !== 'idle'){ f = w.wi === b.words.length - 1 && T - w.t > .7 ? 0 : .8; fk = 1; dW = Math.max(w.w * .75, W * .38); }
  // kelime kelime kamerada dönük kelimeye gelince kamera yan yatar (kelime ekranda yatay okunur)
  const roll = b.layout === 'kamera' && f > 0 && w.rot ? w.rot : 0, swap = Math.abs(Math.sin(roll)) > .7;
  const fx = lerp(W / 2, w.lx + w.w / 2, f * fk), fy = lerp(b.h / 2, w.y + w.h / 2, f);
  const tgt = bpt(b, fx, fy);
  // bölünmüş ekranda ana sahne sağ yarıya sığar
  const tan = Math.tan(FOV / 2), asp = VW / (1 + SPLS) / (VH * (VOY ? .82 : 1));
  const marg = asp < .9 ? 1.14 : 1.25; // dikey ekranda dar kenar boşluğu (yazı genişliğe dayalı, büyük kalsın)
  const dBlock = (swap ? Math.max(b.h / 2 / asp, W / 2) : Math.max(W / 2 / asp, b.h / 2)) / tan * marg;
  const dRow = Math.max(dW / asp, w.h * 1.1) / tan * marg;
  let d = Math.exp(lerp(Math.log(dBlock), Math.log(Math.min(dBlock, dRow)), f));
  // etkin kamera: satır boyunca yavaşça yaklaşır (itme), her kelimede hafif eğik açı (Hollanda açısı) ve yörünge
  const nb = lineWords[b.li + 1], span = Math.max(.8, (nb && nb[0] ? nb[0].t : b.words[b.words.length - 1].t + 1.5) - b.t0);
  if (mode !== 'idle' && b.layout !== 'kamera') d *= 1 - (b.layout === 'merdiven' ? .1 : .06) * S.move * easeOut(clamp((T - b.t0) / span, 0, 1)); // bütün blok kadrajda kalacak kadar
  const dutch = mode === 'idle' ? 0 : (hash01(w.idx * 2654435761 + 7) - .5) * .13 * S.move * (b.chorus ? 1.4 : 1);
  // sürekli hafif yörünge (3D parallax), enerjiyle büyür
  const e = energy(), yo = Math.sin(T * .21) * (.09 + .16 * e) * S.rot, po = Math.sin(T * .16 + 1) * (.06 + .1 * e) * S.rot;
  let back = vmul(b.N, -1); back = vrot(back, b.V, yo); back = vrot(back, b.U, po);
  return {p: vadd(tgt, vmul(back, d)), t: tgt, u: vrot(vmul(b.V, -1), b.N, ROLLS * roll + dutch)};
}
const CAMLEAD = .32;
let CAMK = 1; // kamera yayının çevikliği (kelime kelime kamerada kamera kelimeye çabuk varır)
const ROLLS = 1; // kamera yan yatma yönü (kelimenin dönüşüyle aynı yönde: yazı ekranda yatay)
const finite3 = v => v && isFinite(v[0]) && isFinite(v[1]) && isFinite(v[2]);
function camStep(T, dt, VW, VH){
  let G = camGoal(T, VW, VH);
  if (!finite3(G.p) || !finite3(G.t) || !finite3(G.u)){
    if (!CAM.bad){ CAM.bad = true; const w = words[frontIdx(T)]; diag('nan', {li: w && w.li, st: w && blocks[w.li] && blocks[w.li].style}); }
    G = CAM.p && finite3(CAM.p) ? {p: CAM.p.slice(), t: CAM.t.slice(), u: CAM.u.slice()} : {p: [0, 0, -1000], t: [0, 0, 0], u: [0, -1, 0]};
  } else CAM.bad = false;
  if (CAM.p && !(finite3(CAM.p) && finite3(CAM.t) && finite3(CAM.u) && finite3(CAM.vp))) snapCam = true;
  if (snapCam || !CAM.p){ CAM.p = G.p; CAM.t = G.t; CAM.u = G.u; CAM.vp = [0,0,0]; CAM.vt = [0,0,0]; CAM.vu = [0,0,0]; CAM.pull = 0; snapCam = false; }
  else {
    const om = 2 * Math.PI * (.35 + .6 * S.move) * clamp(L.bpm / 120, .8, 1.25) * CAMK, steps = Math.ceil(dt / .01), h = dt / steps;
    const spring = (x, v, g) => { for (let k = 0; k < 3; k++){ v[k] += (om * om * (g[k] - x[k]) - 2 * om * v[k]) * h; x[k] += v[k] * h; } };
    for (let i = 0; i < steps; i++){ spring(CAM.p, CAM.vp, G.p); spring(CAM.t, CAM.vt, G.t); spring(CAM.u, CAM.vu, G.u); }
  }
  // yolculukta geri çekil (yay çizen hareket): hız arttıkça kamera geriye açılır
  const sp = vlen(CAM.vt), goal = Math.min(sp * .22, 900);
  CAM.pull += (goal - CAM.pull) * Math.min(1, dt * 4);
  // sağ = ileri × yukarı (dünyada y aşağı); yukarı = sağ × ileri
  const f = vnorm(vsub(CAM.t, CAM.p)), r = vnorm(vcross(f, vnorm(CAM.u))), u = vcross(r, f);
  CAM.f = f; CAM.r = r; CAM.up = u; CAM.F = VH / (2 * Math.tan(FOV / 2));
  CAM.eye = vsub(CAM.p, vmul(f, CAM.pull));
}
let SX = 0, SY = 0, XF = 0, XFL = 0; // XF: karede başarılı çizim dönüşümü sayısı (test)
let VOY = 0; // çeviri açıkken sahnenin dikey kayması (px): alt şerit çeviriye kalır
let VOX = 0, SPLS = 0; // bölünmüş ekran: görüntü merkezinin yatay kayması (px) ve açıklık (0–1)
// fare: imleç yakınındaki kelime ekranda imleçten uzağa itilir (PX/PY, setXform'a eklenir), imleç gidince yaylanıp döner
let PX = 0, PY = 0;
const MOUSE = {x: -1e4, y: -1e4, t: -99};
addEventListener('mousemove', ev => { MOUSE.x = ev.clientX * cv.width / innerWidth; MOUSE.y = ev.clientY * cv.height / innerHeight; MOUSE.t = nowS(); });
function mousePush(b, w){
  PX = PY = 0;
  if (!S.mouse) return;
  let tx = 0, ty = 0;
  if (nowS() - MOUSE.t < 2.5){
    // uzaklık kelimenin ekrandaki kutusuna (içindeyse 0); itme yönü imleçten kelime merkezine
    const q = [bpt(b, w.lx, w.y), bpt(b, w.lx + w.w, w.y), bpt(b, w.lx + w.w, w.y + w.h), bpt(b, w.lx, w.y + w.h)].map(proj);
    if (q.every(Boolean)){
      const xs = q.map(p => p[0]), ys = q.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const R = Math.min(cv.width, cv.height) * .22, d = Math.hypot(Math.max(x0 - MOUSE.x, 0, MOUSE.x - x1), Math.max(y0 - MOUSE.y, 0, MOUSE.y - y1));
      if (d < R){ const dx = (x0 + x1) / 2 - MOUSE.x, dy = (y0 + y1) / 2 - MOUSE.y, l = Math.hypot(dx, dy) || 1, mag = Math.pow(1 - d / R, 2) * R * .45; tx = dx / l * mag; ty = dy / l * mag; }
    }
  }
  // yaylı yaklaşma (biraz salınarak geri döner)
  w.pvx = (w.pvx || 0) * Math.exp(-RDT * 9) + (tx - (w.px || 0)) * RDT * 60; w.pvy = (w.pvy || 0) * Math.exp(-RDT * 9) + (ty - (w.py || 0)) * RDT * 60;
  w.px = (w.px || 0) + w.pvx * RDT; w.py = (w.py || 0) + w.pvy * RDT;
  PX = w.px; PY = w.py;
}
function proj(p){
  const d = vsub(p, CAM.eye), z = vdot(d, CAM.f);
  if (z < 15) return null;
  const k = CAM.F * CAM.zoom / z;
  return [cv.width / 2 + SX + VOX + vdot(d, CAM.r) * k, cv.height / 2 + SY + VOY - vdot(d, CAM.up) * k, z];
}
// yerel yazı koordinatı (100 px yazı) → ekran afin dönüşümü. A: çapa (dünya), U/V: eksenler, s: birim/px, pv: pivot px
let WR = null; // çizilen kelimenin dönüşü: {ang, c (dünya merkezi)}; drawWord kurar, setXform uygular
function setXform(A, U, V, s, pvx, pvy){
  let P = vadd(A, vadd(vmul(U, pvx * s), vmul(V, pvy * s)));
  if (WR){ const n = vnorm(vcross(U, V)); P = vadd(WR.c, vrot(vsub(P, WR.c), n, WR.ang)); U = vrot(U, n, WR.ang); V = vrot(V, n, WR.ang); }
  const c = proj(P); if (!c) return null;
  const k = 60, cu = proj(vadd(P, vmul(U, k * s))), cvv = proj(vadd(P, vmul(V, k * s)));
  if (!cu || !cvv) return null;
  const a = (cu[0] - c[0]) / k, b = (cu[1] - c[1]) / k, cc = (cvv[0] - c[0]) / k, d = (cvv[1] - c[1]) / k;
  if (Math.abs(a * d - b * cc) > 900) return null; // kameraya çok yakın
  XF++;
  g.setTransform(a, b, cc, d, c[0] - a * pvx - cc * pvy + PX, c[1] - b * pvx - d * pvy + PY);
  return Math.sqrt(Math.abs(a * d - b * cc)); // ekran px / yazı px
}
