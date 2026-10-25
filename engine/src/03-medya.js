/* ================= Medya oturumu ================= */
const MI = window.wallpaperMediaIntegration || {};
const M = { enabled:null, title:'', artist:'', album:'', playing:false, pos:0, at:0, dur:0, lastRep:null, hasTl:false, thumb:'', key:'' };
const songT = () => M.pos + (M.playing ? nowS() - M.at : 0);
const RZ = {at: -99, paused: false}; // son uykudan dönüş anı (bkz. resume)
let idleT0 = nowS();
let SO = 0; // şarkıya özel elle senkron düzeltmesi (sn)
function curT(){ return mode === 'idle' ? nowS() - idleT0 : songT() + S.off + SO; }

const cleanTitle = s => (s || '')
  .replace(/\s*[([][^)\]]*(official|video|audio|lyric|lyrics|klip|remaster|hd|4k|mv|visuali[sz]er|live|söz)[^)\]]*[)\]]/gi, '')
  .replace(/\s+(ft\.?|feat\.?|featuring)\s.*$/i, '').replace(/\s*\|.*$/, '').trim();
const cleanArtist = s => (s || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').replace(/\s+Official$/i, '').trim();

// tanı kaydı: WE'den gelen medya olayları (son 60) yerel kayıtta 'kkdiag' anahtarında; diskteki leveldb'den okunur
const DIAG = [];
function diag(k, o){ DIAG.push(Object.assign({k, at: +nowS().toFixed(2), est: +songT().toFixed(2), pl: M.playing ? 1 : 0}, o)); if (DIAG.length > 60) DIAG.shift(); try { localStorage.setItem('kkdiag', JSON.stringify(DIAG)); } catch(_){} }
function onProps(e){
  diag('pr', {ti: (e && e.title || '').slice(0, 30)});
  const title = (e && e.title) || '', artist = (e && e.artist) || '';
  M.album = (e && e.albumTitle) || '';
  const key = artist + '\u0001' + title;
  if (key === M.key) return;
  // yeni şarkı: renkler/tema değişir. Saat ekranındaysak arama bitene dek saat eski renklerinde kalır (CLK_HOLD),
  // sözler gelince ya da söz yoksa tek geçişle yeni şarkıya geçilir (art arda iki geçiş olmasın)
  if (mode === 'idle' && S.clock && title) CLK_HOLD = CLK_HOLD || pal(0); else screenFade();
  M.key = key; M.title = title; M.artist = artist; M.stopped = false; M.colors = null; M.thumb = ''; // önceki şarkının kapağı kalmasın
  M.pos = 0; M.at = nowS(); M.hasTl = false; M.lastRep = null; M.dur = 0; M.playing = true; M.silFrozen = false; M.silAt = 0;
  // duvar kâğıdı yeniden yüklendiyse: aynı şarkı için kaydedilen saatten devam (WE'nin ilk konumu bayat olabilir)
  // yalnız sayfa açıldıktan sonraki ilk şarkıda (sonradan durdurup yeniden başlatılan şarkı baştan başlar)
  M.restore = null; const first = !M.seenKey; M.seenKey = true;
  try { const r = JSON.parse(localStorage.getItem('kkpos') || 'null'), age = r ? (Date.now() - r.w) / 1000 : 1e9;
    if (first && r && r.k === key && age < 900){ M.restore = r.p + (r.pl ? age : 0); M.pos = M.restore; } } catch(_){}
  L.drops = [];
  // şarkı bilgisinden önce gelen konum (yüklemede WE önce konumu yolluyor) bu şarkıya uygulanır
  const pend = M.pendTl; M.pendTl = null;
  if (pend && nowS() - pend.at < 3) onTimeline(pend.e, nowS() - pend.at);
  info();
  if (!title){ setMode('idle'); return; }
  startTrack(key);
}
function onPlayback(e){
  diag('pb', {st: e && e.state});
  const st = e && e.state;
  const playingNow = MI.PLAYBACK_PLAYING !== undefined ? st === MI.PLAYBACK_PLAYING : st === 1;
  const stopped = MI.PLAYBACK_STOPPED !== undefined && st === MI.PLAYBACK_STOPPED;
  if (playingNow && !M.playing){ M.pos = songT(); M.at = nowS(); M.playing = true; M.silFrozen = false; }
  else if (!playingNow && M.playing){ M.pos = songT(); M.at = nowS(); M.playing = false; }
  if (stopped && mode !== 'idle'){ setMode('idle'); M.stopped = true; info(); }
  // durdurulan şarkı yeniden çalarsa (özellikler tekrar gelmeyebilir) sözleri geri getir
  else if (playingNow && M.stopped && M.title){ M.stopped = false; info(); startTrack(M.key); }
}
function onTimeline(e, late){
  diag('tl', {p: e && e.position, d: e && e.duration});
  if (!e || typeof e.position !== 'number') return;
  if (!M.key){ M.pendTl = {e, at: nowS()}; return; }
  if (late && M.playing) e = Object.assign({}, e, {position: e.position + late});
  if (e.duration > 0) M.dur = e.duration;
  // aynı değer art arda (1.5 sn içinde) gelirse kopyadır; daha sonra gelen aynı değer gerçek sarmadır (ör. başa alma)
  if (e.position === M.lastRep && M.hasTl && nowS() - M.lastRepAt < 1.5) return;
  M.lastRepAt = nowS();
  // WE konumu tam saniyeye yuvarlıyor ve olaylar ~1 sn'lik tikte geliyor: ±1 sn'lik fark gürültüdür.
  // Yalnızca bariz fark (sarma) saati atlatır; küçük fark yavaş yavaş emilir.
  const est = songT(), d = e.position - est;
  // uykudan dönüşün ilk saniyelerinde geri atlama bayat konum olabilir (Chrome konumu yalnız olayda günceller):
  // ikinci bir konum onu doğrulamadan (aradaki süre kadar ilerlemiş olmalı) saati geri alma
  if (M.hasTl && d < -1.6 && nowS() - RZ.at < 5){
    // aynı bayat değerin tekrarı doğrulama sayılmasın: en az 1.5 sn arayla ve ±1 sn içinde ilerlemiş olmalı
    const pb = M.pendBack, el = pb ? nowS() - pb.at : 0;
    if (!pb || el < 1.5 || Math.abs(e.position - pb.p - el) > 1){ if (!pb || el >= 1.5) M.pendBack = {p: e.position, at: nowS()}; diag('rb', {d: +d.toFixed(1)}); return; }
  }
  M.pendBack = null;
  // yüklemeden sonraki ilk konum: Chrome konumu yalnız olaylarda (oynat/duraklat/sarma) günceller, WE bu bayat değeri
  // gönderir; bayat değer hep geridedir. Kayıttaki tahminden gerideyse yok say, ileride ise (arada sarılmış) ona geç.
  if (!M.hasTl && M.restore != null){
    M.restore = null; M.lastRep = e.position; M.hasTl = true;
    if (d < 0 && !(e.duration > 0 && est > e.duration)){ diag('rs', {}); return; }
  }
  // uygulamada konum hassas (4 kez/sn): yarım saniyelik fark bile düzeltilir, küçük fark hızla emilir
  const jump = APP ? .5 : 1.6;
  if (!M.hasTl || Math.abs(d) > jump){ M.pos = e.position; M.at = nowS(); if (Math.abs(d) > jump) snapCam = true; }
  else { M.pos = est + d * (APP ? .5 : .25); M.at = nowS(); }
  M.lastRep = e.position; M.hasTl = true;
}
// saati saniyede bir kaydet (yeniden yüklemede kaldığı yerden devam için)
setInterval(() => { if (M.key && M.title && !M.stopped) try { localStorage.setItem('kkpos', JSON.stringify({k: M.key, p: songT(), w: Date.now(), pl: M.playing ? 1 : 0})); } catch(_){} }, 1000);
// Duraklatma yalnız WE'nin oynatma olayından (PAUSED) alınır. Sessizlikten tahmin denendi ve kaldırıldı:
// şarkı başı/reklam sessizliğinde saat donuyor, WE duvar kâğıdını uyutunca da donuk kalıyordu.
function onThumb(e){
  if (!e) return;
  M.thumb = e.thumbnail || '';
  const old = M.colors ? M.colors.bg + M.colors.fg + M.colors.ac : '';
  const P = M.colors = M.colors || {}, norm = c => { if (!c) return null; const x = document.createElement('canvas').getContext('2d'); x.fillStyle = '#000001'; x.fillStyle = c; return x.fillStyle === '#000001' ? null : x.fillStyle; };
  const bg = norm(e.primaryColor), fg = norm(e.textColor) || norm(e.highContrastColor);
  if (!bg){ if (old && !CLK_HOLD) screenFade(); M.colors = null; info(); applyLook(); return; }
  P.bg = bg; P.fg = fg || (lum(bg) > .45 ? '#111111' : '#FFFFFF');
  // okunurluk: kapağın yazı rengi zemine yakınsa siyah ya da beyaz (hangisi daha çok ayrışıyorsa)
  if (contrast(P.fg, P.bg) < 4.5) P.fg = contrast('#111111', P.bg) >= contrast('#FFFFFF', P.bg) ? '#111111' : '#FFFFFF';
  // vurgu: arka planla en iyi ayrışan ikincil renk, yoksa yazı rengi
  const cands = [norm(e.secondaryColor), norm(e.tertiaryColor)].filter(Boolean).sort((a, b) => contrast(b, P.bg) - contrast(a, P.bg));
  P.ac = cands.length && contrast(cands[0], P.bg) > 2.2 ? cands[0] : P.fg;
  if (P.bg + P.fg + P.ac !== old && !CLK_HOLD) screenFade(); // kapak renkleri gelince zemin bir karede değişmesin
  info(); applyLook();
}
function lum(hex){ const n = parseInt(hex.slice(1), 16), f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126*f(n >> 16) + .7152*f((n >> 8) & 255) + .0722*f(n & 255); }
function contrast(a, b){ const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
