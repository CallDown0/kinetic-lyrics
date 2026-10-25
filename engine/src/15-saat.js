/* ---------- saat ekranı: saat ortada sabit, arkada ekran koruyucu gibi süzülen şekiller ----------
   Kinetik motor kullanılmaz (dakika değişince satır/kamera animasyonu yok); yalnız rakamlar değişir. */
const IDLE = {items: null, rot: 0};
function idleItems(){
  const r = Math.random, a = [];
  for (let i = 0; i < 18; i++) a.push({x: r(), y: r(), z: .35 + r() * .65, a: r() * 6.2832, va: (r() - .5) * .25,
    rot: r() * 6.2832, vr: (r() - .5) * .5, type: i % 5, fill: r() < .5, ac: r() < .35, ph: r() * 6.2832});
  return a;
}
function drawIdleClock(T, dt, P, VW, VH){
  const m = Math.min(VW, VH), d = new Date(), kick = clamp((L.low - L.lowSlow) * 2.4, 0, 1);
  L.beat *= Math.exp(-dt * 7);
  g.fillStyle = P.bg; g.fillRect(0, 0, VW, VH);
  // saat kutusu (şekiller buraya yaklaştıkça zemine karışır; saydamlık/kutu yok, düz renk)
  const cw = VW * .5, ch = m * .28;
  if (!IDLE.items) IDLE.items = idleItems();
  // büyük, çok yavaş dönen ince halka (saatin arkasında)
  IDLE.rot += dt * .05;
  g.save(); g.translate(VW / 2, VH / 2); g.rotate(IDLE.rot);
  g.strokeStyle = mixHex(P.bg, P.fg, .07); g.lineWidth = Math.max(1, m * .002);
  g.setLineDash([m * .006, m * .02]); g.beginPath(); g.arc(0, 0, m * .42, 0, 6.2832); g.stroke(); g.setLineDash([]);
  g.restore();
  // süzülen şekiller: yavaş, derinliğe göre hız/boyut (paralaks), kenardan çıkan karşıdan girer; sesle hafif nabız
  for (const s of IDLE.items){
    s.a += s.va * dt; s.rot += s.vr * dt;
    const sp = .012 * s.z;
    s.x += Math.cos(s.a) * sp * dt * (VH / VW); s.y += Math.sin(s.a) * sp * dt;
    if (s.x < -.1) s.x += 1.2; else if (s.x > 1.1) s.x -= 1.2;
    if (s.y < -.1) s.y += 1.2; else if (s.y > 1.1) s.y -= 1.2;
    const x = s.x * VW, y = s.y * VH;
    const near = clamp(1 - Math.max(Math.abs(x - VW / 2) / cw, Math.abs(y - VH / 2) / ch), 0, 1);
    const sz = m * (.012 + .03 * s.z) * (1 + .06 * Math.sin(T * .8 + s.ph) + .18 * L.beat * s.z);
    const t = (s.ac ? 1 : .12 + .2 * s.z) * (1 - near * .85);
    const col = s.ac ? mixHex(P.bg, P.ac, t) : mixHex(P.bg, P.fg, t);
    g.save(); g.translate(x, y); g.rotate(s.rot); g.beginPath();
    if (s.type === 0) g.arc(0, 0, sz, 0, 6.2832);
    else if (s.type === 1) g.rect(-sz * .85, -sz * .85, sz * 1.7, sz * 1.7);
    else if (s.type === 2){ for (let k = 0; k < 3; k++){ const q = k * 2.0944 - 1.5708; k ? g.lineTo(Math.cos(q) * sz, Math.sin(q) * sz) : g.moveTo(Math.cos(q) * sz, Math.sin(q) * sz); } g.closePath(); }
    else if (s.type === 3){ const k = sz * .3; g.rect(-sz, -k, sz * 2, k * 2); g.rect(-k, -sz, k * 2, sz * 2); }
    else { g.moveTo(-sz, 0); for (let k = 0; k <= 12; k++) g.lineTo(-sz + k * sz / 6, Math.sin(k * 1.05) * sz * .35); }
    if (s.type === 4){ g.strokeStyle = col; g.lineWidth = Math.max(2, sz * .16); g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); }
    else if (s.fill || s.type === 3){ g.fillStyle = col; g.fill('nonzero'); }
    else { g.strokeStyle = col; g.lineWidth = Math.max(2, sz * .18); g.stroke(); }
    g.restore();
  }
  // sabit saat: ortada, dakika değişince yalnız rakam değişir; iki nokta saniyede bir yumuşak söner
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  const big = fontStr(false).replace('100px', '1px'), small = fontStr(true).replace('100px', '1px');
  const hs = m * .3 * (1 + kick * .015);
  g.textBaseline = 'alphabetic'; g.textAlign = 'center';
  g.font = big.replace('1px', hs + 'px');
  const wH = g.measureText(hh).width, wC = g.measureText(':').width, wM = g.measureText(mm).width;
  const fit = Math.min(1, VW * .86 / (wH + wC + wM)), y0 = VH / 2 + hs * .3 * fit;
  g.save(); g.translate(VW / 2, y0); g.scale(fit, fit);
  const x0 = -(wH + wC + wM) / 2;
  g.fillStyle = P.fg; g.textAlign = 'left';
  g.fillText(hh, x0, 0); g.fillText(mm, x0 + wH + wC, 0);
  const ms = d.getMilliseconds() / 1000, blink = .5 + .5 * Math.cos(ms * 6.2832);
  g.fillStyle = mixHex(P.bg, P.ac, .35 + .65 * blink); g.fillText(':', x0 + wH, -hs * .04);
  g.restore();
  // gün ve tarih
  const ds = m * .045; g.font = small.replace('1px', ds + 'px'); g.textAlign = 'center';
  g.fillStyle = mixHex(P.bg, P.fg, .7);
  g.fillText(DAYS[d.getDay()] + '  ·  ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(), VW / 2, y0 + ds * 2.2);
  // dakika içi ilerleme çizgisi (vurgu rengi, ince)
  const pw = Math.min(VW * .3, m * .5), pf = (d.getSeconds() + ms) / 60, py = y0 + ds * 3.4, th = Math.max(2, m * .003);
  g.fillStyle = mixHex(P.bg, P.fg, .12); g.fillRect(VW / 2 - pw / 2, py, pw, th);
  g.fillStyle = P.ac; g.fillRect(VW / 2 - pw / 2, py, pw * pf, th);
  g.textAlign = 'left';
}

