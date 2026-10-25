/* ---------- destek efektleri: parçacıklar (dünya uzayında, kamerayla birlikte) ---------- */
const FX = {last: -1, beatN: 0, pts: []};
function fxReset(){ FX.last = -1; FX.pts.length = 0; }
const wCenter = (b, w) => bpt(b, w.lx + w.w / 2, w.y + w.h / 2);
function burst(b, w, n, power){
  // kelimenin kutusunun kenarlarından dışarı saçılan parçacıklar
  const c = wCenter(b, w);
  for (let i = 0; i < n && FX.pts.length < 320; i++){
    const edge = Math.random(), top = Math.random() < .5;
    const lx = w.lx + (edge * 1.1 - .05) * w.w, ly = w.y + (top ? 0 : w.h) + (Math.random() - .5) * w.h * .3;
    const p = bpt(b, lx, ly), d = vnorm(vsub(p, c)), sp = (W * .25 + Math.random() * W * .6) * power;
    FX.pts.push({p, v: vadd(vmul(d, sp), vmul(b.N, (Math.random() - .5) * W * .5 * power)), age: 0, life: .6 + Math.random() * .8,
      r: w.h * (.025 + Math.random() * .05), ac: Math.random() < .55, sq: Math.random() < .5});
  }
}
function fxWord(b, w, e){
  if (S.particles) burst(b, w, 10 + Math.round(22 * e), .7 + .6 * e);
}
function fxStep(dt){
  for (let i = FX.pts.length - 1; i >= 0; i--){
    const q = FX.pts[i]; q.age += dt; if (q.age > q.life){ FX.pts.splice(i, 1); continue; }
    const k = Math.exp(-dt * 2.6); q.v = vmul(q.v, k); q.p = vadd(q.p, vmul(q.v, dt));
  }
}
function drawParticles(P){
  if (!FX.pts.length) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  for (const pass of [false, true]){
    g.fillStyle = pass ? P.ac : P.fg;
    for (const q of FX.pts){
      if (q.ac !== pass) continue;
      const s = proj(q.p); if (!s) continue;
      const r = Math.max(.8, q.r * CAM.F * CAM.zoom / s[2]), f = 1 - q.age / q.life;
      g.globalAlpha = f * f * .9;
      if (q.sq) g.fillRect(s[0] - r, s[1] - r, r * 2, r * 2);
      else { g.beginPath(); g.arc(s[0], s[1], r, 0, 6.2832); g.fill(); }
    }
  }
  g.globalAlpha = 1;
}

/* ---------- çeviri satırı ---------- */
let TR = null; // {key, lines: Map(satır anahtarı → çeviri)}
function drawTranslation(T, ai, P, VW, VH){
  if (!S.translate || !TR || TR.key !== M.key || ai < 0 || mode !== 'lyrics') return;
  const lw = lineWords[words[ai].li]; if (!lw) return;
  const tx = TR.lines.get(lineKey(lw)); if (!tx) return;
  g.setTransform(1, 0, 0, 1, 0, 0); g.textAlign = 'center';
  const fs = Math.round(VH * .028); g.font = '400 ' + fs + 'px "Martian Mono", Consolas, monospace';
  const y = VH - VH * .12, w = Math.min(VW * .8, g.measureText(tx).width + fs * 2);
  g.globalAlpha = .85; g.fillStyle = P.fg; g.fillText(tx, VW / 2, y, VW * .78);
  g.textAlign = 'start'; g.globalAlpha = 1;
}
async function loadTranslation(key){
  // Google'ın ücretsiz çeviri ucu (anahtarsız). Türkçe sözler çevrilmez; sonuç şarkıya göre önbelleğe alınır.
  TR = null;
  if (!S.translate || !lineWords.length) return;
  const keys = [], texts = [];
  lineWords.forEach(lw => { if (!lw) return; const k = lineKey(lw); if (keys.includes(k)) return; keys.push(k); texts.push(lw.map(w => w.raw).join(' ')); });
  if (!texts.length) return;
  const ck = 'kk4t:' + key;
  let out = null;
  try { out = JSON.parse(localStorage.getItem(ck) || 'null'); } catch(_){}
  if (!out){
    try {
      const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=' + encodeURIComponent(texts.join('\n')));
      const j = await r.json();
      if (j[2] === 'tr'){ out = []; } // zaten Türkçe
      else { const all = (j[0] || []).map(x => x[0] || '').join(''); out = all.split('\n').map(s => s.trim()); }
      try { localStorage.setItem(ck, JSON.stringify(out)); } catch(_){}
    } catch(_){ return; }
  }
  if (key !== M.key || !out.length || out.length !== texts.length) return;
  TR = {key, lines: new Map(keys.map((k, i) => [k, out[i]]))};
}
