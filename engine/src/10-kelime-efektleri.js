/* ---------- uzatılan hece: şarkıcı satır sonundaki kelimeyi uzatırken son sesli harf gerilir ---------- */
// sesli harf yatayda uzar (uzatma boyunca 1 → 3,4 kat), sonraki harfler kayar; yer yoksa bütün kelime yatayda sıkışır.
// harf vokale göre hafif titrer (vibrato).
const VOWELS = /[aeıioöuüâîûAEIİOÖUÜÂÎÛ]/;
function drawHold(w, age, b){
  if (!S.hold || !w.hold) return false;
  const t0 = .25, s = easeOut(clamp((age - t0) / Math.max(.4, w.hold - t0), 0, 1)); if (s <= 0) return false;
  let vi = -1; for (let i = w.chars.length - 1; i >= 0; i--) if (VOWELS.test(w.chars[i])){ vi = i; break; }
  if (vi < 0) return false;
  const n = w.chars.length, cw = (vi + 1 < n ? w.offs[vi + 1] : w.w100) - w.offs[vi];
  // sağdaki boş yer (yerel yazı birimi): tek kelimelik stillerde kelime ortalı, iki yana da yer var
  const room = Math.max(0, (W * .985 - (w.lx + w.w)) / w.s) + (b && STYLES[b.style].single ? w.lx / w.s : 0);
  // yer yoksa uzama kısılır: kelime en fazla %25 sıkışır (diğer harfler okunur kalsın)
  const extra = Math.min(cw * 2.4 * s, room + w.w100 * .33 * s), k = 1 + extra / Math.max(1, cw);
  const fx = extra > room ? (w.w100 + room) / (w.w100 + extra) : 1, A = w.asc, H = A + w.desc;
  const vib = Math.sin(age * 32) * H * .012 * (.4 + FQ.mi);
  const tx = b && STYLES[b.style].single && fx === 1 ? -Math.min(extra, w.lx / w.s) / 2 : 0;
  g.save(); if (tx) g.translate(tx, 0); g.scale(fx, 1);
  for (let i = 0; i < n; i++){
    if (i < vi) g.fillText(w.chars[i], w.offs[i], 0);
    else if (i > vi) g.fillText(w.chars[i], w.offs[i] + extra, 0);
    else { g.save(); g.translate(w.offs[i], vib); g.scale(k, 1); g.fillText(w.chars[i], 0, 0); g.restore(); }
  }
  g.restore();
  return true;
}
/* ---------- kelime görüntüsü (çıkış efektleri parça parça çizer) ---------- */
// k: yerel yazı birimi başına piksel; görüntü kelimeye bağlı saklanır (renk ya da çözünürlük değişirse yeniden çizilir)
function wordSprite(w, col, k){
  const key = col + '|' + k; if (w.spr && w.sprKey === key) return w.spr;
  const pad = 14, cw = Math.max(1, Math.ceil((w.w100 + pad * 2) * k)), ch = Math.max(1, Math.ceil((w.asc + w.desc + pad * 2) * k));
  const c = w.spr && w.spr.width >= cw && w.spr.height >= ch ? w.spr : document.createElement('canvas');
  c.width = cw; c.height = ch;
  const x = c.getContext('2d'); x.setTransform(k, 0, 0, k, pad * k, (pad + w.asc) * k); x.font = w.font; x.fillStyle = col; x.fillText(w.text, 0, 0);
  w.spr = c; w.sprKey = key; w.sprPad = pad; w.sprK = k; return c;
}
function drawPosterBlock(b, T, P, e){
  // satırın son hâli: bütün kelimeler (tek kelimelik stillerde yalnız sonuncusu), poster belirdikçe görünür
  const list = STYLES[b.style].single ? [b.words[b.words.length - 1]] : b.words;
  for (const w of list){ w.chorus = b.chorus; drawWord(b, w, T, P, 1, POSTER, e, 0, null); PX = PY = 0; }
  if (b.cap && setXform(bpt(b, b.cap.x, b.cap.base), b.U, b.V, b.cap.s, 0, 0)){ g.font = fontStr(false); g.globalAlpha = POSTER * .85; g.fillStyle = P.fg; g.fillText(b.cap.text, 0, 0); }
}
/* ---------- çıkış efektleri: yeni satır başlayınca eski satır EXD sn içinde gösteriyle gider ---------- */
const EXD = 1, EXL = .35;
function drawExit(b, T, q, P){
  const list = STYLES[b.style].single ? [b.words.filter(w => w.t <= T).pop() || b.words[b.words.length - 1]] : b.words;
  for (const w of list){
    const A = w.asc, D = w.desc, H = A + D, n = w.chars.length, col = P.fg;
    const scr = setXform(bpt(b, w.lx, w.base), b.U, b.V, w.s, 0, 0); if (!scr) continue;
    g.font = w.font; g.fillStyle = col;
    // ekranın aşağı yönü yerel yazı uzayında (satır dönük olsa da parçalar ekranda aşağı düşer)
    const m = g.getTransform(), det = (m.a * m.d - m.b * m.c) || 1; let gx = -m.c / det, gy = m.a / det; const gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl;
    if (b.exit === 'kum' || b.exit === 'erime'){
      // görüntü bir kez çizilir, parçaları drawImage ile taşınır (harf başına fillText'ten çok ucuz)
      if (!w.exK) w.exK = clamp(Math.round(scr * 2) / 2, 1, Math.min(4, 4096 / (w.w100 + 28)));
      const k = w.exK, spr = wordSprite(w, col, k), pad = w.sprPad, x0 = -pad, y0 = -A - pad, BW = w.w100 + 2 * pad, BH = H + 2 * pad;
      if (b.exit === 'kum'){
        // kum: soldan sağa doğru taneler kopar, rüzgârla sağa ve yukarı savrulur, küçülerek kaybolur
        const cols = clamp(Math.round(n * 4.5), 10, 34), rows = 6, cw = BW / cols, ch = BH / rows;
        for (let i = 0; i < cols; i++){
          const cd = i / cols * .5;
          if (q <= cd){ g.globalAlpha = 1; g.drawImage(spr, i * cw * k, 0, cw * k, spr.height, x0 + i * cw, y0, cw + .3, BH); continue; }
          for (let j = 0; j < rows; j++){
            const h1 = hash01(w.idx * 131 + i * 17 + j * 7), pc = clamp((q - cd - h1 * .12) / .45, 0, 1), x = x0 + i * cw, y = y0 + j * ch;
            if (pc <= 0){ g.globalAlpha = 1; g.drawImage(spr, i * cw * k, j * ch * k, cw * k, ch * k, x, y, cw + .3, ch + .3); continue; }
            const wind = pc * pc * (H * 1.4 + h1 * H * 2.2), lift = pc * H * (.3 + h1 * .9) - Math.sin(pc * 6 + h1 * 9) * H * .08, sz = 1 - pc * .7;
            g.globalAlpha = 1 - pc;
            g.drawImage(spr, i * cw * k, j * ch * k, cw * k, ch * k, x + wind - gx * lift + cw * (1 - sz) / 2, y - gy * lift + ch * (1 - sz) / 2, cw * sz, ch * sz);
          }
        }
      } else {
        // erime: dikey şeritler farklı hızlarda aşağı akıp uzar, sonda söner
        const st = clamp(Math.round(n * 6), 12, 44), sw = BW / st, fade = 1 - clamp((q - .65) / .35, 0, 1);
        for (let i = 0; i < st; i++){
          const h1 = hash01(w.idx * 71 + i * 13), dq = clamp((q - h1 * .15) / .85, 0, 1), drip = dq * dq * (.55 + h1 * .9);
          g.globalAlpha = fade;
          g.drawImage(spr, i * sw * k, 0, sw * k, spr.height, x0 + i * sw, y0 + drip * H * .5, sw + .4, BH * (1 + drip * 1.2));
        }
      }
      continue;
    }
    if (b.exit === 'domino'){
      // harfler soldan sağa sırayla sağ alt köşelerinin üstünde devrilir, sonra aşağı düşüp söner
      for (let i = 0; i < n; i++){
        const pi = clamp((q - i / n * .4) / .38, 0, 1), cw = (i + 1 < n ? w.offs[i + 1] : w.w100) - w.offs[i];
        if (pi <= 0){ g.globalAlpha = 1; g.fillText(w.chars[i], w.offs[i], 0); continue; }
        const ang = Math.pow(Math.min(1, pi * 1.3), 2) * Math.PI / 2, drop = pi > .77 ? Math.pow((pi - .77) / .23, 2) * H * 1.2 : 0, px = w.offs[i] + cw;
        g.save(); g.globalAlpha = 1 - clamp((pi - .7) / .3, 0, 1); g.translate(px, D + drop); g.rotate(ang); g.translate(-px, -D); g.fillText(w.chars[i], w.offs[i], 0); g.restore();
      }
      continue;
    }
    if (b.exit === 'kirilma'){
      // cam gibi kırılma: önce çatlaklar belirir, sonra üçgen parçalar dışarı ve aşağı savrulup döner
      if (!w.shards){
        const C2 = 4, R2 = 2, L0 = -8, R0 = w.w100 + 8, T0 = -A - 8, B0 = D + 8, P2 = [];
        for (let j = 0; j <= R2; j++) for (let i = 0; i <= C2; i++){ const inner = i && j && i < C2 && j < R2, h1 = hash01(w.idx * 53 + i * 7 + j * 31), h2 = hash01(w.idx * 37 + i * 11 + j * 3);
          P2.push([L0 + (R0 - L0) * (i + (inner ? (h1 - .5) * .6 : 0)) / C2, T0 + (B0 - T0) * (j + (inner ? (h2 - .5) * .6 : 0)) / R2]); }
        const id = (i, j) => P2[j * (C2 + 1) + i], mx = w.w100 / 2, my = (D - A) / 2; w.shards = [];
        for (let j = 0; j < R2; j++) for (let i = 0; i < C2; i++){
          const a1 = id(i, j), b1 = id(i + 1, j), c1 = id(i + 1, j + 1), d1 = id(i, j + 1), flip = hash01(w.idx * 13 + i * 5 + j) < .5;
          for (const tri of flip ? [[a1, b1, c1], [a1, c1, d1]] : [[a1, b1, d1], [b1, c1, d1]]){
            const cx2 = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy2 = (tri[0][1] + tri[1][1] + tri[2][1]) / 3, h = hash01(w.idx * 97 + w.shards.length * 19);
            const dx = cx2 - mx, dy = cy2 - my, l = Math.hypot(dx, dy) || 1, sp = H * (1 + h * 1.6);
            w.shards.push({tri, cx: cx2, cy: cy2, vx: dx / l * sp, vy: dy / l * sp * .6, rs: (hash01(w.idx * 41 + w.shards.length * 23) - .5) * 5});
          }
        }
      }
      if (q < .12){
        g.globalAlpha = 1; g.fillText(w.text, 0, 0);
        g.strokeStyle = P.bg; g.lineWidth = H * .025; g.globalAlpha = q / .12; g.beginPath();
        for (const s of w.shards){ g.moveTo(s.tri[0][0], s.tri[0][1]); g.lineTo(s.tri[1][0], s.tri[1][1]); g.lineTo(s.tri[2][0], s.tri[2][1]); g.closePath(); }
        g.stroke(); continue;
      }
      const t = (q - .12) / .88, fall = t * t * H * 3.2;
      for (const s of w.shards){
        g.save(); g.globalAlpha = 1 - Math.pow(t, 1.5);
        g.translate(s.cx + s.vx * t + gx * fall, s.cy + s.vy * t + gy * fall); g.rotate(s.rs * t); g.translate(-s.cx, -s.cy);
        g.beginPath(); g.moveTo(s.tri[0][0], s.tri[0][1]); g.lineTo(s.tri[1][0], s.tri[1][1]); g.lineTo(s.tri[2][0], s.tri[2][1]); g.closePath(); g.clip();
        g.fillText(w.text, 0, 0); g.restore();
      }
    }
  }
}
/* ---------- nefes alan harfler: söylenen kelimenin kalınlığı canlı sesle değişir (değişken yazı tipi) ---------- */
// genişlik değişince kelime yerinden taşmasın diye yatayda eski genişliğe ölçeklenir
let BRE = 0;
function breathe(w, cx){
  const F = TH.big;
  if (!S.breath || w.small || F.f === 'Instrument Serif') return false;
  // temanın kendi kalınlığı çevresinde (sessizde biraz incelir, vokal/basta kalınlaşır); yüklenen aralık 400–900
  const wt = Math.round(clamp(F.w - 160 + 300 * BRE, 400, 900) / 10) * 10;
  const f2 = (F.it ? 'italic ' : '') + wt + ' 100px "' + F.f + '", "Arial Narrow", Impact, sans-serif';
  if (!w.adv) w.adv = g.measureText(w.text).width; // g.font şu an kelimenin kendi yazı tipi
  g.font = f2; const nw = g.measureText(w.text).width || w.adv;
  g.save(); g.translate(cx, 0); g.scale(w.adv / nw, 1); g.translate(-cx, 0); g.fillText(w.text, 0, 0); g.restore();
  g.font = w.font;
  return true;
}

