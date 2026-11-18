/* ---------- fare etkileşimi (ayar fare) ----------
   Kelimelerin imleçten kaçması 08-kamera.js'te (mousePush). Buradakiler:
   - bakış: kamera imlece doğru birkaç derece döner (sahne derinlik kazanır); imleç 3 sn durunca ortaya döner
   - iz: imlecin arkasında vurgu renginde, ucu incelen kısa bir kuyruk
   - tıklama: iki ince halka + dışa kaçan kısa çizgiler; sözler ekranında sinema efektleri açıksa imleçten şok dalgası
   - saat ekranı: süzülen şekiller imleçten kaçar ve derinliklerine göre kayar (mouseRepel + MFX.tx/ty)
   - zemin noktaları imlecin çevresinde büyür (drawDots)
   Hepsi ekran uzayında, düz renkle; saydam kutu ya da ışık halesi yok. */
const MFX = {tx: 0, ty: 0, trail: [], rip: [], lastWave: -9};
const mouseOn = s => S.mouse && nowS() - MOUSE.t < (s || 2.5);
// yumuşatılmış imleç konumu (−1…1); karede bir kez çağrılır
function mouseTilt(dt){
  const on = !REDUCED && mouseOn(3), k = Math.min(1, dt * (on ? 4 : 1.5));
  MFX.tx += ((on ? clamp(MOUSE.x / cv.width * 2 - 1, -1, 1) : 0) - MFX.tx) * k;
  MFX.ty += ((on ? clamp(MOUSE.y / cv.height * 2 - 1, -1, 1) : 0) - MFX.ty) * k;
}
// imleç yakınındaki nesnenin yaylı kaçışı (durum nesnenin üstünde tutulur); dönen değer ekran kayması [dx, dy]
function mouseRepel(o, x, y, R, dt){
  let tx = 0, ty = 0; dt = Math.min(dt, .05);
  if (mouseOn()){
    const dx = x - MOUSE.x, dy = y - MOUSE.y, d = Math.hypot(dx, dy) || 1;
    if (d < R){ const mag = Math.pow(1 - d / R, 2) * R * .7; tx = dx / d * mag; ty = dy / d * mag; }
  }
  o.mvx = (o.mvx || 0) * Math.exp(-dt * 7) + (tx - (o.mx || 0)) * dt * 50; o.mvy = (o.mvy || 0) * Math.exp(-dt * 7) + (ty - (o.my || 0)) * dt * 50;
  o.mx = (o.mx || 0) + o.mvx * dt; o.my = (o.my || 0) + o.mvy * dt;
  return [o.mx, o.my];
}
// imlecin çevresindeki yakınlık (0–1): R yarıçapında yumuşak düşer
function mouseNear(x, y, R){ return mouseOn() ? Math.max(0, 1 - Math.hypot(x - MOUSE.x, y - MOUSE.y) / R) : 0; }

addEventListener('mousemove', ev => {
  if (!S.mouse) return;
  const x = ev.clientX * cv.width / innerWidth, y = ev.clientY * cv.height / innerHeight, l = MFX.trail[MFX.trail.length - 1];
  if (!l || Math.hypot(x - l.x, y - l.y) > 3){ MFX.trail.push({x, y, t: nowS()}); if (MFX.trail.length > 90) MFX.trail.shift(); }
});
addEventListener('mousedown', ev => {
  if (!S.mouse || ev.button !== 0) return;
  const x = ev.clientX * cv.width / innerWidth, y = ev.clientY * cv.height / innerHeight, t = nowS();
  MFX.rip.push({x, y, t, a: Math.random() * 6.2832}); if (MFX.rip.length > 6) MFX.rip.shift();
  // şok dalgası: sinema zinciri çalışıyorsa (sözler ekranı) imlecin altından yayılır
  if (mode === 'lyrics' && B3.fxOn && B3.wave && S.cine && !REDUCED && t - MFX.lastWave > .35){
    MFX.lastWave = t;
    try {
      const v = B3.v[0]; v.set(x / cv.width * 2 - 1, 1 - y / cv.height * 2, .5).unproject(B3.cam).sub(B3.cam.position).normalize().multiplyScalar(8).add(B3.cam.position);
      B3.wave.position.copy(v); B3.wave.amplitude = .035 * S.cineAmt; B3.wave.explode();
    } catch(_){}
  }
});

function drawMouseFx(P, VW, VH){
  const now = nowS(), m = Math.min(VW, VH), TL = .55, RL = .8, tr = MFX.trail, rp = MFX.rip;
  while (tr.length && now - tr[0].t > TL) tr.shift();
  while (rp.length && now - rp[0].t > RL) rp.shift();
  if (!S.mouse){ tr.length = 0; rp.length = 0; return; }
  if (tr.length < 3 && !rp.length) return;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.lineCap = 'round'; g.lineJoin = 'round';
  // iz: orta noktalardan geçen yaylar, kalınlık yaşla incelir
  g.strokeStyle = P.ac;
  for (let i = 1; i < tr.length - 1; i++){
    const a = tr[i - 1], b = tr[i], c = tr[i + 1], f = 1 - (now - b.t) / TL; if (f <= 0) continue;
    g.lineWidth = Math.max(.6, m * .0058 * f * f);
    g.beginPath(); g.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2); g.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2); g.stroke();
  }
  // tıklama: dış halka yazı renginde, iç halka vurgu renginde ve biraz geriden; sekiz kısa çizgi dışa kaçar
  for (const r of rp){
    const q = (now - r.t) / RL, e = 1 - Math.pow(1 - q, 3), R = m * .1 * e, lw = Math.max(.6, m * .004 * (1 - q));
    g.lineWidth = lw; g.strokeStyle = P.fg; g.beginPath(); g.arc(r.x, r.y, R, 0, 6.2832); g.stroke();
    const q2 = clamp(q * 1.25 - .15, 0, 1); if (q2 > 0 && q2 < 1){ g.strokeStyle = P.ac; g.lineWidth = Math.max(.6, m * .003 * (1 - q2)); g.beginPath(); g.arc(r.x, r.y, m * .062 * (1 - Math.pow(1 - q2, 3)), 0, 6.2832); g.stroke(); }
    g.strokeStyle = P.ac; g.lineWidth = lw; g.beginPath();
    for (let j = 0; j < 8; j++){ const an = r.a + j * .7854, r0 = R + m * .012, r1 = r0 + m * .022 * (1 - q); g.moveTo(r.x + Math.cos(an) * r0, r.y + Math.sin(an) * r0); g.lineTo(r.x + Math.cos(an) * r1, r.y + Math.sin(an) * r1); }
    g.stroke();
  }
  g.restore();
}
