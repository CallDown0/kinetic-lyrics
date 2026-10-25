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
