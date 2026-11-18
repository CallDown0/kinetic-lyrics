/* ---------- hava olayları, toz, konfeti, şimşek, ışık sızıntısı (ekran uzayında; ayar hava / parlama) ----------
   Yağmur, kar, yaprak ve kor: sözlerde ilgili kelime söylenince birkaç saniyeliğine bütün ekrana yayılır.
   Toz zerreleri sakin bölümlerde süzülür; konfeti nakarat girişinde ve şarkı sonu posterinde patlar;
   şimşek büyük düşüşte ve "şimşek" kelimesinde çakar. Gerçek zamanla ilerler (sarma etkilemez). */
const WX = {kind: '', until: -9, pts: [], dust: null, conf: [], bolt: null, chB: null, poster: '', drop: null, acc: 0};
const WX_LEAF = /^(yaprak\w*|sonbahar\w*|hazan\w*|autumn|leaf|leaves)$/;
function wxWord(w){
  if (!S.weather) return;
  if (w.wx === undefined){
    const ic = iconOf(w.raw), k = fold((w.raw || '').toLocaleLowerCase(UPL)).replace(/[^a-z0-9]/g, '');
    w.wx = ic === 'yagmur' ? 'yagmur' : ic === 'kar' ? 'kar' : ic === 'ates' ? 'kor' : ic === 'simsek' ? 'simsek' : WX_LEAF.test(k) ? 'yaprak' : '';
  }
  if (w.wx === 'simsek') wxBolt(); else if (w.wx){ WX.kind = w.wx; WX.until = nowS() + 7; }
}
function wxConfetti(n){
  if (!S.weather || REDUCED) return;
  const VW = cv.width, VH = cv.height, m = Math.min(VW, VH);
  for (let i = 0; i < n && WX.conf.length < 260; i++){
    const left = i % 2 === 0, a = (left ? -1 : 1) * (.25 + Math.random() * .75), sp = m * (1.1 + Math.random() * 1.1);
    WX.conf.push({x: left ? -m * .02 : VW + m * .02, y: VH * (.75 + Math.random() * .25), vx: -Math.sin(a) * sp, vy: -Math.cos(a) * sp, // içe ve yukarı
      w: m * (.008 + Math.random() * .01), rot: Math.random() * 6.28, vr: (Math.random() - .5) * 14, age: 0, life: 2.2 + Math.random() * 1.4, c: i % 3});
  }
}
function wxBolt(){
  if (!S.weather || REDUCED) return;
  const VW = cv.width, VH = cv.height, mk = (x, y, len, spread, depth) => {
    const pts = [[x, y]], segs = []; let cx = x, cy = y;
    const n = 9 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++){
      cx += (Math.random() - .5) * spread; cy += len / n * (.6 + Math.random() * .8); pts.push([cx, cy]);
      if (depth && Math.random() < .28) segs.push(...mk(cx, cy, len * (.25 + Math.random() * .25), spread * .8, 0));
    }
    return [pts, ...segs];
  };
  WX.bolt = {t0: nowS(), lines: mk(VW * (.2 + Math.random() * .6), -VH * .02, VH * (.55 + Math.random() * .3), VW * .09, 1)};
}
function drawWeather(T, dt, P, VW, VH, e, cb, li){
  if (!S.weather) return;
  const m = Math.min(VW, VH), now = nowS();
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  // tetikler: nakarat girişi ve poster → konfeti; büyük düşüş → şimşek
  if (cb && cb.chorus && WX.chB !== cb && T >= cb.t0 && T - cb.t0 < .3){ WX.chB = cb; const pb = blocks[li - 1]; if (mode === 'lyrics' && (!pb || !pb.chorus)) wxConfetti(70); }
  if (POSTER > 0 && WX.poster !== M.key){ WX.poster = M.key; wxConfetti(160); }
  const dr = L.drops.length ? L.drops[L.drops.length - 1] : null;
  if (dr !== WX.drop){ WX.drop = dr; if (dr != null && Math.abs(T - dr) < .5) wxBolt(); }
  // toz zerreleri: sakin bölümde belirir, enerji yükselince söner
  if (!WX.dust){ WX.dust = []; for (let i = 0; i < 26; i++) WX.dust.push({x: Math.random(), y: Math.random(), z: .3 + Math.random() * .7, ph: Math.random() * 6.28, a: Math.random() * 6.28}); }
  WX.dustA = (WX.dustA || 0) + ((e < .38 && mode === 'lyrics' ? 1 : 0) - (WX.dustA || 0)) * Math.min(1, dt * .8);
  if (WX.dustA > .02){
    const col = lum(P.bg) < .4 ? mixHex(P.fg, '#FFFFFF', .3) : P.ac;
    g.fillStyle = col;
    for (const d of WX.dust){
      d.x += Math.cos(d.a) * .012 * d.z * dt * (VH / VW); d.y += (Math.sin(d.a) * .012 - .008) * d.z * dt; d.a += Math.sin(now * .3 + d.ph) * dt * .4;
      if (d.x < -.02) d.x = 1.02; else if (d.x > 1.02) d.x = -.02; if (d.y < -.02) d.y = 1.02; else if (d.y > 1.02) d.y = -.02;
      g.globalAlpha = WX.dustA * (.18 + .3 * d.z) * (.55 + .45 * Math.sin(now * (1 + d.z) + d.ph));
      g.beginPath(); g.arc(d.x * VW, d.y * VH, m * (.0015 + .0035 * d.z), 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
  }
  // yağmur / kar / yaprak / kor
  const on = now < WX.until, k = WX.kind;
  if (on){
    WX.acc += dt * (k === 'yagmur' ? 130 : k === 'kar' ? 38 : k === 'kor' ? 30 : 12) * Math.min(1, (WX.until - now) / 1.5);
    while (WX.acc >= 1 && WX.pts.length < 240){
      WX.acc--; const r = Math.random;
      if (k === 'yagmur') WX.pts.push({k, x: r() * 1.15 - .05, y: -.05, vx: -.12, vy: 1.5 + r() * .7, z: .5 + r() * .5, age: 0, life: 1.2});
      else if (k === 'kar') WX.pts.push({k, x: r(), y: -.03, vx: 0, vy: .1 + r() * .14, z: .4 + r() * .6, ph: r() * 6.28, age: 0, life: 12});
      else if (k === 'kor') WX.pts.push({k, x: r(), y: 1.03, vx: (r() - .5) * .05, vy: -(.12 + r() * .22), z: .4 + r() * .6, ph: r() * 6.28, age: 0, life: 4 + r() * 3});
      else WX.pts.push({k, x: r() * 1.1, y: -.04, vx: -.05 - r() * .06, vy: .1 + r() * .12, z: .5 + r() * .5, ph: r() * 6.28, rot: r() * 6.28, vr: (r() - .5) * 4, ac: r() < .6, age: 0, life: 12});
    }
    if (WX.acc > 3) WX.acc = 3;
  }
  if (WX.pts.length){
    const soft = mixHex(P.bg, P.fg, .5), bright = mixHex(P.bg, P.fg, .85);
    for (let i = WX.pts.length - 1; i >= 0; i--){
      const q = WX.pts[i]; q.age += dt;
      const sway = q.k === 'kar' ? Math.sin(now * 1.3 + q.ph) * .02 : q.k === 'yaprak' ? Math.sin(now * 1.7 + q.ph) * .06 : q.k === 'kor' ? Math.sin(now * 2.3 + q.ph) * .03 : 0;
      q.x += (q.vx + sway) * dt * (VH / VW) * (q.k === 'yagmur' ? 1 : q.z); q.y += q.vy * dt * (q.k === 'yagmur' ? 1 : q.z);
      if (q.age > q.life || q.y > 1.06 || q.y < -.08 || q.x < -.1){ WX.pts.splice(i, 1); continue; }
      const x = q.x * VW, y = q.y * VH;
      if (q.k === 'yagmur'){ g.strokeStyle = soft; g.lineWidth = Math.max(1, m * .0018 * q.z); g.beginPath(); g.moveTo(x, y); g.lineTo(x + q.vx * VH * .03, y + q.vy * VH * .03 * q.z); g.stroke(); }
      else if (q.k === 'kar'){ g.fillStyle = bright; g.beginPath(); g.arc(x, y, m * (.002 + .005 * q.z), 0, 6.2832); g.fill(); }
      else if (q.k === 'kor'){ const f = 1 - q.age / q.life; g.globalAlpha = f; g.fillStyle = P.ac; const s = m * (.002 + .004 * q.z) * (.5 + .5 * f); g.fillRect(x - s, y - s, s * 2, s * 2); g.globalAlpha = 1; }
      else { q.rot += q.vr * dt; const s = m * (.008 + .012 * q.z);
        g.save(); g.translate(x, y); g.rotate(q.rot); g.scale(1, .45 + .4 * Math.sin(now * 3 + q.ph)); g.fillStyle = q.ac ? P.ac : soft;
        g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(0, -s * .8, s, 0); g.quadraticCurveTo(0, s * .8, -s, 0); g.fill(); g.restore(); }
    }
  }
  // konfeti: iki alt köşeden fırlar, yerçekimiyle düşer
  if (WX.conf.length){
    const cols = [P.ac, P.fg, mixHex(P.ac, P.fg, .5)];
    for (let i = WX.conf.length - 1; i >= 0; i--){
      const c = WX.conf[i]; c.age += dt; if (c.age > c.life || c.y > VH * 1.1){ WX.conf.splice(i, 1); continue; }
      c.vy += m * 1.5 * dt; c.vx *= Math.exp(-dt * 1.1); c.vy *= Math.exp(-dt * .6); c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
      g.save(); g.translate(c.x, c.y); g.rotate(c.rot); g.scale(1, Math.cos(c.age * 9 + c.rot)); g.globalAlpha = Math.min(1, (c.life - c.age) * 2);
      g.fillStyle = cols[c.c]; g.fillRect(-c.w, -c.w * .5, c.w * 2, c.w); g.restore();
    }
    g.globalAlpha = 1;
  }
  // şimşek: kısa titrek çakma (dallı çizgi + hafif aydınlanma)
  if (WX.bolt){
    const x = now - WX.bolt.t0; if (x > .38) WX.bolt = null;
    else {
      const fl = (x < .05 ? 1 : .35 + .65 * Math.abs(Math.sin(x * 46))) * (1 - x / .38), col = lum(P.bg) < .5 ? mixHex(P.fg, '#FFFFFF', .6) : P.ac;
      g.globalAlpha = fl * .16; g.fillStyle = col; g.fillRect(0, 0, VW, VH);
      g.globalAlpha = fl; g.strokeStyle = col; g.lineJoin = 'round'; g.lineCap = 'round';
      WX.bolt.lines.forEach((pts, i) => { g.lineWidth = Math.max(1.5, m * (i ? .0025 : .005)); g.beginPath(); pts.forEach((p, j) => j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); });
      g.globalAlpha = 1;
    }
  }
}
// ışık sızıntısı: sakin bölümde kenarlardan süzülen vurgu rengi lekeler (film yanığı gibi); ayar parlama
function drawLeak(T, dt, P, VW, VH, e){
  WX.leak = (WX.leak || 0) + ((S.bloom && e < .42 && /^#[0-9a-f]{6}$/i.test(P.ac) ? 1 : 0) - (WX.leak || 0)) * Math.min(1, dt * .6);
  if (WX.leak < .02) return;
  const m = Math.min(VW, VH), now = nowS();
  g.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 2; i++){
    const x = (i ? VW : 0) + Math.sin(now * .11 + i * 2.1) * VW * .12, y = VH * (.3 + .4 * Math.sin(now * .07 + i * 1.3) * (i ? -1 : 1) + .2 * i), R = m * (.75 + .1 * Math.sin(now * .2 + i));
    const gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, P.ac + 'ff'); gr.addColorStop(1, P.ac + '00');
    g.globalAlpha = WX.leak * .2; g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
  }
  g.globalAlpha = 1;
}
// ışık huzmeleri (arka plan türü 'isin'): merkezden dışarı yavaşça dönen, genişliği nefes alan düz renkli ışınlar
function drawRays(P, VW, VH){
  const n = 16, R = Math.hypot(VW, VH), rot = BR.t * .025;
  g.save(); g.translate(VW / 2, VH / 2);
  for (let i = 0; i < n; i++){
    const a = i / n * 6.2832 + rot, hw = Math.PI / n * (.3 + .22 * Math.sin(i * 2.3 + BR.t * .35)) * (1 + L.beat * .25);
    g.fillStyle = i % 4 === 0 ? mixHex(P.bg, P.ac, .2) : mixHex(P.bg, P.fg, i % 2 ? .05 : .09);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a - hw) * R, Math.sin(a - hw) * R); g.lineTo(Math.cos(a + hw) * R, Math.sin(a + hw) * R); g.closePath(); g.fill();
  }
  g.restore();
}