function drawBackground(T, dt, P, VW, VH, li, cb, e){
  const kind = bgKind(); if (kind === 'yok') return;
  BR.t += dt * (1 + e * 1.5);
  const m = Math.min(VW, VH), holes = []; for (const b of [blocks[li - 1], cb]) if (b) holes.push(...wordHoles(b, .28));
  const beat = L.beatN !== BR.beatN; BR.beatN = L.beatN;
  // öğe üretimi
  if (kind === 'cizgi'){
    // kamera her yeni satırı ortaya getirir: seçimde ortadaki yazı alanı da boş sayılır; 10 adaydan en az değen
    const mid = [[VW * .1, VH * .28], [VW * .9, VH * .28], [VW * .9, VH * .72], [VW * .1, VH * .72]], hs = holes.concat([mid]);
    const spawn = () => { let best = null, bh = 1e9; for (let k = 0; k < 10; k++){ const s = linePath(VW, VH, e); let h = 0; for (let i = 0; i < s.pts.length; i += 3){ const p = s.pts[i]; if (hs.some(q => inQuad(q, p[0], p[1]))) h++; } if (h < bh){ best = s; bh = h; if (!h) break; } } BR.list.push(best); };
    if (cb && cb.li !== BR.lastLi){ BR.lastLi = cb.li; if (BR.list.length < 5) spawn(); }
    BR.timer -= dt; if (BR.timer <= 0){ BR.timer = lerp(2.8, 1.2, e) * (.7 + Math.random() * .6); if (BR.list.length < 5) spawn(); }
  } else if (kind === 'sekil'){
    BR.timer -= dt; if ((BR.timer <= 0 || (beat && Math.random() < .25)) && BR.list.length < 9){ BR.timer = lerp(1.6, .6, e); BR.list.push(shapeItem(VW, VH, e)); }
  } else if (kind === 'halka'){
    // vuruşta (en sık 0.35 sn'de bir) ortadan büyüyen halka
    BR.timer -= dt; if (beat && BR.timer <= 0 && BR.list.length < 8){ BR.timer = .35; BR.list.push({age: 0, life: 2.4 - e * .6, ac: BR.list.length % 2 === 0, w: m * (.012 + .012 * L.beat)}); }
  }
  for (let i = BR.list.length - 1; i >= 0; i--){ const s = BR.list[i]; s.age += dt; if (s.age > s.life) BR.list.splice(i, 1); }

  // kırpma yok: efektler yazının arkasından kesintisiz geçer (kelime çevresinde kutu gibi boşluk kalmasın)
  g.setTransform(1, 0, 0, 1, 0, 0); g.save(); g.globalAlpha = 1;
  if (kind === 'cizgi') for (const s of BR.list) drawLineItem(s, P);
  else if (kind === 'sekil') for (const s of BR.list) drawShapeItem(s, P, VW);
  else if (kind === 'halka'){
    const R = Math.hypot(VW, VH) * .6;
    for (const s of BR.list){
      const q = s.age / s.life, rad = m * .15 + easeOut(q) * R, lw = s.w * (1 - q); if (lw < .5) continue;
      g.strokeStyle = s.ac ? P.ac : mixHex(P.bg, P.fg, .35); g.lineWidth = lw;
      g.beginPath(); g.arc(VW / 2, VH / 2, rad, 0, 6.2832); g.stroke();
    }
  } else if (kind === 'izgara'){
    // kayan ızgara; kesişimlerde vurgu renginde küçük artılar (vuruşta büyür)
    const sp = m * .09, ox = (BR.t * m * .02) % sp, oy = (BR.t * m * .012) % sp;
    g.strokeStyle = mixHex(P.bg, P.fg, .13); g.lineWidth = Math.max(1, m * .0018);
    g.beginPath();
    for (let x = -ox; x < VW + sp; x += sp){ g.moveTo(x, 0); g.lineTo(x, VH); }
    for (let y = -oy; y < VH + sp; y += sp){ g.moveTo(0, y); g.lineTo(VW, y); }
    g.stroke();
    g.fillStyle = P.ac; const pl = m * (.006 + .006 * L.beat), th = Math.max(1, pl * .35);
    let ix = 0;
    for (let x = -ox; x < VW + sp; x += sp, ix++){ let iy = 0; for (let y = -oy; y < VH + sp; y += sp, iy++){
      if (hash01(ix * 73 + iy * 151 + Math.floor((BR.t * m * .02) / sp) * 7) > .12) continue;
      g.fillRect(x - pl, y - th / 2, pl * 2, th); g.fillRect(x - th / 2, y - pl, th, pl * 2);
    } }
  } else if (kind === 'serit'){
    // kayan çapraz şeritler (zeminden biraz ayrışan düz renk); vuruşta hızlanır
    const sw = m * .035, per = sw * 3.2, off = (BR.t * m * .03) % per, d = Math.hypot(VW, VH);
    g.translate(VW / 2, VH / 2); g.rotate(-.5);
    g.fillStyle = mixHex(P.bg, P.fg, .07);
    for (let x = -d / 2 - per + off; x < d / 2 + per; x += per) g.fillRect(x, -d / 2, sw, d);
  }
  g.restore();
}
