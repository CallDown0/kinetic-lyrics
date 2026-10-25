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
