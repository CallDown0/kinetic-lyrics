/* ---------- satırlar ve yerleşim ---------- */
// blocks[li]: satır başına blok, gerektiğinde (satır başlamadan hemen önce) o anki enerjiyle kurulur
let lineWords = [], chorusSet = new Set(), curLine = 0, lastBg = '', LS = null;
const lineKey = lw => lw.map(w => w.raw).join(' ').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N} ]/gu, '');
function layoutReset(){ fxReset(); RLI = -1; WP = SPL = null; SPLS = VOX = 0; blocks = []; if (!words.length) lineWords = []; LS = {heading: 0, prevRot: 0}; prevStyle = ''; pickTheme(); ensureFont(); }
function inkOf(text){ const m = g.measureText(text), a = m.actualBoundingBoxAscent, d = m.actualBoundingBoxDescent; return {w: Math.max(1, m.width), asc: a > 0 ? a : 74, desc: d > 0 ? d : 4}; }
function layoutLine(lw){ lineWords[lw[0].li] = lw; } // kurulum tembel: ensureBlock
function relayoutFrom(list){
  words = list; lineWords = [];
  list.forEach((w, i) => { w.idx = i; (lineWords[w.li] = lineWords[w.li] || []).push(w); });
  // nakarat: şarkıda iki ve daha çok geçen satırlar
  const cnt = {}; lineWords.forEach(lw => { if (lw){ const k = lineKey(lw); cnt[k] = (cnt[k] || 0) + 1; } });
  chorusSet = new Set(Object.keys(cnt).filter(k => cnt[k] >= 2));
  layoutReset();
}
function relayout(){ words.forEach(w => w.text = up(w.raw)); const keepSet = chorusSet; relayoutFrom(words); chorusSet = keepSet; snapCam = true; }
relayoutHook = relayout;
function measureWords(lw, noSmall){
  let icN = 0;
  lw.forEach(w => {
    w.small = !noSmall && lw.length > 2 && [...w.text].length <= 3; w.rot = 0; w.rcx = w.rcy = null; w.colk = null; w.adv = 0; w.spr = null; w.shards = null; w.exK = 0;
    w.font = fontStr(w.small); g.font = w.font;
    const chars = [...w.text], offs = []; let acc = '';
    chars.forEach(c => { offs.push(g.measureText(acc).width); acc += c; });
    const ink = inkOf(w.text);
    w.chars = chars; w.offs = offs; w.w100 = ink.w; w.asc = ink.asc; w.desc = ink.desc;
    w.icon = S.icons && icN < 2 ? iconOf(w.raw) : null; if (w.icon) icN++;
    w.ix = w.icon ? w.asc * 1.05 + 30 : 0; w.icOn = false; // çizim payı (100 px yazı biriminde); yer ayrılan dizilişlerde icOn
  });
}
/* ---------- dizilişler (kinetik kompozisyon) ----------
   satir: eski düz sıralar. dikey: en uzun kelime 90° dönük, kalan kelimelerin sıra yığınının yanına kenetlenir (6+ kelimede
   ikinci dikey kelime öbür yanda). kamera: kelimeler okuma sırası yerine dağınık yerlerde, farklı boy ve açılarda durur;
   kamera her kelimeye ayrı uçup yakınlaşır (dönük kelimede yan yatar), satır sonunda geri çekilip bütün kompozisyonu gösterir.
   merdiven: her kelime öncekinin altında ve biraz sağında başlar (çapraz basamak).
   Dönük kelimenin kutusu (lx, y, w, h) dönmemiş hâlidir; dönüş kutunun merkezi etrafında çizimde uygulanır (w.rot, WR). */
