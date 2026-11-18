// Duvar kâğıdının duman testi: wallpaper/index.html başsız Chromium'da açılır, Wallpaper Engine'in medya olayları taklit
// edilir (sahte şarkı, LRCLIB yanıtı sahte) ve temel davranışlar denetlenir. İnternet ve sunucu gerekmez.
// Çalıştırma: npm install && npx playwright install chromium && npm test   (bu klasörde)
const path = require('path'), { chromium } = require('playwright');
const PAGE = 'file://' + path.resolve(__dirname, '..', '..', 'wallpaper', 'index.html').replace(/\\/g, '/');
const f = x => `00:${x.toFixed(2).padStart(5, '0')}`;
const LRC = Array.from({length: 20}, (_, i) => `[${f(i * 3)}] hello world this is line ${i} love fire rain`).join('\n');
const ELRC = Array.from({length: 20}, (_, i) => `[${f(i * 3)}] <${f(i * 3)}> hello <${f(i * 3 + .5)}> world <${f(i * 3 + 1.2)}> line${i} <${f(i * 3 + 2)}>`).join('\n');
let browser, failed = 0;

// sayfayı açar, şarkıyı başlatır; senk: yerel sunucuya giden kelime senkronu isteklerinin sayısı
async function open(props, lrc, seed){
  const p = await (await browser.newContext({viewport: {width: 1280, height: 720}})).newPage(), o = {p, errs: [], senk: 0};
  p.on('pageerror', e => o.errs.push(String(e)));
  await p.addInitScript(() => { const L = {}; for (const n of ['Audio', 'MediaStatus', 'MediaProperties', 'MediaThumbnail', 'MediaPlayback', 'MediaTimeline']) window['wallpaperRegister' + n + 'Listener'] = fn => L[n] = fn; window.__L = L; });
  await p.route(u => /^https?:/.test(u.href), r => {
    const u = r.request().url();
    if (u.includes('lrclib.net')) return r.fulfill({contentType: 'application/json', body: JSON.stringify([{trackName: 'Test Song', artistName: 'Tester', duration: 60, instrumental: false, plainLyrics: 'a', syncedLyrics: lrc || LRC}])});
    if (u.includes('/senkron')) o.senk++;
    return r.abort();
  });
  await p.goto(PAGE);
  if (seed) await p.evaluate(seed);
  await p.evaluate(props => { window.wallpaperPropertyListener.applyUserProperties(props); const L = window.__L; L.MediaStatus({enabled: true}); L.MediaProperties({title: 'Test Song', artist: 'Tester'}); L.MediaPlayback({state: 1}); L.MediaTimeline({position: 0, duration: 60}); }, props || {});
  return o;
}
const set = (o, props) => o.p.evaluate(props => window.wallpaperPropertyListener.applyUserProperties(props), props);
const wait = (o, ms) => o.p.waitForTimeout(ms);
// koşul sağlanana dek bekler (yavaş makinede sabit süre yetmeyebilir); sağlanmazsa false
const until = (o, fn, ms) => o.p.waitForFunction(fn, null, {timeout: ms || 20000, polling: 200}).then(() => true, () => false);
const lyricsUp = o => until(o, () => /Sözler: Test Song/.test(document.getElementById('st').textContent));
// 2D tuvalde zeminden farklı piksel var mı (yazı çizildi mi)
const inked = o => o.p.evaluate(() => { const c = document.getElementById('cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i + 3] > 0 && Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 60) n++; return n; });
async function test(name, fn){
  const t = Date.now();
  let o;
  try { o = await fn(); if (o && o.errs.length) throw new Error('sayfa hatası: ' + o.errs[0]); console.log('  geçti  ' + name + ' (' + ((Date.now() - t) / 1000).toFixed(1) + ' sn)'); }
  catch(e){ failed++; console.log('  KALDI  ' + name + '\n         ' + String(e.message || e)); }
  if (o) await o.p.context().close().catch(() => {});
}
const ok = (c, msg) => { if (!c) throw new Error(msg); };

(async () => {
  browser = await chromium.launch({args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']});
  await test('şarkı çalınca sözler çizilir', async () => {
    const o = await open({arkaplan: {value: 'yok'}, sinema: {value: false}, stil: {value: 'sade'}});
    ok(await lyricsUp(o), 'durum yazısı sözleri göstermiyor'); await wait(o, 3000);
    ok(await inked(o) > 20, 'tuvalde yazı yok'); return o;
  });
  await test('yapay zeka araçları kapalıyken sunucuya istek gitmez, açınca gider', async () => {
    const o = await open({yapayzeka: {value: false}}); ok(await lyricsUp(o), 'sözler gelmedi'); await wait(o, 2500);
    ok(o.senk === 0, 'kapalıyken ' + o.senk + ' istek gitti');
    await set(o, {yapayzeka: {value: true}}); await wait(o, 2500);
    ok(o.senk >= 1, 'açınca istek gitmedi'); return o;
  });
  await test('kelime damgalı (gelişmiş) LRC sunucusuz kelime zamanı verir', async () => {
    const o = await open({yapayzeka: {value: true}}, ELRC);
    ok(await until(o, () => /kelime zamanlı/.test(document.getElementById('st').textContent)), 'kelime zamanları kullanılmadı'); await wait(o, 2500);
    ok(o.senk === 0, 'gereksiz senkron isteği gitti'); return o;
  });
  await test('tanı kayıtları yalnız ayar açıkken yazılır', async () => {
    const o = await open({}); await wait(o, 2500);
    ok(await o.p.evaluate(() => !localStorage.getItem('kkdiag') && !localStorage.getItem('kkhb')), 'kapalıyken kayıt yazıldı');
    await set(o, {tani: {value: true}}); await o.p.evaluate(() => window.__L.MediaTimeline({position: 3, duration: 60})); await wait(o, 2500);
    ok(await o.p.evaluate(() => !!localStorage.getItem('kkdiag') && !!localStorage.getItem('kkhb')), 'açıkken kayıt yazılmadı'); return o;
  });
  await test('WebGL bağlamı kaybolunca 2D tuvale dönülür, geri gelince 3D açılır', async () => {
    const o = await open({stil: {value: 'uc'}, arkaplan: {value: '3d-parcacik'}}); ok(await lyricsUp(o), 'sözler gelmedi');
    await until(o, () => !document.getElementById('bg3').hidden, 8000);
    const st = () => o.p.evaluate(() => ({cv: document.getElementById('cv').style.visibility, gl: !document.getElementById('bg3').hidden}));
    let s = await st(); if (!s.gl){ console.log('         (WebGL yok: atlandı)'); return o; }
    ok(s.cv === 'hidden', 'sözler WebGL katmanında değil');
    await o.p.evaluate(() => { const c = document.getElementById('bg3'); window.__x = (c.getContext('webgl2') || c.getContext('webgl')).getExtension('WEBGL_lose_context'); window.__x.loseContext(); });
    ok(await until(o, () => document.getElementById('bg3').hidden && document.getElementById('cv').style.visibility === '', 8000), 'kayıpta 2D tuvale dönülmedi');
    await wait(o, 2500); ok(await inked(o) > 20, 'kayıpta tuvalde yazı yok');
    await o.p.evaluate(() => window.__x.restoreContext());
    ok(await until(o, () => !document.getElementById('bg3').hidden && document.getElementById('cv').style.visibility === 'hidden', 10000), 'bağlam geri gelince 3D açılmadı'); return o;
  });
  await test('söz önbelleği 300 şarkıyla sınırlanır, elle senkron silinmez', async () => {
    const o = await open({}, LRC, () => { const now = Date.now(); for (let i = 0; i < 320; i++){ localStorage.setItem('kk4:old' + i, JSON.stringify({ts: now - (400 - i) * 1000, lrc: '[00:01.00] x'})); localStorage.setItem('kk4t:old' + i, '[]'); } localStorage.setItem('kk2a:old0', '{"0":3}'); });
    ok(await lyricsUp(o), 'sözler gelmedi');
    const r = await o.p.evaluate(() => { const ks = Object.keys(localStorage); return {n: ks.filter(k => k.startsWith('kk4:')).length, old: ks.includes('kk4:old0'), tr: ks.includes('kk4t:old0'), nw: ks.includes('kk4:old319'), tap: ks.includes('kk2a:old0')}; });
    ok(r.n === 300 && !r.old && !r.tr && r.nw, 'sınır uygulanmadı: ' + JSON.stringify(r)); ok(r.tap, 'elle senkron silindi'); return o;
  });
  await test('tema fontları internetsiz yüklenir', async () => {
    const o = await open({});
    ok(await until(o, () => [...document.fonts].some(x => x.status === 'loaded')), 'gömülü font yüklenmedi'); return o;
  });
  await browser.close();
  console.log(failed ? failed + ' test kaldı.' : 'Bütün testler geçti.');
  process.exit(failed ? 1 : 0);
})();
