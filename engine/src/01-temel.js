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
