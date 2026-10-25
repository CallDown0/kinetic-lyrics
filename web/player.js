/* Kinetic Lyrics tarayıcı oynatıcısı.
   Motor (kinetik.js) Wallpaper Engine için yazıldı: şarkı bilgisini, konumu ve canlı ses spektrumunu WE'nin API'lerinden alır.
   Bu dosya o API'leri taklit eder: sesi kendisi çalar (<audio>), Web Audio ile 128 bantlık spektrum üretir, şarkı adı/konum/
   oynatma olaylarını motora WE'nin biçiminde yollar. Ayarlar WE'nin project.json'ındaki özelliklerden üretilen menüyle verilir.
   kinetik.js'ten ÖNCE yüklenmeli (motor dinleyicilerini açılışta kaydeder). */
(function(){
'use strict';
const CB = {};
// WE'nin oynatma durumu sabitleri (motor MI.PLAYBACK_* ile karşılaştırır)
window.wallpaperMediaIntegration = {PLAYBACK_STOPPED: 0, PLAYBACK_PLAYING: 1, PLAYBACK_PAUSED: 2};
for (const n of ['Audio', 'MediaStatus', 'MediaProperties', 'MediaThumbnail', 'MediaPlayback', 'MediaTimeline'])
  window['wallpaperRegister' + n + 'Listener'] = f => { CB[n] = f; };
const emit = (n, e) => { try { CB[n] && CB[n](e); } catch(err){ console.error(err); } };
window.KKP = {audio: null}; // motor kelime senkronu isteğine ekler: ses sunucuda, YouTube'da aranmaz

const audio = new Audio(); audio.preload = 'auto';
let ctx = null, an = null, buf = null, cur = null, bandEdges = null;

/* ---------- Web Audio: WE biçiminde 128 değer (0–63 sol, 64–127 sağ; düşük indeks bas) ---------- */
function ensureAudioGraph(){
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaElementSource(audio);
  an = ctx.createAnalyser(); an.fftSize = 4096; an.smoothingTimeConstant = .55;
  src.connect(an); an.connect(ctx.destination);
  buf = new Uint8Array(an.frequencyBinCount);
  // 64 logaritmik bant: 30 Hz – 16 kHz
  const hz = ctx.sampleRate / an.fftSize; bandEdges = [];
  for (let i = 0; i <= 64; i++) bandEdges.push(Math.max(1, Math.round(30 * Math.pow(16000 / 30, i / 64) / hz)));
}
const spec = new Array(128).fill(0);
setInterval(() => {
  if (!an || audio.paused) return;
  an.getByteFrequencyData(buf);
  for (let b = 0; b < 64; b++){
    const a = bandEdges[b], z = Math.max(a + 1, bandEdges[b + 1]); let s = 0;
    for (let k = a; k < z; k++) s += buf[k];
    const v = Math.pow(s / (z - a) / 255, 1.5); // WE değerleri doğrusal genlik gibi: yüksek kısım sıkıştırılır
    spec[b] = spec[b + 64] = v;
  }
  emit('Audio', spec);
}, 33);

/* ---------- motora şarkı bilgisi, konum, oynatma durumu ---------- */
const PL = window.wallpaperMediaIntegration;
function timeline(){ if (cur) emit('MediaTimeline', {position: audio.currentTime, duration: audio.duration || cur.duration || 0}); }
setInterval(() => { if (!audio.paused) timeline(); }, 250);
audio.addEventListener('play', () => { emit('MediaPlayback', {state: PL.PLAYBACK_PLAYING}); timeline(); ui(); });
audio.addEventListener('pause', () => { if (!audio.ended){ emit('MediaPlayback', {state: PL.PLAYBACK_PAUSED}); timeline(); } ui(); });
audio.addEventListener('seeked', timeline);
audio.addEventListener('loadedmetadata', () => { timeline(); ui(); });
audio.addEventListener('ended', () => { emit('MediaPlayback', {state: PL.PLAYBACK_STOPPED}); ui(); });
audio.addEventListener('timeupdate', uiTime);

async function thumbColors(url){
  // kapak: motor base64 resim ve WE'nin verdiği gibi baskın renkler bekler (tema "Otomatik" bunlarla boyar)
  try {
    const r = await fetch('/api/thumb?u=' + encodeURIComponent(url)); if (!r.ok) return null;
    const blob = await r.blob(), bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = c.height = 48;
    const x = c.getContext('2d'); x.drawImage(bmp, 0, 0, 48, 48);
    const d = x.getImageData(0, 0, 48, 48).data; let R = 0, G = 0, B = 0, n = 0, best = null, bs = -1;
    for (let i = 0; i < d.length; i += 4){
      const r1 = d[i], g1 = d[i+1], b1 = d[i+2], mx = Math.max(r1, g1, b1), mn = Math.min(r1, g1, b1);
      R += r1; G += g1; B += b1; n++;
      const sat = mx ? (mx - mn) / mx : 0, sc = sat * (mx / 255);
      if (sc > bs){ bs = sc; best = [r1, g1, b1]; }
    }
    const hex = a => '#' + a.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    const avg = [R / n * .55, G / n * .55, B / n * .55]; // zemin: ortalama renk koyulaştırılmış
    const dataUrl = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
    return {thumbnail: dataUrl, primaryColor: hex(avg), secondaryColor: best ? hex(best) : null, textColor: null};
  } catch(e){ return null; }
}

async function play(info){
  ensureAudioGraph(); if (ctx.state === 'suspended') ctx.resume();
  cur = info; window.KKP.audio = info.audio;
  audio.src = '/media/' + encodeURIComponent(info.audio);
  emit('MediaStatus', {enabled: true});
  emit('MediaProperties', {title: info.title, artist: info.artist, albumTitle: ''});
  emit('MediaThumbnail', {thumbnail: '', primaryColor: null});
  try { await audio.play(); } catch(e){ toast('Oynatmak için ▶ düğmesine bas'); }
  remember(info); ui();
  if (info.thumb){ const t = await thumbColors(info.thumb); if (t && cur === info) emit('MediaThumbnail', t); }
}

/* ---------- şarkı alma: YouTube / dosya ---------- */
async function fromYouTube(q){
  busy('YouTube\'dan alınıyor…');
  try {
    const r = await fetch('/api/youtube', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({q})});
    const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
    busy(''); play(j);
  } catch(e){ busy(''); toast('Alınamadı: ' + e.message); }
}
async function fromFile(file){
  busy('Dosya yükleniyor…');
  try {
    const r = await fetch('/api/upload', {method: 'POST', headers: {'X-Filename': encodeURIComponent(file.name)}, body: file});
    const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
    busy(''); play(j);
  } catch(e){ busy(''); toast('Yüklenemedi: ' + e.message); }
}

/* ---------- son çalınanlar ---------- */
const HK = 'kl-history';
const hist = () => { try { return JSON.parse(localStorage.getItem(HK)) || []; } catch(e){ return []; } };
function remember(info){ try { localStorage.setItem(HK, JSON.stringify([info, ...hist().filter(h => h.audio !== info.audio)].slice(0, 30))); } catch(e){} renderHist(); }

/* ---------- arayüz ---------- */
const $ = id => document.getElementById(id);
const fmt = s => !isFinite(s) ? '0:00' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
function toast(m){ const t = $('kl-toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 5000); }
function busy(m){ $('kl-busy').textContent = m; $('kl-busy').hidden = !m; $('kl-go').disabled = !!m; }
function ui(){
  $('kl-play').textContent = audio.paused ? '▶' : '❚❚';
  $('kl-play').title = audio.paused ? 'Oynat (boşluk)' : 'Duraklat (boşluk)';
  $('kl-now').textContent = cur ? (cur.artist && !cur.title.includes(cur.artist) ? cur.artist + ' — ' : '') + cur.title : '';
  document.body.classList.toggle('kl-empty', !cur);
  uiTime();
}
function uiTime(){
  const d = audio.duration || (cur && cur.duration) || 0;
  $('kl-seek').max = d || 1; if (!seeking) $('kl-seek').value = audio.currentTime;
  $('kl-time').textContent = fmt(audio.currentTime) + ' / ' + fmt(d);
}
let seeking = false;
function renderHist(){
  const h = hist(), el = $('kl-hist');
  el.innerHTML = h.length ? '' : '<div class="kl-muted">Henüz şarkı yok</div>';
  h.forEach(x => {
    const b = document.createElement('button'); b.className = 'kl-hi';
    b.textContent = (x.artist && !x.title.includes(x.artist) ? x.artist + ' — ' : '') + x.title;
    b.onclick = () => { $('kl-histp').hidden = true; play(x); };
    el.appendChild(b);
  });
}

/* ---------- ayarlar: WE'nin project.json özelliklerinden menü ---------- */
const SK = 'kl-settings';
async function buildSettings(){
  let props;
  try { props = (await (await fetch('project.json')).json()).general.properties; } catch(e){ return; }
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(SK)) || {}; } catch(e){}
  const el = $('kl-set'), all = {};
  Object.entries(props).sort((a, b) => (a[1].order || 0) - (b[1].order || 0)).forEach(([k, p]) => {
    if (k === 'senkronsifirla') return; // duvar kâğıdına özgü
    const v = k in saved ? saved[k] : p.value; all[k] = {value: v};
    const row = document.createElement('label'); row.className = 'kl-row';
    const name = document.createElement('span'); name.textContent = p.text.replace(/<[^>]+>/g, ''); row.appendChild(name);
    let inp;
    if (p.type === 'combo'){ inp = document.createElement('select'); p.options.forEach(o => { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label; inp.appendChild(op); }); inp.value = v; }
    else if (p.type === 'bool'){ inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!v; }
    else if (p.type === 'slider'){ inp = document.createElement('input'); inp.type = 'range'; inp.min = p.min; inp.max = p.max; inp.step = p.step || (p.fraction ? .1 : 1); inp.value = v; }
    else return;
    inp.addEventListener('input', () => {
      const val = p.type === 'bool' ? inp.checked : p.type === 'slider' ? +inp.value : inp.value;
      saved[k] = val; try { localStorage.setItem(SK, JSON.stringify(saved)); } catch(e){}
      window.wallpaperPropertyListener && window.wallpaperPropertyListener.applyUserProperties({[k]: {value: val}});
    });
    row.appendChild(inp); el.appendChild(row);
  });
  const rs = document.createElement('button'); rs.className = 'kl-btn kl-wide'; rs.textContent = 'Varsayılanlara dön';
  rs.onclick = () => { try { localStorage.removeItem(SK); } catch(e){} location.reload(); };
  el.appendChild(rs);
  window.wallpaperPropertyListener && window.wallpaperPropertyListener.applyUserProperties(all);
}

/* ---------- olaylar ---------- */
addEventListener('DOMContentLoaded', () => {
  const bar = $('kl-ui');
  // arayüze tıklama motorun "tıklayarak senkron düzelt" davranışına gitmesin
  bar.addEventListener('mousedown', e => e.stopPropagation());
  $('kl-form').addEventListener('submit', e => { e.preventDefault(); const q = $('kl-q').value.trim(); if (q) fromYouTube(q); $('kl-q').blur(); });
  $('kl-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) fromFile(f); e.target.value = ''; });
  $('kl-open').onclick = () => $('kl-file').click();
  $('kl-play').onclick = () => { if (!cur) return $('kl-q').focus(); ensureAudioGraph(); ctx.resume(); audio.paused ? audio.play() : audio.pause(); };
  $('kl-seek').addEventListener('input', () => { seeking = true; $('kl-time').textContent = fmt(+$('kl-seek').value) + ' / ' + fmt(audio.duration); });
  $('kl-seek').addEventListener('change', () => { audio.currentTime = +$('kl-seek').value; seeking = false; });
  const vol = $('kl-vol'); try { vol.value = localStorage.getItem('kl-vol') ?? 1; } catch(e){} audio.volume = +vol.value;
  vol.addEventListener('input', () => { audio.volume = +vol.value; try { localStorage.setItem('kl-vol', vol.value); } catch(e){} });
  $('kl-fs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  const pop = (b, p) => { $(b).onclick = () => { const o = $(p).hidden; document.querySelectorAll('.kl-pop').forEach(x => x.hidden = true); $(p).hidden = !o; }; };
  pop('kl-gear', 'kl-setp'); pop('kl-histb', 'kl-histp');
  // sürükle-bırak: ses dosyası ya da YouTube bağlantısı
  addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('kl-drop'); });
  addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('kl-drop'); });
  addEventListener('drop', e => {
    e.preventDefault(); document.body.classList.remove('kl-drop');
    const f = e.dataTransfer.files[0]; if (f) return fromFile(f);
    const u = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'); if (u) fromYouTube(u.trim());
  });
  // klavye: boşluk oynat/duraklat, oklar 5 sn, F tam ekran (yazı kutusundayken değil)
  addEventListener('keydown', e => {
    if (e.target.matches('input[type=text], input[type=search], select')) return;
    if (e.code === 'Space'){ e.preventDefault(); $('kl-play').click(); }
    else if (e.code === 'ArrowRight') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
    else if (e.code === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
    else if (e.code === 'KeyF') $('kl-fs').click();
  });
  // arayüz fare durunca gizlenir (şarkı yokken hep görünür)
  let hideT; const wake = () => { document.body.classList.add('kl-awake'); clearTimeout(hideT); hideT = setTimeout(() => { if (!bar.matches(':hover') && !bar.contains(document.activeElement)) document.body.classList.remove('kl-awake'); }, 2800); };
  addEventListener('mousemove', wake); addEventListener('keydown', wake); wake();
  const p = new URLSearchParams(location.search).get('q'); if (p) fromYouTube(p);
  renderHist(); ui();
});
addEventListener('load', buildSettings); // motor wallpaperPropertyListener'ı kurduktan sonra
})();
