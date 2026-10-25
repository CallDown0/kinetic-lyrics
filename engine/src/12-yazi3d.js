/* ---------- 3D yazı stilleri (three.js + troika yazısı, GSAP çizelgeleri) ----------
   Bu stillerde harfler gerçek 3D nesnedir: WebGL katmanında, sözlerin kamerasıyla birebir aynı kamerayla çizilir ve
   sinema efektlerinden geçer. Her blok bir düğüm ağacıdır (blok → sahne → kelime → harf → iç): düğümlerin CSS'e benzer
   değerleri (x, y, z px; rotationX/Y/Z derece; scale; autoAlpha) ve dönme merkezi vardır, GSAP onları düz nesne olarak
   oynatır, her karede matrise çevrilir. Zaman çizelgeleri duraklatılmış kurulur ve her karede şarkı saatine göre konumlanır
   (tl.time): sarma, duraklatma ve uykudan dönüş kendiliğinden doğru olur. Blok düzleminin yerel koordinatları
   (x sağa U, y aşağı V, z okura −N) dünyaya, dünya three'ye (x, −y, −z) çevrilir.
   Stiller: kup (kelimeler dönen küpün yüzlerinde), koridor (harfler derinden uçar, biten satır kameranın yanından geçer),
   sayfa (satır kâğıt gibi kenarından açılır ve çevrilip gider), sarmal (harfler dönen sarmal silindirde, söylenen öne döner),
   toplanma (uzayda süzülen harfler söylenince dönerek yerine kilitlenir), pano (havaalanı tabelası gibi takla atan harfler),
   sahneyle bütünleşenler: yildiz (galaksi), arazi (zeminden kalkan kelimeler). */
const G3 = new Map(); // blok → {root, st, tl, ws, ls, upd, fade}
const G3PRE = 1.2; // çizelgenin 0 anı satır başlangıcından bu kadar önce (süzülme / hazırlık için)
const D2R = Math.PI / 180;
const fbC = {};
function fbMet(font){ if (!fbC[font]){ g.font = font; const m = g.measureText('HÇg'); const a = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent * 1.25 || 90; fbC[font] = [a, m.fontBoundingBoxDescent || a * .3]; } return fbC[font]; }

