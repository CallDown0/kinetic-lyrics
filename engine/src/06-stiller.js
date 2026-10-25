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
