/* ================= Şarkı kartı ve görünüm ================= */
function info(){
  const el = $('info'), has = !!M.title && !M.stopped && S.info;
  el.hidden = !has; if (!has) return;
  const t = cleanTitle(M.title) || M.title, sp = t.split(/\s[-–—]\s/);
  // "Sanatçı - Şarkı" biçimli YouTube başlığında kartta yalnızca şarkı adı
  $('ti').textContent = sp.length >= 2 ? sp.slice(1).join(' - ') : t;
  $('ar').textContent = sp.length >= 2 ? sp[0] : cleanArtist(M.artist);
  const im = $('art'); im.hidden = !M.thumb; if (M.thumb){ const src = M.thumb.startsWith('data:') ? M.thumb : 'data:image/png;base64,' + M.thumb; if (im.src !== src) im.src = src; } // aynı resmi yeniden çözme (geçişte takılma)
}
function applyLook(){
  const P = pre();
  document.body.style.background = P.bg;
  const el = $('info'); el.style.color = P.fg;
  $('st').style.color = P.fg;
  info();
}
let fontKey = '';
function ensureFont(){
  const fs = fontList(), k = fs.join('|');
  if (k === fontKey) return; fontKey = k;
  Promise.all(fs.map(f => document.fonts.load(f, 'ABÇĞİÖŞÜ0123abçğıöşü').catch(() => {}))).then(() => { if (fontKey === k) relayout(); });
}

/* ================= Kullanıcı ayarları (Wallpaper Engine özellikleri) ================= */
window.wallpaperPropertyListener = {
  setPaused(p){ if (p){ RZ.paused = true; diag('ps', {}); } else resume('wp'); },
  applyUserProperties(p){
    let lay = false;
    if (p.tema){ S.theme = p.tema.value; lay = true; }
    // özel tema: üç renk ve yazı tipi (tema "Özel" seçiliyken görünür etkisi olur)
    for (const [k, f] of [['ozelzemin', 'bg'], ['ozelyazi', 'fg'], ['ozelvurgu', 'ac']]) if (p[k]){ const h = weHex(p[k].value); if (h){ THEMES.ozel[f] = [h]; lay = true; lastBg = ''; } }
    if (p.ozelfont){ const F = OZEL_FONTS[p.ozelfont.value] || OZEL_FONTS.bigshoulders; THEMES.ozel.big = F[0]; THEMES.ozel.small = F[1]; lay = true; }
    if (p.saatturu) S.clockKind = p.saatturu.value || 'dijital';
    // animasyon türü: kategori (benzer stiller bir arada); eski kayıtlı tek stil adı gelirse kategorisi seçilir
    if (p.stil){ const v = p.stil.value || 'oto'; S.cat = CATS[v] ? v : Object.keys(CATS).find(k => CATS[k].includes(v)) || ''; lay = true; }
    // arka plan: 3D sahneler ve 2D efektler tek listede; Otomatik her şarkıda birini seçer
    if (p.arkaplan){ const v = p.arkaplan.value || 'oto'; S.bg3 = v === 'oto' ? 'oto' : v.startsWith('3d-') ? v.slice(3) : 'kapali'; S.bg = v.startsWith('3d-') ? 'yok' : v; BR.list.length = 0; BR.key = null; }
    // gruplu düğmeler: her biri birbirine yakın birkaç efekti birlikte açıp kapatır
    if (p.muzik){ S.freq = S.breath = S.beatcut = S.rap = S.beatflash = !!p.muzik.value; lay = true; }
    if (p.anlam){ S.semantic = S.icons = S.hold = !!p.anlam.value; }
    if (p.sahnefx){ S.wipe = S.split = S.poster = !!p.sahnefx.value; lastBg = ''; if (!S.split) SPL = null; }
    if (p.parcacik) S.particles = !!p.parcacik.value;
    if (p.sinema) S.cine = !!p.sinema.value;
    if (p.parlama) S.bloom = !!p.parlama.value;
    if (p.hava) S.weather = !!p.hava.value;
    if (p.derinlik) S.depth = !!p.derinlik.value;
    if (p.bozulma) S.distort = !!p.bozulma.value;
    if (p.filtre) S.filter = p.filtre.value || 'kapali';
    if (p.sinemasiddet) S.cineAmt = p.sinemasiddet.value / 100;
    if (p.buyukharf){ S.upper = !!p.buyukharf.value; lay = true; }
    if (p.takip) S.move = p.takip.value / 100;
    if (p.sarsinti) S.shake = p.sarsinti.value / 100;
    if (p.donus){ S.rot = p.donus.value / 100; lay = true; }
    if (p.sozkaydir) S.off = +p.sozkaydir.value;
    if (p.sarkibilgisi) S.info = !!p.sarkibilgisi.value;
    if (p.durum){ S.status = !!p.durum.value; if (!S.status) $('st').hidden = true; }
    if (p.gecis) S.trans = p.gecis.value || 'oto';
    if (p.kelimekarma) S.wordMix = !!p.kelimekarma.value;
    if (p.dizilis) S.layout = p.dizilis.value || 'oto';
    if (p.saat){ S.clock = !!p.saat.value; if (mode === 'idle') setMode('idle'); }
    if (p.fare) S.mouse = !!p.fare.value;
    if (p.cikis){ S.exit = p.cikis.value || 'oto'; lay = true; }
    if (p.yapayzeka){
      const was = S.ai; S.ai = !!p.yapayzeka.value;
      if (S.ai && !was && WS_LAST && WS_LAST.key === M.key) wordSync(WS_LAST.key, WS_LAST.src, WS_LAST.timed); // çalan şarkı için hemen başla
    }
    if (p.spektrum){ const v = p.spektrum.value || 'kapali'; S.spec = v === 'kapali' || SPK.includes(v) ? v : 'tel'; } // eski türler (çubuk, dalga…) tele düşer
    if (p.spektrumboy) S.specSize = clamp(+p.spektrumboy.value / 100, .4, 2.5);
    if (p.plak) S.record = !!p.plak.value;
    if (p.tani) S.diag = !!p.tani.value;
    if (p.ceviri){ const was = S.translate; S.translate = !!p.ceviri.value; if (S.translate && !was && mode === 'lyrics' && M.key) loadTranslation(M.key); }
    // ilk yüklemede gelen değer yalnızca kaydedilir; sonra her değişimde çalan şarkının tıklamaları silinir
    if (p.senkronsifirla){
      if (S.resetSeen !== undefined && S.resetSeen !== p.senkronsifirla.value && PL && PL.key === M.key){ PL.anchors = {}; saveAnchors(); applyPlain(true); }
      S.resetSeen = p.senkronsifirla.value;
    }
    applyLook();
    if (lay){ fontKey = ''; ensureFont(); relayout(); }
  }
};