// CSS 3D benzeri düğüm. Kutu: (left, top) köşesi, bw × bh boyutu; dönme merkezi (ox, oy) kutuya göre (varsayılan orta).
// Yerel matris = T(left, top) · T(o) · T(x, y, z) · Rz · Ry · Rx · S · base · T(−o)   (base: değişmeyen ek dönüşüm)
class N3 {
  constructor(parent, left, top, bw, bh){
    this.x = this.y = this.z = this.rotationX = this.rotationY = this.rotationZ = 0; this.scale = this.autoAlpha = this.opacity = 1;
    this.left = left || 0; this.top = top || 0; this.bw = bw || 0; this.bh = bh || 0; this.ox = this.bw / 2; this.oy = this.bh / 2;
    this.base = null; this.hidden = false; this.kids = []; this.mesh = null;
    if (parent) parent.kids.push(this);
  }
}
let Y3 = null; // three nesneleri (ilk kullanımda kurulur)
function y3Init(){
  if (Y3) return Y3.ok;
  const T3 = window.THREE, TT = window.TT;
  Y3 = {ok: false};
  if (!T3 || !TT || !window.KKFONTS || !bg3Init() || !B3.fxOk){ for (const k in STYLES) if (STYLES[k].dom) STYLES[k].auto = false; return false; }
  Y3.scene = new T3.Scene();
  Y3.cam = new T3.PerspectiveCamera(50, 16 / 9, 10, 2e5);
  Y3.m = [new T3.Matrix4(), new T3.Matrix4(), new T3.Matrix4(), new T3.Matrix4()];
  Y3.flip = new T3.Matrix4().makeScale(1, -1, 1);
  Y3.v = [new T3.Vector3(), new T3.Vector3(), new T3.Vector3()];
  Y3.mat = new T3.MeshBasicMaterial({side: T3.DoubleSide, transparent: true, depthWrite: false, toneMapped: false});
  // yazı katmanı: 2D dokunun üstünde, yalnız derinlik temizlenerek (3D sahnenin derinliği yazıyı örtmesin)
  Y3.clear = new window.PP.ClearPass(false, true, false);
  Y3.pass = new window.PP.RenderPass(Y3.scene, Y3.cam); Y3.pass.clearPass.enabled = false;
  const ps = B3.comp.passes, at = ps.indexOf(B3.pov) + 1;
  B3.comp.addPass(Y3.clear, at); B3.comp.addPass(Y3.pass, at + 1);
  // fontlar arka planda önceden işlenir: ilk 3D satırın ilk kelimesi font hazırlanırken kaybolmasın
  const CH = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZabcçdefgğhıijklmnoöprsştuüvyz0123456789';
  for (const k in window.KKFONTS) TT.preloadFont({font: window.KKFONTS[k], characters: CH}, () => {});
  return Y3.ok = true;
}
// w.font ("900 100px \"Big Shoulders Display\", …") → gömülü font (yoksa ailenin en yakın ağırlığı)
const fontUrlC = {};
function fontUrl(font){
  if (fontUrlC[font]) return fontUrlC[font];
  const m = /^(italic )?(\d+) 100px "([^"]+)"/.exec(font) || [], fam = (m[3] || 'Big Shoulders Display').replace(/ /g, '').toLowerCase();
  const wt = +(m[2] || 900), it = m[1] ? '-i' : '', keys = Object.keys(window.KKFONTS);
  let best = null, bd = 1e9;
  for (const k of keys){ const x = /^(.+)-(\d+)(-i)?$/.exec(k); if (!x || x[1] !== fam) continue; const d = Math.abs(+x[2] - wt) + ((x[3] || '') === it ? 0 : 500); if (d < bd){ bd = d; best = k; } }
  return fontUrlC[font] = window.KKFONTS[best || keys[0]];
}
// harf yazısı: taban çizgisi düğümün (0, asc) noktasında; three'nin y'si yukarı olduğu için çizimde dikeyde çevrilir
function y3Glyph(node, ch, font, size, asc){
  const t = new window.TT.Text();
  t.text = ch; t.font = fontUrl(font); t.fontSize = size; t.anchorX = 'left'; t.anchorY = 'bottom-baseline';
  t.material = Y3.mat; t.matrixAutoUpdate = false; t.frustumCulled = false; t.color = new window.THREE.Color(1, 1, 1);
  t.sync(); Y3.scene.add(t);
  node.mesh = t; node.asc = asc;
  return t;
}
const g3n = (parent, left, top, bw, bh) => new N3(parent, left, top, bw, bh);
function g3Build(b){
  const root = g3n(null, 0, 0, W, b.h), st = g3n(root, 0, 0, W, b.h);
  const ws = [], ls = [];
  for (const w of b.words){
    const we = g3n(st, 0, 0, W, b.h), [fa, fd] = fbMet(w.font), fs = 100 * w.s, bh = (fa + fd) * w.s;
    const wo = {w, el: we, ls: [], col: '', fs};
    w.chars.forEach((ch, i) => {
      const adv = ((i + 1 < w.chars.length ? w.offs[i + 1] : w.w100) - w.offs[i]) * w.s;
      const x = w.lx + w.offs[i] * w.s, y = w.base - fa * w.s;
      const ce = g3n(we, x, y, Math.max(1, adv), bh), ci = g3n(ce, 0, 0, Math.max(1, adv), bh);
      if (ch.trim()) y3Glyph(ci, ch, w.font, fs, fa * w.s);
      const lo = {el: ce, in: ci, ch, cur: ch, w, i, cx: x + adv / 2, cy: w.base - w.asc * w.s / 2, adv};
      wo.ls.push(lo); ls.push(lo);
    });
    ws.push(wo);
  }
  const o = {root, st, ws, ls, tl: gsap.timeline({paused: true}), upd: null, fade: 1};
  const nx = lineWords[b.li + 1], R = rngFrom(0xA5A5 ^ Math.imul(b.li + 1, 2654435761) ^ strHash(M.key || ''));
  const wt = w => w.t - b.t0 + G3PRE;
  const exitAt = nx && nx[0] ? nx[0].t - b.t0 + G3PRE : null;
  G3STYLE[b.style](b, o, wt, exitAt, R);
  o.tl.set({}, {}, (exitAt != null ? exitAt : wt(b.words[b.words.length - 1]) + 2) + 1.5); // çizelge sonu
  return o;
}
// kelime girişleri: koridor/sayfa/toplanma/pano stillerinde her kelime (karışık açıkken) bunlardan birini alır
const G3ENTER = ['derin', 'kalk', 'toplan', 'takla', 'don', 'dus'];
function g3Enter(o, wo, t, kind, R){
  const tl = o.tl, els = wo.ls.map(l => l.el), w = wo.w;
  if (kind === 'derin'){
    // derinden, hafif savrularak ve dönerek sırayla uçar
    wo.ls.forEach(l => tl.set(l.el, {z: -2200 - R() * 900, x: (R() - .5) * 500, y: (R() - .5) * 300, rotationY: (R() - .5) * 120, rotationX: (R() - .5) * 60, autoAlpha: 0}, 0));
    tl.to(els, {z: 0, x: 0, y: 0, rotationY: 0, rotationX: 0, autoAlpha: 1, duration: .55, ease: 'expo.out', stagger: Math.min(.03, .12 / els.length)}, Math.max(0, t - .1));
  } else if (kind === 'kalk'){
    // kelime yatık hâlden taban çizgisi üstünde kalkar
    wo.el.ox = w.lx + w.w / 2; wo.el.oy = w.base;
    tl.set(wo.el, {rotationX: -85, autoAlpha: 0}, 0);
    tl.to(wo.el, {rotationX: 0, autoAlpha: 1, duration: .5, ease: 'back.out(1.7)'}, Math.max(0, t - .06));
  } else if (kind === 'toplan'){
    // uzayda soluk süzülen harfler söylenince dönerek yerine kilitlenir
    const t1 = Math.max(.05, t - .08);
    wo.ls.forEach(l => tl.set(l.el, {x: (R() - .5) * W * 1.1, y: (R() - .5) * W * .6, z: -1500 + R() * 1700, rotationX: (R() - .5) * 360, rotationY: (R() - .5) * 360, rotationZ: (R() - .5) * 180, autoAlpha: .16}, 0));
    tl.to(els, {rotationZ: '+=50', z: '+=260', duration: t1, ease: 'none'}, 0);
    tl.to(els, {x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, autoAlpha: 1, duration: .55, ease: 'expo.out', stagger: {each: Math.min(.02, .1 / els.length), from: 'center'}}, t1);
  } else if (kind === 'takla'){
    // tabela: harfler birkaç kez takla atar, her taklada başka harf (pano'nun upd'si harfleri değiştirir)
    const F = .07, N = 2;
    wo.ls.forEach((l, i) => {
      l.f0 = Math.max(0, t - .08 + i * Math.min(.02, .1 / wo.ls.length)); l.f1 = l.f0 + F * (N + 1);
      l.el.oy = l.el.bh * .55;
      tl.set(l.el, {rotationX: -90, autoAlpha: 0}, 0);
      tl.set(l.el, {autoAlpha: 1}, l.f0);
      tl.fromTo(l.el, {rotationX: -90}, {rotationX: 0, duration: F, ease: 'power1.out', repeat: N, immediateRender: false}, l.f0);
    });
  } else if (kind === 'don'){
    // kelime dikey eksende neredeyse tam tur dönerek küçükten büyür
    wo.el.ox = w.lx + w.w / 2; wo.el.oy = w.base - w.asc * w.s / 2;
    tl.set(wo.el, {rotationY: -270, scale: .3, autoAlpha: 0}, 0);
    tl.to(wo.el, {rotationY: 0, scale: 1, autoAlpha: 1, duration: .5, ease: 'power3.out'}, Math.max(0, t - .12));
  } else {
    // harfler yukarıdan öne devrilerek düşer ve seker
    wo.ls.forEach(l => { l.el.oy = l.el.bh; tl.set(l.el, {y: -W * .5, rotationX: 120, autoAlpha: 0}, 0); });
    tl.to(els, {y: 0, rotationX: 0, autoAlpha: 1, duration: .5, ease: 'bounce.out', stagger: Math.min(.025, .1 / els.length)}, Math.max(0, t - .1));
  }
}
// pano'nun harf değiştirme döngüsü (takla girişli harfler)
function g3FlapUpd(o){
  const F = .07, POOL = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ0123456789';
  return lt => { for (const l of o.ls){
    let ch = l.ch;
    if (l.f0 != null && lt >= l.f0 && lt < l.f1 - F && l.ch.trim()){ const k = Math.floor((lt - l.f0) / F); ch = POOL[Math.floor(hash01(l.i * 131 + l.w.idx * 977 + k * 31) * POOL.length)]; if (!S.upper) ch = ch.toLocaleLowerCase('tr'); }
    if (ch !== l.cur && l.in.mesh){ l.cur = ch; l.in.mesh.text = ch; l.in.mesh.sync(); } } };
}
const G3STYLE = {
  kup(b, o, wt, exitAt){
    // her kelime küpün bir yüzünde (yüz i: rotateX(−90i) translateZ(d)); küp kelime başına 90° yuvarlanır
    const T3 = window.THREE, d = b.h / 2, n = o.ws.length;
    o.ws.forEach((wo, i) => { wo.el.base = new T3.Matrix4().makeRotationX(-90 * i * D2R).multiply(new T3.Matrix4().makeTranslation(0, 0, d)); });
    o.tl.set(o.st, {z: -d, rotationX: -90, autoAlpha: 0}, 0);
    o.tl.to(o.st, {rotationX: 0, autoAlpha: 1, duration: .45, ease: 'back.out(1.4)'}, Math.max(0, wt(o.ws[0].w) - .32));
    for (let i = 1; i < n; i++) o.tl.to(o.st, {rotationX: 90 * i, duration: .42, ease: 'back.out(1.5)'}, wt(o.ws[i].w) - .14);
    if (exitAt != null) o.tl.to(o.st, {rotationX: 90 * n, autoAlpha: 0, duration: .4, ease: 'power2.in'}, exitAt - .05);
    // yüzler dönerken ışık: öne bakan yüz parlak, yana dönen kararır; uzak yüzler gizli
    o.upd = () => { const r = o.st.rotationX;
      o.ws.forEach((wo, i) => { const a = (r - 90 * i) * D2R, c = Math.cos(a), v = c > .02 && Math.abs(a) < 2.2;
        wo.el.hidden = !v; if (v) wo.el.opacity = Math.pow(c, .7); }); };
  },
  koridor(b, o, wt, exitAt, R){
    // harfler koridorun derinliğinden, hafif yana savrularak ve dönerek sırayla uçar; biten satır kameranın yanından geçer
    for (const wo of o.ws) g3Enter(o, wo, wt(wo.w), wo.w.g3a || 'derin', R);
    if (o.ws.some(wo => wo.w.g3a === 'takla')) o.upd = g3FlapUpd(o);
    if (exitAt != null) o.tl.to(o.ls.map(l => l.el), {z: 1250, x: i => (o.ls[i].cx - W / 2) * 1.1, y: i => (o.ls[i].cy - b.h / 2) * 1.1, autoAlpha: 0, duration: .55, ease: 'power2.in', stagger: {each: .01, from: 'center'}}, exitAt - .3);
  },
  sayfa(b, o, wt, exitAt, R){
    // sayfa sol kenarından menteşeli: açılarak gelir, kelimeler alttan kalkarak yazılır, sonunda sayfa çevrilir
    o.st.ox = 0;
    o.tl.set(o.st, {rotationY: 100, autoAlpha: 0}, 0);
    o.tl.to(o.st, {rotationY: 0, autoAlpha: 1, duration: .9, ease: 'power3.out'}, Math.max(0, wt(o.ws[0].w) - .4));
    for (const wo of o.ws) g3Enter(o, wo, wt(wo.w), wo.w.g3a || 'kalk', R);
    if (o.ws.some(wo => wo.w.g3a === 'takla')) o.upd = g3FlapUpd(o);
    if (exitAt != null) o.tl.to(o.st, {rotationY: -110, autoAlpha: 0, duration: .7, ease: 'power2.in'}, exitAt - .4);
  },
  sarmal(b, o, wt, exitAt){
    // bütün harfler tek sırada sarmal bir silindire sarılır; söylenen kelime öne döner, sarmal onu dikeyde ortaya getirir
    const T3 = window.THREE, span = Math.PI * 2 * .82, gap = 30;
    let tot = 0; o.ws.forEach((wo, k) => { tot += wo.w.w100 + (k ? gap : 0); });
    const Rr = Math.max(W * .34, tot * 1.7 / span);
    const s0 = Math.min(span * Rr / tot, (b.h * .55) / 100, 2.6), pitch = b.h * .35 / Math.PI;
    let acc = 0; const wc = [];
    o.ws.forEach((wo, k) => {
      if (k) acc += gap;
      const w = wo.w, [fa, fd] = fbMet(w.font);
      wo.ls.forEach((l, i) => {
        const adv = ((i + 1 < w.chars.length ? w.offs[i + 1] : w.w100) - w.offs[i]) * s0, xc = (acc + w.offs[i]) * s0 + adv / 2;
        l.th = xc / Rr - span / 2;
        const e = l.el, bh = (fa + fd) * s0;
        e.left = W / 2 - adv / 2; e.top = b.h / 2 - fa * s0 + w.asc * s0 / 2; e.bw = l.in.bw = adv; e.bh = l.in.bh = bh;
        e.ox = l.in.ox = adv / 2; e.oy = l.in.oy = bh / 2;
        e.base = new T3.Matrix4().makeRotationY(l.th).multiply(new T3.Matrix4().makeTranslation(0, l.th * pitch, Rr));
        if (l.in.mesh){ l.in.mesh.fontSize = 100 * s0; l.in.asc = fa * s0; l.in.mesh.sync(); }
      });
      wc.push(((acc + w.w100 / 2) * s0) / Rr - span / 2);
      acc += w.w100;
    });
    const deg = th => -th * 180 / Math.PI;
    o.tl.set(o.st, {z: -Rr, rotationY: deg(wc[0]) + 70, y: -wc[0] * pitch, autoAlpha: 0}, 0);
    o.tl.to(o.st, {rotationY: deg(wc[0]), autoAlpha: 1, duration: .8, ease: 'power3.out'}, Math.max(0, wt(o.ws[0].w) - .45));
    o.ws.forEach((wo, k) => {
      if (k) o.tl.to(o.st, {rotationY: deg(wc[k]), y: -wc[k] * pitch, duration: .6, ease: 'power3.inOut'}, wt(wo.w) - .22);
      o.tl.set(wo.ls.map(l => l.in), {autoAlpha: 0, scale: .2, y: 40}, 0);
      o.tl.to(wo.ls.map(l => l.in), {autoAlpha: 1, scale: 1, y: 0, duration: .45, ease: 'back.out(2.2)', stagger: .03}, Math.max(0, wt(wo.w) - .04));
    });
    if (exitAt != null) o.tl.to(o.st, {rotationY: '-=150', scale: 1.25, autoAlpha: 0, duration: .65, ease: 'power2.in'}, exitAt - .35);
    // arkada kalan harfler soluk (ayna görüntüsü), yana dönenler kararır
    o.upd = () => { const r = o.st.rotationY * D2R; for (const l of o.ls){ const c = Math.cos(l.th + r); l.el.opacity = c > 0 ? .3 + .7 * c : .14; } };
  },
  toplanma(b, o, wt, exitAt, R){
    // harfler uzayda dağınık ve soluk süzülür; kelime söylenince her harf dönerek yerine kilitlenir, sonunda dağılır
    for (const wo of o.ws) g3Enter(o, wo, wt(wo.w), wo.w.g3a || 'toplan', R);
    if (o.ws.some(wo => wo.w.g3a === 'takla')) o.upd = g3FlapUpd(o);
    if (exitAt != null) o.tl.to(o.ls.map(l => l.el), {x: () => (R() - .5) * W * 1.4, y: () => (R() - .5) * W * .8, z: () => 300 + R() * 700, rotationX: () => (R() - .5) * 540, rotationY: () => (R() - .5) * 540, autoAlpha: 0, duration: .6, ease: 'power3.in', stagger: {each: .008, from: 'random'}}, exitAt - .32);
  },
  pano(b, o, wt, exitAt, R){
    // havaalanı tabelası: her harf yatay eksende birkaç kez takla atar, her taklada başka harf görünür, sonra yerine oturur
    for (const wo of o.ws) g3Enter(o, wo, wt(wo.w), wo.w.g3a || 'takla', R);
    if (exitAt != null) o.tl.to(o.ls.map(l => l.el), {rotationX: 90, autoAlpha: 0, duration: .25, ease: 'power2.in', stagger: .016}, exitAt - .3);
    o.upd = g3FlapUpd(o);
  },
  yildiz(b, o, wt, exitAt, R){
    // harfler derinlikte yıldız gibi dağınık parlar; kelime söylenince her harf sarmal çizerek yerine akar, satır bitince
    // sarmal kollar boyunca kameranın yanından savrulup gider (konum upd'de sp.p'den hesaplanır: 0 yıldız, 1 yerinde, 2 gitti)
    for (const l of o.ls){ l.sp = {p: 0}; l.a0 = R() * 6.2832; l.r0 = 250 + R() * 900; l.z0 = -1200 - R() * 2600; l.tw = R() * 6.2832; }
    for (const wo of o.ws){
      const t = wt(wo.w), n = wo.ls.length;
      wo.ls.forEach((l, i) => {
        o.tl.to(l.sp, {p: .12, duration: Math.max(.05, t - .5), ease: 'none'}, 0);
        o.tl.to(l.sp, {p: 1, duration: .7, ease: 'power3.out'}, Math.max(.05, t - .35 + i * Math.min(.025, .12 / n)));
      });
    }
    if (exitAt != null) o.ls.forEach((l, i) => o.tl.to(l.sp, {p: 2, duration: .8, ease: 'power2.in'}, exitAt - .4 + (i % 7) * .012));
    o.upd = lt => { for (const l of o.ls){
      const q = l.sp.p, e = l.el;
      if (q <= 1){
        const k = 1 - q, a = l.a0 + k * 4.5;
        e.x = Math.cos(a) * l.r0 * k; e.y = Math.sin(a) * l.r0 * k * .55; e.z = l.z0 * k; e.rotationZ = k * 200;
        e.scale = .18 + .82 * q * q; e.autoAlpha = (.3 + .7 * q) * (q < .99 ? .75 + .25 * Math.sin(lt * 5 + l.tw) : 1);
      } else {
        const k = q - 1, a = l.a0 - k * 2.5;
        e.x = Math.cos(a) * l.r0 * k * 1.6; e.y = Math.sin(a) * l.r0 * k; e.z = k * 1500; e.rotationZ = -k * 120;
        e.scale = 1; e.autoAlpha = 1 - k;
      } } };
  },
  arazi(b, o, wt, exitAt, R){
    // kelimeler zeminde yatık durur, sırası gelen taban çizgisi üstünde ayağa kalkar; kelimeler derinlik boyunca sağa sola
    // dizilidir, kamera kelimeden kelimeye ileri uçar, geçilen kelimeler kameranın yanından geride kalıp söner
    const Dz = 1100, gy = b.h * .6;
    let side = R() < .5 ? 1 : -1;
    const pos = o.ws.map((wo, k) => { const x = k ? side * (W * .22 + R() * W * .08) : 0; if (k) side = -side; return {x, s: clamp((W * .55) / Math.max(1, wo.w.w), .6, 1.5)}; });
    o.ws.forEach((wo, k) => {
      const w = wo.w, e = wo.el, p = pos[k];
      e.left = W / 2 + p.x - (w.lx + w.w / 2); e.top = gy - w.base; e.z = -k * Dz; e.scale = p.s;
      e.ox = w.lx + w.w / 2; e.oy = w.base;
      o.tl.set(e, {rotationX: -88, autoAlpha: .35}, 0);
      o.tl.to(e, {rotationX: 0, autoAlpha: 1, duration: .55, ease: 'back.out(1.6)'}, Math.max(0, wt(w) - .15));
    });
    o.st.ox = W / 2; o.st.oy = gy;
    o.tl.set(o.st, {x: -pos[0].x, z: 0}, 0);
    o.ws.forEach((wo, k) => { if (k) o.tl.to(o.st, {x: -pos[k].x, z: k * Dz, duration: .7, ease: 'power3.inOut'}, wt(wo.w) - .45); });
    if (exitAt != null) o.tl.to(o.st, {z: '+=' + Dz, autoAlpha: 0, duration: .6, ease: 'power2.in'}, exitAt - .35);
    o.upd = () => { o.ws.forEach((wo, k) => { const zr = o.st.z - k * Dz; wo.el.opacity = zr > 0 ? clamp(1 - zr / (Dz * .7), 0, 1) : 1; }); };
  }
};
function g3Dispose(o){ o.tl.kill(); for (const l of o.ls) if (l.in.mesh){ Y3.scene.remove(l.in.mesh); l.in.mesh.dispose(); } }

