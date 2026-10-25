/* Kinetik Klip Canlı — Wallpaper Engine web duvar kâğıdı.
   Çalan şarkıyı Wallpaper Engine'in medya entegrasyonundan (Windows medya oturumu: Spotify, tarayıcıda YouTube…) alır,
   zamanlı sözleri LRCLIB'den çeker ve şarkının konumuna göre kinetik tipografiyle oynatır.
   Ritim, Wallpaper Engine'in gönderdiği canlı ses spektrumundan (128 bant, ~30/sn) çıkarılır. */
(function(){
'use strict';
// ===== src/01-temel.js =====
const $ = id => document.getElementById(id);
const clamp = (v,a,b) => v < a ? a : v > b ? b : v;
const lerp = (a,b,t) => a + (b - a) * t;
// GSAP eğrileri: tuval animasyonları da GSAP'ın eğrileriyle (expo/back/bounce) yumuşak oturur; gsap yüklenemezse eski formüller
const gez = (n, fb) => window.gsap ? window.gsap.parseEase(n) : fb;
const easeOut = gez('expo.out', p => 1 - Math.pow(1 - p, 3));
const easeBack = window.gsap ? window.gsap.parseEase('back.out(1.9)') : p => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3*Math.pow(p-1,3) + c1*Math.pow(p-1,2); };
const noise1 = x => Math.sin(x)*.6 + Math.sin(x*2.31+1.7)*.3 + Math.sin(x*5.13+.3)*.1;
const hash01 = n => { n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 9); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296; };
function rngFrom(seed){ let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const nowS = () => performance.now() / 1000;
// mobil uygulamanın sahnesi (stage.html KK.uygulama): konum kesin ve sık gelir, dokunuş senkron düzeltmesi değildir
const APP = !!(window.KK && window.KK.uygulama);

const S = { theme:'oto', res:1, cat:'', move:.7, shake:.5, rot:.55, upper:true, off:0, info:true, status:true, clock:true, particles:true, bg:'oto', semantic:true, breath:true, poster:true, mouse:true, rap:true,
  exit:'oto', wordMix:true, layout:'oto', icons:true, hold:true, freq:true, beatcut:true, wipe:true, split:true, bg3:'oto', cine:true, cineAmt:.6 };
if (matchMedia('(prefers-reduced-motion: reduce)').matches) S.shake = 0;
let UPL = 'tr'; // sözlerin dili (büyük/küçük harf kuralı); setMode sözlerden tahmin eder
const up = s => S.upper ? s.toLocaleUpperCase(UPL) : s;
// Türkçeye özgü harf yoksa ve İngilizce sık kelimeler varsa İngilizce say
function guessLang(text){
  const t = (text || '').toLowerCase(), tr = (t.match(/[çğışöü]/g) || []).length, en = (t.match(/\b(the|you|and|i|i'm|me|my|your|to|it|is|don't|can't|won't|of|in|on|we|love|baby|never|know)\b/g) || []).length;
  if (/ə/.test(t)) return 'az';
  return tr === 0 && en >= 2 ? 'en' : tr > 0 ? 'tr' : (en ? 'en' : 'tr');
}

const cv = $('cv'), g = cv.getContext('2d');
// 3D yazı stilleri: GSAP + three.js + troika + gömülü fontlar gerekir (biri yüklenemezse bu stiller kapalı)
const HAS_G3 = !!(window.gsap && window.THREE && window.PP && window.TT && window.KKFONTS);
let snapCam = true;
let aspClass = '', relayoutHook = null; // relayout aşağıda tanımlanınca bağlanır
function resize(){
  // 4K ve üstünde tuval en çok 3840×2160 piksel (yazı keskin kalır, kare süresi patlamaz)
  // telefonda tuval CSS pikselinin en çok 1.25 katı (yazılar büyük, keskin kalır; kare süresi yarıya iner)
  let d = Math.min(devicePixelRatio || 1, APP ? 1.25 : 1.5) * S.res;
  d = Math.min(d, Math.sqrt(3840 * 2160 / Math.max(1, innerWidth * innerHeight)));
  cv.width = Math.round(innerWidth * d); cv.height = Math.round(innerHeight * d); snapCam = true;
  // ekran oranı sınıfı değişince (dikey ↔ yatay ↔ ultra geniş) satırlar yeniden dizilir
  const a = cv.width / Math.max(1, cv.height), c = a < .9 ? 'd' : a < 1.4 ? 'k' : a > 2.1 ? 'u' : 'y';
  if (c !== aspClass){ const was = aspClass; aspClass = c; if (was && relayoutHook) relayoutHook(); }
}
addEventListener('resize', resize); resize();

/* ================= Durum yazısı ================= */
let stTimer;
function status(msg, sticky){
  const el = $('st'); el.textContent = msg || ''; el.hidden = !msg || !S.status;
  clearTimeout(stTimer); if (msg && !sticky) stTimer = setTimeout(() => el.hidden = true, 7000);
}

// ===== src/02-ses.js =====
/* ================= Canlı ses (Wallpaper Engine spektrumu) ================= */
// 128 değer: 0–63 sol, 64–127 sağ kanal; düşük indeks bas. Her bant kendi tepe değerine göre normalize edilir.
const L = { low:0, mid:0, high:0, lowSlow:0, intensity:0, pLo:.05, pMi:.05, pHi:.05, prevLo:0, fluxAvg:.03,
  lastOn:-9, ivs:[], bpm:120, drops:[], hist:[], lastDrop:-99, onset:false, packets:0, beat:0 };
function onAudio(a){
  const t = nowS(); L.packets++;
  let lo = 0, mi = 0, hi = 0;
  for (let i = 0; i < 64; i++){
    const v = Math.min(1, ((a[i] || 0) + (a[i + 64] || 0)) / 2);
    if (i < 5) lo += v; else if (i < 24) mi += v; else hi += v;
  }
  lo /= 5; mi /= 19; hi /= 40;
  L.pLo = Math.max(lo, L.pLo * .9985, .03); L.pMi = Math.max(mi, L.pMi * .9985, .02); L.pHi = Math.max(hi, L.pHi * .9985, .015);
  const nlo = lo / L.pLo, nmi = mi / L.pMi, nhi = hi / L.pHi;
  L.low = nlo; L.mid = nmi; L.high = nhi;
  L.lowSlow += (nlo - L.lowSlow) * .12;
  L.intensity += ((nlo + nmi + nhi) / 3 - L.intensity) * .04;
  // Atak: bastaki ani artış. Ataklar arası sürelerden tempo tahmini (70–180 BPM'e katlanır, medyan).
  const flux = Math.max(0, nlo - L.prevLo); L.prevLo = nlo;
  L.fluxAvg += (flux - L.fluxAvg) * .06;
  if (flux > L.fluxAvg * 2 + .12 && t - L.lastOn > .22){
    let iv = t - L.lastOn;
    if (iv < 2){
      while (iv < 60 / 180) iv *= 2;
      while (iv > 60 / 90) iv /= 2; // yarım tempoya düşmesin
      L.ivs.push(iv); if (L.ivs.length > 24) L.ivs.shift();
      const s = [...L.ivs].sort((x, y) => x - y); L.bpm = 60 / s[s.length >> 1];
    }
    L.lastOn = t; L.onset = true; L.beat = Math.min(1, .55 + flux); L.beatN = (L.beatN || 0) + 1; // görsel vuruş darbesi (karede söner)
  }
  // Patlama: ~2.5 sn sakinliğin ardından gelen yüksek yoğunluk
  L.hist.push(L.intensity); if (L.hist.length > 75) L.hist.shift();
  if (L.hist.length >= 60 && L.intensity > .62 && t - L.lastDrop > 8){
    let mn = 9; for (const v of L.hist) if (v < mn) mn = v;
    if (mn < .3){ L.lastDrop = t; L.drops.push(curT()); if (L.drops.length > 8) L.drops.shift(); }
  }
}

// ===== src/03-medya.js =====
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

// ===== src/04-sozler.js =====
/* ================= LRCLIB'den zamanlı sözler ================= */
const norm = s => (s || '').toLocaleLowerCase('tr').replace(/official|video|lyrics?|audio|remaster(ed)?|klip/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
const fold = s => s.replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
function sim(a, b){ const A1 = new Set(norm(a).map(fold)), B1 = new Set(norm(b).map(fold)); if (!A1.size || !B1.size) return 0; let n = 0; A1.forEach(x => { if (B1.has(x)) n++; }); return n / Math.max(A1.size, B1.size); }
async function lrclib(params){
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch('https://lrclib.net/api/search?' + new URLSearchParams(params), {signal: ctl.signal});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}
function cacheGet(k){ try { const v = JSON.parse(localStorage.getItem('kk4:' + k)); if (v && (v.lrc || Date.now() - v.ts < 864e5)) return v; } catch(e){} return null; }
function cacheSet(k, v){ try { localStorage.setItem('kk4:' + k, JSON.stringify(Object.assign({ts: Date.now()}, v))); } catch(e){} }
async function findLyrics(key){
  const c = cacheGet(key); if (c) return c;
  const t0 = cleanTitle(M.title), a0 = cleanArtist(M.artist);
  // YouTube başlığı çoğu zaman "Sanatçı - Şarkı" olur, kanal adı ise sanatçı değildir
  const cands = [];
  const sp = t0.split(/\s[-–—]\s/);
  if (sp.length >= 2) cands.push({t: sp.slice(1).join(' - ').trim(), a: sp[0].trim()});
  cands.push({t: t0, a: a0});
  let all = [], net = false;
  for (const q of cands){
    try {
      const res = await lrclib(q.a ? {track_name: q.t, artist_name: q.a} : {track_name: q.t});
      net = true; res.forEach(x => x._q = q); all = all.concat(res);
      if (res.some(x => x.syncedLyrics)) break;
    } catch(e){}
  }
  if (!all.some(x => x.syncedLyrics)){
    try { const res = await lrclib({q: (sp.length >= 2 ? t0 : t0 + ' ' + a0)}); net = true; res.forEach(x => x._q = cands[0]); all = all.concat(res); } catch(e){}
  }
  const D = M.dur;
  // süre farkı: video sürümü uzun olabilir; aynı şarkıyı elemesin diye ceza en fazla 1 puan
  const scoreOf = x => { const dd = D ? Math.abs(x.duration - D) : 0; return 2 * sim(x.trackName, x._q.t) + (x._q.a ? sim(x.artistName, x._q.a) : .5) - Math.min(dd, 30) / 30; };
  const pick = has => all.filter(x => has(x) && !x.instrumental).map(x => (x._score = scoreOf(x), x)).sort((x, y) => y._score - x._score)[0];
  const best = pick(x => x.syncedLyrics), plain = pick(x => x.plainLyrics);
  let v = best && best._score >= 1.2 ? {lrc: best.syncedLyrics, name: best.trackName + ' · ' + best.artistName, srcDur: best.duration} : null;
  // LRCLIB'de zamanlı söz yoksa YouTube Music (LyricFind/Musixmatch; YouTube'un "Şarkı sözleri" sekmesindeki sözler)
  let yt = null;
  if (!v){ try { yt = await ytLyrics(sp.length >= 2 ? t0 : (a0 + ' ' + t0).trim(), cands[0]); net = true; } catch(e){} }
  if (!v && yt && yt.lrc) v = yt;
  if (!v && plain && plain._score >= 1.2) v = {plain: plain.plainLyrics, name: plain.trackName + ' · ' + plain.artistName}; // zamansız düz söz
  if (!v && yt && yt.plain) v = yt;
  if (!v && !net) return {error: true};
  v = v || {lrc: null};
  cacheSet(key, v); return v;
}

/* ================= YouTube Music'ten sözler ================= */
// İç arayüz (youtubei) kaynağı "null" olan isteklere CORS izni veriyor; WE duvar kâğıdı dosyadan açıldığı için kaynağı null.
// Android Music istemcisi satır zamanlı sözü (cueRange), web istemcisi düz metni verir. Şarkı başına bir kez sorulur, sonuç önbellekte.
const YTM = 'https://music.youtube.com/youtubei/v1/';
const YT_WEB = {clientName: 'WEB_REMIX', clientVersion: '1.20251001.01.00', hl: 'tr', gl: 'TR'};
const YT_AND = {clientName: 'ANDROID_MUSIC', clientVersion: '7.27.52', androidSdkVersion: 34, hl: 'tr', gl: 'TR'};
async function ytm(ep, client, body){
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
  try {
    // text/plain: ön kontrol (preflight) isteği gerektirmeyen basit istek
    const r = await fetch(YTM + ep + '?prettyPrint=false', {method: 'POST', credentials: 'omit', signal: ctl.signal,
      headers: {'Content-Type': 'text/plain;charset=UTF-8'}, body: JSON.stringify(Object.assign({context: {client}}, body))});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}
function findAll(o, pred, out){ out = out || []; if (o && typeof o === 'object'){ if (pred(o)) out.push(o); for (const k in o) findAll(o[k], pred, out); } return out; }
const runsText = r => r ? (r.runs ? r.runs.map(x => x.text).join('') : r.simpleText || '') : '';
const durOf = s => { const m = /\b(\d{1,2}):(\d\d)(?::(\d\d))?\b/.exec(s || ''); return m ? (m[3] ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2]) : 0; };
const lrcTag = t => { const m = Math.floor(t / 60), s = t - m * 60; return String(m).padStart(2, '0') + ':' + s.toFixed(2).padStart(5, '0'); };
async function ytLyrics(query, q){
  // aday: şarkılar ve videolar; süresi çalan parçaya en yakın, adı en çok tutan
  const cands = [];
  for (const params of ['EgWKAQIIAWoKEAkQBRAKEAMQBA==', 'EgWKAQIQAWoKEAkQChAFEAMQBA==']){
    try {
      const j = await ytm('search', YT_WEB, {query, params});
      findAll(j, o => o.musicResponsiveListItemRenderer).slice(0, 4).forEach(x => {
        const it = x.musicResponsiveListItemRenderer, cols = (it.flexColumns || []).map(c => runsText(c.musicResponsiveListItemFlexColumnRenderer && c.musicResponsiveListItemFlexColumnRenderer.text));
        const vid = (it.playlistItemData && it.playlistItemData.videoId) || (findAll(it, o => typeof o.videoId === 'string')[0] || {}).videoId;
        if (vid) cands.push({vid, title: cols[0] || '', sub: cols.slice(1).join(' '), dur: durOf(cols.slice(1).join(' '))});
      });
    } catch(e){}
  }
  if (!cands.length) return null;
  const D = M.dur;
  // sanatçı: aranan sanatçı kelimelerinin alt satırda ("Sanatçı ve Sanatçı • Albüm • 2:38") geçme oranı
  const cover = (hay, need) => { const H = new Set(norm(hay).map(fold)), N2 = norm(need).map(fold).filter(x => x !== 'x' && x !== 've' && x !== 'feat' && x !== 'ft'); return N2.length ? N2.filter(x => H.has(x)).length / N2.length : .5; };
  cands.forEach(c => { c.score = 2 * sim(c.title, q.t) + cover(c.sub, q.a || '') - (D && c.dur ? Math.min(Math.abs(c.dur - D), 30) / 30 : .3); });
  cands.sort((a, b) => b.score - a.score);
  for (const c of cands.slice(0, 3)){
    if (c.score < .9) break;
    const nx = await ytm('next', YT_WEB, {videoId: c.vid, isAudioOnly: true});
    const be = findAll(nx, o => typeof o.browseId === 'string' && o.browseId.startsWith('MPLY'))[0];
    if (!be) continue;
    const name = c.title + ' · YouTube Music';
    try {
      const a = await ytm('browse', YT_AND, {browseId: be.browseId});
      const cues = findAll(a, o => typeof o.lyricLine === 'string' && o.cueRange && o.cueRange.startTimeMilliseconds != null);
      if (cues.length > 3){
        // video ile şarkı sürümünün süresi farklıysa aradaki fark baştaki giriş kabul edilir
        return {lrc: cues.map(x => '[' + lrcTag(+x.cueRange.startTimeMilliseconds / 1000) + '] ' + x.lyricLine.trim()).join('\n'), name, srcDur: c.dur};
      }
    } catch(e){}
    const b = await ytm('browse', YT_WEB, {browseId: be.browseId});
    const sh = findAll(b, o => o.musicDescriptionShelfRenderer)[0];
    const txt = sh ? runsText(sh.musicDescriptionShelfRenderer.description) : '';
    if (txt.trim()) return {plain: txt, name};
  }
  return null;
}

/* ================= Zamansız sözler: tahmini akış + tıklayarak düzeltme ================= */
// Düz sözler hece sayısına göre şarkıya yayılır (kıta araları nefes). Her tıklama sıradaki satırı o ana
// sabitler; sabitlenmemiş satırlar en yakın sabit noktayla birlikte kayar. Tıklamalar şarkıya özel saklanır.
let PL = null;
function plainLines(plain, dur){
  const D = dur || 210, items = plain.split(/\r?\n/).map(s => s.trim());
  const syl = s => Math.max(2, (s.match(/[aeıioöuüâîûAEIİOÖUÜ]/g) || []).length);
  const ws = items.map(s => s ? syl(s) + 1.5 : 5);
  const t0 = Math.max(8, D * .07), t1 = D - Math.max(8, D * .06), tot = ws.reduce((a, b) => a + b, 0) || 1;
  let acc = 0; const out = [];
  items.forEach((s, i) => { if (s) out.push({t: t0 + (t1 - t0) * acc / tot, words: s.split(/\s+/), text: s}); acc += ws[i]; });
  return out;
}
const anchorIdx = () => Object.keys(PL.anchors).map(Number).sort((x, y) => x - y);
const nextTap = () => { const k = anchorIdx(); return k.length ? k[k.length - 1] + 1 : 0; };
function plainTimed(){
  const b = PL.base, A = PL.anchors, idx = anchorIdx();
  return b.map((ln, i) => {
    let t = b[i].t;
    if (A[i] != null) t = A[i];
    else {
      let p = null, n = null; for (const j of idx){ if (j < i) p = j; else if (n == null) n = j; }
      if (p != null && n != null) t = A[p] + (A[n] - A[p]) * (b[i].t - b[p].t) / ((b[n].t - b[p].t) || 1);
      else if (p != null) t = b[i].t + (A[p] - b[p].t);
      else if (n != null) t = b[i].t + (A[n] - b[n].t);
    }
    return {t, words: ln.words};
  });
}
function plainStatus(){
  const n = nextTap();
  if (n >= PL.base.length) status('Senkron tamam; bu şarkı için kaydedildi.');
  else status((anchorIdx().length ? 'Düzeltiliyor. ' : 'Bu şarkının zamanlı sözü yok, tahmini akıyor. ') + 'Sıradaki satır söylenmeye başlarken ekrana tıkla: “' + PL.base[n].text + '”', true);
}
function applyPlain(keepCam){ setMode('lyrics', plainTimed(), keepCam); plainStatus(); }
function loadAnchors(key){ try { return JSON.parse(localStorage.getItem('kk2a:' + key)) || {}; } catch(e){ return {}; } }
function saveAnchors(){ try { localStorage.setItem('kk2a:' + PL.key, JSON.stringify(PL.anchors)); } catch(e){} }
function onTap(undo){
  if (APP) return; // telefonda ekrana dokunmak kontrolleri açar, senkronu kaydırmaz
  if (!PL && mode === 'lyrics' && M.syncHint){
    // zamanlı söz + video sürümü farklı: ekrandaki satır söylenirken tıklanır, o satır şimdiye oturur (orta tık sıfırlar)
    if (undo) SO = 0;
    else {
      const T = curT(), ai = activeIndex(T); if (ai < 0) return;
      const first = words.find(w => w.li === words[ai].li);
      SO += first.t + .15 - T; // tıklama tepki payı
    }
    try { localStorage.setItem('kk4o:' + M.key, String(SO)); } catch(e){}
    snapCam = true; status(undo ? 'Senkron düzeltmesi sıfırlandı.' : 'Senkron düzeltildi (' + (SO >= 0 ? '+' : '') + SO.toFixed(1) + ' sn); bu şarkı için kaydedildi.');
    return;
  }
  if (!PL || PL.key !== M.key || mode !== 'lyrics') return;
  if (undo){ const k = anchorIdx(); if (!k.length) return; delete PL.anchors[k[k.length - 1]]; }
  else {
    if (!M.playing) return;
    const i = nextTap(); if (i >= PL.base.length) return;
    PL.anchors[i] = Math.max(0, songT() - .15); // tıklama tepki payı
  }
  saveAnchors(); applyPlain(true);
}
// Sol tık: sıradaki satırı şimdiye sabitle. Orta tık: son sabitlemeyi geri al.
addEventListener('mousedown', e => { if (e.button === 0) onTap(false); else if (e.button === 1) onTap(true); });

async function startTrack(key){
  const t = cleanTitle(M.title), a = cleanArtist(M.artist);
  // arama sırasında boşta ekranı kalır (şarkı adı ekrana yazılmaz, kart gösteriyor); sözler bulununca tek geçişle gelir
  if (mode !== 'idle') setMode('idle');
  pickTheme(); ensureFont();
  status('Sözler aranıyor…', true);
  await new Promise(r => setTimeout(r, 900)); // süre bilgisi gelsin, özellikler parça parça gelebilir
  if (key !== M.key) return;
  const r = await findLyrics(key);
  if (key !== M.key) return;
  PL = null; SO = 0; M.syncHint = false;
  // söz yoksa saat ekranına dön (şarkı kartı ve ritim tepkisi sürer)
  if (r.error){ setMode('idle'); status('LRCLIB\'e ulaşılamadı; saat gösteriliyor.'); }
  else if (r.lrc){
    // sözler şarkı kaydına göre; video daha uzunsa fark girişte kabul edilir (klipler çoğunlukla bir sahneyle açılır)
    const diff = M.dur && r.srcDur ? M.dur - r.srcDur : 0, intro = !APP && diff > 2 && diff < 150 ? diff : 0; // uygulamada şarkı sürümü çalınır: fark genelde sondaki sessizlik
    M.syncHint = Math.abs(diff) > 2;
    try { SO = APP ? 0 : +(localStorage.getItem('kk4o:' + key) || 0) || 0; } catch(e){ SO = 0; }
    const src = parseLrc(r.lrc).map(l => ({t: l.t + intro, words: l.words}));
    setMode('lyrics', src);
    status(M.syncHint ? 'Sözler: ' + r.name + '. Video şarkıdan ' + Math.round(Math.abs(diff)) + ' sn ' + (diff > 0 ? 'uzun' : 'kısa') + '; kayma varsa ekrandaki satır söylenirken ekrana tıkla.' : 'Sözler: ' + r.name, M.syncHint);
    wordSync(key, src, true);
  }
  else if (r.plain){ PL = {key, base: plainLines(r.plain, M.dur), anchors: loadAnchors(key)}; applyPlain(false); wordSync(key, PL.base, false); }
  else {
    // hiçbir yerde söz yok: servis vokali ayırıp Whisper'ın duyduğunu söz yapar (servis kapalıysa saat kalır)
    setMode('idle'); status('Bu şarkının sözü bulunamadı; saat gösteriliyor.');
    wordSync(key, null, false); return;
  }
  loadTranslation(key);
}

/* ================= Kelime senkronu (yerel servis) ================= */
// %USERPROFILE%\KinetikKlip\senkron\senkron_servis.py: şarkıyı YouTube'dan bulur, vokali ayırır, Whisper ile her kelimenin
// zamanını çıkarır. Sözler önce satır zamanlı gösterilir; kelime zamanları gelince aynı sözler onlarla yeniden dizilir.
// Servis kapalıysa ya da sözler sesle tutmazsa hiçbir şey değişmez. İlk kez ~30 sn sürer, sonra servisin önbelleğinden anında.
// src null: şarkının sözü hiç bulunamadı; servis duyduğu metni satırlarıyla (j.lines) yollar.
// sayfa sunucudan açıldıysa (tarayıcı oynatıcısı) aynı sunucu; Wallpaper Engine dosyadan açar, o zaman varsayılan port
const WS_URL = (/^https?:/.test(location.protocol) ? location.origin : 'http://127.0.0.1:8778') + '/senkron';
async function wordSync(key, src, timed){
  if (APP) return; // telefonda yerel servis yok
  if (!M.dur) await new Promise(r => setTimeout(r, 1500)); // süre şarkı sürümünü seçmek için gerekli
  for (let i = 0; i < 60; i++){
    if (key !== M.key) return;
    let j;
    try {
      // text/plain: ön kontrol (preflight) isteği gerektirmeyen basit istek
      const r = await fetch(WS_URL, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=UTF-8'},
        body: JSON.stringify({key, title: M.title, artist: M.artist, dur: M.dur, lines: src ? src.map(l => l.words) : null, lt: src && timed ? src.map(l => l.t) : null,
          lang: src ? guessLang(src.map(l => l.words.join(' ')).join(' ')) : null,
          audio: window.KKP && window.KKP.audio || null})}); // tarayıcı oynatıcısı: ses sunucuda, YouTube'da aranmaz
      j = await r.json();
    } catch(e){ diag('ws', {s: 'yok'}); return; } // servis çalışmıyor: satır zamanlı devam
    if (j.state === 'done'){
      // uygulama hatası sessizce kaybolmasın: tanı kaydına (kkdiag) yazılır
      try { applyWordSync(key, src, j); diag('ws', {s: 'ok', n: j.wt.length, a: j.asr ? 1 : 0}); }
      catch(e){ diag('ws', {s: 'err', e: String(e).slice(0, 80)}); }
      return;
    }
    if (j.state !== 'working'){
      diag('ws', {s: j.state, r: (j.reason || '').slice(0, 40)});
      if (!src && mode === 'idle') status('Bu şarkının sözü bulunamadı; saat gösteriliyor.');
      return;
    }
    // söz yoksa beklerken ne olduğu görünsün (servis çalışıyor, sözler sesten çıkarılıyor)
    if (!i && !src && mode === 'idle') status('Bu şarkının sözü yok; sözler sesten çıkarılıyor…', true);
    await new Promise(r => setTimeout(r, 4000));
  }
}
function applyWordSync(key, src, j){
  if (key !== M.key || !j.wt) return;
  if (!src){
    // sesten çıkarılan sözler (saat ekranından sözlere geçilir)
    if (!j.lines || j.lines.length !== j.wt.length || M.stopped) return;
    PL = null; M.syncHint = !!j.approx; SO = 0;
    setMode('lyrics', j.lines.map((ws, i) => ({t: j.wt[i][0][0], words: ws, wt: j.wt[i]})));
    loadTranslation(key);
    return status('Sözler sesten çıkarıldı.');
  }
  if (mode !== 'lyrics' || j.wt.length !== src.length) return;
  const off = j.off || 0;
  // boş satırlar (LRC'de müzik arası damgaları) kelimesizdir: zamanları olduğu gibi kalır
  const lines = src.map((l, i) => { const wt = j.wt[i]; return wt && wt.length && wt.length === l.words.length
    ? {t: wt[0][0] + off, words: l.words, wt: wt.map(x => [x[0] + off, x[1] + off])} : {t: l.t, words: l.words}; });
  // kelime zamanları sesten: tahmini akış ve tıklama düzeltmesi artık gerekmez (sürüm farklıysa tıklama düzeltmesi açık kalır)
  PL = null; M.syncHint = !!j.approx; if (!j.approx) SO = 0;
  // kelimeler aynıysa yalnız zamanlar yerinde güncellenir: yeniden dizme (blok/3D yazı kurulumu) şarkı ortasında takılma yapıyordu.
  // Bloklar satır başlamadan hemen önce kurulduğu için gelecek satırlar yeni zamanlarla kurulur.
  const nw = lyricWords(lines);
  if (nw.length === words.length && nw.every((w, i) => w.raw === words[i].raw && w.li === words[i].li)){
    nw.forEach((w, i) => { const o = words[i]; o.t = w.t; if (w.hold) o.hold = w.hold; else delete o.hold; });
  } else { setMode('lyrics', lines, true); loadTranslation(key); }
  status('Kelime senkronu hazır.');
}

// ===== src/05-kelimeler.js =====
/* ================= Kelimeler ================= */
let mode = 'idle', words = [], blocks = [], gen = null, assigned = -1;
function parseLrc(lrc){
  const re = /^\[(\d+):(\d+(?:[.,]\d+)?)\]\s*(.*)$/;
  return lrc.split(/\r?\n/).map(l => l.trim().match(re)).filter(Boolean).map(m => ({
    t: +m[1] * 60 + parseFloat(m[2].replace(',', '.')),
    words: m[3].replace(/<\d+:\d+(?:[.,]\d+)?>/g, ' ').split(/\s+/).filter(Boolean)
  }));
}
function lyricWords(src){
  // wt: kelime senkronu servisinden gelen kelime başına [başlangıç, bitiş] (varsa satır içi tahmin yerine kullanılır)
  const lines = src.map(l => ({t: l.t, words: l.words, wt: l.wt})).sort((a, b) => a.t - b.t);
  const out = []; let prevT = -1, li = 0, lastSpk = '';
  lines.forEach((ln, i) => {
    // düet etiketi ("Ezhel: …") satırdan ayrılır, konuşan değişince bölünmüş ekran açılabilir (etiketsiz satır öncekinin)
    let ws = ln.words, wt = ln.wt && ln.wt.length === ln.words.length ? ln.wt : null;
    const tag = /^(\p{Lu}[\p{L}.'&-]{1,18}):$/u.exec(ws[0] || '');
    if (tag && ws.length > 1){ lastSpk = tag[1].toLocaleLowerCase('tr'); ws = ws.slice(1); if (wt) wt = wt.slice(1); }
    const spk = lastSpk;
    const n = ws.length; if (!n) return;
    const t1 = i + 1 < lines.length ? lines[i+1].t : ln.t + n * .6 + 1;
    // arka vokal: satırın tamamı parantez içinde
    const paren = /^[(（]/.test(ws[0]) && /[)）][.,!?…]*$/.test(ws[n - 1]);
    // satır içindeki kelimeler konuşma hızında yayılır
    const span = Math.min(Math.max(.2, t1 - ln.t) * .85, n * .55 + .4);
    ws.forEach((w, wi) => {
      let t = wt ? wt[wi][0] : ln.t + wi * span / n; if (t <= prevT) t = prevT + .03; prevT = t;
      const o = {raw: w, text: up(w), t, li, wi, idx: out.length, spk, paren};
      // uzatılan hece: kelime zamanı varsa kelimenin kendi süresinden, yoksa son kelimeden sıradaki satıra kadarki boşluktan
      if (wt){ if (wi === n - 1 && wt[wi][1] - t > 1.3) o.hold = Math.min(wt[wi][1] - t - .3, 4); }
      else if (wi === n - 1 && i + 1 < lines.length && t1 - t > 1.3) o.hold = Math.min(t1 - t - .3, 4);
      out.push(o);
    });
    li++;
  });
  guessSpeakers(out);
  return out;
}
// Düet tahmini: sözlerde konuşan etiketi yoksa ve şarkıcı alanında birden fazla isim varsa ("Sibel Can ve Eypio"),
// sözler uzun boşluklardan bölümlere ayrılır. Hızlı (rap) ve yavaş (şarkı) bölümler varsa hız grubuna göre, yoksa
// bölüm bölüm sırayla bir şarkıcıya verilir. Konuşan değişince bölünmüş ekran açılır.
function guessSpeakers(out){
  if (!out.length || out.some(w => w.spk)) return;
  const arts = cleanArtist(M.artist).split(/\s*(?:,|&|\+|\/|\bve\b|\bx\b|\bvs\.?|\bfeat\.?|\bft\.?|\bile\b|\bwith\b)\s*/i).map(s => s.trim()).filter(Boolean);
  if (arts.length < 2) return;
  const lines = []; out.forEach(w => { (lines[w.li] = lines[w.li] || []).push(w); });
  // hız: hece/sn (Türkçe rapte kelimeler uzun, kelime sayısı yanıltır); bölüm hızı satırların ortancası
  const syl = lw => lw.reduce((x, w) => x + Math.max(1, (w.raw.match(/[aeıioöuüâîûAEIİOÖUÜÂÎÛ]/g) || []).length), 0);
  const L2 = lines.filter(Boolean).map((lw, i, a) => { const t0 = lw[0].t, t1 = a[i + 1] ? a[i + 1][0].t : t0 + lw.length * .6; return {lw, t0, rate: t1 - t0 > 6 ? 0 : syl(lw) / Math.max(.6, t1 - t0)}; });
  const secs = []; L2.forEach((l, i) => { if (!i || l.t0 - L2[i - 1].t0 > 5.5) secs.push([]); secs[secs.length - 1].push(l); });
  const sr = secs.map(s => { const r = s.map(l => l.rate).filter(Boolean).sort((a, b) => a - b); return r.length ? r[r.length >> 1] : 0; });
  const real = sr.filter((r, k) => r && secs[k].length >= 3), mx = Math.max(0, ...real), mn = Math.min(1e9, ...real), split = real.length >= 2 && mx >= mn * 1.35;
  // belirgin hızlı (rap) bölüm varsa ikinci isim ona, değilse bölümler sırayla
  secs.forEach((s, k) => { const who = split ? arts[sr[k] >= (mx + mn) / 2 ? 1 : 0] : arts[k % 2]; s.forEach(l => l.lw.forEach(w => w.spk = who.toLocaleLowerCase('tr'))); });
}
let VLOOK = '', CLK_HOLD = null;
function setMode(m, data, keepCam){
  // görünüm değişince (saat ↔ şarkı adı ↔ sözler) ekran bir karede değişmesin: eski kare yumuşakça söner
  const look = m === 'idle' && !S.clock ? 'idleK' : m;
  if (look !== VLOOK || CLK_HOLD){ if (VLOOK) screenFade(); VLOOK = look; }
  CLK_HOLD = null;
  UPL = m === 'lyrics' ? guessLang(data.map(l => l.words.join(' ')).join(' ')) : m === 'gen' ? guessLang(data.map(l => l.join(' ')).join(' ') + ' ' + (M.title || '')) : 'tr';
  mode = m; words = []; assigned = -1; snapCam = !keepCam; layoutReset();
  if (m === 'lyrics'){ words = lyricWords(data); relayoutFrom(words); gen = null; }
  else if (m === 'gen') gen = {lines: data, k: 0, lastT: -99};
  else { idleT0 = nowS(); gen = {clock: true, last: '', lastT: -99, k: 0}; status(M.enabled === false ? 'Wallpaper Engine ayarlarında medya entegrasyonu kapalı.' : ''); }
}
function appendLine(tokens, t0){
  const li = words.length ? words[words.length - 1].li + 1 : 0, bd = 60 / L.bpm / 2;
  const lw = tokens.map((w, i) => ({raw: w, text: up(w), t: t0 + i * bd, li, wi: i, idx: words.length + i}));
  words.push(...lw); layoutLine(lw);
  if (words.length > 300){ const keep = words.slice(-40); words = []; layoutReset(); assigned = -1; keep.forEach(w => w.li -= keep[0].li); relayoutFrom(keep); snapCam = true; }
}
const DAYS = ['PAZAR','PAZARTESİ','SALI','ÇARŞAMBA','PERŞEMBE','CUMA','CUMARTESİ'];
const MONTHS = ['OCAK','ŞUBAT','MART','NİSAN','MAYIS','HAZİRAN','TEMMUZ','AĞUSTOS','EYLÜL','EKİM','KASIM','ARALIK'];
function genStep(T){
  if (!gen) return;
  if (words.length && T < words[words.length - 1].t - 2){ words = []; layoutReset(); assigned = -1; snapCam = true; gen.lastT = -99; } // geri sarıldı
  if (gen.clock){
    // saat açıkken kinetik satır üretilmez: saat sabit durur, render() ekran koruyucuyu çizer (drawIdleClock)
    if (!S.clock){ if (!words.length) appendLine(['KİNETİK', 'KLİP'], T + .2); return; }
  } else if (gen.lines.length){
    if (T - gen.lastT > 5 || (L.onset && T - gen.lastT > 2.8)){ appendLine(gen.lines[gen.k++ % gen.lines.length], T); gen.lastT = T; }
  }
}

// ===== src/06-stiller.js =====
/* ================= Kinetik tipografi motoru ================= */
// Araştırmadan çıkan kurallar:
//  · Her kelime kendi vokal anında gelir; satır bütün hâlde gelmez.                       (TuneClip lyric video rehberi)
//  · Bölümler arası kontrast: sakin kıtada küçük/yumuşak, nakarat ve patlamada büyük/sert;
//    ardışık iki satır aynı sahne stilini kullanmaz.                                          (TuneClip)
//  · Enerji ← boyut, hız, ivme, hareket miktarı; ruh hâli ← saydamlık, yön, düzen.           (kinetik tipografi ve duygu çalışması)
//  · Kamera tek düğümlü, yay çizerek gider, hareketler örtüşür, uzun yavaşlayarak durur,
//    sesten birkaç kare önce kalkar; hareket okunsun diye zeminde silik doku.                  (School of Motion, Kinetic Typography)
//  · Okunurluk: yazı kadrajdan taşmaz; vurgu kelimeleri daha büyük ve daha uzun kalır.
// Performans: kelime başına tek fillText (harf animasyonunda harf başına), gölge/bulanıklık yok; 3D yalnızca kamera ve düzlem dönüşü.
const W = 1000; // blok genişliği (dünya birimi)

/* ---------- vektör ---------- */
const vadd = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const vsub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const vmul = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
const vdot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const vcross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const vlen = a => Math.hypot(a[0], a[1], a[2]);
const vnorm = a => { const l = vlen(a) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
function vrot(v, k, th){
  if (!th) return v;
  const c = Math.cos(th), s = Math.sin(th), kv = vcross(k, v), d = vdot(k, v) * (1 - c);
  return [v[0]*c + kv[0]*s + k[0]*d, v[1]*c + kv[1]*s + k[1]*d, v[2]*c + kv[2]*s + k[2]*d];
}
const easeBounce = window.gsap ? window.gsap.parseEase('bounce.out') : p => { const n = 7.5625, d = 2.75; if (p < 1/d) return n*p*p; if (p < 2/d) return n*(p-=1.5/d)*p + .75; if (p < 2.5/d) return n*(p-=2.25/d)*p + .9375; return n*(p-=2.625/d)*p + .984375; };
function strHash(s){ let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ---------- temalar (renk + yazı tipi) ---------- */
const THEMES = {
  manset:   {bg:['#0B0B0C'], fg:['#F2EFE6'], ac:['#FF3B1F'], big:{f:'Big Shoulders Display', w:900}, small:{f:'Big Shoulders Display', w:500}},
  kontrast: {bg:['#F4F1EA'], fg:['#111111'], ac:['#FFD400'], big:{f:'Anybody', w:900}, small:{f:'Instrument Serif', w:400, it:true}},
  pop:      {bg:['#FF5A36', '#2C5BFF', '#14C38E', '#FFB800', '#9B3BFF'], fg:['#FFFFFF', '#FFFFFF', '#0B0B0C', '#0B0B0C', '#FFFFFF'], ac:['#111111', '#FFD400', '#FFFFFF', '#FFFFFF', '#FFD400'],
             big:{f:'Unbounded', w:900}, small:{f:'Unbounded', w:400}, perLine:true},
  zarif:    {bg:['#EFE8DA'], fg:['#2A2420'], ac:['#B5462B'], big:{f:'Instrument Serif', w:400}, small:{f:'Instrument Serif', w:400, it:true}},
  gece:     {bg:['#0E0F12'], fg:['#ECE9E2'], ac:['#E8553A'], big:{f:'Big Shoulders Display', w:800}, small:{f:'Big Shoulders Display', w:400}},
  kobalt:   {bg:['#1C2B8F'], fg:['#F1EFEA'], ac:['#FFD23F'], big:{f:'Unbounded', w:700}, small:{f:'Unbounded', w:400}},
  orman:    {bg:['#12241C'], fg:['#E7E4D9'], ac:['#E9A23B'], big:{f:'Anybody', w:800}, small:{f:'Anybody', w:400}},
  beyaz:    {bg:['#F2F3F1'], fg:['#131416'], ac:['#2B4BFF'], big:{f:'Anybody', w:800}, small:{f:'Anybody', w:400}},
  neon:     {bg:['#07060D'], fg:['#F2F0FF'], ac:['#FF2E88'], big:{f:'Unbounded', w:800}, small:{f:'Unbounded', w:400}},
  asit:     {bg:['#C6FF3D'], fg:['#0A0A0A'], ac:['#5B21FF'], big:{f:'Big Shoulders Display', w:900}, small:{f:'Big Shoulders Display', w:500}}
};
const THEME_KEYS = Object.keys(THEMES);
let TH = THEMES.manset, TH_KEY = 'manset';
function pickTheme(){
  TH_KEY = S.theme === 'oto' ? THEME_KEYS[strHash(M.key || 'idle') % THEME_KEYS.length] : (THEMES[S.theme] ? S.theme : 'manset');
  TH = THEMES[TH_KEY];
}
function basePal(li){
  // otomatik tema ya da albüm renkleri: renkler çalan şarkının kapağından (yazı tipi temadan)
  if (S.theme === 'oto' && M.colors && M.colors.bg) return {bg: M.colors.bg, fg: M.colors.fg, ac: M.colors.ac};
  const n = TH.perLine ? TH.bg.length : 1, k = TH.perLine ? ((li || 0) % n + n) % n : 0;
  return {bg: TH.bg[k], fg: TH.fg[k], ac: TH.ac[k]};
}
// nakarat satırı mı (satır başına bir kez hesaplanır)
function isChorusLi(li){ const lw = lineWords[li]; if (!lw) return false; if (lw._ch === undefined) lw._ch = chorusSet.has(lineKey(lw)); return lw._ch; }
// renk bloğu silme açıkken nakarat ters renklerle gelir (zemin ↔ yazı); vurgu yeni zeminde seçilmiyorsa eski zemin rengi
function invPal(p){ return {bg: p.fg, fg: p.bg, ac: contrast(p.ac, p.fg) >= 2 ? p.ac : p.bg}; }
function pal(li){
  const p = basePal(li);
  return S.wipe && mode === 'lyrics' && li != null && isChorusLi(li) ? invPal(p) : p;
}
const pre = () => pal(curLine);
const fontStr = sm => { const F = sm ? TH.small : TH.big; return (F.it ? 'italic ' : '') + F.w + ' 100px "' + F.f + '", "Arial Narrow", Impact, sans-serif'; };
const fontList = () => [fontStr(false), fontStr(true)];

/* ---------- müzik enerjisi (uzun pencere, şarkının kendi aralığına göre 0–1) ---------- */
const EN = {s: .4, max: .6, min: .2};
function energy(){
  const i = clamp(L.intensity, 0, 1.5);
  return L.packets < 30 ? .5 : clamp((EN.s - EN.min) / Math.max(.12, EN.max - EN.min), 0, 1) * .8 + clamp(i, 0, 1) * .2;
}
function energyTick(dt){
  const k = Math.min(1, dt / 2.5);
  EN.s += (L.intensity - EN.s) * k;
  EN.max = Math.max(EN.s, EN.max - dt * .01); EN.min = Math.min(EN.s, EN.min + dt * .01);
}

/* ---------- sahne stilleri ---------- */
// tier: 0 sakin (kıta), 1 yükseliş, 2 nakarat/patlama
const STYLES = {
  sakin:   {tier: 0}, // bulanıklıktan beliren, hafif yükselen kelimeler; yavaş itme
  daktilo: {tier: 0}, // harf harf yazılır, imleç
  dolan:   {tier: 0, tier2: 1}, // satır içi boş (kontur) görünür, söylenen kelime soldan dolar (karaoke)
  poster:  {tier: 1}, // poster gibi yığılır, kelimeler sırayla iki yandan kayar
  tabela:  {tier: 1}, // havaalanı tabelası: harfler yatay eksende dönerek açılır (3D)
  donus:   {tier: 1, tier2: 2}, // blok 3D kart gibi dönerek gelir, kelimeler patlar
  dusen:   {tier: 2}, // kelimeler yukarıdan düşer, sekerek oturur
  dev:     {tier: 2, single: true}, // nakarat: tek dev kelime, öncekisi kameranın içinden geçer, zemin vuruşta döner
  bukum:   {tier: 1, tier2: 2}, // harfler zarfa göre bükülür: ortası şişkin, kenarları basık
  perspektif: {tier: 1, tier2: 0}, // düzlem geriye yatar, yazı kaçış noktasına doğru daralır
  kontur:  {tier: 0, tier2: 1}, // önce içi boş kontur, söylenince alttan dolar
  glitch:  {tier: 2, tier2: 1}, // yatay dilimler kayarak ve renk kanalları ayrılarak girer
  tekrar:  {tier: 1, tier2: 2, single: true}, // stomp: kelime ortada dolu, üstünde ve altında kontur kopyaları
  kesik:   {tier: 1, tier2: 2}, // kelime çapraz kesilir, iki yarı zıt yönden kayıp birleşir
  halka:   {tier: 1, tier2: 2, whole: true}, // satır dönen 3D halkaya sarılır; arkadaki harfler ters ve soluk
  serit:   {tier: 2, whole: true}, // satır çapraz şeritlerde tekrar eder, şeritler ters yönlere akar
  patlama: {tier: 2, tier2: 1}, // harfler dağınık 3D konumlardan dönerek toplanır
  maske:   {tier: 0, tier2: 1}, // kelime görünmez bir çizginin arkasından yükselir, altında vurgu çizgisi çekilir
  // kelime bazlı efektler
  derin:   {tier: 2, tier2: 1}, // kelime derinden (kameranın karşısından) hızla yerine uçar
  esnek:   {tier: 1, tier2: 2}, // ezilip uzayan yay: basık gelir, uzar, sönümlü salınımla oturur
  kabarcik:{tier: 1, tier2: 0}, // harfler sırayla sıfırdan şişerek çıkar
  rulet:   {tier: 1, tier2: 0}, // her harf slot makinesi makarası gibi döner ve yerine kilitlenir
  sarkac:  {tier: 0, tier2: 1}, // kelime sol üst köşesinden asılı gibi sallanarak oturur
  dilim:   {tier: 2, tier2: 1}, // dikey dilimler sırayla yukarıdan ve aşağıdan kayıp birleşir
  neon:    {tier: 0, tier2: 2}, // neon tabela gibi titreşerek yanar
  coz:     {tier: 0, tier2: 1}, // şifre çözme: rastgele harfler soldan sağa doğru harflere dönüşür
  kilit:   {tier: 1, tier2: 2}, // editoryal kilit: dev küçük harfli ana kelime, üstünde küçük satır, altta imza
  hiz:     {tier: 2, tier2: 1}, // kelime hızla kayıp gelir: çizgi film gibi uzar, arkasında hız çizgileri
  origami: {tier: 1, tier2: 0}, // harfler kâğıt gibi: önce alt yarı kalkar, sonra üst yarı katlanmışken açılır
  // GSAP 3D stilleri (DOM katmanı, bkz. G3STYLE)
  kup:     {tier: 2, tier2: 1, single: true, dom: true, noIcon: true}, // kelimeler dönen küpün yüzlerinde, küp kelime başına yuvarlanır
  koridor: {tier: 2, tier2: 1, dom: true}, // harfler derinden sırayla uçar, biten satır kameranın yanından geçer
  sayfa:   {tier: 0, tier2: 1, dom: true}, // satır kâğıt sayfası gibi kenarından açılır, kelimeler kalkar, sayfa çevrilir
  sarmal:  {tier: 1, tier2: 2, dom: true, noIcon: true}, // harfler dönen sarmal silindirde, söylenen kelime öne döner
  toplanma:{tier: 1, tier2: 2, dom: true}, // uzayda süzülen soluk harfler söylenince dönerek yerine kilitlenir
  pano:    {tier: 1, tier2: 0, dom: true}, // havaalanı tabelası: harfler takla atarak başka harflerden geçip oturur
  yildiz:  {tier: 1, tier2: 2, dom: true, bg: 'parcacik'}, // harfler yıldız gibi derinde parlar, söylenince sarmal çizerek yerine akar
  arazi:   {tier: 1, tier2: 0, dom: true, bg: 'zemin', noIcon: true}, // kelimeler zeminde yatık, sırası gelen kalkar; kamera kelimeden kelimeye ileri uçar
  rap:     {tier: 2, single: true, auto: false} // hızlı satır: kelimeler tek tek sert kesmeyle çakılır (otomatik algılanır)
};
if (!HAS_G3) for (const k in STYLES) if (STYLES[k].dom) STYLES[k].auto = false;
// noIcon: kelimeleri yerleşimden başka yere taşıyan 3D stiller; nesne çizimleri tuvalde eski yerde kalacağı için çizilmez
const STYLE_KEYS = Object.keys(STYLES);
// menüdeki animasyon türleri: benzer stiller tek kategoride (seçilince otomatik seçim yalnız bu havuzdan yapılır)
const CATS = {
  sade:  ['sakin', 'daktilo', 'dolan', 'maske', 'kontur', 'sarkac'],
  kayan: ['poster', 'dusen', 'hiz', 'derin', 'esnek'],
  harf:  ['kabarcik', 'rulet', 'coz', 'neon', 'origami', 'dilim', 'tabela'],
  uc:    ['donus', 'halka', 'perspektif', 'bukum', 'kup', 'koridor', 'sayfa', 'sarmal', 'toplanma', 'pano', 'yildiz', 'arazi'],
  sert:  ['glitch', 'kesik', 'patlama', 'tekrar', 'dev', 'serit', 'kilit']
};
const catPool = () => S.cat && CATS[S.cat] ? CATS[S.cat] : null;
// kelime başına karışık animasyon: satırın stili yerleşimi ve kamerayı belirler, her kelime girişini bu havuzdan ayrı seçer
// (dolan, dev, tekrar, kilit, rap, halka, şerit, perspektif, büküm satırın bütününe bağlı olduğu için karışmaz)
const MIX = ['sakin', 'daktilo', 'poster', 'tabela', 'dusen', 'derin', 'hiz', 'esnek', 'kabarcik', 'rulet', 'sarkac', 'dilim', 'neon', 'coz', 'origami', 'kesik', 'glitch', 'patlama', 'maske', 'kontur', 'donus'];
// nakarat: gösterişli stiller; aynı nakarat satırı şarkı boyunca hep aynı stille gelir (şarkının yapısı hissedilir)
const CHORUS_STYLES = ['dev', 'tekrar', 'serit', 'halka', 'donus', 'glitch', 'kesik', 'bukum', 'patlama', 'derin', 'esnek', 'dilim', 'neon', 'kilit', 'hiz', 'kup', 'koridor', 'sarmal', 'toplanma', 'yildiz'];
let prevStyle = '', USE = {}, useKey = '', CHS = {}; // USE: şarkı boyunca stil kullanım sayıları, CHS: nakarat satırı → stil
function chooseStyle(li, lw, isChorus){
  // ayarlardan sabitlenen stil (test sayfası da window.__kk_force ile zorlayabilir)
  const forced = window.__kk_force;
  if (forced && STYLES[forced] && !(STYLES[forced].dom && !HAS_G3)) return forced;
  if (useKey !== M.key){ useKey = M.key; USE = {}; CHS = {}; } // yeni şarkıda sayaç sıfırlanır
  // rap modu: satırda kelimeler saniyede ~4'ten sık geliyorsa okunur kalsın diye tek tek sert kesme
  if (S.rap && mode !== 'idle' && lw.length >= 4){ const iv = (lw[lw.length - 1].t - lw[0].t) / (lw.length - 1); if (iv > 0 && iv < .24) return 'rap'; }
  const lk = isChorus && mode !== 'idle' ? lineKey(lw) : '';
  if (lk && CHS[lk] && !(CHS[lk] === 'dev' && lw.length > 7)) return CHS[lk];
  // kategori seçiliyse yalnız onun stilleri; art arda aynı stil gelmez
  let pool = (catPool() || STYLE_KEYS).filter(k => STYLES[k].auto !== false);
  if (!pool.length) pool = ['poster'];
  if (lk){ const f = pool.filter(k => CHORUS_STYLES.includes(k)); if (f.length) pool = f; }
  let cands = pool.filter(k => k !== prevStyle);
  if (mode === 'idle') cands = ['sakin', 'tabela', 'dolan', 'poster', 'donus', 'maske'].filter(k => k !== prevStyle);
  if (lw.length > 7) cands = cands.filter(k => k !== 'dev');
  if (!cands.length) cands = pool.length ? [pool[0]] : ['poster'];
  // ruh hali: o anki enerjiye uyan seviyedeki stiller öne çıkar; az gösterilmiş stiller de (her stil sırayla gelir)
  const e = energy(), want = e < .35 ? 0 : e < .7 ? 1 : 2, least = Math.min(...cands.map(k => USE[k] || 0));
  const score = k => { const s = STYLES[k], d = Math.min(Math.abs(s.tier - want), s.tier2 != null ? Math.abs(s.tier2 - want) : 9);
    // kelime bazlı efektler öncelikli: bütün satırı tek parça oynatan stiller seyrek gelir
    // 3D arka plan açıkken ona uyan stil (galaksi → yildiz, arazi → arazi) üç kat sık gelir
    return 1 / (1 + d * 1.6) * (s.whole ? .2 : 1) * (s.bg && B3.want && B3.kind === s.bg ? 3 : 1) * ((USE[k] || 0) === least ? 1 : (USE[k] || 0) === least + 1 ? .3 : .05); };
  let tot = 0; const sc = cands.map(k => tot += score(k));
  const r = Math.random() * tot, pick = cands[Math.max(0, sc.findIndex(v => v >= r))];
  USE[pick] = (USE[pick] || 0) + 1;
  if (lk) CHS[lk] = pick;
  return pick;
}

// ===== src/07-dizilis.js =====
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

// ===== src/08-kamera.js =====
/* ---------- kamera (3D, tek düğüm, kritik sönümlü yay) ---------- */
const CAM = {p: null, t: null, u: null, vp: [0,0,0], vt: [0,0,0], vu: [0,0,0], f: [0,0,1], r: [1,0,0], up: [0,-1,0], F: 1000, pull: 0};
const FOV = .9;
function activeIndex(T){
  let a = 0, b = words.length - 1, r = -1;
  while (a <= b){ const m = (a + b) >> 1; if (words[m].t <= T){ r = m; a = m + 1; } else b = m - 1; }
  return r;
}
// en fazla bir kelime önden hazırlık: sıradaki kelimenin satırı LEAD sn önce kurulur ve kamera yola çıkar;
// kelime yine tam zamanında belirir, eski satır kamera giderken ekranda kalır (boş ekran yok)
const LEAD = .28; // kamera vuruşa otursun diye çok az erken kalkar; fazlası eski satır çıkıp yeni gelmeden boş kare yapar
function frontIdx(T){ const ai = activeIndex(T), n = ai + 1; return n < words.length && T >= words[n].t - LEAD ? n : Math.max(0, ai); }
// şarkı sonu posteri: kamera bütün satırları tek kadraja alacak kadar geri çekilir (hafif yörüngeyle)
let POSTER = 0;
function posterGoal(T, VW, VH){
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const b of blocks) if (b){ x0 = Math.min(x0, b.cx - b.hw); x1 = Math.max(x1, b.cx + b.hw); y0 = Math.min(y0, b.cy - b.hh); y1 = Math.max(y1, b.cy + b.hh); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, asp = VW / VH;
  const d = Math.max((x1 - x0) / 2 / asp, (y1 - y0) / 2) / Math.tan(FOV / 2) * 1.12;
  const yo = Math.sin(T * .15) * .08, back = vrot([0, 0, -1], [0, 1, 0], yo);
  return {p: vadd([cx, cy, 0], vmul(back, d)), t: [cx, cy, 0], u: [0, -1, 0]};
}
function camGoal(T, VW, VH){
  if (POSTER > 0) return posterGoal(T, VW, VH);
  // sesten biraz önce kalk: hedef 0.12 sn ileriden seçilir
  // satır içinde kamera sıradaki kelimeye CAMLEAD sn önce döner (kelime söylenirken kadrajda olsun); satır geçişi LEAD ile
  let ai = frontIdx(T); { const a0 = activeIndex(T), nx = words[a0 + 1]; if (a0 >= 0 && nx && nx.li === words[a0].li && T >= nx.t - CAMLEAD) ai = a0 + 1; }
  const w = words[ai], b = ensureBlock(w.li);
  const single = STYLES[b.style].single || STYLES[b.style].whole || STYLES[b.style].dom || b.style === 'kilit';
  let f = mode === 'idle' || single ? 0 : .15 + .35 * S.move, fk = .5, dW = W / 2;
  // kelime kelime kamera: her kelimeye tam odak; satırın son kelimesinden biraz sonra geri çekilip bütün kompozisyon
  CAMK = b.layout === 'kamera' && mode !== 'idle' ? 2.2 : 1.45; // okunurluk: kamera kelimeye/satıra çabuk varır
  if (b.layout === 'kamera' && mode !== 'idle'){ f = w.wi === b.words.length - 1 && T - w.t > .7 ? 0 : 1; fk = 1; dW = Math.max(w.w * .62, W * .2); }
  // merdiven uzun bir çapraz: kamera basamakları izler (söylenen kelime ve çevresi kadrajda), satır sonunda bütün merdiven
  else if (b.layout === 'dikey' && mode !== 'idle') f = .1;
  else if (b.layout === 'satir' && mode !== 'idle' && b.words.length > 1) f = Math.min(f, .24); // kilit bir bütün: sıraya fazla yakınlaşıp üst/alt sırayı kesme
  else if (b.layout === 'merdiven' && mode !== 'idle'){ f = w.wi === b.words.length - 1 && T - w.t > .7 ? 0 : .8; fk = 1; dW = Math.max(w.w * .75, W * .38); }
  // kelime kelime kamerada dönük kelimeye gelince kamera yan yatar (kelime ekranda yatay okunur)
  const roll = b.layout === 'kamera' && f > 0 && w.rot ? w.rot : 0, swap = Math.abs(Math.sin(roll)) > .7;
  const fx = lerp(W / 2, w.lx + w.w / 2, f * fk), fy = lerp(b.h / 2, w.y + w.h / 2, f);
  const tgt = bpt(b, fx, fy);
  // bölünmüş ekranda ana sahne sağ yarıya sığar
  const tan = Math.tan(FOV / 2), asp = VW / (1 + SPLS) / (VH * (VOY ? .82 : 1));
  const marg = asp < .9 ? 1.14 : 1.25; // dikey ekranda dar kenar boşluğu (yazı genişliğe dayalı, büyük kalsın)
  const dBlock = (swap ? Math.max(b.h / 2 / asp, W / 2) : Math.max(W / 2 / asp, b.h / 2)) / tan * marg;
  const dRow = Math.max(dW / asp, w.h * 1.1) / tan * marg;
  let d = Math.exp(lerp(Math.log(dBlock), Math.log(Math.min(dBlock, dRow)), f));
  // etkin kamera: satır boyunca yavaşça yaklaşır (itme), her kelimede hafif eğik açı (Hollanda açısı) ve yörünge
  const nb = lineWords[b.li + 1], span = Math.max(.8, (nb && nb[0] ? nb[0].t : b.words[b.words.length - 1].t + 1.5) - b.t0);
  if (mode !== 'idle' && b.layout !== 'kamera') d *= 1 - (b.layout === 'merdiven' ? .1 : .06) * S.move * easeOut(clamp((T - b.t0) / span, 0, 1)); // bütün blok kadrajda kalacak kadar
  const dutch = mode === 'idle' ? 0 : (hash01(w.idx * 2654435761 + 7) - .5) * .13 * S.move * (b.chorus ? 1.4 : 1);
  // sürekli hafif yörünge (3D parallax), enerjiyle büyür
  const e = energy(), yo = Math.sin(T * .21) * (.09 + .16 * e) * S.rot, po = Math.sin(T * .16 + 1) * (.06 + .1 * e) * S.rot;
  let back = vmul(b.N, -1); back = vrot(back, b.V, yo); back = vrot(back, b.U, po);
  return {p: vadd(tgt, vmul(back, d)), t: tgt, u: vrot(vmul(b.V, -1), b.N, ROLLS * roll + dutch)};
}
const CAMLEAD = .32;
let CAMK = 1; // kamera yayının çevikliği (kelime kelime kamerada kamera kelimeye çabuk varır)
const ROLLS = 1; // kamera yan yatma yönü (kelimenin dönüşüyle aynı yönde: yazı ekranda yatay)
const finite3 = v => v && isFinite(v[0]) && isFinite(v[1]) && isFinite(v[2]);
function camStep(T, dt, VW, VH){
  let G = camGoal(T, VW, VH);
  if (!finite3(G.p) || !finite3(G.t) || !finite3(G.u)){
    if (!CAM.bad){ CAM.bad = true; const w = words[frontIdx(T)]; diag('nan', {li: w && w.li, st: w && blocks[w.li] && blocks[w.li].style}); }
    G = CAM.p && finite3(CAM.p) ? {p: CAM.p.slice(), t: CAM.t.slice(), u: CAM.u.slice()} : {p: [0, 0, -1000], t: [0, 0, 0], u: [0, -1, 0]};
  } else CAM.bad = false;
  if (CAM.p && !(finite3(CAM.p) && finite3(CAM.t) && finite3(CAM.u) && finite3(CAM.vp))) snapCam = true;
  if (snapCam || !CAM.p){ CAM.p = G.p; CAM.t = G.t; CAM.u = G.u; CAM.vp = [0,0,0]; CAM.vt = [0,0,0]; CAM.vu = [0,0,0]; CAM.pull = 0; snapCam = false; }
  else {
    const om = 2 * Math.PI * (.35 + .6 * S.move) * clamp(L.bpm / 120, .8, 1.25) * CAMK, steps = Math.ceil(dt / .01), h = dt / steps;
    const spring = (x, v, g) => { for (let k = 0; k < 3; k++){ v[k] += (om * om * (g[k] - x[k]) - 2 * om * v[k]) * h; x[k] += v[k] * h; } };
    for (let i = 0; i < steps; i++){ spring(CAM.p, CAM.vp, G.p); spring(CAM.t, CAM.vt, G.t); spring(CAM.u, CAM.vu, G.u); }
  }
  // yolculukta geri çekil (yay çizen hareket): hız arttıkça kamera geriye açılır
  const sp = vlen(CAM.vt), goal = Math.min(sp * .22, 900);
  CAM.pull += (goal - CAM.pull) * Math.min(1, dt * 4);
  // sağ = ileri × yukarı (dünyada y aşağı); yukarı = sağ × ileri
  const f = vnorm(vsub(CAM.t, CAM.p)), r = vnorm(vcross(f, vnorm(CAM.u))), u = vcross(r, f);
  CAM.f = f; CAM.r = r; CAM.up = u; CAM.F = VH / (2 * Math.tan(FOV / 2));
  CAM.eye = vsub(CAM.p, vmul(f, CAM.pull));
}
let SX = 0, SY = 0, XF = 0, XFL = 0; // XF: karede başarılı çizim dönüşümü sayısı (test)
let VOY = 0; // çeviri açıkken sahnenin dikey kayması (px): alt şerit çeviriye kalır
let VOX = 0, SPLS = 0; // bölünmüş ekran: görüntü merkezinin yatay kayması (px) ve açıklık (0–1)
// fare: imleç yakınındaki kelime ekranda imleçten uzağa itilir (PX/PY, setXform'a eklenir), imleç gidince yaylanıp döner
let PX = 0, PY = 0;
const MOUSE = {x: -1e4, y: -1e4, t: -99};
addEventListener('mousemove', ev => { MOUSE.x = ev.clientX * cv.width / innerWidth; MOUSE.y = ev.clientY * cv.height / innerHeight; MOUSE.t = nowS(); });
function mousePush(b, w){
  PX = PY = 0;
  if (!S.mouse) return;
  let tx = 0, ty = 0;
  if (nowS() - MOUSE.t < 2.5){
    // uzaklık kelimenin ekrandaki kutusuna (içindeyse 0); itme yönü imleçten kelime merkezine
    const q = [bpt(b, w.lx, w.y), bpt(b, w.lx + w.w, w.y), bpt(b, w.lx + w.w, w.y + w.h), bpt(b, w.lx, w.y + w.h)].map(proj);
    if (q.every(Boolean)){
      const xs = q.map(p => p[0]), ys = q.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const R = Math.min(cv.width, cv.height) * .22, d = Math.hypot(Math.max(x0 - MOUSE.x, 0, MOUSE.x - x1), Math.max(y0 - MOUSE.y, 0, MOUSE.y - y1));
      if (d < R){ const dx = (x0 + x1) / 2 - MOUSE.x, dy = (y0 + y1) / 2 - MOUSE.y, l = Math.hypot(dx, dy) || 1, mag = Math.pow(1 - d / R, 2) * R * .45; tx = dx / l * mag; ty = dy / l * mag; }
    }
  }
  // yaylı yaklaşma (biraz salınarak geri döner)
  w.pvx = (w.pvx || 0) * Math.exp(-RDT * 9) + (tx - (w.px || 0)) * RDT * 60; w.pvy = (w.pvy || 0) * Math.exp(-RDT * 9) + (ty - (w.py || 0)) * RDT * 60;
  w.px = (w.px || 0) + w.pvx * RDT; w.py = (w.py || 0) + w.pvy * RDT;
  PX = w.px; PY = w.py;
}
function proj(p){
  const d = vsub(p, CAM.eye), z = vdot(d, CAM.f);
  if (z < 15) return null;
  const k = CAM.F * CAM.zoom / z;
  return [cv.width / 2 + SX + VOX + vdot(d, CAM.r) * k, cv.height / 2 + SY + VOY - vdot(d, CAM.up) * k, z];
}
// yerel yazı koordinatı (100 px yazı) → ekran afin dönüşümü. A: çapa (dünya), U/V: eksenler, s: birim/px, pv: pivot px
let WR = null; // çizilen kelimenin dönüşü: {ang, c (dünya merkezi)}; drawWord kurar, setXform uygular
function setXform(A, U, V, s, pvx, pvy){
  let P = vadd(A, vadd(vmul(U, pvx * s), vmul(V, pvy * s)));
  if (WR){ const n = vnorm(vcross(U, V)); P = vadd(WR.c, vrot(vsub(P, WR.c), n, WR.ang)); U = vrot(U, n, WR.ang); V = vrot(V, n, WR.ang); }
  const c = proj(P); if (!c) return null;
  const k = 60, cu = proj(vadd(P, vmul(U, k * s))), cvv = proj(vadd(P, vmul(V, k * s)));
  if (!cu || !cvv) return null;
  const a = (cu[0] - c[0]) / k, b = (cu[1] - c[1]) / k, cc = (cvv[0] - c[0]) / k, d = (cvv[1] - c[1]) / k;
  if (Math.abs(a * d - b * cc) > 900) return null; // kameraya çok yakın
  XF++;
  g.setTransform(a, b, cc, d, c[0] - a * pvx - cc * pvy + PX, c[1] - b * pvx - d * pvy + PY);
  return Math.sqrt(Math.abs(a * d - b * cc)); // ekran px / yazı px
}

// ===== src/09-kelime-cizimi.js =====
/* ---------- kelime çizimi ---------- */
function assignAnim(w, fresh){ w.kick = fresh ? clamp((L.low - L.lowSlow) * 2.4, 0, 1) : 0; }
// değişken yazı tiplerinde harfler üst üste binen parçalardan oluşur; düz strokeText iç çizgileri de gösterir.
// Çift kalın kontur ayrı bir tuvale çizilir, harfin içi oradan silinir (destination-out) ve sonuç ana tuvale basılır:
// yalnızca dış hat kalır, harfin içi gerçekten boş olur (arka plan efektleri içinden görünür; zemin renkli dolgu yok).
const OL = document.createElement('canvas'), olg = OL.getContext('2d');
function outline(text, x, y, color, bg, lw, alpha){
  const m = g.getTransform(), tm = g.measureText(text), pad = lw * 2 + 4;
  const x0 = x - pad, x1 = x + tm.width + pad, y0 = y - (tm.actualBoundingBoxAscent || 80) - pad, y1 = y + (tm.actualBoundingBoxDescent || 20) + pad;
  // yerel kutunun ekrandaki sınırları
  let sx0 = 1e9, sy0 = 1e9, sx1 = -1e9, sy1 = -1e9;
  for (const [px, py] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]){ const X = m.a * px + m.c * py + m.e, Y = m.b * px + m.d * py + m.f; sx0 = Math.min(sx0, X); sy0 = Math.min(sy0, Y); sx1 = Math.max(sx1, X); sy1 = Math.max(sy1, Y); }
  sx0 = Math.max(0, Math.floor(sx0)); sy0 = Math.max(0, Math.floor(sy0)); sx1 = Math.min(cv.width, Math.ceil(sx1)); sy1 = Math.min(cv.height, Math.ceil(sy1));
  const w = sx1 - sx0, h = sy1 - sy0; if (w < 1 || h < 1) return;
  if (OL.width < w || OL.height < h){ OL.width = Math.max(OL.width, w); OL.height = Math.max(OL.height, h); }
  olg.setTransform(1, 0, 0, 1, 0, 0); olg.globalCompositeOperation = 'source-over'; olg.clearRect(0, 0, w, h);
  olg.setTransform(m.a, m.b, m.c, m.d, m.e - sx0, m.f - sy0); olg.font = g.font;
  olg.lineWidth = lw * 2; olg.lineJoin = 'round'; olg.strokeStyle = color; olg.strokeText(text, x, y);
  olg.globalCompositeOperation = 'destination-out'; olg.fillStyle = '#000'; olg.fillText(text, x, y);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = alpha; g.drawImage(OL, 0, 0, w, h, sx0, sy0, w, h); g.restore();
}
/* ---------- anlam efektleri: kelimenin anlamı hareketine yansır ---------- */
// Türkçe ekler kökün arkasına geldiği için kök başlangıcıyla eşlenir (düştüm, düşerken, düşüyor…); İngilizce de var.
const SEM = [
  ['dus',    /^(düş(?!ün)|yıkıl|çök|fall|fell|drop|down$)/],
  ['yuksel', /^(yüksel|uç(?!ak|urum)|uçu|havalan|gökyüz|göğe|fly|flying|rise|rising|high$|sky)/],
  ['don',    /^(dön(?!em)|çevir|döndür|spin|turn|around$|round$)/],
  ['kir',    /^(kırıl|kırdı|kırar|kırma|kırık|paramparça|parçala|dağıl|break|broke|shatter|crash)/],
  ['yan',    /^(yanıyor|yandı|yanar|yanma|yangın|yaktı|yakar|yakıyor|ateş|alev|burn|fire|flame)/],
  ['titre',  /^(titre|kork|sarsıl|deprem|shake|shaking|shiver|trembl|scared|fear)/],
  ['sus',    /^(sus(?!a)|sessiz|fısıl|whisper|quiet|silence|silent)/],
  ['bagir',  /^(bağır|çığlık|haykır|isyan|scream|shout|yell|loud)/],
  ['kalp',   /^(kalp|kalb|sev(?!iye)|aşk|aşık|love|heart)/],
  ['kos',    /^(koş|kaçıyor|kaçtı|kaçar|hızlı|acele|run|running|fast|speed|rush)/],
  ['agla',   /^(ağla|gözyaş|yağmur|cry|crying|tears|rain)/]
];
function semOf(raw){
  const s = (raw || '').toLocaleLowerCase('tr').replace(/[^\p{L}]/gu, '');
  if (s.length < 3) return '';
  for (const [k, re] of SEM) if (re.test(s)) return k;
  return mlSem(raw) || '';
}
let IMP = 0; // bağırma: kamera sarsıntısı darbesi
function drawSem(b, w, age, P, active, a, U, V, N, anchor, col, kick, e){
  const A = w.asc, D = w.desc, H = A + D, n = w.chars.length, cx = w.w100 / 2, cy = (D - A) / 2, sg = w.idx % 2 ? 1 : -1;
  const expo = q => q >= 1 ? 1 : 1 - Math.pow(2, -10 * q);
  let off = [0, 0, 0], sc = 1, rot = 0, sy = 1, skew = 0, c = col;
  const k = w.sem;
  if (k === 'dus'){ const q = clamp(age / .5, 0, 1); off = vmul(V, -(1 - easeBounce(q)) * H * w.s * 1.6); rot = sg * .07 * easeOut(clamp((age - .5) / .3, 0, 1)); } // okunurluk: kısa düşüş, üst satırın üstünden geçmez
  else if (k === 'don'){ const q = clamp(age / .5, 0, 1); rot = (1 - easeOut(q)) * Math.PI * 2 * sg; sc = .45 + .55 * easeOut(q); }
  else if (k === 'sus'){ sc = .62; c = mixHex(P.bg, col, .55); a *= clamp(age / .6, 0, 1); }
  else if (k === 'bagir'){ const q = clamp(age / .35, 0, 1); sc = 1.6 - .6 * easeOut(q); if (!w.shouted){ w.shouted = true; IMP = 1; } c = P.ac; }
  else if (k === 'kalp'){ const ph = (age * 1.25) % 1, pulse = Math.pow(Math.max(0, Math.sin(ph * Math.PI * 2)), 6) + .6 * Math.pow(Math.max(0, Math.sin((ph - .18) * Math.PI * 2)), 6); sc = (.7 + .3 * easeBack(clamp(age / .4, 0, 1))) * (1 + .1 * pulse); c = P.ac; }
  else if (k === 'kos'){ const q = expo(clamp(age / .4, 0, 1)); off = vmul(U, -(1 - q) * W * 1.3); skew = -.4 * (1 - q); }
  const A2 = vadd(anchor, off);
  if (!setXform(A2, vmul(U, sc), vmul(V, sc * sy), w.s, cx, cy)) return;
  g.font = w.font; g.fillStyle = c; g.globalAlpha = a;
  if (rot || skew){ g.translate(cx, cy); if (rot) g.rotate(rot); if (skew) g.transform(1, 0, skew, 1, 0, 0); g.translate(-cx, -cy); }
  if (k === 'yuksel'){
    // harfler sırayla aşağıdan süzülür; sonra kelime çok hafif yukarı doğru uçmaya devam eder
    const drift = Math.min(age, 3) * H * .06;
    for (let i = 0; i < n; i++){ const qi = clamp((age - i * .025) / .4, 0, 1); if (qi <= 0) continue; g.globalAlpha = a * Math.min(1, qi * 3); g.fillText(w.chars[i], w.offs[i], (1 - expo(qi)) * H * 1.6 - drift); }
    return;
  }
  if (k === 'kir'){
    // önce bütün belirir, 0.35 sn sonra çapraz çatlaktan iki parçaya ayrılıp hafifçe kayar
    const q = easeOut(clamp((age - .35) / .5, 0, 1)), tilt = H * .3, L2 = -30, R2 = w.w100 + 30, T2 = -A - 14, B2 = D + 14, m = (T2 + B2) / 2;
    const half = (top, dx, dy, r) => { g.save(); g.translate(cx, cy); g.rotate(r); g.translate(-cx, -cy); g.beginPath();
      if (top){ g.moveTo(L2, T2); g.lineTo(R2, T2); g.lineTo(R2, m - tilt); g.lineTo(L2, m + tilt); } else { g.moveTo(L2, m + tilt); g.lineTo(R2, m - tilt); g.lineTo(R2, B2); g.lineTo(L2, B2); }
      g.closePath(); g.clip(); g.fillText(w.text, dx, dy); g.restore(); };
    g.globalAlpha = a * Math.min(1, age * 8);
    half(true, -w.w100 * .03 * q, -H * .12 * q, -.04 * q); half(false, w.w100 * .03 * q, H * .12 * q, .04 * q);
    return;
  }
  if (k === 'yan'){
    // alev: harfler titreşir, yukarı doğru kıpırdar, bazıları vurgu renginde parlar
    const fr = Math.floor(age * 16);
    for (let i = 0; i < n; i++){ const h = hash01(w.idx * 37 + i * 11 + fr); g.globalAlpha = a * (.65 + .35 * h); g.fillStyle = h < .35 ? P.ac : c; g.fillText(w.chars[i], w.offs[i], -Math.abs(noise1(age * 9 + i * 1.7)) * H * .07); }
    return;
  }
  if (k === 'titre'){
    // korku: her harf ayrı ayrı sarsılır (söylenirken güçlü, sonra hafif)
    const amp = (active ? 1 : .35) * H * .05;
    for (let i = 0; i < n; i++){ g.save(); const mx = w.offs[i]; g.translate(noise1(age * 41 + i * 3) * amp, noise1(age * 37 + i * 5 + 2) * amp); g.fillText(w.chars[i], mx, 0); g.restore(); }
    return;
  }
  if (k === 'agla'){
    // gözyaşı: bazı harfler yavaşça aşağı akar ve hafif solar
    for (let i = 0; i < n; i++){ const h = hash01(w.idx * 19 + i * 7), q = h < .4 ? clamp((age - .4 - h * .6) / 1.4, 0, 1) : 0; g.globalAlpha = a * (1 - q * .45); g.fillText(w.chars[i], w.offs[i], q * q * H * .4); }
    return;
  }
  g.fillText(w.text, 0, 0);
}

// kelime girişleri (konum kayması, ölçek, saydamlık); age harf gecikmesiyle de çağrılır
const STAG = {sakin: 1, poster: 1, dusen: 1, donus: 1, derin: 1, hiz: 1}, STG = .02;
// okunurluk: giriş kelimenin söylenme anından bu kadar önce başlar (söylendiğinde kelime okunur hâldedir)
const EARLY = .2;
function entr(style, w, age, dur, e, U, V, N, H){
  const p = clamp(age / dur, 0, 1), ep = easeOut(p);
  let off = [0, 0, 0], sc = 1, a = 1;
  switch (style){
    case 'sakin': off = vmul(V, (1 - ep) * H * w.s * .35); a = ep; break;
    case 'poster': off = vmul(U, (w.idx % 2 ? 1 : -1) * (1 - ep) * W * (.35 + .4 * e)); a = Math.min(1, p * 2); break;
    case 'dusen': { const q = clamp(age / (dur * 1.6), 0, 1); off = vmul(V, -(1 - easeBounce(q)) * H * w.s * 2.6); a = Math.min(1, q * 5); break; }
    case 'donus': sc = .55 + .45 * easeBack(p); a = Math.min(1, p * 2.5); break;
    case 'dev': sc = 1 + .5 * Math.pow(1 - ep, 2); a = Math.min(1, p * 4); break;
    case 'derin': { const q = clamp(age / (dur * 1.3), 0, 1); off = vmul(N, Math.pow(1 - easeOut(q), 2) * W * 3.2); a = Math.min(1, q * 4); break; }
    case 'rap': sc = 1 + .3 * Math.pow(1 - clamp(age / .14, 0, 1), 2); break; // geçişsiz, kısa çakma darbesi
    case 'hiz': { const q = clamp(age / (dur * .9), 0, 1), x = q >= 1 ? 1 : 1 - Math.pow(2, -10 * q); off = vmul(U, (w.idx % 2 ? 1 : -1) * (1 - x) * W * 1.4); a = Math.min(1, q * 6); break; }
  }
  return {off, sc, a};
}
function drawWord(b, w, T, P, st, alpha, e, kick, swing){ try { return drawWord0(b, w, T, P, st, alpha, e, kick, swing); } finally { WR = null; } }
function drawWord0(b, w, T, P, st, alpha, e, kick, swing){
  const age = T - w.t + EARLY, style = w.anim || b.style, A = w.asc, D = w.desc, H = A + D, n = w.chars.length;
  const dur = lerp(.42, .28, e) * (w.chorus ? .85 : 1), p = clamp(age / dur, 0, 1), ep = easeOut(p);
  let U = swing ? swing.U : b.U, V = swing ? swing.V : b.V, N = swing ? swing.N : b.N;
  WR = w.rot ? {ang: w.rot, c: w.rcx != null ? bpt(b, w.rcx, w.rcy, U, V) : bpt(b, w.lx + w.w / 2, w.y + w.h / 2, U, V)} : null;
  const anchor = bpt(b, w.lx, w.base, U, V);
  let off = [0, 0, 0], sc = 1, a = alpha;
  const active = st === 2, future = st === 0;
  // fosforlu kalem: yazı kalemin üstünde okunmuyorsa (kapak renklerinde olabilir) zemin rengine döner
  // söylenen kelime vurgu renginde; vurgu zeminden yeterince ayrışmıyorsa (kapak renklerinde olur) normal yazı rengi.
  // Fosforlu kalem kutusu kaldırıldı: koyu kapak renklerinde kutu ile yazı aynı tona düşüp okunmuyordu.
  let col = w.colk != null ? mcol(P, w.colk) : active && contrast(P.ac, P.bg) >= 2.5 ? P.ac : P.fg;
  // frekans tepkisi: vokal (orta bant) yükselince söylenen kelimenin rengi parlar (koyu zeminde beyaza, açıkta siyaha doğru)
  if (active && S.freq && FQ.mi > .55) col = mixHex(col, lum(P.bg) < .4 ? '#FFFFFF' : '#000000', Math.min(.4, (FQ.mi - .55) * .7));
  // anlamlı kelime (düş, uç, dön, kırıl, yan…): stilin girişi yerine anlamını taşıyan hareket
  if (w.sem === undefined) w.sem = semOf(w.raw);
  if (w.sem && S.semantic && !future && !STYLES[style].whole && style !== 'kilit' && style !== 'rap'){
    drawSem(b, w, age, P, active, a, U, V, N, anchor, col, kick, e); return;
  }
  // girişler
  if (!future){ const r = entr(style, w, age, dur, e, U, V, N, H); off = r.off; sc = r.sc; a *= r.a; }
  // harf harf kademeli giriş (GSAP stagger gibi): hareketli girişlerde her harf kendi gecikmesiyle gelir, bitince bütün kelime çizilir
  const stg = Math.min(STG, .1 / Math.max(1, n));
  if (!future && STAG[style] && age < dur * 1.7 + n * stg){
    g.font = w.font; g.fillStyle = col; const cy = (D - A) / 2;
    for (let i = 0; i < n; i++){
      const ag = age - i * stg; if (ag <= 0) continue;
      const r = entr(style, w, ag, dur, e, U, V, N, H), ad = (i + 1 < n ? w.offs[i + 1] : w.w100) - w.offs[i];
      if (!setXform(vadd(anchor, r.off), vmul(U, r.sc), vmul(V, r.sc), w.s, w.offs[i] + ad / 2, cy)) continue;
      g.globalAlpha = alpha * r.a; g.fillText(w.chars[i], w.offs[i], 0);
    }
    return;
  }
  // vurgu: etkin kelime vuruşta büyür (enerjiyle orantılı)
  if (active) sc *= 1 + kick * (.03 + .07 * e) * (.4 + S.shake);
  // frekans tepkisi: bas seviyesi kelimeyi büyütür, tizler hafifçe titretir
  if (active && S.freq){
    sc *= 1 + clamp(FQ.lo - .35, 0, 1) * .07;
    const jit = H * w.s * .018 * clamp(FQ.hi - .45, 0, 1);
    if (jit > 0) off = vadd(off, vadd(vmul(U, noise1(T * 47 + w.idx) * jit), vmul(V, noise1(T * 53 + w.idx * 3) * jit)));
  }
  const A2 = vadd(anchor, off), cx = w.w100 / 2, cy = (D - A) / 2;
  const scr = setXform(A2, vmul(U, sc), vmul(V, sc), w.s, cx, cy); if (!scr) return;
  g.font = w.font;
  // kontrast teması: fosforlu kalem
  g.globalAlpha = a; g.fillStyle = col;
  if (style === 'dolan'){
    // karaoke: boş kontur, söylenen kısım soldan dolar
    outline(w.text, 0, 0, P.fg, P.bg, 2.2 / Math.max(.05, scr), alpha * (future ? .55 : .9));
    if (!future){
      const nx = words[w.idx + 1], span = nx && nx.li === w.li ? Math.max(.15, nx.t - w.t) : .5;
      const fw = w.w100 * clamp(age / span, 0, 1);
      g.save(); g.beginPath(); g.rect(-6, -A - 10, fw + 6, H + 20); g.clip(); g.globalAlpha = alpha; g.fillStyle = active ? P.ac : P.fg; g.fillText(w.text, 0, 0); g.restore();
    }
    return;
  }
  if (style === 'sakin' && p < 1){
    // bulanıklıktan belirme: iki soluk, büyük kopya içe doğru toplanır
    for (const k of [1, 2]){ const s2 = 1 + (1 - ep) * .12 * k; g.save(); g.translate(cx, cy); g.scale(s2, s2); g.translate(-cx, -cy); g.globalAlpha = a * .22 * (1 - ep); g.fillText(w.text, 0, 0); g.restore(); }
    g.globalAlpha = a;
  }
  if (style === 'daktilo' && p < 1){
    const c = Math.min(n, Math.ceil(p * n * 1.1));
    for (let i = 0; i < c; i++) g.fillText(w.chars[i], w.offs[i], 0);
    g.fillRect((c < n ? w.offs[c] : w.w100) + 4, -A, 8, H);
    return;
  }
  if (style === 'bukum'){
    // zarf bükülmesi: her harf tabanından, ortaya doğru artan oranda uzar; giriş yayla açılır
    const amt = (.55 + .25 * e) * (p < 1 ? easeBack(p) : 1);
    for (let i = 0; i < n; i++){
      const env = Math.sin(Math.PI * (i + .5) / n), k = Math.max(.05, 1 + amt * (env - .45));
      const ach = vadd(bpt(b, w.lx + w.offs[i] * w.s, w.base, U, V), off);
      if (!setXform(ach, vmul(U, sc), vmul(V, k * sc), w.s, 0, 0)) continue;
      g.globalAlpha = a; g.fillStyle = col; g.fillText(w.chars[i], 0, 0);
    }
    return;
  }
  if (style === 'kontur'){
    // içi boş kontur; söylenince alttan yukarı dolar
    outline(w.text, 0, 0, col, P.bg, 2.4 / Math.max(.05, scr), a);
    const q = easeOut(clamp(age / .5, 0, 1));
    g.save(); g.beginPath(); g.rect(-8, D + 6 - (H + 12) * q, w.w100 + 16, (H + 12) * q); g.clip();
    g.fillStyle = col; g.fillText(w.text, 0, 0); g.restore();
    return;
  }
  if (style === 'tekrar'){
    // üstte ve altta konturlar: giriş anında kelimeden açılır, vuruşta hafifçe aralanır
    const gap = (H + 14) * (p < 1 ? ep : 1) * (1 + kick * .08);
    for (let k = 3; k >= 1; k--){
      const ka = a * (.62 - k * .16), lw = 1.8 / Math.max(.05, scr);
      outline(w.text, 0, -gap * k, col, P.bg, lw, ka); outline(w.text, 0, gap * k, col, P.bg, lw, ka);
    }
    g.globalAlpha = a; g.fillStyle = col; g.fillText(w.text, 0, 0);
    return;
  }
  if (style === 'kesik' && p < 1){
    // çapraz kesik: üst yarı soldan, alt yarı sağdan gelir; kesik çizgisi boyunca kayar
    const sh = (1 - ep) * w.w100 * .7, tilt = H * .35, L2 = -30, R2 = w.w100 + 30, T2 = -A - 12, B2 = D + 12, m = (T2 + B2) / 2;
    const half = (top, dx) => {
      g.save(); g.beginPath();
      if (top){ g.moveTo(L2, T2); g.lineTo(R2, T2); g.lineTo(R2, m - tilt); g.lineTo(L2, m + tilt); }
      else { g.moveTo(L2, m + tilt); g.lineTo(R2, m - tilt); g.lineTo(R2, B2); g.lineTo(L2, B2); }
      g.closePath(); g.clip(); g.fillText(w.text, dx, 0); g.restore();
    };
    g.globalAlpha = a * Math.min(1, p * 3); g.fillStyle = col;
    half(true, -sh); half(false, sh);
    return;
  }
  if (style === 'glitch' && p < 1){
    // yatay dilimler sağa sola kayar; iki renk kanalı ayrık başlayıp üst üste oturur
    const sl = 7, hs = (H + 16) / sl, jit = (1 - ep) * w.w100 * .35, rgb = (1 - ep) * 18;
    for (let j = 0; j < sl; j++){
      const dx = (hash01(w.idx * 31 + j * 7 + Math.floor(age * 24)) - .5) * 2 * jit;
      g.save(); g.beginPath(); g.rect(-20, -A - 8 + j * hs, w.w100 + 40, hs + .5); g.clip();
      g.globalAlpha = a * .55; g.fillStyle = P.ac; g.fillText(w.text, dx - rgb, 0);
      g.fillStyle = P.fg; g.fillText(w.text, dx + rgb, 0);
      g.globalAlpha = a; g.fillStyle = col; g.fillText(w.text, dx, 0);
      g.restore();
    }
    return;
  }
  if (style === 'tabela' && p < 1){
    // havaalanı tabelası: her harf yatay ekseni etrafında döner (gerçek perspektif)
    for (let i = 0; i < n; i++){
      const pi = clamp((age - i * .035) / .3, 0, 1); if (pi <= 0) continue;
      const ang = -Math.PI / 2 * (1 - easeBack(pi));
      const V2 = vrot(V, U, ang), cw = (i + 1 < n ? w.offs[i + 1] : w.w100) - w.offs[i];
      const ach = bpt(b, w.lx + w.offs[i] * w.s, w.base, U, V);
      if (!setXform(ach, U, V2, w.s, cw / 2, cy)) continue;
      g.globalAlpha = a * (.35 + .65 * Math.cos(ang)); g.fillStyle = col;
      g.fillText(w.chars[i], 0, 0);
    }
    return;
  }
  const cwOf = i => (i + 1 < n ? w.offs[i + 1] : w.w100) - w.offs[i];
  if (style === 'kilit'){
    // akıcı giriş: ana kelimenin harfleri tabandaki maskenin altından sırayla süzülür (üstel yavaşlama),
    // nokta en son düşer; küçük kelimeler yumuşakça yükselip belirir
    const expo = q => q >= 1 ? 1 : 1 - Math.pow(2, -10 * q);
    if (w.big){
      g.save(); g.beginPath(); g.rect(-40, -A - 60, w.w100 + 80, A + D + 60); g.clip();
      for (let i = 0; i < n; i++){
        const dot = w.chars[i] === '.', pi = clamp((age - i * .05 - (dot ? .12 : 0)) / (dot ? .45 : .7), 0, 1); if (pi <= 0) continue;
        const q = dot ? easeBounce(pi) : expo(pi), y = dot ? -(1 - q) * H * .9 : (1 - q) * (H + 30);
        g.globalAlpha = a * Math.min(1, pi * 3); g.fillText(w.chars[i], w.offs[i], y);
      }
      g.restore();
    } else {
      const q = expo(clamp(age / .55, 0, 1));
      g.globalAlpha = a * q; g.fillText(w.text, 0, (1 - q) * H * .7);
    }
    return;
  }
  if (style === 'esnek' && age < 1.2){
    // ezilip uzama: tabandan basık başlar, sönümlü yayla salınıp oturur
    const k = Math.exp(-age * 6.5) * Math.cos(age * 21), sy = Math.max(.05, 1 - k * .85), sx = 1 + k * .45;
    g.save(); g.translate(cx, D); g.scale(sx, sy); g.translate(-cx, -D); g.globalAlpha = a * Math.min(1, age * 10); g.fillText(w.text, 0, 0); g.restore();
    return;
  }
  if (style === 'kabarcik' && p < 1.6){
    // harfler sırayla sıfırdan şişer (hafif yana yatmış başlar)
    for (let i = 0; i < n; i++){
      const pi = clamp((age - i * .045) / .32, 0, 1); if (pi <= 0) continue;
      const k = easeBack(pi), mx = w.offs[i] + cwOf(i) / 2, my = -A * .4, r = (hash01(w.idx * 17 + i) - .5) * .8 * (1 - pi);
      g.save(); g.translate(mx, my); g.rotate(r); g.scale(k, k); g.translate(-mx, -my);
      g.globalAlpha = a * Math.min(1, pi * 3); g.fillText(w.chars[i], w.offs[i], 0); g.restore();
    }
    return;
  }
  if (style === 'rulet' && age < .2 + n * .035){
    // slot makarası: her harfin üstünde rastgele harfler kayar, soldan sağa sırayla kilitlenir
    const step = H + 14, ABC = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ0123456789';
    for (let i = 0; i < n; i++){
      const pi = clamp(age / (.2 + i * .035), 0, 1), shift = (1 - easeOut(pi)) * step * 4;
      g.save(); g.beginPath(); g.rect(w.offs[i] - 4, -A - 7, cwOf(i) + 8, H + 14); g.clip();
      for (let k = 0; k < 5; k++){
        const y = shift - k * step; if (y < -step || y > step) continue;
        const ch = k === 0 ? w.chars[i] : ABC[Math.floor(hash01(w.idx * 131 + i * 17 + k) * ABC.length)];
        g.globalAlpha = a * (k === 0 ? 1 : .5); g.fillText(k === 0 ? ch : up(ch), w.offs[i], y);
      }
      g.restore();
    }
    return;
  }
  if (style === 'sarkac' && age < 2){
    // sol üst köşeden asılı: sönümlü sarkaç salınımı
    const sg = w.idx % 2 ? 1 : -1, ang = sg * .75 * Math.exp(-age * 3.2) * Math.cos(age * 9);
    g.save(); g.translate(0, -A); g.rotate(ang); g.translate(0, A); g.globalAlpha = a * Math.min(1, age * 8); g.fillText(w.text, 0, 0); g.restore();
    return;
  }
  if (style === 'dilim' && p < 1){
    // dikey dilimler: sırayla bir yukarıdan bir aşağıdan kayıp birleşir
    const sl = Math.max(4, Math.min(9, n * 2)), sw = (w.w100 + 20) / sl;
    for (let j = 0; j < sl; j++){
      const pj = easeOut(clamp((age - j * .025) / (dur * .9), 0, 1)); if (pj <= 0) continue;
      const dy = (1 - pj) * (H + 30) * 1.3 * (j % 2 ? 1 : -1);
      g.save(); g.beginPath(); g.rect(-10 + j * sw, -A - 12, sw + .6, H + 24); g.clip();
      g.globalAlpha = a * Math.min(1, pj * 2); g.fillText(w.text, 0, dy); g.restore();
    }
    return;
  }
  if (style === 'neon' && age < .32){
    // neon tabela: düzensiz yanıp söner, sonra sabit yanar
    const on = hash01(w.idx * 7 + Math.floor(age * 22)) < .45 + age * 2.5;
    g.globalAlpha = a * (on ? 1 : .12); g.fillText(w.text, 0, 0);
    if (on){ g.globalAlpha = a * .25; g.fillStyle = P.ac; g.fillText(w.text, -3, -3); g.fillText(w.text, 3, 3); }
    return;
  }
  if (style === 'coz' && age < .12 + n * .025){
    // şifre çözme: henüz çözülmemiş harfler her karede değişen rastgele harfler (vurgu renginde)
    const ABC = 'ABCDEFGHIJKLMNOPRSTUVYZ#%&@$*+=?<>', fr = Math.floor(age * 18);
    for (let i = 0; i < n; i++){
      const done = age > .06 + i * .025;
      if (done){ g.globalAlpha = a; g.fillStyle = col; g.fillText(w.chars[i], w.offs[i], 0); }
      else if (age > i * .01){ g.globalAlpha = a * .8; g.fillStyle = P.ac; g.fillText(ABC[Math.floor(hash01(w.idx * 53 + i * 11 + fr * 7) * ABC.length)], w.offs[i], 0); }
    }
    return;
  }
  if (style === 'patlama' && p < 1){
    // harfler dağınık 3D konumlardan (öne/arkaya, yana) dönerek yerine toplanır; her harf biraz gecikmeli
    for (let i = 0; i < n; i++){
      const pi = clamp((age - i * .025) / (dur * 1.2), 0, 1), q = 1 - easeOut(pi);
      const h1 = hash01(w.idx * 97 + i * 13), h2 = hash01(w.idx * 57 + i * 29 + 5), h3 = hash01(w.idx * 31 + i * 41 + 9);
      const cw = (i + 1 < n ? w.offs[i + 1] : w.w100) - w.offs[i];
      const sp = H * w.s * (2.2 + 2 * e);
      const ach = vadd(bpt(b, w.lx + w.offs[i] * w.s, w.base, U, V), vadd(vmul(U, (h1 - .5) * sp * 1.6 * q), vadd(vmul(V, (h2 - .5) * sp * q), vmul(N, (h3 - .35) * sp * 3 * q))));
      const ang = (h1 - .5) * 5 * q, U2 = vrot(U, N, ang), V2 = vrot(V, N, ang);
      if (!setXform(ach, U2, V2, w.s, cw / 2, cy)) continue;
      g.globalAlpha = a * Math.min(1, pi * 3); g.fillStyle = col; g.fillText(w.chars[i], 0, 0);
    }
    return;
  }
  if (style === 'maske'){
    // görünmez çizginin (taban + alt boşluk) arkasından yükselir; altta vurgu çizgisi soldan çekilir
    const q = clamp(age / (dur * 1.1), 0, 1), rise = (1 - easeBack(q)) * (H + 20);
    g.save(); g.beginPath(); g.rect(-30, -A - 40, w.w100 + 60, H + 40 + D * .2 + 10); g.clip();
    g.fillText(w.text, 0, rise); g.restore();
    const lq = easeOut(clamp((age - .05) / .35, 0, 1));
    if (!future){ g.globalAlpha = a * (active ? 1 : .35); g.fillStyle = P.ac; g.fillRect(0, D + 10, w.w100 * lq, Math.max(4, H * .06)); }
    return;
  }
  if (style === 'rap'){
    // her kelime farklı eğim ve boyda; her üç kelimeden biri vurgu renginde
    const r = (hash01(w.idx * 13 + 5) - .5) * .32, s2 = .85 + hash01(w.idx * 7 + 1) * .25;
    g.save(); g.translate(cx, cy); g.rotate(r); g.scale(s2, s2); g.translate(-cx, -cy);
    g.fillStyle = w.idx % 3 === 0 ? P.ac : P.fg; g.fillText(w.text, 0, 0); g.restore();
    return;
  }
  if (style === 'hiz' && age < dur * .9){
    // çizgi film hız izi: hızlıyken kelime hareket yönünde uzar ve eğilir, arkasında vurgu renginde hız çizgileri
    const q = clamp(age / (dur * .9), 0, 1), spd = Math.pow(2, -10 * q), sg = w.idx % 2 ? 1 : -1;
    if (spd > .02){
      g.fillStyle = P.ac;
      for (let k = 0; k < 5; k++){
        const h1 = hash01(w.idx * 29 + k * 7), len = spd * w.w100 * (1.4 + h1 * 1.6), y = -A + (k + .5) * H / 5 + (h1 - .5) * H * .08, th = H * (.025 + h1 * .02);
        const x0 = sg > 0 ? w.w100 + H * .1 : -H * .1 - len;
        g.globalAlpha = a * Math.min(1, spd * 3); g.fillRect(x0, y - th / 2, len, th);
      }
    }
    g.save(); g.translate(cx, cy); g.transform(1, 0, sg * spd * .45, 1, 0, 0); g.scale(1 + spd * 1.1, 1 - spd * .2); g.translate(-cx, -cy);
    g.globalAlpha = a; g.fillStyle = col; g.fillText(w.text, 0, 0); g.restore();
    return;
  }
  if (style === 'origami' && age < .35 + n * .025){
    // kâğıt katlama: her harfin alt yarısı tabandan yatık hâlden kalkar, üst yarısı ortadan katlanmışken açılır;
    // kâğıdın arka yüzü görünürken renk zemine doğru koyulaşır
    const mid = (D - A) / 2;
    for (let i = 0; i < n; i++){
      const pi = clamp((age - i * .025) / .32, 0, 1); if (pi <= 0) continue;
      const cw = cwOf(i), base = vadd(bpt(b, w.lx + w.offs[i] * w.s, w.base, U, V), off);
      const angB = (1 - easeOut(clamp(pi / .45, 0, 1))) * 1.35, Vb = vrot(V, U, angB);
      g.globalAlpha = a * Math.min(1, pi * 5);
      if (setXform(base, U, Vb, w.s, cw / 2, mid)){
        g.save(); g.beginPath(); g.rect(-6, mid, cw + 12, D - mid + 14); g.clip();
        g.fillStyle = mixHex(P.bg, col, .55 + .45 * Math.cos(angB)); g.fillText(w.chars[i], 0, 0); g.restore();
      }
      const angT = (1 - easeOut(clamp((pi - .3) / .7, 0, 1))) * Math.PI * .97, Vt = vrot(Vb, U, -angT);
      const midW = vadd(base, vmul(Vb, mid * w.s)), At = vsub(midW, vmul(Vt, mid * w.s));
      if (setXform(At, U, Vt, w.s, cw / 2, mid)){
        g.save(); g.beginPath(); g.rect(-6, -A - 14, cw + 12, mid + A + 14); g.clip();
        g.fillStyle = mixHex(P.bg, col, .3 + .7 * Math.abs(Math.cos(angT)) * (Math.cos(angT) > 0 ? 1 : .6)); g.fillText(w.chars[i], 0, 0); g.restore();
      }
    }
    return;
  }
  if (active && drawHold(w, age, b)) return;
  if (active && breathe(w, cx)) return;
  g.fillText(w.text, 0, 0);
}

// ===== src/10-kelime-efektleri.js =====
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

// ===== src/11-gecisler.js =====
/* ---------- geçişler ---------- */
// Satır değişiminde (yeni satırın ilk karesinde) bir geçiş seçilir: nakarata giriş/çıkışta renk bloğu silme, düet/arka vokalde
// bölünmüş ekran. Geçişler eski karenin görüntüsünü (SNAP) kullanır.
const SNAP = document.createElement('canvas'), sng = SNAP.getContext('2d');
// ekran geçişi: saat ↔ sözler ya da yeni şarkı. Eski kare (XS) hareketle ekrandan çıkar, yeni ekran (canlı kare, NS)
// hafif büyükten yerine oturur. Türler: bol (ekran ikiye bölünüp ayrılır), zoom (eskinin içine dalış), jaluzi (şeritler),
// kayma (yeni ekran eskisini iter), sade (eski yumuşak söner). Geçiş sürerken gelen yeni tetik görmezden gelinir:
// eski ekran gerçek eski ekran kalır, alttaki yeni ekran zaten canlı güncellenir (art arda iki geçiş olmaz).
const XS = document.createElement('canvas'), xsg = XS.getContext('2d');
const NS = document.createElement('canvas'), nsg = NS.getContext('2d');
const TRANS = ['bol', 'zoom', 'jaluzi', 'kayma'];
let FADE = null, lastTrans = '';
const trIO = q => q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;   // yavaş başla, hızlan, yavaş otur
const trOut = q => q >= 1 ? 1 : 1 - Math.pow(2, -9 * q);                      // hızlı gel, yumuşak otur
function screenFade(){
  if (!last || !cv.width) return; // henüz hiç kare çizilmedi
  if (FADE && nowS() - FADE.t0 < FADE.dur * .7) return;
  if (XS.width !== cv.width || XS.height !== cv.height){ XS.width = cv.width; XS.height = cv.height; }
  xsg.setTransform(1, 0, 0, 1, 0, 0); xsg.clearRect(0, 0, XS.width, XS.height); xsg.drawImage(cv, 0, 0);
  let k = S.trans || 'oto';
  if (k === 'oto'){ const c = TRANS.filter(x => x !== lastTrans); k = c[Math.floor(Math.random() * c.length)]; }
  lastTrans = k;
  // bölme çizgisi: dikey, yatay ya da çapraz
  const ang = [Math.PI / 2, 0, .38, -.38][Math.floor(Math.random() * 4)];
  FADE = {t0: nowS(), k, ang, dir: Math.random() < .5 ? 1 : -1, ac: pre().ac,
    dur: k === 'sade' ? .9 : k === 'jaluzi' ? 1.25 : k === 'bol' ? 1.15 : k === 'zoom' ? .95 : 1.05};
}
function drawFade(){
  if (!FADE) return;
  const VW = cv.width, VH = cv.height, q = (nowS() - FADE.t0) / FADE.dur, k = FADE.k;
  if (q >= 1 || q < 0 || XS.width !== VW || XS.height !== VH){ FADE = null; return; }
  const sc = (s, ox, oy) => g.setTransform(s, 0, 0, s, VW / 2 * (1 - s) + (ox || 0), VH / 2 * (1 - s) + (oy || 0));
  g.save(); g.globalAlpha = 1;
  if (k === 'sade'){
    const e = q * q * (3 - 2 * q); sc(1 + .04 * e); g.globalAlpha = 1 - e; g.drawImage(XS, 0, 0); g.restore(); return;
  }
  // yeni ekranın kopyası (bu karede çizilmiş hâli); altta büyükten oturur
  if (NS.width !== VW || NS.height !== VH){ NS.width = VW; NS.height = VH; }
  nsg.setTransform(1, 0, 0, 1, 0, 0); nsg.drawImage(cv, 0, 0);
  if (k === 'bol'){
    // önce ortada vurgu renginde ince bir çatlak açılır, sonra iki yarı birbirinden uzaklaşıp hafifçe döner
    const p = clamp((q - .14) / .86, 0, 1), e = trIO(p);
    sc(1 + .1 * (1 - trOut(p))); g.drawImage(NS, 0, 0);
    const a = FADE.ang, nx = -Math.sin(a), ny = Math.cos(a), R = Math.hypot(VW, VH), cx = VW / 2, cy = VH / 2;
    const tx = Math.cos(a) * R, ty = Math.sin(a) * R, m = Math.min(VW, VH);
    const crack = q < .14 ? Math.sin(q / .14 * Math.PI / 2) * m * .006 : m * .006;
    const dist = crack + e * R * .62;
    for (const sd of [1, -1]){
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.translate(cx + nx * dist * sd, cy + ny * dist * sd); g.rotate(sd * .06 * e * FADE.dir); g.translate(-cx, -cy);
      g.save();
      g.beginPath(); g.moveTo(cx - tx, cy - ty); g.lineTo(cx + tx, cy + ty);
      g.lineTo(cx + tx + nx * R * sd, cy + ty + ny * R * sd); g.lineTo(cx - tx + nx * R * sd, cy - ty + ny * R * sd); g.closePath();
      g.clip(); g.drawImage(XS, 0, 0);
      // kesik kenarı vurgu renginde (yarıya kırpıldığı için her parçada ince bir şerit kalır)
      g.strokeStyle = FADE.ac; g.lineWidth = m * .012; g.beginPath(); g.moveTo(cx - tx, cy - ty); g.lineTo(cx + tx, cy + ty); g.stroke();
      g.restore();
    }
  } else if (k === 'zoom'){
    // eski ekranın içine dalış: eski hızla büyüyüp saydamlaşır (iki kat hayalet = hız hissi), yeni büyükten oturur
    sc(1.18 - .18 * trOut(q)); g.drawImage(NS, 0, 0);
    const o = q * q, al = clamp(1 - q * 1.5, 0, 1);
    sc(1 + .9 * o); g.globalAlpha = al; g.drawImage(XS, 0, 0);
    sc(1 + 1.15 * o); g.globalAlpha = al * .35; g.drawImage(XS, 0, 0);
  } else if (k === 'jaluzi'){
    // eski ekran dikey şeritlere ayrılır, şeritler sırayla (bir yandan öbür yana) aşağı-yukarı kayıp çıkar
    sc(1.07 - .07 * trOut(q)); g.drawImage(NS, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const n = VW > VH * 1.1 ? 9 : 6, w = VW / n, st = .045;
    for (let i = 0; i < n; i++){
      const j = FADE.dir > 0 ? i : n - 1 - i, p = clamp((q - j * st) / (1 - st * (n - 1)), 0, 1);
      if (p >= 1) continue;
      const off = (i % 2 ? 1 : -1) * trIO(p) * VH * 1.05, x0 = Math.floor(i * w), x1 = Math.ceil((i + 1) * w);
      g.drawImage(XS, x0, 0, x1 - x0, VH, x0, off, x1 - x0, VH);
    }
  } else {
    // kayma: yeni ekran yandan gelip eskisini iter; eski geri çekilirken biraz küçülür, arada vurgu renginde ince şerit
    const e = trIO(q), d = FADE.dir, bw = Math.min(VW, VH) * .012;
    const s = 1 - .08 * e;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = mixHex(pre().bg, '#000000', .35); g.fillRect(0, 0, VW, VH);
    g.setTransform(s, 0, 0, s, VW / 2 * (1 - s) - d * e * VW, VH / 2 * (1 - s)); g.drawImage(XS, 0, 0);
    const nxp = d * (1 - e) * (VW + bw);
    g.setTransform(1, 0, 0, 1, nxp, 0); g.drawImage(NS, 0, 0);
    g.fillStyle = FADE.ac; g.fillRect(d > 0 ? -bw : VW, 0, bw, VH);
  }
  g.restore();
}
function snapshot(){ if (SNAP.width !== cv.width || SNAP.height !== cv.height){ SNAP.width = cv.width; SNAP.height = cv.height; } sng.setTransform(1, 0, 0, 1, 0, 0); sng.drawImage(cv, 0, 0); }
let RLI = -1, WP = null, SPL = null, SPLlast = -99;
const BC = {n: 0, last: -9, cut: -9};

// renk bloğu silme: eğik iki renkli bant ekranı süpürür; bandın önünde eski kare, arkasında yeni (ters renkli) sahne
function drawWipe(T, P){
  const q = clamp((T - WP.t0) / WP.dur, 0, 1); if (q >= 1 || T < WP.t0 - .1){ WP = null; return; }
  const VW = cv.width, VH = cv.height, s = VH * .35, b1 = VW * .16, b2 = VW * .05;
  const e2 = q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2, xL = lerp(-s, VW + s + b1 + b2, e2);
  const poly = (xa, xb) => { g.beginPath(); g.moveTo(xa + s, 0); g.lineTo(xb + s, 0); g.lineTo(xb, VH); g.lineTo(xa, VH); g.closePath(); };
  g.save(); g.globalAlpha = 1;
  if (WP.dir < 0) g.setTransform(-1, 0, 0, 1, VW, 0); else g.setTransform(1, 0, 0, 1, 0, 0);
  g.save(); poly(xL, VW + s + 10); g.clip(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(SNAP, 0, 0); g.restore();
  g.fillStyle = P.ac; poly(xL - b1, xL); g.fill();
  g.fillStyle = P.fg; poly(xL - b1 - b2, xL - b1); g.fill();
  g.restore();
}
// bölünmüş ekran: arka vokal cevabı, düette konuşan değişimi ya da hızlı kısa karşılıklı satırlar.
// Sol panelde önceki satır (ters renklerle, kendi kamerasıyla), sağda yeni satır; ayraç eğik vurgu çizgisi.
function splitWanted(pb, cb, T){
  if (!S.split || cv.width < cv.height * 1.2 || POSTER > 0) return false;
  if (STYLES[pb.style].whole || STYLES[cb.style].whole || STYLES[pb.style].dom || STYLES[cb.style].dom) return false;
  const a = pb.words, c = cb.words;
  if (c[0].paren && !a[0].paren) return true;
  if (a[0].spk && c[0].spk && a[0].spk !== c[0].spk) return true;
  return a.length <= 4 && c.length <= 4 && cb.t0 - pb.t0 < 2.6 && T - SPLlast > 20 && Math.random() < .35;
}
function splitAmt(T){
  if (!SPL) return 0;
  let s = easeOut(clamp((T - SPL.t0) / .45, 0, 1));
  if (SPL.endT != null){ const c = clamp((T - SPL.endT) / .45, 0, 1); if (c >= 1 || T < SPL.t0){ SPL = null; return 0; } s *= 1 - easeOut(c); }
  return s;
}
function drawSplit(T, P, e){
  const A = blocks[SPL.a]; if (!A) return;
  const VW = cv.width, VH = cv.height, sl = VH * .12, xd = lerp(-sl - VW * .01, VW / 2, SPLS), Pi = invPal(P);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(xd + sl, 0); g.lineTo(xd - sl, VH); g.lineTo(0, VH); g.closePath(); g.clip();
  g.fillStyle = Pi.bg; g.fillRect(0, 0, VW, VH);
  // geçici kamera: blok sol panele sığar ve tam karşıdan görünür
  const keep = [CAM.eye, CAM.f, CAM.r, CAM.up, CAM.zoom, VOX, SX, SY];
  const tan = Math.tan(FOV / 2), asp = VW / 2 / VH, d = Math.max(W / 2 / asp, A.h / 2) / tan * 1.3, f = A.N, r = vnorm(vcross(f, vmul(A.V, -1)));
  CAM.eye = vsub(A.C, vmul(f, d)); CAM.f = f; CAM.r = r; CAM.up = vcross(r, f); CAM.zoom = 1 + L.beat * .015;
  VOX = xd / 2 - VW / 2 - VW * .25 * (1 - SPLS); SX = SY = 0;
  for (const w of STYLES[A.style].single ? [A.words[A.words.length - 1]] : A.words){ w.chorus = A.chorus; drawWord(A, w, T, Pi, 1, 1, e, 0, null); PX = PY = 0; }
  [CAM.eye, CAM.f, CAM.r, CAM.up, CAM.zoom, VOX, SX, SY] = keep;
  g.restore();
  const lw = VW * .005; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = P.ac;
  g.beginPath(); g.moveTo(xd + sl - lw, 0); g.lineTo(xd + sl + lw, 0); g.lineTo(xd - sl + lw, VH); g.lineTo(xd - sl - lw, VH); g.closePath(); g.fill();
}
// vuruşa kesme: tempo güvenilirken, sıradaki satır 0.3 sn içinde başlayacaksa ve vuruş geldiyse satır vuruşa çekilir,
// kamera yolculuk yerine sert kesmeyle yeni satıra geçer (klip montajı). Art arda iki kesme olmaz, enerjik bölümde ya da nakaratta.
function beatSure(){
  if (L.ivs.length < 6) return false;
  const s = [...L.ivs].sort((a, b) => a - b), med = s[s.length >> 1];
  return (s[(s.length * 3) >> 2] - s[s.length >> 2]) / med < .2;
}
function beatCut(T, ai){
  if (ai < 0 || POSTER > 0) return;
  const nx = words[ai + 1]; if (!nx || nx.wi !== 0) return;
  const dn = nx.t - T; if (dn <= 0 || dn > .3) return;
  if (BC.last === nx.li - 1 || !beatSure() || (energy() < .5 && !isChorusLi(nx.li)) || Math.random() > .6) return;
  nx.t = Math.max(T, words[ai].t + .01); if (blocks[nx.li]) blocks[nx.li].t0 = nx.t;
  BC.last = nx.li; BC.cut = nx.li; L.beat = 1;
}
function lineChange(pb, cb, T){
  if (BC.cut === cb.li) snapCam = true; // vuruşa kesme
  // düet/arka vokal: bölünmüş ekran (renk bloğundan önce gelir; nakarat sınırına denk gelse de konuşan değişimi gösterilir)
  if (splitWanted(pb, cb, T)){ SPL = {a: pb.li, b: cb.li, t0: SPL && SPL.endT == null ? SPL.t0 : T, endT: null}; SPLlast = T; return; }
  // nakarata giriş/çıkış: paletler değişir, değişim renk bloğuyla süpürülür
  if (S.wipe && pb.chorus !== cb.chorus){ snapshot(); WP = {t0: T, dur: .6, dir: cb.chorus ? 1 : -1}; if (SPL && SPL.endT == null) SPL.endT = T; return; }
  if (SPL && SPL.endT == null) SPL.endT = T;
}

// ===== src/12-yazi3d.js =====
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

// ===== src/13-nesneler.js =====
/* ---------- nesne çizimleri: para, altın, su, ateş… kelimelerinin yanında küçük çizim ----------
   Kelime ekli hâlleriyle de tanınır (Türkçe harfler sadeleştirilip kök kalıbına bakılır; İngilizce karşılıklar da).
   Dizilişte kelimenin sağında çizime yer ayrılır (w.ix, 100 px yazı biriminde), çizim kelimenin dönüşüne uyar.
   Çizimler 0..100 kutusunda; vurgu renginde, kelimeyle birlikte pop ederek gelir, vuruşta hafif nabız atar. */
const icPoly = (pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };
const icLine = (...seg) => { g.beginPath(); for (let i = 0; i < seg.length; i += 2) i ? g.lineTo(seg[i], seg[i + 1]) : g.moveTo(seg[i], seg[i + 1]); g.stroke(); };
const icCirc = (x, y, r) => { g.moveTo(x + r, y); g.arc(x, y, r, 0, 6.2832); };
const icCloud = () => { g.beginPath(); icCirc(30, 58, 18); icCirc(52, 44, 24); icCirc(74, 58, 18); g.rect(30, 52, 44, 24); g.fill('nonzero'); };
const ICONS = [
  ['para', /^(para|paralar\w*|paray\w*|paran\w*|parada\w*|paramiz|dolar\w*|money|cash|dollars?|bucks?|zengin\w*|rich)$/, () => {
    g.lineWidth = 10; g.beginPath(); g.moveTo(72, 26); g.bezierCurveTo(62, 12, 28, 12, 28, 32); g.bezierCurveTo(28, 52, 72, 46, 72, 68); g.bezierCurveTo(72, 90, 34, 90, 26, 74); g.stroke(); icLine(50, 4, 50, 96); }],
  ['altin', /^(altin|altinlar\w*|altini|altinim|altinin|gold|golden)$/, () => {
    icPoly([[8, 92], [48, 92], [42, 70], [14, 70]]); g.fill(); icPoly([[52, 92], [92, 92], [86, 70], [58, 70]]); g.fill(); icPoly([[30, 66], [70, 66], [64, 44], [36, 44]]); g.fill();
    g.lineWidth = 5; icLine(80, 12, 80, 32); icLine(70, 22, 90, 22); }],
  ['damla', /^(su|suyu|suyun|sular\w*|suda|sudan|suya|water|waters|damla\w*|gozyas\w*|tears?|teardrops?)$/, () => {
    g.beginPath(); g.moveTo(50, 4); g.bezierCurveTo(64, 28, 84, 46, 84, 66); g.bezierCurveTo(84, 86, 68, 96, 50, 96); g.bezierCurveTo(32, 96, 16, 86, 16, 66); g.bezierCurveTo(16, 46, 36, 28, 50, 4); g.fill(); }],
  ['ates', /^(ates\w*|alev\w*|fire|flames?|burn\w*)$/, () => {
    g.beginPath(); g.moveTo(52, 2); g.bezierCurveTo(60, 26, 86, 40, 84, 66); g.bezierCurveTo(82, 88, 66, 98, 50, 98); g.bezierCurveTo(30, 98, 16, 86, 18, 66); g.bezierCurveTo(20, 50, 32, 46, 36, 30); g.bezierCurveTo(44, 40, 46, 46, 46, 54); g.bezierCurveTo(56, 40, 56, 20, 52, 2); g.fill(); }],
  ['kalp', /^(kalp\w*|kalb\w*|sevda\w*|heart\w*|love|loved|lover)$/, () => {
    g.beginPath(); g.moveTo(50, 90); g.bezierCurveTo(10, 62, 4, 36, 24, 22); g.bezierCurveTo(37, 13, 48, 21, 50, 32); g.bezierCurveTo(52, 21, 63, 13, 76, 22); g.bezierCurveTo(96, 36, 90, 62, 50, 90); g.fill(); }],
  ['kalp', /^(ask|aski|askim\w*|askin\w*|aska|askla)$/, null, 'tr'],
  ['yildiz', /^(yildiz\w*|stars?|starlight)$/, () => {
    g.beginPath(); for (let i = 0; i < 10; i++){ const r = i % 2 ? 19 : 46, a = -1.5708 + i * .62832; i ? g.lineTo(50 + r * Math.cos(a), 54 + r * Math.sin(a)) : g.moveTo(50 + r * Math.cos(a), 54 + r * Math.sin(a)); } g.closePath(); g.fill(); }],
  ['ay', /^(ay|aya|ayin|ayi|mehtap\w*|moon\w*|gece\w*|night\w*|tonight)$/, () => {
    g.beginPath(); g.arc(50, 50, 42, -1, 1, true); g.arc(88, 50, 38.5, 1.98, 4.3, false); g.closePath(); g.fill();
    g.lineWidth = 5; icLine(82, 18, 82, 34); icLine(74, 26, 90, 26); }],
  ['gunes', /^(gunes\w*|sun|sunshine|sunlight|sunny)$/, () => {
    g.beginPath(); icCirc(50, 50, 20); g.fill(); g.lineWidth = 8; for (let i = 0; i < 8; i++){ const a = i * .7854; icLine(50 + 31 * Math.cos(a), 50 + 31 * Math.sin(a), 50 + 45 * Math.cos(a), 50 + 45 * Math.sin(a)); } }],
  ['yagmur', /^(yagmur\w*|rain\w*)$/, () => { g.save(); g.translate(0, -12); icCloud(); g.restore(); g.lineWidth = 7; icLine(32, 76, 26, 94); icLine(52, 76, 46, 94); icLine(72, 76, 66, 94); }],
  ['bulut', /^(bulut\w*|clouds?)$/, () => icCloud()],
  ['deniz', /^(deniz\w*|okyanus\w*|sea|seas|ocean\w*|waves?|dalga\w*)$/, () => {
    g.lineWidth = 8; for (let k = 0; k < 3; k++){ const y = 30 + k * 22; g.beginPath(); g.moveTo(6, y); g.quadraticCurveTo(17, y - 10, 28, y); g.quadraticCurveTo(39, y + 10, 50, y); g.quadraticCurveTo(61, y - 10, 72, y); g.quadraticCurveTo(83, y + 10, 94, y); g.stroke(); } }],
  ['cicek', /^(cicek\w*|gul|gulum|guller\w*|gulu|roses?|flowers?)$/, (c, bg) => {
    g.lineWidth = 7; icLine(50, 66, 50, 98); g.beginPath(); for (let i = 0; i < 5; i++){ const a = -1.5708 + i * 1.2566; icCirc(50 + 20 * Math.cos(a), 42 + 20 * Math.sin(a), 15); } g.fill('nonzero');
    g.fillStyle = bg; g.beginPath(); icCirc(50, 42, 9); g.fill(); }],
  ['kus', /^(kus|kuslar\w*|kusum|kusun|birds?)$/, () => { g.lineWidth = 8; g.beginPath(); g.moveTo(8, 42); g.quadraticCurveTo(30, 22, 50, 50); g.quadraticCurveTo(70, 22, 92, 42); g.stroke(); }],
  ['goz', /^(goz|gozler\w*|gozum\w*|gozun\w*|gozu|eyes?)$/, () => {
    g.lineWidth = 8; g.beginPath(); g.moveTo(6, 50); g.quadraticCurveTo(50, 6, 94, 50); g.quadraticCurveTo(50, 94, 6, 50); g.stroke(); g.beginPath(); icCirc(50, 50, 15); g.fill(); }],
  ['ev', /^(ev|evim\w*|eve|evde|evden|evin|home|house)$/, () => { g.lineWidth = 8; icLine(10, 48, 50, 12, 90, 48); g.strokeRect(22, 46, 56, 46); g.fillRect(42, 64, 16, 28); }],
  ['araba', /^(araba\w*|car|cars)$/, (c, bg) => {
    icPoly([[6, 72], [6, 56], [24, 52], [36, 32], [66, 32], [80, 52], [94, 56], [94, 72]]); g.fill();
    g.beginPath(); icCirc(28, 74, 11); icCirc(72, 74, 11); g.fill(); g.fillStyle = bg; g.beginPath(); icCirc(28, 74, 4); icCirc(72, 74, 4); g.fill(); }],
  ['telefon', /^(telefon\w*|phone\w*)$/, () => { g.lineWidth = 8; g.beginPath(); if (g.roundRect) g.roundRect(28, 6, 44, 88, 9); else g.rect(28, 6, 44, 88); g.stroke(); icLine(44, 80, 56, 80); }],
  ['muzik', /^(muzik\w*|sarki\w*|nota\w*|music|songs?|melod\w*)$/, () => {
    g.lineWidth = 8; icLine(36, 22, 36, 74); icLine(80, 12, 80, 66); icPoly([[36, 18], [80, 8], [80, 24], [36, 34]]); g.fill();
    g.beginPath(); g.ellipse(25, 76, 13, 9, -.4, 0, 6.2832); g.fill(); g.beginPath(); g.ellipse(69, 68, 13, 9, -.4, 0, 6.2832); g.fill(); }],
  ['saat', /^(saat\w*|zaman\w*|time|times|clock\w*)$/, () => { g.lineWidth = 8; g.beginPath(); g.arc(50, 50, 42, 0, 6.2832); g.stroke(); icLine(50, 26, 50, 50, 68, 60); }],
  ['tac', /^(kral\w*|krali\w*|tac|taci\w*|king\w*|queen\w*|crown\w*|prens\w*)$/, () => { icPoly([[10, 76], [14, 28], [32, 50], [50, 18], [68, 50], [86, 28], [90, 76]]); g.fill(); g.fillRect(10, 81, 80, 11); }],
  ['elmas', /^(elmas\w*|pirlanta\w*|diamonds?)$/, () => {
    g.lineWidth = 7; icPoly([[18, 38], [33, 16], [67, 16], [82, 38], [50, 90]]); g.stroke(); g.lineWidth = 4; icLine(18, 38, 82, 38); icLine(33, 16, 42, 38, 50, 90, 58, 38, 67, 16); }],
  ['simsek', /^(simsek\w*|yildirim\w*|lightning|thunder\w*)$/, () => { icPoly([[60, 2], [20, 56], [46, 56], [36, 98], [82, 40], [55, 40], [68, 2]]); g.fill(); }],
  ['kar', /^(kar|kari|karlar\w*|snow\w*)$/, () => { g.lineWidth = 8; for (let i = 0; i < 3; i++){ const a = i * 1.0472; icLine(50 - 44 * Math.cos(a), 50 - 44 * Math.sin(a), 50 + 44 * Math.cos(a), 50 + 44 * Math.sin(a)); } }],
  ['anahtar', /^(anahtar\w*|keys?)$/, () => { g.lineWidth = 8; g.beginPath(); g.arc(26, 50, 17, 0, 6.2832); g.stroke(); icLine(43, 50, 94, 50); icLine(78, 50, 78, 66); icLine(91, 50, 91, 62); }],
  ['dunya', /^(dunya\w*|world\w*|earth)$/, () => { g.lineWidth = 7; g.beginPath(); g.arc(50, 50, 42, 0, 6.2832); g.stroke(); g.beginPath(); g.ellipse(50, 50, 17, 42, 0, 0, 6.2832); g.stroke(); icLine(8, 50, 92, 50); }],
  ['sehir', /^(sehir|sehre|sehri\w*|sehrin\w*|sehirde|city|town)$/, () => { g.fillRect(6, 46, 18, 50); g.fillRect(28, 22, 20, 74); g.fillRect(52, 40, 16, 56); g.fillRect(72, 12, 20, 84); }],
  ['dag', /^(dag|daglar\w*|dagin\w*|dagi|mountains?)$/, () => { icPoly([[2, 94], [38, 28], [58, 60], [70, 42], [98, 94]]); g.fill(); }],
  ['agac', /^(agac\w*|trees?|orman\w*|forest)$/, () => { icPoly([[50, 4], [88, 70], [12, 70]]); g.fill(); g.fillRect(43, 70, 14, 26); }],
  ['kahve', /^(kahve\w*|coffee)$/, () => {
    icPoly([[14, 40], [72, 40], [66, 90], [20, 90]]); g.fill(); g.lineWidth = 7; g.beginPath(); g.arc(74, 60, 12, -1.3, 1.3); g.stroke();
    g.lineWidth = 5; g.beginPath(); g.moveTo(34, 32); g.bezierCurveTo(26, 22, 42, 16, 34, 4); g.stroke(); g.beginPath(); g.moveTo(52, 32); g.bezierCurveTo(44, 22, 60, 16, 52, 4); g.stroke(); }],
  ['sarap', /^(sarap\w*|kadeh\w*|wine|raki\w*)$/, () => {
    g.beginPath(); g.moveTo(24, 6); g.lineTo(76, 6); g.quadraticCurveTo(78, 52, 50, 56); g.quadraticCurveTo(22, 52, 24, 6); g.fill(); g.lineWidth = 7; icLine(50, 56, 50, 88); icLine(30, 92, 70, 92); }]
];
// duygu yüzleri: kelimenin anına göre canlı (t = kelime girişinden beri geçen sn). Yüz çemberi + gözler + ağız;
// gülümseme ağzı kıvrılır ve göz kırpar, şaşırma zıplar ve ağzı O olur, kahkaha sallanır, ağlama gözyaşı akıtır…
const faceRing = () => { g.lineWidth = 7; g.beginPath(); g.arc(50, 52, 40, 0, 6.2832); g.stroke(); };
const blinkK = t => { const ph = (t + .6) % 2.8; return ph < .12 ? Math.abs(ph - .06) / .06 : 1; }; // 1 açık, 0 kapalı
const eyes = (t, r) => { const k = blinkK(t); g.beginPath(); g.ellipse(36, 44, r, Math.max(1, r * k), 0, 0, 6.2832); g.ellipse(64, 44, r, Math.max(1, r * k), 0, 0, 6.2832); g.fill(); };
const EMO = [
  ['gulumse', /^(gulumse\w*|gulus\w*|tebessum\w*|smil\w*|happy|mutlu\w*|sevin\w*)$/, (c, bg, t) => {
    const k = easeBack(clamp(t / .55, 0, 1)), bob = Math.sin(t * 3.2) * 2 * Math.min(1, t);
    g.translate(0, bob); faceRing(); eyes(t, 5.5);
    g.lineWidth = 7; g.beginPath(); g.moveTo(31, 62); g.quadraticCurveTo(50, 62 + 22 * k, 69, 62); g.stroke(); }],
  ['kahkaha', /^(gul(uyor|dum|dun|du|duk|duler|mek|meye|elim|eriz|uyorum|uyorsun|uyoruz|unce)\w*|kahkaha\w*|haha\w*|laugh\w*|lol)$/, (c, bg, t) => {
    const sh = Math.sin(t * 18) * 4 * Math.max(.25, 1 - t * .6);
    g.translate(0, -Math.abs(sh)); g.rotate(sh * .012); faceRing();
    g.lineWidth = 6; g.beginPath(); g.moveTo(28, 46); g.quadraticCurveTo(36, 36, 44, 46); g.moveTo(56, 46); g.quadraticCurveTo(64, 36, 72, 46); g.stroke();
    const o = clamp(t / .3, 0, 1); g.beginPath(); g.moveTo(28, 58); g.lineTo(72, 58); g.quadraticCurveTo(70, 58 + 26 * o, 50, 58 + 26 * o); g.quadraticCurveTo(30, 58 + 26 * o, 28, 58); g.fill(); }],
  ['sasir', /^(sasir\w*|saski\w*|hayret\w*|vay|vay+|wow+|surpris\w*|shock\w*|amanin)$/, (c, bg, t) => {
    const j = t < .45 ? Math.sin(t / .45 * Math.PI) * 14 : 0; g.translate(0, -j); faceRing();
    const k = easeBack(clamp(t / .35, 0, 1));
    g.beginPath(); icCirc(36, 44, 6.5); icCirc(64, 44, 6.5); g.fill();
    g.lineWidth = 5; const br = 8 * k; icLine(28, 32 - br, 42, 30 - br); icLine(58, 30 - br, 72, 32 - br);
    g.lineWidth = 6; g.beginPath(); g.ellipse(50, 70, 3 + 6 * k, 3 + 9 * k, 0, 0, 6.2832); g.stroke();
    if (t > .15){ g.globalAlpha *= Math.min(1, (t - .15) * 4); g.lineWidth = 7; icLine(94, 6, 94, 22); g.beginPath(); icCirc(94, 31, 3.5); g.fill(); } }],
  ['aglama', /^(agla\w*|cry\w*|crie[sd]|sad|uzgun\w*|huzun\w*)$/, (c, bg, t) => {
    faceRing(); g.lineWidth = 5; icLine(28, 40, 42, 36); icLine(58, 36, 72, 40); eyes(t, 4.5);
    const k = easeOut(clamp(t / .5, 0, 1)); g.lineWidth = 7; g.beginPath(); g.moveTo(33, 76); g.quadraticCurveTo(50, 76 - 18 * k, 67, 76); g.stroke();
    // gözyaşı: iki gözden sırayla süzülen damlalar
    for (const [x, ph] of [[36, 0], [64, .5]]){ const q = ((t * 1.1 + ph) % 1), y = 50 + q * 34; g.globalAlpha *= 1; g.beginPath(); g.moveTo(x, y - 7); g.quadraticCurveTo(x + 5, y, x, y + 4); g.quadraticCurveTo(x - 5, y, x, y - 7); g.fill(); } }],
  ['kizgin', /^(kiz(gin|di|dim|dik|iyor|iyorum|arim)\w*|ofke\w*|sinir\w*|angry|mad|rage)$/, (c, bg, t) => {
    g.translate(Math.sin(t * 45) * 3 * Math.max(0, 1 - t * 1.2), 0); faceRing();
    g.lineWidth = 6; icLine(26, 32, 44, 40); icLine(56, 40, 74, 32); g.beginPath(); icCirc(37, 48, 4.5); icCirc(63, 48, 4.5); g.fill();
    g.lineWidth = 7; g.beginPath(); g.moveTo(34, 74); g.quadraticCurveTo(50, 64, 66, 74); g.stroke(); }],
  ['asik', /^(asik\w*|asig\w*|vurgun\w*|crush\w*|inlove)$/, (c, bg, t) => {
    faceRing(); const p = 1 + .18 * Math.max(0, Math.sin(t * 7)) * Math.min(1, t * 2);
    for (const x of [36, 64]){ g.save(); g.translate(x, 44); g.scale(.17 * p, .17 * p); g.translate(-50, -55); g.beginPath(); g.moveTo(50, 90); g.bezierCurveTo(10, 62, 4, 36, 24, 22); g.bezierCurveTo(37, 13, 48, 21, 50, 32); g.bezierCurveTo(52, 21, 63, 13, 76, 22); g.bezierCurveTo(96, 36, 90, 62, 50, 90); g.fill(); g.restore(); }
    g.lineWidth = 7; g.beginPath(); g.moveTo(33, 64); g.quadraticCurveTo(50, 80, 67, 64); g.stroke(); }],
  ['uyku', /^(uyku\w*|uyu(du|dum|yor|mak|yamam|yamiyorum|yan)\w*|uykusuz\w*|sleep\w*|tired|yorgun\w*|dream\w*|ruya\w*)$/, (c, bg, t) => {
    g.save(); g.translate(-8, 6); g.scale(.82, .82); faceRing(); g.lineWidth = 6; icLine(28, 46, 44, 46); icLine(56, 46, 72, 46); g.beginPath(); g.ellipse(50, 68, 5, 4, 0, 0, 6.2832); g.fill(); g.restore();
    // havaya süzülen Z'ler
    g.lineWidth = 4;
    for (let i = 0; i < 3; i++){ const q = ((t * .55 + i / 3) % 1), x = 74 + q * 16, y = 40 - q * 38, z = 6 + q * 6, a = g.globalAlpha;
      g.globalAlpha = a * Math.sin(q * Math.PI); icLine(x, y, x + z, y, x, y + z, x + z, y + z); g.globalAlpha = a; } }]
];
ICONS.unshift(...EMO);
// kalp için Türkçe "aşk" (İngilizce "ask" ile karışmasın): çizimi yukarıdaki kalpten al
ICONS.forEach(e => { if (!e[2]) e[2] = ICONS.find(x => x[0] === e[0] && x[2])[2]; });
function iconOf(raw){
  // şapka ve işaretler ayrılıp atılır (â→a, ş→s, ü→u…); harf dışı her şey silinir
  const k = fold((raw || '').toLocaleLowerCase(UPL)).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  if (!k) return mlIcon(raw) || null; // Latin dışı yazı (Rusça, Arapça, Korece, Japonca): yalnız çok dilli kökler
  // "para" (İsp./Port. için), "su" (İsp./İt. onun), "ay" (İsp. ünlem)… Türkçe olmayan şarkıda çizim yapmaz
  const trOnly = UPL !== 'tr' && UPL !== 'az' && /^(ay|aya|ayi|ayin|su|suda|suya|suyu|para|paran\w*|parada|ev|eve|evde|kar|kari|gul|gulu|gulum|dag|dagi|tac|ates)$/.test(k);
  if (!trOnly) for (const [name, re, draw, lang] of ICONS) if ((!lang || lang === UPL) && re.test(k)) return name;
  return mlIcon(raw) || null;
}
const iconDraw = name => ICONS.find(x => x[0] === name)[2];
function drawIcons(T, li, P, cb){
  if (!S.icons || POSTER > 0) return;
  const col = contrast(P.ac, P.bg) >= 2.5 ? P.ac : P.fg;
  for (const b of [blocks[li - 1], cb]){
    if (!b || STYLES[b.style].noIcon) continue;
    const ba = b === cb ? 1 : Math.max(0, 1 - clamp((T - cb.t0) / 1, 0, 1));
    if (ba < .02) continue;
    for (const w of b.words){
      if (!w.icOn || !w.icon) continue;
      const age = T - w.t + EARLY; if (age < 0) continue;
      const p = clamp(age / .45, 0, 1), sz = w.asc * w.s * 1.05;
      WR = w.rot ? {ang: w.rot, c: w.rcx != null ? bpt(b, w.rcx, w.rcy) : bpt(b, w.lx + w.w / 2, w.y + w.h / 2)} : null;
      const ok = setXform(bpt(b, w.lx + w.w + 14 * w.s, w.base - sz * .98), b.U, b.V, sz / 100, 50, 50);
      WR = null;
      if (!ok) continue;
      const sc = easeBack(p) * (1 + L.beat * .1), bob = Math.sin(T * 2.3 + w.idx) * 3 * p;
      g.translate(50, 50 + bob); g.rotate((1 - easeOut(p)) * -.7); g.scale(sc, sc); g.translate(-50, -50);
      g.globalAlpha = ba * Math.min(1, p * 3); g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
      iconDraw(w.icon)(col, P.bg, age, T);
    }
  }
  g.globalAlpha = 1; g.lineCap = 'butt'; g.lineJoin = 'miter';
}

/* ---------- çok dilli kelime kökleri (çizimler, duygu yüzleri, anlam efektleri) ----------
   Türkçe/İngilizce kalıplar yukarıda; burada İspanyolca, Portekizce, Fransızca, Almanca, İtalyanca, Rusça, Azerice, Kürtçe,
   Arapça, Korece, Japonca kökler. Kelime ve kök aynı biçimde sadeleştirilir (küçük harf, aksan/işaret silinir, ı→i).
   "kök" ile başlayan kelime eşleşir; sonunda = olan kök yalnız tam kelime (kısa ya da başka anlamı olan kelimeler için).
   Latin dışı yazılarda (Arapça, Korece, Japonca, Rusça) kök kelimenin içinde geçerse eşleşir (Japoncada boşluk yok). */
const mlNorm = s => (s || '').toLocaleLowerCase(UPL).replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
const ML_ICON = {
  gulumse: 'sonri feliz alegr sorri sourir heureu joie= lachel glucklich froh= sorris sorrid felic улыб счаст рад= gulumsə xosbəxt ابتسام سعيد 미소 행복 笑顔 幸せ',
  kahkaha: 'reir riendo risa jaja rir= rindo riso= rire= rient lachen lacht lachte ridere rido= risata смех смея смеш хаха ضحك ههه 웃 ㅋㅋ 笑',
  sasir: 'sorpres asombr surpres espant surpris etonn uberrasch staun stupi удивл вау= təəccub مفاجأ 놀라 驚',
  aglama: 'llor chor= chora choro chorar chorando triste pleur weine weint traurig piang плак плач груст печал kədər بكاء يبكي حزين 슬프 슬픔 泣 悲し',
  kizgin: 'enfad enoj furia rabia raiva colere furieu wut= wutend zorn arrabbi злой злост злюсь гнев ярост qəzəb hirs غضب 화나 분노 怒',
  asik: 'enamor apaixon amoureu verliebt innamor влюбл asiq عاشق 반했 恋',
  uyku: 'dormi sueno cansad dormir dorme duerm sono= sonho sommeil reve= reves fatigu schlaf mude traum sonno sogno stanco stanca сон= сна= спать сплю спит устал мечт yuxu نوم نائم حلم 잠= 자고 꿈 眠 夢 寝',
  para: 'dinero plata= dinheiro grana= argent= fric= geld soldi denaro деньг бабк pul= pullar pere= مال= فلوس 돈= お金',
  altin: 'oro= ouro= золот qizil zer= ذهب 금= 黄金',
  damla: 'agua lagrim eau= larme wasser trane acqua lacrim вода= воды= воду= слез hesir ماء دموع 물= 눈물 水= 涙',
  ates: 'fuego fogo chama= feu= flamme feuer flamm fuoco fiamm огон огн пламя atəs alov agir= نار 불= 火 炎',
  kalp: 'corazon amor coracao coeur cœur amour herz liebe cuore amore сердц любов люблю urək urəy sevgi قلب حب حبيب 사랑 마음 愛 心 好き',
  yildiz: 'estrell estrel etoile sterne sternen stell звезд ulduz ster= نجم نجوم 별= 星',
  ay: 'luna= lua= lune= mond luna= луна луну луны hiv= heyv قمر 달= 月 noche noite nuit nacht notte ночь ночи gecə ليل 밤= 夜',
  gunes: 'sol= soleil sonne солнц gunəs roj= شمس 태양 太陽',
  yagmur: 'lluvia llov chuva chov pluie pleu regen pioggia piov дожд yagis baran مطر 비= 雨',
  bulut: 'nube nuvem nuage wolke nuvol облак туч bulud ewr غيم سحاب 구름 雲',
  deniz: 'mar= oceano ola= olas= onda mer= ocean meer ozean welle море океан волн dəniz derya behr بحر 바다 海',
  cicek: 'flor rosa= fleur blume fiore fiori цветок цветы роза gul= وردة ورد زهرة 꽃 장미 花 薔薇',
  kus: 'pajaro ave= aves= passaro oiseau vogel uccell птиц qus teyr طير عصفور 새= 鳥',
  goz: 'ojo= ojos= olho yeux= oeil œil auge= augen occhi occhio глаз cav= عين عيون 瞳',
  ev: 'casa= hogar lar= maison haus= heim= zuhause дом= дома= домой بيت 집= 家',
  araba: 'coche carro voiture wagen macchina машин masin سيارة 車',
  telefon: 'telefono movil telefone celular telephone телефон هاتف 전화 電話',
  muzik: 'musica cancion cancao musique chanson musik canzon музык песн musiqi mahni stran موسيق أغني 노래 음악 音楽 歌',
  saat: 'tiempo reloj hora= tempo= relogio temps= heure horloge zeit= uhr= orologio время часы= vaxt وقت ساعة 시간 時間 時計',
  tac: 'rey= reina corona rei= rainha coroa roi= reine couronne konig koenig krone regina корол царь корон ملك تاج 왕= 여왕 女王',
  elmas: 'diamante diamant алмаз бриллиант almaz ماس 다이아 ダイヤ',
  simsek: 'rayo= trueno relampago raio= trovao eclair tonnerre foudre blitz donner fulmine tuono молни гром= ildirim simsək برق رعد 번개 雷',
  kar: 'nieve neve neige schnee снег qar= berf ثلج 雪',
  anahtar: 'llave chave cle= clef schlussel chiave ключ acar مفتاح 열쇠 鍵',
  dunya: 'mundo tierra terra monde terre welt= erde= mondo мир= мира= земл dinya cihan عالم دنيا 세상 세계 世界',
  sehir: 'ciudad cidade ville= cite= stadt citta город səhər bajar مدينة 도시 都市',
  dag: 'montana montanha montagne berg= berge= montagn гор= горы= ciya جبل 산= 山',
  agac: 'arbol bosque arvore floresta arbre foret baum= baume wald= albero alberi bosco foresta дерев лес= леса= məsə شجر غابة 나무 숲 森 木=',
  kahve: 'cafe= caffe kaffee кофе qəhvə قهوة 커피 コーヒー',
  sarap: 'vino= vinho vin= wein= вино вина= sərab نبيذ 와인 ワイン'
};
const ML_SEM = {
  dus: 'caer cae= caigo cayo cair cai= caiu tomb fallen sturz cade cadere caduto пада упал yixil',
  yuksel: 'volar vuelo cielo voar voo= ceu= voler ciel= envol flieg himmel vola cielo лета небо неба goy سماء',
  don: 'girar gira= vuelta volta tourn dreh круж верт',
  kir: 'romp roto= quebr casse briser brise brech bricht kaputt zerbro rotto spezz слом разбит ломат qir',
  yan: 'quem arde brul brenn brucia горит сгора',
  titre: 'tembl miedo treme tremer tremo medo= peur= zitter angst= paura дрож страх боюсь',
  sus: 'silencio calla cala= tais chut= leise ruhe= silenzio zitto тиш молч',
  bagir: 'grita gritar grito cri= cris= crie= hurl schrei grida gridare urla крич крик',
  kalp: 'corazon amor coracao coeur cœur amour herz liebe cuore amore сердц любов люблю urək urəy sevgi قلب حب 사랑 愛',
  kos: 'corre corri correr courir cours= lauf renn бег беж',
  agla: 'llor lluvia chor= chora choro chorar chorando chuva pleur pluie weine regen piang pioggia плак плач дожд'
};
const mlPrep = o => Object.keys(o).map(k => [k, o[k].split(/\s+/).filter(Boolean).map(t => { const ex = t.endsWith('='), st = mlNorm(ex ? t.slice(0, -1) : t); return {st, ex, latin: /^[a-z0-9]+$/.test(st)}; })]);
let MLI = null, MLS = null;
function mlFind(raw, table){
  const k = mlNorm(raw); if (!k) return '';
  for (const [key, stems] of table) for (const s of stems){
    if (s.ex ? k === s.st : s.latin ? (s.st.length >= 3 && k.startsWith(s.st)) : k.includes(s.st)) return key;
  }
  return '';
}
const mlIcon = raw => { if (!MLI) MLI = mlPrep(ML_ICON); return mlFind(raw, MLI); };
const mlSem = raw => { if (!MLS) MLS = mlPrep(ML_SEM); return mlFind(raw, MLS); };

// ===== src/14-arka3d.js =====
/* ---------- 3D arka plan ve sinema efektleri (three.js + postprocessing; WebGL tuvali #bg3) ---------- */
// Sözler 2D tuvalde kalır. 3D açıkken 2D tuval zemini boyamaz (şeffaf), 2D arka plan efektleri ve nokta dokusu çizilmez.
// Saat ekranı opak olduğu için orada 3D hiç çizilmez. Sahneler tamamen shader'da (kare başına birkaç çizim çağrısı):
// parcacik (kollarıyla dönen galaksi), zemin (müzikle kabaran tel kafes arazi).
// Renkler zemine karıştırılır ki yazı okunur kalsın; bas, enerji ve vuruşa tepki verir. Kamera, sözlerin kamerasının
// yönelimini kısılmış ve yumuşatılmış olarak izler: yazı dönerken arka plan da onunla döner.
const B3 = {tried: false, ok: false, want: false, shown: false, kind: '', key: null, prevKind: '', off: 0, bgCol: '#000000'};
const BG3_KINDS = ['parcacik', 'zemin'];
const B3_NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ return vnoise(p) * .6 + vnoise(p * 2.1 + 3.7) * .3 + vnoise(p * 4.3 + 9.1) * .1; }`;

function bg3Init(){
  if (B3.tried) return B3.ok; B3.tried = true;
  const T3 = window.THREE, el = $('bg3'); if (!T3 || !el) return false;
  try { B3.r = new T3.WebGLRenderer({canvas: el, antialias: true, powerPreference: 'high-performance'}); }
  catch(e){ diag('b3', {m: String(e && e.message).slice(0, 160)}); return false; }
  B3.r.setPixelRatio(1);
  // renk dönüşümü kapalı: 2D tuvalin renkleri doku olarak aynen geçer (sahne shader'ları da ham değer yazar)
  B3.r.outputColorSpace = T3.LinearSRGBColorSpace;
  B3.clr = new T3.Color(0, 0, 0); B3.clrT = new T3.Color();
  B3.scene = new T3.Scene();
  B3.cam = new T3.PerspectiveCamera(62, 16 / 9, .1, 500);
  // bütün malzemeler aynı uniform nesnelerini paylaşır: karede bir kez güncellenir
  B3.u = {uT: {value: 0}, uOff: {value: 0}, uBass: {value: 0}, uBeat: {value: 0}, uE: {value: .5}, uPx: {value: 1},
    uBg: {value: new T3.Color()}, uFg: {value: new T3.Color()}, uAc: {value: new T3.Color()}};
  B3.tBg = new T3.Color(); B3.tFg = new T3.Color(); B3.tAc = new T3.Color();
  B3.q = new T3.Quaternion(); B3.qt = new T3.Quaternion(); B3.q0 = new T3.Quaternion(); B3.m = new T3.Matrix4();
  B3.qp = new T3.Quaternion(); B3.ax = new T3.Vector3(1, 0, 0);
  B3.v = [new T3.Vector3(), new T3.Vector3(), new T3.Vector3()];
  B3.objs = {parcacik: b3Galaxy(T3), zemin: b3Terrain(T3)};
  for (const k in B3.objs) B3.scene.add(B3.objs[k]);
  // shader'lar açılışta derlenir (sahne ilk göründüğü karede derlenince takılma oluyordu)
  try { B3.r.compile(B3.scene, B3.cam); } catch(_){}
  for (const k in B3.objs) B3.objs[k].visible = false;
  B3.fxOk = fxInit(T3);
  if (B3.fxOk) try { B3.comp.render(0); } catch(_){}
  return B3.ok = true;
}

// galaksi: üç kollu sarmal disk + kameranın çevresinde seyrek yıldızlar; iç kısım dış kısımdan hızlı döner
function b3Galaxy(T3){
  const n = 14000, pos = new Float32Array(n * 3), aR = new Float32Array(n * 2);
  for (let i = 0; i < n; i++){
    let x, y, z;
    if (i < n * .8){
      const r = 2 + Math.pow(Math.random(), .55) * 70, a = (i % 3) * 2.094 + r * .11 + (Math.random() - .5) * (.5 + 16 / (r + 6));
      x = Math.cos(a) * r; z = Math.sin(a) * r; y = (Math.random() - .5) * (1.5 + 9 * Math.exp(-r / 10));
    } else { // çevre yıldızları: kamera hangi yöne dönerse dönsün boş kalmasın
      const u = Math.random() * 2 - 1, t = Math.random() * 6.2832, r = 60 + Math.random() * 90, s = Math.sqrt(1 - u * u);
      x = Math.cos(t) * s * r; y = u * r; z = Math.sin(t) * s * r;
    }
    pos.set([x, y, z], i * 3); aR[i * 2] = Math.random(); aR[i * 2 + 1] = Math.random();
  }
  const geo = new T3.BufferGeometry();
  geo.setAttribute('position', new T3.BufferAttribute(pos, 3)); geo.setAttribute('aR', new T3.BufferAttribute(aR, 2));
  const mat = new T3.ShaderMaterial({uniforms: B3.u, transparent: true, depthWrite: false, blending: T3.AdditiveBlending,
    vertexShader: `uniform float uT, uOff, uBass, uBeat, uPx; attribute vec2 aR; varying float vK, vA;
      void main(){
        vec3 p = position; float r = length(p.xz);
        float ang = uOff * (.02 + .5 / (r + 3.)); float c = cos(ang), s = sin(ang);
        p.xz = mat2(c, -s, s, c) * p.xz; p *= 1. + uBeat * .035;
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
        float tw = .55 + .45 * sin(uT * (1.5 + aR.y * 2.) + aR.y * 40.);
        gl_PointSize = (1.4 + aR.x * aR.x * 4.) * (1. + uBass * .9) * uPx / max(1., -mv.z) * 130.;
        vK = aR.x; vA = tw; }`,
    fragmentShader: `uniform vec3 uFg, uAc, uBg; uniform float uBeat; varying float vK, vA;
      void main(){
        float d = length(gl_PointCoord - .5); if (d > .5) discard;
        vec3 c = vK > .8 ? uAc : uFg;
        gl_FragColor = vec4(c * smoothstep(.5, 0., d) * vA * (.75 + uBeat * .35), 1.); }`});
  const pts = new T3.Points(geo, mat); pts.frustumCulled = false;
  const grp = new T3.Group(); grp.add(pts); grp.position.set(0, -2, -48); grp.rotation.x = .55; grp.rotation.z = -.25;
  return grp;
}

// tel kafes arazi: ortası kameranın geçtiği vadi, yanlar basla kabaran tepeler; ızgara çizgileri ekran türeviyle keskin
function b3Terrain(T3){
  const geo = new T3.PlaneGeometry(220, 220, 200, 200); geo.rotateX(-Math.PI / 2);
  const mat = new T3.ShaderMaterial({uniforms: B3.u,
    vertexShader: B3_NOISE + `uniform float uOff, uBass, uE; varying vec2 vG; varying float vD, vH;
      void main(){
        vec3 p = position; vec2 w = vec2(p.x, p.z - uOff);
        float side = smoothstep(3., 26., abs(p.x));
        float h = fbm(w * .055) * (6. + uBass * 9. + uE * 4.) * side + fbm(w * .2) * .35;
        p.y += h; vG = w; vH = h;
        vec4 mv = modelViewMatrix * vec4(p, 1.); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uBg, uFg, uAc; uniform float uBeat, uBass; varying vec2 vG; varying float vD, vH;
      void main(){
        vec2 g = vG / 2.5, a = abs(fract(g - .5) - .5) / fwidth(g);
        float line = 1. - min(min(a.x, a.y), 1.);
        float fog = smoothstep(105., 12., vD);
        vec3 lc = mix(uFg, uAc, clamp(vH / 11., 0., 1.));
        vec3 c = mix(uBg, lc, line * fog * (.5 + uBeat * .3));
        gl_FragColor = vec4(mix(c, uFg, .025 * fog), 1.); }`});
  const m = new T3.Mesh(geo, mat); m.position.y = -4.5; m.frustumCulled = false;
  return m;
}

// render() karede bir kez sorar: 3D arka plan bu karede çizilecek mi (saat ekranında değil, ayar açık, WebGL var)
// arka plan 'Otomatik' ise her şarkıda yarı yarıya 3D sahne ya da 2D efekt
function bg3Want(){
  if (S.bg3 === 'kapali' || (mode === 'idle' && S.clock) || !bg3Init()) return false;
  if (S.bg3 !== 'oto') return true;
  if (B3.autoKey !== M.key){ B3.autoKey = M.key; B3.auto = Math.random() < .5; }
  return B3.auto;
}
function bg3Kind(){
  if (S.bg3 && S.bg3 !== 'oto' && B3.objs[S.bg3]) return S.bg3;
  if (B3.key !== M.key){ B3.key = M.key; const c = BG3_KINDS.filter(k => k !== B3.prevKind); B3.prevKind = c[Math.floor(Math.random() * c.length)]; }
  return B3.prevKind;
}
// 3D sahnenin bu kareki durumu: renkler, müzik değerleri, kamera (çizim glFrame'de)
function bg3Update(T, dt){
  const k = bg3Kind();
  if (k !== B3.kind){ for (const n in B3.objs) B3.objs[n].visible = n === k; B3.kind = k; }
  // renkler: zemin aynen (2D tuvalin altında görünen zemin bu), çizgiler zemine doğru kısık
  const P = pre(), kc = 1 - Math.exp(-dt * 3);
  B3.tBg.set(B3.bgCol); B3.tFg.set(mixHex(P.bg, P.fg, .55)); B3.tAc.set(mixHex(P.bg, P.ac, .8));
  const U = B3.u, e = energy(), bass = clamp(L.low, 0, 1.5) / 1.5;
  U.uBg.value.lerp(B3.tBg, kc); U.uFg.value.lerp(B3.tFg, kc); U.uAc.value.lerp(B3.tAc, kc);
  B3.off += dt * (k === 'parcacik' ? 1.2 + 2.5 * e : 5 + 16 * e) * (M.playing === false ? .25 : 1);
  U.uT.value = T; U.uOff.value = B3.off; U.uE.value += (e - U.uE.value) * kc;
  U.uBass.value += (bass - U.uBass.value) * Math.min(1, dt * (bass > U.uBass.value ? 14 : 4));
  U.uBeat.value = L.beat; U.uPx.value = cv.height / 1080;
  // kamera: sözlerin kamerasının yönelimi (dünya y aşağı → three y yukarı: x, −y, −z), %55'i alınır, yumuşak izlenir
  const f = CAM.f || [0, 0, 1], rt = CAM.r || [1, 0, 0], up = CAM.up || [0, -1, 0], v = B3.v;
  if (finite3(f) && finite3(rt) && finite3(up)){
    v[0].set(rt[0], -rt[1], -rt[2]); v[1].set(up[0], -up[1], -up[2]); v[2].set(-f[0], f[1], f[2]);
    B3.qt.setFromRotationMatrix(B3.m.makeBasis(v[0], v[1], v[2])); B3.qt.slerpQuaternions(B3.q0, B3.qt, .55);
  }
  B3.qp.setFromAxisAngle(B3.ax, k === 'zemin' ? -.1 : k === 'parcacik' ? -.05 : 0); B3.qt.multiply(B3.qp);
  if (snapCam) B3.q.copy(B3.qt); else B3.q.slerp(B3.qt, 1 - Math.exp(-dt * 3.5));
  B3.cam.quaternion.copy(B3.q);
  B3.cam.position.set(Math.sin(T * .13) * .8, Math.sin(T * .17) * .4 + (k === 'zemin' ? 1.2 : 0), 0);
}

/* ---------- sinema efektleri (ayar sinema + sinemasiddet) ----------
   Sözler ekranındayken 2D tuval gizlenir; her kare doku olarak WebGL'e alınır, 3D sahnenin üstüne konur ve efekt
   zincirinden geçer: şok dalgası (büyük düşüşte ve nakarat girişinde), film greni + kenar kararması, vuruşta renk kanalı kayması, kamera hızlı dönerken hareket bulanıklığı.
   Saat ekranında kapalı (boşta GPU harcamasın). 3D kategorisindeki sayfa öğesi stillerin harfleri efekt dışında kalır. */
function fxInit(T3){
  const PP = window.PP; if (!PP) return false;
  try {
    B3.ov = new T3.Scene(); B3.ocam = new T3.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    B3.tex = new T3.CanvasTexture(cv); B3.tex.minFilter = B3.tex.magFilter = T3.LinearFilter; B3.tex.generateMipmaps = false;
    B3.ov.add(new T3.Mesh(new T3.PlaneGeometry(2, 2), new T3.MeshBasicMaterial({map: B3.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false})));
    const C = B3.comp = new PP.EffectComposer(B3.r);
    B3.p3 = new PP.RenderPass(B3.scene, B3.cam); B3.pov = new PP.RenderPass(B3.ov, B3.ocam);
    B3.wave = new PP.ShockWaveEffect(B3.cam, new T3.Vector3(), {speed: 1.4, maxRadius: .9, waveSize: .22, amplitude: .05});
    B3.noise = new PP.NoiseEffect({blendFunction: PP.BlendFunction.OVERLAY});
    B3.vig = new PP.VignetteEffect({offset: .3, darkness: .4});
    B3.chroma = new PP.ChromaticAberrationEffect({offset: new T3.Vector2(), radialModulation: true, modulationOffset: .2});
    // hareket bulanıklığı: kamera açısal hızı yönünde 9 örnek (dir = 0 iken örnekleme yok)
    B3.blur = new PP.Effect('kkBlur', `uniform vec2 dir;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
        if (dot(dir, dir) < 1e-8){ outputColor = inputColor; return; }
        vec4 c = vec4(0.);
        for (int i = 0; i < 9; i++) c += texture2D(inputBuffer, uv + dir * (float(i) / 8. - .5));
        outputColor = c / 9.; }`, {attributes: PP.EffectAttribute.CONVOLUTION, uniforms: new Map([['dir', new T3.Uniform(new T3.Vector2())]])});
    for (const p of [B3.p3, B3.pov, new PP.EffectPass(B3.cam, B3.wave, B3.noise, B3.vig), new PP.EffectPass(B3.cam, B3.chroma), new PP.EffectPass(B3.cam, B3.blur)]) C.addPass(p);
  } catch(e){ diag('fx', {m: String(e && e.message).slice(0, 160)}); return false; }
  return true;
}
function fxWave(){
  if (!S.cine) return;
  const v = B3.v[0]; B3.cam.getWorldDirection(v).multiplyScalar(8).add(B3.cam.position);
  B3.wave.position.copy(v); B3.wave.amplitude = .05 * S.cineAmt; B3.wave.explode();
}
function fxUpdate(T, dt){
  const a = S.cine ? S.cineAmt : 0, cb = blocks[curLine], kick = clamp((L.low - L.lowSlow) * 2.4, 0, 1);
  const co = (L.beat * .006 + kick * .0025) * a; B3.chroma.offset.set(co, co * .5);
  B3.noise.blendMode.opacity.value = .12 * a; B3.vig.darkness = .5 * a;
  // şok dalgası: büyük düşüş ya da nakarata giriş
  const dr = L.drops.length ? L.drops[L.drops.length - 1] : null;
  if (dr !== B3.drSeen){ B3.drSeen = dr; if (dr != null && Math.abs(T - dr) < .5) fxWave(); }
  if (cb && cb.chorus && B3.chB !== cb && T >= cb.t0 && T - cb.t0 < .3){ B3.chB = cb; const pb = blocks[cb.li - 1]; if (!pb || !pb.chorus) fxWave(); }
  // hareket bulanıklığı: sözlerin kamerasının bakış yönündeki değişim (ekran eksenlerine izdüşüm), kısa enstantane
  const f = CAM.f, dir = B3.blur.uniforms.get('dir').value;
  if (finite3(f) && B3.pf && dt > 0 && !snapCam){
    const d = vsub(f, B3.pf), s = Math.min(1, 1 / 50 / dt) * 1.4 * a;
    dir.set(vdot(d, CAM.r) * s * cv.height / cv.width, vdot(d, CAM.up) * s);
    const l = dir.length(); if (l < .002) dir.set(0, 0); else if (l > .04) dir.multiplyScalar(.04 / l);
  } else dir.set(0, 0);
  B3.pf = finite3(f) ? f.slice() : null;
}

// kare sonu: sözler ekranında 2D kare WebGL'den geçer (3D arka plan, 3D yazı, sinema efektleri; efektler kapalıysa şiddet 0);
// saat ekranında yalnız 3D arka plan (varsa) 2D tuvalin altında çizilir
function glFrame(T, dt){
  const el = $('bg3'), fx = !!(mode === 'lyrics' && bg3Init() && B3.fxOk);
  const on = B3.want || fx;
  if (on !== B3.shown){ B3.shown = on; el.hidden = !on; }
  if (fx !== B3.fxOn){ B3.fxOn = fx; cv.style.visibility = fx ? 'hidden' : ''; if (fx) B3.pf = null; }
  if (!on) return;
  const r = B3.r, VW = cv.width, VH = cv.height;
  if (el.width !== VW || el.height !== VH){ if (B3.comp) B3.comp.setSize(VW, VH, false); else r.setSize(VW, VH, false); B3.cam.aspect = VW / VH; B3.cam.updateProjectionMatrix(); }
  if (B3.want){
    bg3Update(T, dt);
    // temizleme rengi ham sRGB değeriyle (çıktı dönüşümü kapalı: 2D yazının renkleri olduğu gibi kalsın)
    B3.clrT.setHex(parseInt(B3.bgCol.slice(1), 16), window.THREE.LinearSRGBColorSpace); B3.clr.lerp(B3.clrT, 1 - Math.exp(-dt * 3));
  }
  r.setClearColor(B3.clr, 1);
  if (!fx){ r.render(B3.scene, B3.cam); return; }
  fxUpdate(T, dt);
  // tuval boyutu değişince (pencere ya da otomatik çözünürlük düşürme) doku yeniden ayrılmalı: three dokunun belleğini
  // ilk boyutla ayırıyor, küçülen kare yalnız bir köşesine yazılıyor ve üst/sağ şeritte eski kare donuk kalıyordu
  if (B3.texW !== cv.width || B3.texH !== cv.height){ if (B3.texW) B3.tex.dispose(); B3.texW = cv.width; B3.texH = cv.height; }
  B3.tex.needsUpdate = true;
  B3.p3.enabled = B3.want; B3.pov.clearPass.enabled = !B3.want;
  B3.comp.render(dt);
}

// ===== src/14-sahne.js =====
/* ---------- sahne ---------- */
let RDT = .016; // son kare süresi (halka gibi kare-zamanlı yumuşatmalar için)
function render(T, dt){
  XFL = XF; XF = 0;
  const VW = cv.width, VH = cv.height;
  RDT = dt;
  energyTick(dt);
  const ai = activeIndex(T), aw = ai >= 0 ? words[ai] : null;
  if (L.beatN !== BC.n){ BC.n = L.beatN; if (S.beatcut && mode === 'lyrics') beatCut(T, ai); }
  // sıradaki kelimenin satırı LEAD sn önceden sahnede hazır olur (kelime görünmez, yalnız yer ve kamera hazırlanır)
  const pi = ai + 1 < words.length && T >= words[ai + 1].t - LEAD ? ai + 1 : -1;
  const fw = pi >= 0 ? words[pi] : aw || words[0], li = fw ? fw.li : 0;
  // sıradaki satır 1 sn kala kurulur (o anki enerjiyle)
  if (aw){ ensureBlock(li); const nx = words.find(w => w.li > li); if (nx && nx.t - T < 1) ensureBlock(nx.li); }
  else if (words.length) ensureBlock(li);
  curLine = li;
  const P = CLK_HOLD && mode === 'idle' ? CLK_HOLD : pal(li), kick = clamp((L.low - L.lowSlow) * 2.4, 0, 1), e = energy();
  if (P.bg !== lastBg){ lastBg = P.bg; applyLook(); }
  const cb = blocks[li];
  // satır değişimi: geçiş seçimi (tuval hâlâ önceki kareyi tutuyor, kamera da önceki karede)
  if (li !== RLI){ const was = RLI; RLI = li; if (mode === 'lyrics' && li === was + 1 && blocks[was] && cb && T - cb.t0 < 1) lineChange(blocks[was], cb, T); }
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  B3.want = false;
  if (mode === 'idle' && S.clock){ drawIdleClock(T, dt, P, VW, VH); return; }
  B3.want = bg3Want(); // 3D arka plan: 2D tuval zemin boyamaz, şeffaf kalır
  // zemin: Pop'ta yeni satır rengi ortadan daire; dev stilinde vuruşta zemin/yazı rengi yer değiştirir
  let bgCol = P.bg, fgSwap = false;
  if (cb && cb.style === 'dev' && aw && aw.li === li && e > .45 && aw.wi % 2 === 1){ bgCol = P.ac; fgSwap = true; }
  const tr = cb ? clamp((T - cb.t0) / .45, 0, 1) : 1;
  if (B3.want){ g.clearRect(0, 0, VW, VH); B3.bgCol = bgCol; }
  else if (TH.perLine && tr < 1 && li > 0){
    g.fillStyle = pal(li - 1).bg; g.fillRect(0, 0, VW, VH);
    g.fillStyle = bgCol; g.beginPath(); g.arc(VW / 2, VH / 2, Math.hypot(VW, VH) / 2 * easeOut(tr), 0, Math.PI * 2); g.fill();
  } else { g.fillStyle = bgCol; g.fillRect(0, 0, VW, VH); }
  let flash = 0; for (const d of L.drops){ const x = T - d; if (x >= 0 && x < .25) flash = Math.max(flash, 1 - x / .25); }
  // nakarat girişi: kısa vurgu rengi parlaması
  if (!S.wipe && cb && cb.chorus && mode === 'lyrics' && !(blocks[li - 1] && blocks[li - 1].chorus)){ const x = T - cb.t0; if (x >= 0 && x < .3) flash = Math.max(flash, (1 - x / .3) * .7); }
  if (flash){ g.globalAlpha = flash * .45; g.fillStyle = P.ac; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1; }
  L.beat *= Math.exp(-dt * 7);
  // nefes: vokal bölgesi (orta) + bas; hızlı yükselir, yavaş iner
  { const tg = clamp(L.mid * .55 + L.low * .45, 0, 1); BRE += (tg - BRE) * Math.min(1, dt * (tg > BRE ? 14 : 5)); }
  fqTick(dt);
  // ara bölüm ekranı (şarkı adı + ses çubukları) kullanıcı isteğiyle kaldırıldı: sözsüz kısımda son satır kalır
  if (!words.length || !cb){ drawTranslation(T, ai, P, VW, VH); return; }
  // şarkı sonu posteri: son sözden 3 sn sonra (en az 3 satır kurulduysa)
  const lastT = words[words.length - 1].t;
  POSTER = S.poster && mode === 'lyrics' && ai === words.length - 1 && blocks.filter(Boolean).length >= 3 ? clamp((T - lastT - 3) / 1.5, 0, 1) : 0;
  SPLS = POSTER > 0 ? 0 : splitAmt(T); VOX = SPLS * VW / 4;
  const trOn = S.translate && TR && TR.key === M.key && mode === 'lyrics'; VOY = trOn ? -VH * .06 : 0;
  camStep(T, dt, VW, VH);
  // vuruş: yakınlaşma darbesi (nakaratta daha güçlü); sert stillerde kamera sarsıntısı
  const hard = cb.style === 'dev' || cb.style === 'dusen' || cb.style === 'patlama' || cb.style === 'rap';
  CAM.zoom = 1 + (kick * (.02 + .04 * e) + L.beat * (cb.chorus ? .05 : .022)) * (.4 + S.shake);
  const amp = (hard ? 1 : .25) * S.shake * kick * e * VW * .006 + IMP * VW * .012 * (.3 + S.shake);
  IMP *= Math.exp(-dt * 6);
  SX = noise1(T * 11) * amp; SY = noise1(T * 13 + 5) * amp;
  const Pd = fgSwap ? {bg: P.ac, fg: P.bg, ac: P.bg} : P;
  if (!B3.want){ drawBackground(T, dt, Pd, VW, VH, li, cb, e); drawDots(fgSwap ? {fg: P.bg} : P, kick); }
  // destek efektleri: yeni kelimede parçacık patlaması, vuruşta kıvılcım (yılan çizgiler denendi, kullanıcı beğenmedi)
  if (aw && aw.idx !== FX.last){ FX.last = aw.idx; const b = blocks[aw.li]; if (b && !STYLES[b.style].whole && b.style !== 'sarmal' && T - aw.t < .4) fxWord(b, aw, e); }
  if (aw && L.beatN !== FX.beatN){ FX.beatN = L.beatN; const b = blocks[aw.li]; if (b && !STYLES[b.style].whole && b.style !== 'sarmal' && S.particles) burst(b, aw, 4 + Math.round(8 * e), .5); }
  fxStep(dt);
  for (const b of POSTER > 0 ? blocks.filter(Boolean) : [blocks[li - 1], cb]){
    if (!b || b.t0 > T + LEAD + .01) continue;
    const back = li - b.li;
    // bölünmüş ekranın sol panelindeki satır ana sahnede çizilmez
    if (back !== 0 && POSTER === 0 && SPL && b.li === SPL.a) continue;
    // posterde eski satırlar son hâlleriyle (bütün kelimeler yerinde) belirir
    if (POSTER > 0 && back > 1){ if (!STYLES[b.style].whole && !STYLES[b.style].dom) drawPosterBlock(b, T, TH.perLine ? pal(b.li) : Pd, e); continue; }
    // önceki satır son kelimesi bitene dek tam görünür; yeni satır başlayınca 1 sn içinde söner (kamera yoldayken ikisi de görünür)
    // dikey ekranda önceki satır tamamen sönmez, soluk kalarak üst boşluğu doldurur
    const ba = Math.max(POSTER, back === 0 ? 1 : Math.max(VH > VW * 1.1 ? .22 : 0, 1 - clamp((T - cb.t0) / 1, 0, 1)));
    if (ba < .01) continue;
    const Pb = back === 0 ? Pd : (TH.perLine ? pal(b.li) : P);
    // dönüş stili: blok 3D kart gibi dikey eksende dönerek gelir
    if (STYLES[b.style].dom) continue; // 3D yazı katmanında çizilir (g3Frame)
    if (STYLES[b.style].whole){ if (b.style === 'halka') drawRing(b, T, Pb, ai, ba, e, kick); else drawBands(b, T, Pb, ai, ba, e); continue; }
    // çıkış efekti: yeni satırın ilk kelimesi gelince eski satır gösteriyle gider (dikey ekranda soluk kalma sürer)
    // kamera kalkmadan görünsün diye sıradaki satırdan EXL sn önce başlar (uzatılan son hecenin sonuna denk gelir)
    const nb = blocks[b.li + 1], es = nb ? nb.t0 - EXL : 1e9;
    if (POSTER === 0 && b.exit && T >= es && VH <= VW * 1.1 && !(b.style === 'rap')){ const q = (T - es) / EXD; if (q < 1) drawExit(b, T, q, Pb); continue; }
    let swing = null;
    if (b.style === 'perspektif'){
      // geriye yatma: dik başlar, okunur ama belirgin bir eğimde kalır
      const q = clamp((T - b.t0 + LEAD) / .9, 0, 1), ang = -(1.25 - .4 * easeOut(q));
      swing = {U: b.U, V: vrot(b.V, b.U, ang), N: vrot(b.N, b.U, ang)};
    }
    if (b.style === 'donus' && back === 0){
      const q = clamp((T - b.t0 + LEAD) / .75, 0, 1), ang = (1 - easeOut(q)) * 1.25 * (b.li % 2 ? 1 : -1);
      if (ang) swing = {U: vrot(b.U, b.V, ang), V: b.V, N: vrot(b.N, b.V, ang)};
    }
    for (const w of b.words){
      const st = w.idx === ai ? 2 : w.t <= T + EARLY ? 1 : 0;
      if (STYLES[b.style].single){
        // tek dev kelime; öncekisi kameraya doğru büyüyüp geçer.
        // önceki satırın söylenmekte olan kelimesi, yeni satırın ilk kelimesi gelene dek kalır (kamera erken kalkınca boş kare olmasın)
        if (back !== 0 && st !== 2) continue;
        if (st === 1){
          if (b.style === 'rap') continue; // sert kesme: önceki kelime anında gider
          const nx = words[w.idx + 1], x = nx ? T - nx.t : 9;
          if (x > .28 || x < 0) continue;
          const q = x / .28, A2 = vadd(bpt(b, w.lx, w.base), vmul(b.N, -q * 900));
          if (!setXform(A2, b.U, b.V, w.s, w.w100 / 2, (w.desc - w.asc) / 2)) continue;
          g.font = w.font; g.globalAlpha = (1 - q) * .8; g.fillStyle = Pb.fg; g.fillText(w.text, 0, 0);
          continue;
        }
        if (st === 0) continue;
      } else if (st === 0 && b.style !== 'dolan') continue;
      if (st === 0 && back !== 0) continue;
      w.chorus = b.chorus;
      mousePush(b, w); drawWord(b, w, T, Pb, st, ba, e, kick, swing); PX = PY = 0;
    }
    // kilit imzası: satır başlarken yavaşça belirir
    if (b.cap && setXform(bpt(b, b.cap.x, b.cap.base), b.U, b.V, b.cap.s, 0, 0)){
      g.font = fontStr(false); g.globalAlpha = ba * .85 * clamp((T - b.t0 - .3) / .8, 0, 1); g.fillStyle = Pb.fg; g.fillText(b.cap.text, 0, 0);
    }
  }
  drawIcons(T, li, Pd, cb);
  drawParticles(Pd);
  if (SPL && SPLS > 0) drawSplit(T, P, e);
  if (WP) drawWipe(T, P);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  drawTranslation(T, ai, P, VW, VH);
}

/* ---------- arka plan efektleri (ekran uzayında, opak; kelimelerin çevresi boş bırakılır) ---------- */
// türler: cizgi (incelip kalınlaşan düz çizgiler), halka (vuruşta büyüyen halkalar), sekil (süzülen geometrik şekiller),
// izgara (kayan ızgara), serit (kayan çapraz şeritler). Otomatikte her şarkıda biri rastgele seçilir.
// Saydamlık yok: soluk görünmesi gerekenler zemin ile yazı renginin karışımı olan düz renkle çizilir; kaybolurken
// incelir/küçülür/geri çekilir.
const BG_KINDS = ['cizgi', 'halka', 'sekil', 'izgara', 'serit'];
const BR = {list: [], timer: .5, lastLi: -1, kind: '', key: null, beatN: 0, t: 0};
function mixHex(a, b, t){
  const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return b;
  const x = p(a), y = p(b), c = i => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0');
  return '#' + c(0) + c(1) + c(2);
}
function inQuad(q, x, y){
  // dışbükey dörtgen içinde mi (kenar çarpımlarının işareti aynı)
  let s = 0;
  for (let i = 0; i < 4; i++){ const a = q[i], b = q[(i + 1) % 4], c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]); if (c){ const sg = c > 0 ? 1 : -1; if (s && sg !== s) return false; s = sg; } }
  return true;
}
function wordHoles(b, pad){
  // kelime kutularının ekran dörtgenleri (pad: kelime yüksekliğine oranla boşluk)
  const out = [], whole = STYLES[b.style].whole || b.style === 'tekrar'; // tekrar: üst/alt kopyalarla tüm blok
  const quad = (x0, y0, x1, y1) => { const q = [bpt(b, x0, y0), bpt(b, x1, y0), bpt(b, x1, y1), bpt(b, x0, y1)].map(proj); if (q.every(Boolean)) out.push(q); };
  if (whole){ const m = b.h * .25; quad(-W * .35, -m - b.h * .5, W * 1.35, b.h * 1.5 + m); return out; }
  for (const w of b.words){ const p = w.h * pad; quad(w.lx - p, w.y - p, w.lx + w.w + p, w.y + w.h + p); }
  return out;
}
function bgKind(){
  if (S.bg !== 'oto') return S.bg;
  // otomatik: şarkı değişince rastgele yeni tür (bir önceki şarkınınkinden farklı)
  if (BR.key !== M.key){ BR.key = M.key; const c = BG_KINDS.filter(k => k !== BR.kind); BR.kind = c[Math.floor(Math.random() * c.length)]; BR.list.length = 0; BR.timer = .3; }
  return BR.kind;
}

/* çizgi: kenar şeritlerinde kıvrımlı, kalınlığı incelip kalınlaşan düz çizgi; baştan çizilir, sonda geri çekilir */
function linePath(VW, VH, e){
  const r = Math.random, side = r() < (VH > VW ? .45 : .28);
  let ang, len, cx, cy;
  if (!side){ ang = (r() - .5) * .5 + (r() < .5 ? 0 : Math.PI); len = VW * (.7 + r() * .6); cx = VW * (.2 + r() * .6); cy = r() < .5 ? VH * (.08 + r() * .12) : VH * (.8 + r() * .12); }
  else { ang = Math.PI / 2 + (r() - .5) * .5; len = VH * (.6 + r() * .4); cy = VH * (.3 + r() * .4); cx = r() < .5 ? VW * (.04 + r() * .08) : VW * (.88 + r() * .08); }
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, m = Math.min(VW, VH);
  const bend = (r() - .5) * m * .14, wav = m * (.015 + r() * .03), wf = 1.5 + r() * 2.5, ph = r() * 6, pts = [];
  for (let i = 0; i <= 80; i++){
    const t = i / 80, u = (t - .5) * len, o = Math.sin(t * Math.PI) * bend + Math.sin(t * Math.PI * wf + ph) * wav;
    pts.push([cx + dx * u + nx * o, cy + dy * u + ny * o]);
  }
  return {pts, base: m * (.008 + r() * .014) * (.8 + .5 * e), k: 1.5 + r() * 2.5, ph: r() * 6, age: 0, life: 6 + r() * 4, draw: 1 + r() * .6, ac: r() < .6};
}
function lineWidthAt(s, t){
  // incelip kalınlaşan (yumuşak) gövde, uçlarda kısa sivrilme
  const end = Math.min(1, t / .06, (1 - t) / .06);
  return s.base * (.35 + .65 * (.5 + .5 * Math.sin(t * Math.PI * s.k + s.ph))) * Math.max(0, end);
}
function drawLineItem(s, P){
  const n = s.pts.length - 1, head = easeOut(clamp(s.age / s.draw, 0, 1)) * n;
  const tail = easeOut(clamp((s.age - (s.life - s.draw)) / s.draw, 0, 1)) * n; // sonda geri çekilir
  if (head - tail < 1) return;
  const L2 = [], R2 = [];
  for (let i = Math.floor(tail); i <= Math.ceil(head); i++){
    const a = s.pts[Math.max(0, i - 1)], c = s.pts[Math.min(n, i + 1)], p = s.pts[Math.min(n, i)];
    let tx = c[0] - a[0], ty = c[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    // uçlar (çizilen baş ve çekilen kuyruk) yuvarlak incelir
    const edge = Math.min(1, (head - i) / 3, (i - tail) / 3), wv = lineWidthAt(s, i / n) * Math.max(.15, edge) / 2;
    L2.push([p[0] - ty * wv, p[1] + tx * wv]); R2.push([p[0] + ty * wv, p[1] - tx * wv]);
  }
  g.fillStyle = s.ac ? P.ac : mixHex(P.bg, P.fg, .45);
  g.beginPath(); g.moveTo(L2[0][0], L2[0][1]);
  for (const p of L2) g.lineTo(p[0], p[1]);
  for (let i = R2.length - 1; i >= 0; i--) g.lineTo(R2[i][0], R2[i][1]);
  g.closePath(); g.fill();
}

/* şekil: kenarlarda süzülen daire, kare, üçgen, artı; pop ile girer, küçülerek çıkar, vuruşta nabız */
function shapeItem(VW, VH, e){
  const r = Math.random, m = Math.min(VW, VH), band = r();
  const x = band < .5 ? VW * (.05 + r() * .9) : (r() < .5 ? VW * (.03 + r() * .12) : VW * (.85 + r() * .12));
  const y = band < .5 ? (r() < .5 ? VH * (.06 + r() * .16) : VH * (.78 + r() * .16)) : VH * (.2 + r() * .6);
  return {x, y, size: m * (.02 + r() * .045) * (.8 + .4 * e), type: Math.floor(r() * 4), rot: r() * 6, vr: (r() - .5) * 1.2,
    vx: (r() - .5) * m * .02, vy: (r() - .5) * m * .02, fill: r() < .55, ac: r() < .6, age: 0, life: 6 + r() * 5};
}
function drawShapeItem(s, P, VW){
  const pin = easeBack(clamp(s.age / .5, 0, 1)), pout = 1 - easeOut(clamp((s.age - s.life + .6) / .6, 0, 1));
  const sz = s.size * pin * pout * (1 + L.beat * .15); if (sz < .5) return;
  const col = s.ac ? P.ac : mixHex(P.bg, P.fg, .4);
  g.save(); g.translate(s.x + s.vx * s.age, s.y + s.vy * s.age); g.rotate(s.rot + s.vr * s.age);
  g.beginPath();
  if (s.type === 0) g.arc(0, 0, sz, 0, 6.2832);
  else if (s.type === 1) g.rect(-sz * .85, -sz * .85, sz * 1.7, sz * 1.7);
  else if (s.type === 2){ for (let k = 0; k < 3; k++){ const a = k * 2.0944 - 1.5708; k ? g.lineTo(Math.cos(a) * sz, Math.sin(a) * sz) : g.moveTo(Math.cos(a) * sz, Math.sin(a) * sz); } g.closePath(); }
  else { const t = sz * .32; g.rect(-sz, -t, sz * 2, t * 2); g.rect(-t, -sz, t * 2, sz * 2); }
  if (s.fill || s.type === 3){ g.fillStyle = col; g.fill('nonzero'); }
  else { g.strokeStyle = col; g.lineWidth = Math.max(2, sz * .18); g.stroke(); }
  g.restore();
}

// ===== src/15-saat.js =====
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

// ===== src/16-parcacik-ceviri.js =====
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

// ===== src/17-ayarlar.js =====
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
    // animasyon türü: kategori (benzer stiller bir arada); eski kayıtlı tek stil adı gelirse kategorisi seçilir
    if (p.stil){ const v = p.stil.value || 'oto'; S.cat = CATS[v] ? v : Object.keys(CATS).find(k => CATS[k].includes(v)) || ''; lay = true; }
    // arka plan: 3D sahneler ve 2D efektler tek listede; Otomatik her şarkıda birini seçer
    if (p.arkaplan){ const v = p.arkaplan.value || 'oto'; S.bg3 = v === 'oto' ? 'oto' : v.startsWith('3d-') ? v.slice(3) : 'kapali'; S.bg = v.startsWith('3d-') ? 'yok' : v; BR.list.length = 0; BR.key = null; }
    // gruplu düğmeler: her biri birbirine yakın birkaç efekti birlikte açıp kapatır
    if (p.muzik){ S.freq = S.breath = S.beatcut = S.rap = !!p.muzik.value; lay = true; }
    if (p.anlam){ S.semantic = S.icons = S.hold = !!p.anlam.value; }
    if (p.sahnefx){ S.wipe = S.split = S.poster = !!p.sahnefx.value; lastBg = ''; if (!S.split) SPL = null; }
    if (p.parcacik) S.particles = !!p.parcacik.value;
    if (p.sinema) S.cine = !!p.sinema.value;
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

// ===== src/18-dongu.js =====
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

})();