/* ---------- bütün satır efektleri: halka ve şerit ---------- */
// satırın harfleri tek dizi hâlinde (ana yazı tipi), ölçüler bloğa bir kez yazılır
function lineGlyphs(b){
  if (b.gl) return b.gl;
  g.font = fontStr(false);
  const sp = g.measureText(' ').width, list = [];
  let x = 0;
  b.words.forEach((w, k) => { if (k) x += sp; for (const ch of w.chars){ const cw = g.measureText(ch).width; list.push({ch, x, cw, w}); x += cw; } });
  const m = inkOf(b.words.map(w => w.text).join(' '));
  return b.gl = {list, len: Math.max(1, x), asc: m.asc, desc: m.desc};
}
function glyphColor(w, T, ai, P){ return w.idx === ai ? P.ac : P.fg; }
function drawRing(b, T, P, ai, ba, e, kick){
  // eğik halka; söylenen kelime hep önde durur (halka ona doğru yumuşakça döner), arka yüz çok silik
  // harf boyutu sabit; uzun satırda halka büyür (kenarları kadrajdan taşabilir, öndeki kelime hep aynı büyüklükte)
  const G = lineGlyphs(b), s = W * .16 / G.asc, R0 = Math.max(W * .42, G.len * s / (2 * Math.PI * .82)), q = easeOut(clamp((T - b.t0 + LEAD) / .8, 0, 1));
  const R = R0 * (.6 + .4 * q) * (1 + kick * .03);
  const tilt = .3;
  // hedef açı: etkin (yoksa ilk) kelimenin ortası önde
  const aw = b.words.find(w => w.idx === ai) || b.words.filter(w => w.t <= T).pop() || b.words[0];
  const its = G.list.filter(it => it.w === aw), mid = its.length ? (its[0].x + its[its.length - 1].x + its[its.length - 1].cw) / 2 : G.len / 2;
  const goal = -(mid - G.len / 2) * s / R0;
  if (b.rr == null) b.rr = goal;
  b.rr += (goal - b.rr) * (1 - Math.exp(-RDT * 4)); // yumuşak dönüş
  const rot = b.rr + Math.sin(T * .35) * .04;
  const U = b.U, V = vrot(b.V, b.U, tilt), N = vrot(b.N, b.U, tilt);
  // halka merkezi geride: ön yüz tam kameranın baktığı noktada (blok merkezi) durur
  const RC = vadd(b.C, vmul(N, R));
  const items = G.list.map(it => { const th = rot + (it.x + it.cw / 2 - G.len / 2) * s / R; return {it, th, c: Math.cos(th)}; });
  items.sort((x, y) => x.c - y.c); // arkadakiler önce
  g.font = fontStr(false);
  const yb = (G.asc - G.desc) / 2;
  for (const {it, th, c} of items){
    const sn = Math.sin(th), pos = vadd(RC, vadd(vmul(U, sn * R), vmul(N, -c * R)));
    const tU = vadd(vmul(U, c), vmul(N, sn));
    if (!setXform(pos, tU, V, s, 0, 0)) continue;
    const sung = it.w.t <= T;
    // ön yüz: yana döndükçe hafif söner; arka yüz: çok silik
    const face = c > 0 ? .35 + .65 * c : .08;
    g.globalAlpha = ba * q * face * (sung ? 1 : .45);
    g.fillStyle = glyphColor(it.w, T, ai, P);
    g.fillText(it.ch, -it.cw / 2, yb);
  }
}function drawBands(b, T, P, ai, ba, e){
  // üç çapraz bant: satır tekrar eder, bantlar sırayla yandan girer ve ters yönlere akar
  const G = lineGlyphs(b), txt = b.words.map(w => w.text).join(' ') + '   ';
  g.font = fontStr(false);
  const tw = g.measureText(txt).width, s = W * .085 / G.asc, H2 = G.asc + G.desc, pad = H2 * .28;
  const cols = [[P.fg, P.bg], [P.ac, P.bg], [P.bg, P.fg]], angs = [-.32, .26, -.08];
  const L2 = W * 1.6 / s;
  for (let k = 0; k < 3; k++){
    const q = easeOut(clamp((T - b.t0 + LEAD - k * .1) / .7, 0, 1)); if (q <= 0) continue;
    const ang = angs[k] * (.6 + .4 * S.rot), U2 = vrot(b.U, b.N, ang), V2 = vrot(b.V, b.N, ang);
    const Ck = vadd(b.C, vmul(b.V, (k - 1) * W * .2));
    if (!setXform(Ck, U2, V2, s, 0, 0)) continue;
    const dir = k % 2 ? 1 : -1, slide = (1 - q) * L2 * 2 * dir;
    const scroll = ((T * (60 + 90 * e) * dir) % tw + tw) % tw;
    g.globalAlpha = ba;
    g.fillStyle = cols[k][0]; g.fillRect(-L2 + slide, -G.asc - pad, 2 * L2, H2 + 2 * pad);
    g.fillStyle = cols[k][1];
    for (let x = -L2 - tw + scroll + slide; x < L2 + slide; x += tw) g.fillText(txt, x, 0);
  }
}
/* ---------- zemin dokusu: kamera hareketi okunsun diye silik 3D noktalar ---------- */
const DOTS = (() => { const r = rngFrom(7), o = []; for (let i = 0; i < 160; i++) o.push([(r() - .5) * 9000, (r() - .5) * 9000, r() * 3000 + 400]); return o; })();
function drawDots(P, kick){
  const B = 9000, e = CAM.eye;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = P.fg;
  for (const s of DOTS){
    const p = [e[0] + ((s[0] - e[0]) % B + B * 1.5) % B - B / 2, e[1] + ((s[1] - e[1]) % B + B * 1.5) % B - B / 2, s[2]];
    const q = proj(p); if (!q) continue;
    const r = Math.max(1, 1600 / q[2] * (1 + kick * .5)) * cv.height / 1080;
    g.globalAlpha = .1 + kick * .06; g.fillRect(q[0] - r, q[1] - r, r * 2, r * 2);
  }
}

/* ---------- frekans bantları (yumuşatılmış): bas, orta (vokal), tiz ---------- */
const FQ = {lo: 0, mi: 0, hi: 0};
function fqTick(dt){
  const on = L.packets > 30;
  for (const [k, v] of [['lo', L.low], ['mi', L.mid], ['hi', L.high]]){ const x = on ? clamp(v, 0, 1) : 0; FQ[k] += (x - FQ[k]) * Math.min(1, dt * (x > FQ[k] ? 16 : 5)); }
}