// düğüm ağacını matrise çevirir: P (üst matris, blok yerelinden three dünyasına), a (üstten gelen saydamlık), d derinlik.
// Geçici matrisler derinlik başına bir kez üretilir (her karede yüzlerce nesne çöp toplayıcıyı tetikleyip takılma yapıyordu).
const G3MS = [], G3P = {v: null, near: 0};
function g3Apply(n, P, a, col, d){
  const T3 = window.THREE; d = d || 0;
  const M0 = G3MS[d * 2] || (G3MS[d * 2] = new T3.Matrix4()), M1 = G3MS[d * 2 + 1] || (G3MS[d * 2 + 1] = new T3.Matrix4());
  a *= n.autoAlpha * n.opacity;
  const vis = !n.hidden && a > .005;
  M0.copy(P).multiply(M1.makeTranslation(n.left + n.ox, n.top + n.oy, 0)).multiply(M1.makeTranslation(n.x, n.y, n.z));
  if (n.rotationZ) M0.multiply(M1.makeRotationZ(n.rotationZ * D2R));
  if (n.rotationY) M0.multiply(M1.makeRotationY(n.rotationY * D2R));
  if (n.rotationX) M0.multiply(M1.makeRotationX(n.rotationX * D2R));
  if (n.scale !== 1) M0.multiply(M1.makeScale(n.scale, n.scale, n.scale));
  if (n.base) M0.multiply(n.base);
  M0.multiply(M1.makeTranslation(-n.ox, -n.oy, 0));
  if (n.mesh){
    const t = n.mesh; t.visible = vis;
    if (vis){ t.matrix.copy(M0).multiply(M1.makeTranslation(0, n.asc, 0)).multiply(Y3.flip);
      // kameraya çok yaklaşan harf söner, iki katı boyuna ulaşmadan (çıkışta kameranın içinden geçen harfler ekranı kaplamasın)
      const p = G3P.v.setFromMatrixPosition(t.matrix).applyMatrix4(Y3.cam.matrixWorldInverse), vz = -p.z;
      const k = clamp((vz - G3P.near * .45) / (G3P.near * .25), 0, 1); t.visible = k > .01; t.fillOpacity = a * k; if (t.curCol !== col){ t.curCol = col; t.color.setHex(parseInt(col.slice(1), 16), T3.LinearSRGBColorSpace); } }
  }
  for (const k of n.kids) g3Apply(k, M0, vis ? a : 0, n.col || col, d + 1);
}
// blok yerelinden (x sağa U, y aşağı V, z okura −N; px) three dünyasına: dünya = C + U(x − W/2) + V(y − h/2) − N z → (x, −y, −z)
function g3BlockMatrix(b, M){
  const U = b.U, V = b.V, N = b.N, O = bpt(b, 0, 0);
  M.set(U[0], V[0], -N[0], O[0],
       -U[1], -V[1], N[1], -O[1],
       -U[2], -V[2], N[2], -O[2],
        0, 0, 0, 1);
  return M;
}
// yazı kamerası = sözlerin kamerası (aynı göz, yön, odak uzaklığı ve ekran kayması)
function y3Camera(){
  const c = Y3.cam, v = Y3.v, VW = cv.width, VH = cv.height;
  if (!CAM.eye || !finite3(CAM.eye) || !finite3(CAM.f)) return false;
  c.position.set(CAM.eye[0], -CAM.eye[1], -CAM.eye[2]);
  v[0].set(CAM.r[0], -CAM.r[1], -CAM.r[2]); v[1].set(CAM.up[0], -CAM.up[1], -CAM.up[2]); v[2].set(-CAM.f[0], CAM.f[1], CAM.f[2]);
  c.quaternion.setFromRotationMatrix(Y3.m[2].makeBasis(v[0], v[1], v[2]));
  c.fov = 2 * Math.atan(VH / 2 / (CAM.F * CAM.zoom)) / D2R; c.aspect = VW / VH;
  c.setViewOffset(VW, VH, -(SX + VOX), -(SY + VOY), VW, VH);
  c.updateMatrixWorld(); c.updateProjectionMatrix();
  return true;
}
function g3Frame(T){
  const want = new Set(), li = curLine;
  if (HAS_G3 && mode !== 'idle' && POSTER === 0 && y3Init()) for (const b of [blocks[li - 1], blocks[li]]) if (b && STYLES[b.style].dom && T >= b.t0 - G3PRE) want.add(b);
  // artık gerekmeyen blok 0.3 sn'de söner, sonra silinir
  for (const [b, o] of G3) if (!want.has(b) && !o.dying){ o.dying = true; gsap.to(o, {fade: 0, duration: .3, ease: 'power1.out', onComplete: () => { G3.delete(b); g3Dispose(o); }}); }
  if (Y3 && Y3.ok) Y3.pass.enabled = Y3.clear.enabled = G3.size > 0 || want.size > 0;
  if (!G3.size && !want.size) return;
  if (!y3Camera()) return;
  const ai = activeIndex(T), P = pal(li), acc = contrast(P.ac, P.bg) >= 2.5 ? P.ac : P.fg;
  for (const b of want){
    let o = G3.get(b); if (!o){ o = g3Build(b); G3.set(b, o); }
    const lt = Math.max(.001, T - b.t0 + G3PRE + EARLY);
    o.tl.time(Math.min(lt, o.tl.duration()));
    if (o.upd) o.upd(lt);
    const Pb = TH.perLine ? pal(b.li) : P;
    for (const wo of o.ws) wo.el.col = wo.w.colk != null ? mcol(Pb, wo.w.colk) : wo.w.idx === ai ? (TH.perLine ? (contrast(Pb.ac, Pb.bg) >= 2.5 ? Pb.ac : Pb.fg) : acc) : Pb.fg;
  }
  // sönme mesafesi: kameranın satır düzlemine uzaklığı
  G3P.v = G3P.v || new window.THREE.Vector3();
  for (const [b, o] of G3){ G3P.near = Math.max(200, vdot(vsub(b.C, CAM.eye), CAM.f)); g3Apply(o.root, g3BlockMatrix(b, Y3.m[0]), o.fade, '#ffffff'); }
}
