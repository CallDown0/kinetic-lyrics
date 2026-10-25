/* ================= Uykudan dönüş ================= */
// WE "arka planda durdur" ile duvar kâğıdını uyutunca kareler durur ama saat (performance.now) işlemeye devam eder,
// yani şarkı konumu doğru kalır. Dönüşte kamera aradaki satırların üstünden uçmasın, yeni yerine oturtulsun;
// biriken parçacık/efektler atılır. Kare boşluğu, setPaused ve görünürlük olaylarından hangisi önce gelirse.
function resume(why, gap){
  if (nowS() - RZ.at < .5) return;
  RZ.at = nowS(); RZ.paused = false; snapCam = true; fxReset(); M.pendBack = null;
  diag('rz', {w: why, g: gap != null ? +(+gap).toFixed(1) : undefined});
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resume('vis'); });

/* ================= Döngü ================= */
let last = 0, perf = 0, slow = 0;
// tek bir karede çıkan hata döngüyü öldürmesin: sonraki kare önceden istenir, hata kkdiag'a yazılır
let ERRN = 0, ERRLAST = '', FRN = 0;
// tanı: saniyede bir son durum (kare sayısı 0 ise döngü durmuş / WE askıya almış demektir)
setInterval(() => { try { const T = curT(), ai = activeIndex(T); localStorage.setItem('kkhb', JSON.stringify({w: Date.now(), fr: FRN, mode, T: +T.toFixed(1), ai, nw: words.length, nb: blocks.filter(Boolean).length, xf: XFL, st: ai >= 0 && blocks[words[ai].li] ? blocks[words[ai].li].style : '', vis: document.visibilityState, cw: cv.width, ch: cv.height, po: +POSTER.toFixed(2), cz: +(+CAM.zoom || 0).toFixed(2), err: ERRLAST.slice(0, 200)})); } catch(_){} FRN = 0; }, 1000);
function frame(ts){
  requestAnimationFrame(frame); FRN++;
  try { frameBody(ts); }
  catch(e){
    const m = String(e && e.message) + ' @ ' + String(e && e.stack || '').split('\n').slice(1, 4).map(s => s.trim().replace(/^at /, '').replace(/\(.*kinetik\.js:/, '(')).join(' < ');
    if (window.__err) window.__err.push(m);
    if (m !== ERRLAST || ++ERRN % 300 === 0){ ERRLAST = m; diag('err', {m: m.slice(0, 300), mode, st: (blocks[(words[activeIndex(curT())] || {}).li] || {}).style}); }
    try { if (g.reset) g.reset(); else { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; } } catch(_){}
  }
}
function frameBody(ts){
  if (last && ts - last > 1000) resume('gap', (ts - last) / 1000);
  const dt = Math.min(.1, last ? (ts - last) / 1000 : .016); last = ts;
  const T = curT();
  if (mode !== 'lyrics') genStep(T);
  L.onset = false;
  const ai = activeIndex(T);
  for (let i = assigned + 1; i <= ai; i++) assignAnim(words[i], i === ai);
  if (ai > assigned) assigned = ai;
  const t0 = performance.now();
  render(T, dt);
  drawFade();
  g3Frame(T); // 3D yazı düğümleri (çizim glFrame'de)
  glFrame(T, dt); // 2D kare tamamlandıktan sonra (efektler geçişleri de kapsasın)
  // kare çok uzun sürerse çözünürlüğü kademeli düşür (akıcılık önce)
  perf = perf * .97 + (performance.now() - t0) * .03;
  if (perf > 9 && S.res > .55 && ++slow > 90){ S.res = Math.max(.55, S.res - .15); slow = 0; perf = 0; resize(); }
}
applyLook(); ensureFont(); setMode('idle');
requestAnimationFrame(frame);
window.__kk = {MIX, B3, fxWave, cg(){ return camGoal(curT(), cv.width, cv.height); }, get CAMK(){ return CAMK; }, /* test: kelime tanıma */ wordTest(r, l){ const o = UPL; UPL = l || o; try { return [iconOf(r), semOf(r)]; } finally { UPL = o; } }, get CAMU(){ return CAM.u; }, get G3(){ return G3; }, HAS_G3, get TRN(){ return {SPL, SPLS, WP: !!WP, RLI, BC, FQ}; }, get BR(){ return BR; }, get POSTER(){ return POSTER; }, get XF(){ return XFL; }, MOUSE, CAM, pg(){ return posterGoal(curT(), cv.width, cv.height); }, tick(dt){ render(curT(), dt); }, /* test: kare döngüsü kısılan başsız tarayıcıda zamanı ilerletir */ S, L, M, get mode(){ return mode; }, get words(){ return words; }, get blocks(){ return blocks; }, get theme(){ return TH_KEY; }, curT,
  // test: kamera oturmuş hâlde bir karenin çizim süresi (ms)
  bench(n){ snapCam = true; const T = curT(); render(T, 1/60); const t = performance.now(); for (let i = 0; i < n; i++) render(T, 1/60); return (performance.now() - t) / n; },
  settle(){ snapCam = true; render(curT(), 1/60); }};

// Dinleyiciler hemen kaydedilmeli (onload içinde değil)
if (window.wallpaperRegisterAudioListener) window.wallpaperRegisterAudioListener(onAudio);
if (window.wallpaperRegisterMediaStatusListener) window.wallpaperRegisterMediaStatusListener(e => { M.enabled = !!(e && e.enabled); if (!M.enabled){ M.key = ''; M.title = ''; info(); setMode('idle'); } });
if (window.wallpaperRegisterMediaPropertiesListener) window.wallpaperRegisterMediaPropertiesListener(onProps);
if (window.wallpaperRegisterMediaThumbnailListener) window.wallpaperRegisterMediaThumbnailListener(onThumb);
if (window.wallpaperRegisterMediaPlaybackListener) window.wallpaperRegisterMediaPlaybackListener(onPlayback);
if (window.wallpaperRegisterMediaTimelineListener) window.wallpaperRegisterMediaTimelineListener(onTimeline);