let prevLayout = '';
function pickLayout(style, lw){
  if (lw.length < 2 || STYLES[style].single || STYLES[style].whole || style === 'kilit' || style === 'bukum' || style === 'tekrar') return 'satir';
  const n = lw.length, iv = (lw[n - 1].t - lw[0].t) / (n - 1), camOk = iv >= .45 && n <= 6;
  const tot = lw.reduce((a, w) => a + w.w100, 0), mx = Math.max(...lw.map(w => w.w100));
  // dikey kelime yalnız satırın ilk ya da son kelimesi olur (okuma sırası bozulmaz); uygun kenar kelimesi var mı
  const edgeOk = n >= 3 && [lw[0], lw[n - 1]].some(w => [...w.raw].length >= 4 && w.w100 < tot * .45);
  const stairOk = n <= 5 && mx < tot * .5;
  // GSAP katmanı kelime dönüşünü bilmez: kilit ya da merdiven
  if (STYLES[style].dom) return (S.layout === 'merdiven' || (S.layout === 'oto' && Math.random() < .3)) && stairOk ? 'merdiven' : 'satir';
  if (S.layout !== 'oto'){
    const ok = {kamera: camOk, dikey: edgeOk, merdiven: stairOk, satir: true}[S.layout];
    return ok ? S.layout : 'satir';
  }
  // otomatik: ağırlıklı rastgele, art arda aynı özel diziliş gelmez (kilit tekrar edebilir)
  const wt = {satir: 1.6, dikey: edgeOk ? 1 : 0, merdiven: stairOk ? .7 : 0, kamera: camOk ? .9 : 0};
  if (prevLayout && prevLayout !== 'satir') wt[prevLayout] = 0;
  let t = 0; for (const k in wt) t += wt[k];
  let r = Math.random() * t; for (const k in wt){ r -= wt[k]; if (r <= 0) return k; }
  return 'satir';
}
// Kilit (lockup): kelimeler okuma sırasıyla sıralara bölünür. Her satır rastgele bir çeşitle kurulur (okuma sırası ve
// çakışmama sabit, gerisi değişir): hizalama (iki yana yaslı / sola / sağa / orta / zikzak), vurgu (rastgele bir kelime
// kendi sırasında dev, kalanı küçük), istif (yan yana iki kısa kelime üst üste), eğim (sıralar zıt yönlere hafif yatık),
// kalınlık karşıtlığı (kısa kelimeler ince yazı tipiyle). Sıralara bölmenin iyi yollarından biri rastgele seçilir.
function lockOpts(rnd, dom){
  const r = rnd(), align = r < .28 ? 'justify' : r < .46 ? 'left' : r < .6 ? 'right' : r < .76 ? 'center' : 'stagger';
  // vpair: küçük kelime 90° dönük, yanındaki büyük kelimenin boyunca dikey; tiltAll: bütün blok belirgin eğik; colors: her kelime ayrı renk
  const tiltAll = !dom && rnd() < .3;
  return {align, emph: rnd() < .4, stack: rnd() < .4, tilt: !dom && !tiltAll && rnd() < .25, weight: rnd() < .35,
    vpair: !dom && rnd() < .5, tiltAll: tiltAll ? (rnd() < .5 ? -1 : 1) * (.12 + rnd() * .12) : 0, colors: rnd() < .55};
}
function lockup(ws, Wr, rnd, lead, o){
  o = o || {align: 'justify'};
  const n = ws.length, sp = 30, asp = clamp(cv.width / Math.max(1, cv.height), .6, 2.4), A = clamp(asp * .95, .75, 2.1);
  const sm = w => [...w.raw].length <= 3;
  // birimler: istif açıksa yan yana iki kısa kelime tek birim (üst üste, yarım boy)
  const units = [];
  for (let i = 0; i < n;){
    if (o.vpair && i + 1 < n && [...ws[i].raw].length <= 4 && [...ws[i + 1].raw].length >= 4 && rnd() < .75){ units.push({ws: [ws[i], ws[i + 1]], vpair: true}); i += 2; }
    else if (o.stack && n > 2 && i + 1 < n && sm(ws[i]) && sm(ws[i + 1])){ units.push({ws: [ws[i], ws[i + 1]], stack: true}); i += 2; }
    else { units.push({ws: [ws[i]]}); i++; }
  }
  units.forEach(u => {
    if (u.vpair){
      // dikey küçük kelimenin boyu büyük kelimenin yüksekliği kadar (en çok onun %45'i kalınlıkta)
      const [a, b] = u.ws, H = b.asc + b.desc; u.kv = Math.min(H / a.w100, H * .45 / (a.asc + a.desc)); u.thick = (a.asc + a.desc) * u.kv; u.gap = 14;
      u.w100 = u.thick + u.gap + b.w100 + (b.ix || 0); u.asc = b.asc; u.desc = b.desc; return;
    }
    u.w100 = u.stack ? Math.max(...u.ws.map(w => w.w100)) * .5 : u.ws[0].w100 + (u.ws[0].ix || 0); u.asc = Math.max(...u.ws.map(w => w.asc)); u.desc = Math.max(...u.ws.map(w => w.desc)); });
  if (units.some(u => u.vpair)) o.tilt = false; // dikey çift sıra eğimiyle birleşmez (bütün blok eğimi olur)
  const m = units.length;
  // vurgu: rastgele bir içerik kelimesi (≥4 harf) kendi sırasında, öbür sıralar küçük
  let em = -1;
  if (o.emph && m >= 3){ const c = units.map((u, k) => k).filter(k => !units[k].stack && !units[k].vpair && [...units[k].ws[0].raw].length >= 5); if (c.length) em = c[Math.floor(rnd() * c.length)]; }
  const pre = [0]; units.forEach((u, i) => pre.push(pre[i] + u.w100));
  const rowOf = (i, j) => { const seg = units.slice(i, j); return {i, j, w100: pre[j] - pre[i] + sp * (j - i - 1), asc: Math.max(...seg.map(u => u.asc)), desc: Math.max(...seg.map(u => u.desc))}; };
  const cands = [];
  const tryRows = rows => {
    let h = 0, smin = 1e9, smax = 0, pen = 0;
    rows.forEach((r, ri) => {
      const isEm = em >= 0 && r.i === em && r.j === em + 1;
      if (em >= 0 && !isEm && r.i <= em && r.j > em) pen += 50; // vurgulu kelime başkasıyla aynı sırada olmaz
      let sc = Wr / r.w100; if (sc > 3.4){ pen += (sc / 3.4 - 1) * 1.5; sc = 3.4; }
      if (isEm) sc = Math.min(sc, 2.3); // vurgulu kelime dev ama kadrajı taşırmaz
      if (em >= 0 && !isEm) sc *= .6;
      r.s = sc; if (!(em >= 0)){ smin = Math.min(smin, sc); smax = Math.max(smax, sc); }
      h += (r.asc + r.desc) * sc + (ri ? r.asc * sc * lead : 0);
      const k = r.j - r.i;
      if (k === 1 && !units[r.i].stack && !units[r.i].vpair && sm(units[r.i].ws[0]) && m > 1) pen += 2;
      if (k > 4) pen += (k - 4) * .8;
    });
    pen += Math.pow(Math.log((Wr / h) / A), 2) * 4;
    if (smax) pen += Math.pow(Math.max(0, Math.log(smax / smin / 2.4)), 2) * 6;
    cands.push({rows: rows.map(r => Object.assign({}, r)), pen});
  };
  if (m > 12){ const rows = []; for (let i = 0; i < m; i += 3) rows.push(rowOf(i, Math.min(m, i + 3))); tryRows(rows); }
  else { const rec = (i, rows) => { if (i === m){ tryRows(rows); return; } for (let j = i + 1; j <= Math.min(m, i + 5); j++){ rows.push(rowOf(i, j)); if (rows.length <= 6) rec(j, rows); rows.pop(); } }; rec(0, []); }
  // iyi bölmelerden rastgele biri (en iyiye yakın olanlar, iyi olan daha olası)
  cands.sort((a, b) => a.pen - b.pen);
  const good = cands.filter(c => c.pen <= cands[0].pen + .9).slice(0, 6);
  let tw = 0; good.forEach(c => tw += 1 / (1 + c.pen - cands[0].pen)); let rr = rnd() * tw, best = good[0];
  for (const c of good){ rr -= 1 / (1 + c.pen - cands[0].pen); if (rr <= 0){ best = c; break; } }
  const boxes = []; let y = 0;
  best.rows.forEach((r, ri) => {
    let sc = r.s;
    const isEm = em >= 0 && r.i === em && r.j === em + 1;
    if (o.align !== 'justify' && !isEm) sc *= .8 + rnd() * .2;          // hizasız çeşitlerde sıra boyları biraz oynar
    if (ri) y += r.asc * sc * lead;
    const rowW = r.w100 * sc, Hr = (r.asc + r.desc) * sc, free = Wr - rowW;
    const al = isEm ? 'center' : o.align;
    const x0 = al === 'left' ? free * rnd() * .15 : al === 'right' ? free * (1 - rnd() * .15) : al === 'stagger' ? (ri % 2 ? free : 0) : free / 2;
    const ang = o.tilt ? (ri % 2 ? 1 : -1) * (.035 + rnd() * .05) : 0, rc = [x0 + rowW / 2, y + Hr / 2];
    let x = x0;
    for (let q = r.i; q < r.j; q++){
      const u = units[q], uw = u.w100 * sc;
      if (u.vpair){
        const [a, b] = u.ws, bs = y + r.asc * sc, bcy = bs + (b.desc - b.asc) * sc / 2, as = u.kv * sc;
        const abw = a.w100 * as, abh = (a.asc + a.desc) * as, acx = x + u.thick * sc / 2;
        a.icOn = false;
        boxes.push({w: a, s: as, rot: -Math.PI / 2, cx: acx, cy: bcy, bw: abw, bh: abh, base: bcy - (a.desc - a.asc) * as / 2, bb: [x, bcy - abw / 2, x + abh, bcy + abw / 2]});
        const bx = x + (u.thick + u.gap) * sc, bbw = b.w100 * sc, bwT = (b.w100 + (b.ix || 0)) * sc; b.icOn = !!b.icon;
        boxes.push({w: b, s: sc, rot: 0, cx: bx + bbw / 2, cy: bcy, bw: bbw, bh: (b.asc + b.desc) * sc, base: bs, bb: [bx, bs - b.asc * sc, bx + bwT, bs + b.desc * sc]});
        x += uw + sp * sc; continue;
      }
      const parts = u.stack ? u.ws.map((w, k) => ({w, s: sc * .5, base: y + Hr * .5 * k + u.asc * sc * .5})) : [{w: u.ws[0], s: sc, base: y + r.asc * sc}];
      parts.forEach(p => {
        const w = p.w, bw = w.w100 * p.s, top = p.base - w.asc * p.s, bot = p.base + w.desc * p.s;
        const bwT = u.stack ? bw : (w.w100 + (w.ix || 0)) * p.s; w.icOn = !u.stack && !!w.icon;
        const box = {w, s: p.s, rot: ang, cx: x + bw / 2, cy: (top + bot) / 2, bw, bh: bot - top, base: p.base, rc: ang ? rc : null};
        if (bwT > bw) box.bb = [x, top, x + bwT, bot];
        if (ang){ // eğik sıranın çerçevesi (sığdırma için)
          let a0 = 1e9, b0 = 1e9, a1 = -1e9, b1 = -1e9; const c = Math.cos(ang), sn = Math.sin(ang);
          for (const [px, py] of [[x, top], [x + bwT, top], [x + bwT, bot], [x, bot]]){ const dx = px - rc[0], dy = py - rc[1], X = rc[0] + dx * c - dy * sn, Y = rc[1] + dx * sn + dy * c; a0 = Math.min(a0, X); a1 = Math.max(a1, X); b0 = Math.min(b0, Y); b1 = Math.max(b1, Y); }
          box.bb = [a0, b0, a1, b1];
        }
        boxes.push(box);
      });
      x += uw + sp * sc;
    }
    y += Hr * (ang ? 1.12 : 1);
  });
  if (o.tiltAll){
    const g0 = o.tiltAll, c = Math.cos(g0), sn = Math.sin(g0), C = [Wr / 2, y / 2];
    for (const q of boxes){
      const dx = q.cx - C[0], dy = q.cy - C[1], nx = C[0] + dx * c - dy * sn, ny = C[1] + dx * sn + dy * c, sx = nx - q.cx, sy = ny - q.cy;
      const left = q.cx - q.bw / 2, right = q.bb && !q.rot ? q.bb[2] : q.cx + q.bw / 2; // çizim payı dahil
      q.cx = nx; q.cy = ny; q.base += sy; q.rot += g0; q.rc = null;
      // çerçeve: kutunun köşeleri kendi merkezinde toplam açıyla döner
      const t = q.rot, ct = Math.cos(t), st = Math.sin(t), L0 = left - (q.cx - sx), R0 = right - (q.cx - sx), T0 = -q.bh / 2, B0 = q.bh / 2;
      let a0 = 1e9, b0 = 1e9, a1 = -1e9, b1 = -1e9;
      for (const [px, py] of [[L0, T0], [R0, T0], [R0, B0], [L0, B0]]){ const X = q.cx + px * ct - py * st, Y = q.cy + px * st + py * ct; a0 = Math.min(a0, X); a1 = Math.max(a1, X); b0 = Math.min(b0, Y); b1 = Math.max(b1, Y); }
      q.bb = [a0, b0, a1, b1];
    }
  }
  // çok renk: her kelimeye paletten bir renk sırası (art arda aynısı yok); renk çizimde temadan türetilir
  if (o.colors){ let pv = -1; for (const w of ws){ let k = Math.floor(rnd() * 4); if (k === pv) k = (k + 1) % 4; w.colk = pv = k; } } else ws.forEach(w => w.colk = null);
  return {boxes, h: y};
}
// çok renkli paletten renk: yazı, vurgu ve vurgunun iki renk çemberi kardeşi; zeminden ayrışmayan renk yazı rengine doğru açılır
const MCC = {key: '', list: null};
function hueShift(hex, deg){
  const n = parseInt(hex.slice(1), 16); let r = (n >> 16) / 255, g2 = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g2, b), mn = Math.min(r, g2, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, sat = 0;
  if (d){ sat = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? ((g2 - b) / d + (g2 < b ? 6 : 0)) : mx === g2 ? (b - r) / d + 2 : (r - g2) / d + 4; h /= 6; }
  h = (h + deg / 360) % 1; sat = Math.max(sat, .65);
  const f = (p, q, t) => { t = (t + 1) % 1; return t < 1/6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2/3 ? p + (q - p) * (2/3 - t) * 6 : p; };
  const q2 = l < .5 ? l * (1 + sat) : l + sat - l * sat, p2 = 2 * l - q2, L2 = clamp(l, .45, .62);
  const q3 = L2 < .5 ? L2 * (1 + sat) : L2 + sat - L2 * sat, p3 = 2 * L2 - q3;
  const to = v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0');
  return '#' + to(f(p3, q3, h + 1/3)) + to(f(p3, q3, h)) + to(f(p3, q3, h - 1/3));
}
function mcol(P, k){
  const key = P.bg + P.fg + P.ac;
  if (MCC.key !== key){
    MCC.key = key;
    MCC.list = [P.fg, P.ac, hueShift(P.ac, 125), hueShift(P.ac, 235)].map(c => { let x = c; for (let i = 0; i < 4 && contrast(x, P.bg) < 3; i++) x = mixHex(x, P.fg, .45); return x; });
  }
  return MCC.list[k % 4];
}
function composeLine(lw, lay, rnd, style){
  // kilit ve dikeyde tek yazı tipi (küçük kelimeler ayrı yazı tipine geçmez; boy farkını sıralar verir)
  const lo = lockOpts(rnd, STYLES[style] && STYLES[style].dom);
  if (lay === 'satir' || lay === 'dikey') measureWords(lw, !lo.weight);
  const n = lw.length, long = lw.reduce((m, w) => w.w100 > m.w100 ? w : m, lw[0]);
  lw.forEach(w => { w.rot = 0; w.k = (w.small ? .5 : 1) * (w === long ? 1.3 : 1); });
  const fp = (w, sc, rot) => { const fw = (w.w100 + (rot ? 0 : w.ix || 0)) * sc, fh = (w.asc + w.desc) * sc, c = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot)); return [c * fw + sn * fh, sn * fw + c * fh]; };
  const boxes = [];
  if (lay === 'merdiven'){
    lw.forEach(w => { if (w.small) w.k = .72; });
    let x = 0, y = 0, span = 0; lw.forEach(w => span = Math.max(span, w.w100 * w.k)); span *= 2.1;
    lw.forEach((w, i) => {
      const sc = w.k, [bw, bh] = fp(w, sc, 0);
      if (i && x + bw > span) x = i % 2 ? bw * .08 : 0; // çok uzarsa basamak başa döner (zikzak)
      boxes.push({w, s: sc, rot: 0, cx: x + bw / 2, cy: y + bh / 2, bw, bh});
      x += bw * .42 + 20 * sc; y += bh * 1.04; // basamaklar arası küçük boşluk (üst üste binmez)
    });
  } else if (lay === 'kamera'){
    lw.forEach((w, i) => {
      const sc = w.k * (.75 + rnd() * .7), r = rnd();
      const rot = r < .3 ? (rnd() < .5 ? -1 : 1) * Math.PI / 2 : r < .55 ? (rnd() < .5 ? -1 : 1) * (.12 + rnd() * .18) : 0;
      const [bw, bh] = fp(w, sc, rot);
      if (!i){ boxes.push({w, s: sc, rot, cx: 0, cy: 0, bw, bh}); return; }
      const pb = boxes[i - 1], gap = 40 * sc, dirs = [[1, 0], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, 0], [0, -1]];
      let best = null, bd = 1e18;
      for (let k = 0; k < 18; k++){
        const d = dirs[Math.floor(rnd() * dirs.length)];
        const cx = pb.cx + d[0] * (pb.bw / 2 + bw / 2 + gap) + (d[0] ? 0 : (rnd() - .5) * pb.bw * .6);
        const cy = pb.cy + d[1] * (pb.bh / 2 + bh / 2 + gap) + (d[1] ? 0 : (rnd() - .5) * pb.bh * .6);
        const hit = boxes.some(q => Math.abs(q.cx - cx) < (q.bw + bw) / 2 + gap * .5 && Math.abs(q.cy - cy) < (q.bh + bh) / 2 + gap * .5);
        // çakışmasız ve toplu (kompozisyon dağılmasın) olan yer
        const sc2 = (hit ? 1e12 : 0) + Math.hypot(cx, cy * 1.5) + rnd() * 200;
        if (sc2 < bd){ bd = sc2; best = {cx, cy}; }
      }
      boxes.push({w, s: sc, rot, cx: best.cx, cy: best.cy, bw, bh});
    });
  } else if (lay === 'satir'){
    boxes.push(...lockup(lw, 1000, rnd, style === 'bukum' ? .6 : .16, lo).boxes);
  } else {
    // kenar dikeyi: satırın ilk kelimesi solda ya da son kelimesi sağda dikey (kitap sırtı gibi aşağıdan yukarı okunur);
    // kalan kelimeler kilit olarak yanında; dikey kelimenin boyu kilidin yüksekliği kadar
    const tot = lw.reduce((a, w) => a + w.w100, 0), ok = w => [...w.raw].length >= 4 && w.w100 < tot * .45;
    const first = ok(lw[0]), last = ok(lw[n - 1]);
    const left = first && (!last || rnd() < .5), v = left ? lw[0] : lw[n - 1], rest = left ? lw.slice(1) : lw.slice(0, -1);
    lo.tilt = false; lo.tiltAll = 0; // kenar dikeyi kendi açısında kalır
    const Wr = 1000, L = lockup(rest, Wr, rnd, .16, lo), Hs = Math.max(L.h, 200);
    boxes.push(...L.boxes);
    const H = v.asc + v.desc, sc = Math.min(Hs / v.w100, Wr * .4 / H), rot = -Math.PI / 2;
    const [bw, bh] = fp(v, sc, rot), gap = Math.max(40, bw * .22);
    boxes.push({w: v, s: sc, rot, cx: left ? -gap - bw / 2 : Wr + gap + bw / 2, cy: Hs / 2, bw, bh});
  }
  // çok renk bütün dizilişlerde (kilit kendi sırasında atadı; kalan kelimeler)
  if (lo.colors){ let pv = -1; for (const w of lw){ if (w.colk == null){ let k = Math.floor(rnd() * 4); if (k === pv) k = (k + 1) % 4; w.colk = k; } pv = w.colk; } }
  // merdiven/kamera: çizim payı kutunun sağında; metin merkezi sola kayar
  if (lay === 'merdiven' || lay === 'kamera') boxes.forEach(q => { const ix = q.rot ? 0 : (q.w.ix || 0); q.w.icOn = !!(ix && q.w.icon); if (ix){ q.bb = [q.cx - q.bw / 2, q.cy - q.bh / 2, q.cx + q.bw / 2, q.cy + q.bh / 2]; q.cx -= ix * q.s / 2; } });
  // blok genişliğine sığdır (yükseklik ölçülü kalsın; kamera dizilişinde kamera zaten kelimeye gider)
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  boxes.forEach(q => { const bb = q.bb || [q.cx - q.bw / 2, q.cy - q.bh / 2, q.cx + q.bw / 2, q.cy + q.bh / 2]; x0 = Math.min(x0, bb[0]); y0 = Math.min(y0, bb[1]); x1 = Math.max(x1, bb[2]); y1 = Math.max(y1, bb[3]); });
  let k = W / Math.max(1, x1 - x0); const hMax = W * 1.25;
  if ((y1 - y0) * k > hMax && lay !== 'kamera') k = hMax / (y1 - y0);
  const ox = (W - (x1 - x0) * k) / 2;
  boxes.forEach(q => {
    const w = q.w, sc = q.s * k, cx = (q.cx - x0) * k + ox, cy = (q.cy - y0) * k;
    w.s = sc; w.rot = q.rot; w.w = w.w100 * sc; w.h = (w.asc + w.desc) * sc; w.lx = cx - w.w / 2; w.row = 0;
    if (q.rc){ w.rcx = (q.rc[0] - x0) * k + ox; w.rcy = (q.rc[1] - y0) * k; } else w.rcx = w.rcy = null;
    if (q.base != null){ w.base = (q.base - y0) * k; w.y = w.base - w.asc * sc; } else { w.y = cy - w.h / 2; w.base = w.y + w.asc * sc; }
  });
  return (y1 - y0) * k;
}
function ensureBlock(li){
  if (blocks[li] || !lineWords[li]) return blocks[li];
  if (!blocks[li - 1] && blocks.some(Boolean)){ blocks = []; LS = {heading: 0, prevRot: 0}; } // atlandı: dünyayı sıfırla
  const lw = lineWords[li], rnd = rngFrom(0x9E3779B1 ^ Math.imul(li + 1, 7919) ^ strHash(M.key || ''));
  const isChorus = chorusSet.has(lineKey(lw));
  const style = chooseStyle(li, lw, isChorus); prevStyle = style;
  let h, cap = null, lay = 'satir';
  if (style === 'kilit'){
    // editoryal kilit dizgisi: satırın en uzun kelimesi dev ve küçük harf, kalanı küçük yazıyla onun x-yüksekliğinin
    // üstündeki boşluğa sağa yaslı oturur; altta minik imza (sanatçı ® yıl). Satırın son kelimesiyse sonuna nokta.
    let bi = 0; lw.forEach((w, i) => { if ([...w.raw].length >= [...lw[bi].raw].length) bi = i; });
    lw.forEach((w, i) => { w.big = i === bi; w.text = w.raw.toLocaleLowerCase(UPL) + (w.big && i === lw.length - 1 && !/[.!?,…]$/.test(w.raw) ? '.' : ''); });
    measureWords(lw, true);
    const big = lw[bi], rest = lw.filter(w => !w.big);
    g.font = fontStr(false); const xh = g.measureText('x').actualBoundingBoxAscent || big.asc * .7;
    const sb = Math.min(W / big.w100, 4.2), yB = 0;
    // küçük sıra: yüksekliği dev kelimenin çıkıntı payına (asc − x) sığar, genişliği bloğun en çok %78'i
    const sp = 26, rw100 = rest.reduce((s, w) => s + w.w100, 0) + sp * Math.max(0, rest.length - 1);
    const rAsc = rest.length ? Math.max(...rest.map(w => w.asc)) : 0;
    big.s = sb; big.w = big.w100 * sb; big.lx = (W - big.w) / 2;
    const fitH = rest.length ? Math.max(.25, (big.asc - xh) * sb * .78 / Math.max(1, rAsc)) : 0;
    // küçük satır, ana kelimede çıkıntısız harflerin (x-yüksekliğinde kalanların) en geniş aralığının üstüne oturur
    g.font = big.font; let run = null, cur = null;
    big.chars.forEach((ch, i) => {
      const short = ch === '.' || (g.measureText(ch).actualBoundingBoxAscent || 0) < xh * 1.3;
      if (short){ if (!cur) cur = {i0: i, i1: i}; else cur.i1 = i; } else cur = null;
      if (cur){ const x0 = big.offs[cur.i0], x1 = (cur.i1 + 1 < big.chars.length ? big.offs[cur.i1 + 1] : big.w100); if (!run || x1 - x0 >= run.w * .95) run = {x0, x1, w: x1 - x0}; }
    });
    let ss = fitH, sBase = yB - xh * sb * 1.1, right = W * .985;
    const spanW = run ? run.w * sb : 0;
    if (rest.length && spanW > big.w * .28 && spanW * .96 / rw100 > fitH * .45){
      ss = Math.min(fitH, spanW * .96 / rw100); right = big.lx + run.x1 * sb - spanW * .02;
    } else if (rest.length){
      // aralık yoksa ana kelimenin tamamen üstünde (çıkıntıların da üstünde)
      ss = Math.min(fitH * 1.2, W * .78 / rw100); sBase = yB - big.asc * sb - (big.asc + big.desc) * sb * .05;
    }
    const rowW = rw100 * ss;
    let x = right - rowW;
    rest.forEach(w => { w.s = ss; w.lx = x; w.base = sBase; w.y = sBase - w.asc * ss; w.h = (w.asc + w.desc) * ss; w.w = w.w100 * ss; w.row = 0; x += (w.w100 + sp) * ss; });
    big.base = yB; big.y = yB - big.asc * sb; big.h = (big.asc + big.desc) * sb; big.row = 1;
    let top = Math.min(big.y, ...rest.map(w => w.y)), bottom = big.y + big.h;
    const who = ''; // şarkı/sanatçı adı ekrana yazılmaz (kart gösteriyor)
    if (who){
      const ct = who + ' ® ' + new Date().getFullYear(); g.font = fontStr(false); const cm = inkOf(ct), cs = sb * .085;
      cap = {text: ct, s: cs, x: W * .985 - cm.w * cs, base: bottom + cm.asc * cs + big.h * .03};
      bottom = cap.base + cm.desc * cs;
    }
    // bloğun üstü 0 olacak şekilde kaydır
    lw.forEach(w => { w.y -= top; w.base -= top; }); if (cap) cap.base -= top;
    h = bottom - top;
  } else { lw.forEach(w => w.big = false); measureWords(lw); }
  if (style === 'kilit'){ /* yukarıda yerleşti */ }
  else if (STYLES[style].single){
    // her kelime tek başına bloğu doldurur, hepsi aynı yerde (biri çıkarken öteki gelir)
    let hmax = 0;
    lw.forEach(w => { w.s = Math.min(W / w.w100, 4.2); w.w = w.w100 * w.s; w.h = (w.asc + w.desc) * w.s; hmax = Math.max(hmax, w.h); });
    lw.forEach(w => { w.lx = (W - w.w) / 2; w.y = (hmax - w.h) / 2; w.base = w.y + w.asc * w.s; w.row = 0; });
    h = hmax;
  } else if (!STYLES[style].whole && style !== 'bukum'){
    lay = pickLayout(style, lw); h = composeLine(lw, lay, rnd, style); prevLayout = lay;
  } else {
    // sıralar: en uzun kelime kadar genişlik dolana dek kelimeler yan yana; her sıra blok genişliğine yaslanır
    // ekran oranına göre sıra genişliği: dikey ekranda her kelime kendi sırasında (yazı büyür, yükseklik dolar),
    // ultra genişte daha çok kelime yan yana
    const asp = cv.width / Math.max(1, cv.height), wrapK = asp < .9 ? 0 : asp < 1.4 ? .75 : asp > 2.1 ? 1.7 : 1.08;
    const sp = 30, maxW = Math.max(...lw.map(w => w.w100)), rows = [];
    let cur = [], cw = 0;
    // baskın kelime (satırın yarısından uzun) kendi sırasında: kalanlar ayrı sırada tam genişliğe büyür (yoksa hepsi tek sırada minicik kalır)
    const tot100 = lw.reduce((q, w) => q + w.w100, 0), dom = lw.length > 1 && maxW > tot100 * .5 ? lw.find(w => w.w100 === maxW) : null;
    const rest = lw.filter(w => w !== dom), lim = !dom ? maxW * wrapK : rest.length <= 4 ? 1e9 : Math.max(...rest.map(w => w.w100)) * Math.max(2.2, wrapK * 2);
    lw.forEach(w => { const add = (cur.length ? sp : 0) + w.w100; if (cur.length && (cw + add > lim || w === dom || cur[cur.length - 1] === dom)){ rows.push(cur); cur = []; cw = 0; } cw += (cur.length ? sp : 0) + w.w100; cur.push(w); });
    rows.push(cur);
    let y = 0;
    rows.forEach((rw, ri) => {
      const rw100 = rw.reduce((s, w) => s + w.w100, 0) + sp * (rw.length - 1);
      const asc = Math.max(...rw.map(w => w.asc)), desc = Math.max(...rw.map(w => w.desc));
      const s = Math.min(W / rw100, 3.4), rowW = rw100 * s, x0 = rowW < W * .97 ? (ri % 2 ? W - rowW : 0) : 0;
      // bükülmede harfler yukarı uzar: sıralar arası açık
      if (ri) y += asc * s * (style === 'bukum' ? .6 : .14);
      let x = x0;
      rw.forEach(w => { w.s = s; w.lx = x; w.y = y; w.base = y + asc * s; w.h = (asc + desc) * s; w.w = w.w100 * s; w.row = ri; x += (w.w100 + sp) * s; });
      y += (asc + desc) * s;
    });
    h = y;
  }
  if (STYLES[style].whole) h = Math.max(h, style === 'halka' ? W * .3 : W * .8); // halka: kadraj ön yüze; şerit: bloğun tamamı
  if (style === 'sarmal') h = W * .45; // sarmal kendi tek sırasını kurar; satır sıralarının yüksekliği kamerayı gereksiz geri çekerdi
  if (style === 'tekrar'){ const ex = h * 1.3; lw.forEach(w => { w.y += ex; w.base += ex; }); h += 2 * ex; } // üst/alt konturlara yer
  lw.forEach(w => w.bi = li);
  // her kelime farklı animasyon (ayar kelimekarma); stil elle sabitlendiyse o stil saf hâliyle oynar
  const pinned = !!STYLES[window.__kk_force];
  lw.forEach(w => { w.anim = null; w.g3a = null; });
  if (S.wordMix && !pinned && MIX.includes(style)){ const cp = catPool(), mix = cp && cp.some(k => MIX.includes(k)) ? MIX.filter(k => cp.includes(k)) : MIX; let pv = style; lw.forEach(w => { const c = mix.filter(k => k !== pv); w.anim = pv = c[Math.floor(rnd() * c.length)]; }); }
  if (S.wordMix && !pinned && STYLES[style].dom && style !== 'kup' && style !== 'sarmal'){ let pv = ''; lw.forEach(w => { const c = G3ENTER.filter(k => k !== pv); w.g3a = pv = c[Math.floor(rnd() * c.length)]; }); }
  // yön: düz ya da ±90° (klasik çevirme); hafif 3D eğim ve derinlik farkı
  let rot = 0;
  if (blocks[li - 1] && rnd() < S.rot * .55) rot = (rnd() < .5 ? -1 : 1) * Math.PI / 2;
  if (rot && Math.abs(rot - LS.prevRot) < .01) rot = -rot;
  const yaw = (rnd() - .5) * .45 * S.rot, pitch = (rnd() - .5) * .25 * S.rot;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const hw = (Math.abs(cs) * W + Math.abs(sn) * h) / 2, hh = (Math.abs(sn) * W + Math.abs(cs) * h) / 2;
  let cx = 0, cy = 0;
  const pb = blocks[li - 1];
  if (pb){
    const gap = W * .25, side = rnd() < .5 ? 1 : -1, tall = cv.height > cv.width * 1.1;
    // dikey ekran: satırlar alt alta akar (ekranın yüksekliği kullanılır)
    if (tall && Math.abs(Math.sin(LS.heading)) < .5) LS.heading = Math.PI / 2;
    const order = tall ? [0, 2, side, -side] : rnd() < .45 ? [0, side, -side, 2] : [side, 0, -side, 2];
    const others = blocks.filter(Boolean);
    const free = (nx, ny) => !others.some(b => Math.abs(b.cx - nx) < b.hw + hw + gap * .6 && Math.abs(b.cy - ny) < b.hh + hh + gap * .6);
    let placed = false;
    for (const k of [0, 1, 2, 3.5, 6, 10]){
      for (const o of order){
        const hd = LS.heading + o * Math.PI / 2, dx = Math.round(Math.cos(hd)), dy = Math.round(Math.sin(hd));
        const dist = (dx ? pb.hw + hw : pb.hh + hh) + gap + k * W * .45, nx = pb.cx + dx * dist, ny = pb.cy + dy * dist;
        if (free(nx, ny)){ cx = nx; cy = ny; LS.heading = hd; placed = true; break; }
      }
      if (placed) break;
    }
    if (!placed){ cx = pb.cx + W * 30; cy = pb.cy; }
  }
  LS.prevRot = rot;
  // düzlem eksenleri: U yazı yönü, V aşağı, N okurdan uzağa (dünya: y aşağı, z ileri)
  let U = [cs, sn, 0], V = [-sn, cs, 0], N = [0, 0, 1];
  if (yaw){ U = vrot(U, V, yaw); N = vrot(N, V, yaw); }
  if (pitch){ V = vrot(V, U, pitch); N = vrot(N, U, pitch); }
  const C = [cx, cy, (rnd() - .5) * W * .5 * S.rot];
  return blocks[li] = {li, style, words: lw, t0: lw[0].t, h, cx, cy, hw, hh, C, U, V, N, chorus: isChorus, cap, layout: lay, exit: lw.some(w => w.rot) ? '' : exitKind(style, rot)};
}
// çıkış efekti: satır biterken kum gibi savrulur, erir, domino gibi devrilir ya da cam gibi kırılır
let prevExit = '';
function exitKind(style, rot){
  if (STYLES[style].whole || STYLES[style].dom) return ''; // DOM stillerinin çıkışı kendi çizelgesinde
  if (S.exit === 'yok') return '';
  // 90° dönük satırda erime ve domino yazının kendi "aşağısına", yani ekranda yana akar: yerine ekran yerçekimli kırılma
  if (S.exit !== 'oto') return rot && (S.exit === 'erime' || S.exit === 'domino') ? 'kirilma' : S.exit;
  // otomatik: art arda aynısı gelmez; sakin bölümde erime/kum, enerjik bölümde kırılma/domino öne çıkar; arada düz sönme
  const e = energy(), wt = {kum: 1, erime: e < .45 ? 1.6 : .7, domino: e > .4 ? 1.2 : .7, kirilma: e > .55 ? 1.6 : .6, '': .9};
  const c = Object.keys(wt).filter(k => k !== prevExit || k === '');
  let tot = 0; c.forEach(k => tot += wt[k]);
  let r = Math.random() * tot, pick = '';
  for (const k of c){ r -= wt[k]; if (r <= 0){ pick = k; break; } }
  if (rot && (pick === 'erime' || pick === 'domino')) pick = Math.random() < .5 ? 'kum' : 'kirilma';
  prevExit = pick; return pick;
}
// blok yerel noktası (x sağa, y aşağı; 0..W, 0..h) → dünya
const bpt = (b, x, y, U, V) => vadd(b.C, vadd(vmul(U || b.U, x - W / 2), vmul(V || b.V, y - b.h / 2)));
