/* ---------- 3D arka plan ve sinema efektleri (three.js + postprocessing; WebGL tuvali #bg3) ---------- */
// Sözler 2D tuvalde kalır. 3D açıkken 2D tuval zemini boyamaz (şeffaf), 2D arka plan efektleri ve nokta dokusu çizilmez.
// Saat ekranı opak olduğu için orada 3D hiç çizilmez. Sahneler tamamen shader'da (kare başına birkaç çizim çağrısı):
// parcacik (kollarıyla dönen galaksi), zemin (müzikle kabaran tel kafes arazi), tunel (içinden geçilen ızgara tünel),
// su (dalgalanan deniz yüzeyi), bulut (kubbede süzülen bulutlar).
// Renkler zemine karıştırılır ki yazı okunur kalsın; bas, enerji ve vuruşa tepki verir. Kamera, sözlerin kamerasının
// yönelimini kısılmış ve yumuşatılmış olarak izler: yazı dönerken arka plan da onunla döner.
const B3 = {tried: false, ok: false, want: false, shown: false, kind: '', key: null, prevKind: '', off: 0, bgCol: '#000000'};
const BG3_KINDS = ['parcacik', 'zemin', 'tunel', 'su', 'bulut'];
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
  // WebGL bağlamı kaybolabilir (sürücü sıfırlanması, uykudan dönüş, ekran kartı belleğini alan oyun). Sözler ekranında 2D tuval
  // gizli olduğu ve kare WebGL'den geçtiği için kayıpta bütün yazılar kaybolurdu: kayıp sürerken 2D tuvale dönülür.
  el.addEventListener('webglcontextlost', e => { e.preventDefault(); b3Lost(true); });
  el.addEventListener('webglcontextrestored', () => b3Lost(false));
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
  B3.objs = {parcacik: b3Galaxy(T3), zemin: b3Terrain(T3), tunel: b3Tunnel(T3), su: b3Water(T3), bulut: b3Clouds(T3)};
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

// bağlam kaybı / geri gelişi: kayıpta 3D yazı stilleri havuzdan çıkar ve satırlar 2D stillerle yeniden dizilir;
// geri gelince three kaynaklarını kendisi yeniden kurar, 2D karenin dokusu yeniden ayrılır
function b3Lost(lost){
  if (!!B3.lost === lost) return;
  B3.lost = lost; diag('gl', {lost: lost ? 1 : 0});
  if (lost){ B3.domOff = []; for (const k in STYLES) if (STYLES[k].dom && STYLES[k].auto !== false){ STYLES[k].auto = false; B3.domOff.push(k); } }
  else { for (const k of B3.domOff || []) delete STYLES[k].auto; B3.domOff = null; B3.texW = 0; B3.pf = null; }
  CHS = {}; // nakarat satırına atanmış 3D stil kalmasın
  if (mode === 'lyrics' && words.length) relayout();
}
// tünel: kamera ekseninde akan ızgara boru; her sekizinci halka vurgu renginde, basla nefes alır
function b3Tunnel(T3){
  const geo = new T3.CylinderGeometry(16, 16, 320, 48, 1, true); geo.rotateX(Math.PI / 2);
  const mat = new T3.ShaderMaterial({uniforms: B3.u, side: T3.BackSide,
    vertexShader: `uniform float uBass; varying vec2 vU; varying float vD;
      void main(){
        vU = uv; vec3 p = position; p.xy *= 1. + uBass * .1 * sin(p.z * .11);
        vec4 mv = modelViewMatrix * vec4(p, 1.); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uBg, uFg, uAc; uniform float uOff, uBeat; varying vec2 vU; varying float vD;
      void main(){
        vec2 g = vec2(vU.x * 24., vU.y * 40. + uOff / 8.), a = abs(fract(g - .5) - .5) / fwidth(g);
        float line = 1. - min(min(a.x, a.y) * .6, 1.), ring = 1. - min(a.y * .3, 1.);
        float acc = step(mod(floor(g.y + .5), 8.), .5) * ring;
        float fog = smoothstep(150., 6., vD);
        vec3 c = mix(uBg, uFg, line * fog * (.8 + uBeat * .2));
        gl_FragColor = vec4(mix(c, uAc, acc * fog), 1.); }`});
  const m = new T3.Mesh(geo, mat); m.position.z = -150; m.frustumCulled = false;
  return m;
}

// deniz: kameraya doğru akan dalgalar; yatay tarama çizgileri, dalga tepeleri vurgu renginde, basla kabarır
function b3Water(T3){
  const geo = new T3.PlaneGeometry(240, 240, 180, 180); geo.rotateX(-Math.PI / 2);
  const mat = new T3.ShaderMaterial({uniforms: B3.u,
    vertexShader: B3_NOISE + `uniform float uOff, uBass, uE; varying vec2 vG; varying float vD, vH;
      void main(){
        vec3 p = position; vec2 w = vec2(p.x, p.z - uOff);
        float h = sin(w.y * .16 + w.x * .04) * 1.1 + sin(w.y * .31 - w.x * .13) * .55
          + (fbm(w * .07) - .5) * (2.5 + uBass * 7. + uE * 2.5);
        p.y += h; vG = w; vH = h;
        vec4 mv = modelViewMatrix * vec4(p, 1.); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uBg, uFg, uAc; uniform float uBeat; varying vec2 vG; varying float vD, vH;
      void main(){
        float g = vG.y / 1.7, a = abs(fract(g - .5) - .5) / fwidth(g);
        float line = 1. - min(a * .6, 1.), fog = smoothstep(110., 10., vD);
        float crest = smoothstep(.7, 2.4, vH);
        vec3 lc = mix(uFg, uAc, crest);
        vec3 c = mix(uBg, lc, line * fog * (.65 + crest * .35));
        gl_FragColor = vec4(mix(c, lc, (.05 + crest * .22 + uBeat * .05) * fog), 1.); }`});
  const m = new T3.Mesh(geo, mat); m.position.y = -5; m.frustumCulled = false;
  return m;
}

// bulutlar: kamerayı saran kubbede iki katman süzülen gürültü; yoğun yerler vurgu rengine çalar
function b3Clouds(T3){
  const mat = new T3.ShaderMaterial({uniforms: B3.u, side: T3.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: B3_NOISE + `uniform vec3 uBg, uFg, uAc; uniform float uOff, uBass, uBeat; varying vec3 vP;
      void main(){
        vec3 d = normalize(vP);
        vec2 q = d.xy / (abs(d.z) * .6 + .5) * 1.7;
        float n = fbm(q + vec2(uOff * .05, uOff * .012)), n2 = fbm(q * 2.3 - vec2(uOff * .08, 0.) + 7.3);
        float cl = smoothstep(.34, .78, n * .7 + n2 * .3);
        vec3 c = mix(uBg, uFg, cl * (.55 + uBass * .2));
        gl_FragColor = vec4(mix(c, uAc, smoothstep(.45, .85, n2) * cl * (.6 + uBeat * .3)), 1.); }`});
  const m = new T3.Mesh(new T3.SphereGeometry(220, 40, 20), mat); m.frustumCulled = false;
  return m;
}

// render() karede bir kez sorar: 3D arka plan bu karede çizilecek mi (saat ekranında değil, ayar açık, WebGL var)
// arka plan 'Otomatik' ise her şarkıda yarı yarıya 3D sahne ya da 2D efekt
function bg3Want(){
  if (S.bg3 === 'kapali' || (mode === 'idle' && S.clock) || !bg3Init() || B3.lost) return false;
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
  B3.off += dt * (k === 'parcacik' ? 1.2 + 2.5 * e : k === 'bulut' ? 1 + 2 * e : k === 'tunel' ? 9 + 24 * e : 5 + 16 * e) * (M.playing === false ? .25 : 1);
  U.uT.value = T; U.uOff.value = B3.off; U.uE.value += (e - U.uE.value) * kc;
  U.uBass.value += (bass - U.uBass.value) * Math.min(1, dt * (bass > U.uBass.value ? 14 : 4));
  U.uBeat.value = L.beat; U.uPx.value = cv.height / 1080;
  // kamera: sözlerin kamerasının yönelimi (dünya y aşağı → three y yukarı: x, −y, −z), %55'i alınır, yumuşak izlenir
  const f = CAM.f || [0, 0, 1], rt = CAM.r || [1, 0, 0], up = CAM.up || [0, -1, 0], v = B3.v;
  if (finite3(f) && finite3(rt) && finite3(up)){
    v[0].set(rt[0], -rt[1], -rt[2]); v[1].set(up[0], -up[1], -up[2]); v[2].set(-f[0], f[1], f[2]);
    B3.qt.setFromRotationMatrix(B3.m.makeBasis(v[0], v[1], v[2])); B3.qt.slerpQuaternions(B3.q0, B3.qt, .55);
  }
  B3.qp.setFromAxisAngle(B3.ax, k === 'zemin' ? -.1 : k === 'su' ? -.13 : k === 'parcacik' ? -.05 : 0); B3.qt.multiply(B3.qp);
  if (snapCam) B3.q.copy(B3.qt); else B3.q.slerp(B3.qt, 1 - Math.exp(-dt * 3.5));
  B3.cam.quaternion.copy(B3.q);
  B3.cam.position.set(Math.sin(T * .13) * .8, Math.sin(T * .17) * .4 + (k === 'zemin' || k === 'su' ? 1.2 : 0), 0);
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
    // parlama (ayar parlama): yalnız koyu zeminde, parlak yazı ve vurgu ışık halesi verir; kapalıyken geçidi de kapalı (GPU harcamaz)
    if (PP.BloomEffect){ B3.bloom = new PP.BloomEffect({intensity: 0, luminanceThreshold: .62, luminanceSmoothing: .25, mipmapBlur: true, radius: .7}); B3.pbloom = new PP.EffectPass(B3.cam, B3.bloom); B3.pbloom.enabled = false; }
    // ekran filtresi ve bozulmalar (ayar filtre / bozulma): tek efekt, hepsi sıfırken geçidi kapalı.
    // VHS (tarama çizgileri, hafif kavis, kayan bant), yarım ton (baskı noktaları), bas dalgası (merkezden yayılan dalgalanma),
    // glitch (büyük düşüşte yatay yırtılma), kaleydoskop (nakarat girişinde kısa aynalanma).
    B3.scr = new PP.Effect('kkScreen', `uniform float uRip, uGl, uKal, uVhs, uHalf, uT;
      void mainUv(inout vec2 uv){
        if (uVhs > 0.){ vec2 c = uv - .5; uv = .5 + c * (1. + uVhs * .07 * dot(c, c)); }
        if (uKal > 0.){ vec2 c = uv - .5; c.x *= aspect; float a = atan(c.y, c.x), r = length(c); a = abs(mod(a, 2.0944) - 1.0472);
          vec2 k = vec2(cos(a), sin(a)) * r; k.x /= aspect; uv = mix(uv, k + .5, uKal); }
        if (uRip > 0.){ vec2 c = uv - .5; float r = length(c); uv += c / (r + 1e-4) * sin(r * 42. - uT * 9.) * uRip * .006 * smoothstep(0., .25, r); }
        if (uGl > 0.){ float band = floor(uv.y * 16. + uT * 2.), h = fract(sin(band * 91.7 + floor(uT * 18.) * 7.3) * 43758.5453); uv.x += (h - .5) * step(.5, h) * uGl * .14; }
      }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
        vec3 c = inputColor.rgb;
        if (uVhs > 0.){
          float sl = .5 + .5 * sin(uv.y * resolution.y * 1.6), bar = smoothstep(.06, 0., abs(fract(uv.y + uT * .09) - .5));
          c *= 1. - uVhs * (.2 * sl + .1 * bar); c = mix(c, c * vec3(1.06, 1., .94), uVhs);
          vec2 e = abs(uv - .5) * 2.; c *= 1. - uVhs * .5 * smoothstep(.75, 1.05, max(e.x, e.y));
        }
        if (uHalf > 0.){
          vec2 q = mat2(.7071, -.7071, .7071, .7071) * (uv * resolution / (resolution.y / 140.));
          float d = length(fract(q) - .5), l = dot(c, vec3(.299, .587, .114)), dotv = 1. - smoothstep(-.08, .08, d - (.16 + .4 * l));
          c = mix(c, c * (.68 + .5 * dotv), uHalf);
        }
        outputColor = vec4(c, inputColor.a);
      }`, {uniforms: new Map(['uRip', 'uGl', 'uKal', 'uVhs', 'uHalf', 'uT'].map(k => [k, new T3.Uniform(0)]))});
    B3.pscr = new PP.EffectPass(B3.cam, B3.scr); B3.pscr.enabled = false;
    for (const p of [B3.p3, B3.pov, B3.pbloom, new PP.EffectPass(B3.cam, B3.wave, B3.noise, B3.vig), B3.pscr, new PP.EffectPass(B3.cam, B3.chroma), new PP.EffectPass(B3.cam, B3.blur)]) if (p) C.addPass(p); // son geçit hep açık olmalı: ekrana o yazar
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
  if (B3.scr){
    const U = B3.scr.uniforms, sm = (k, tg, sp) => { const u = U.get(k); u.value += (tg - u.value) * Math.min(1, dt * sp); return u.value; };
    const dOn = S.distort && !REDUCED;
    // glitch: büyük düşüşten sonraki 0.35 sn; kaleydoskop: nakarata girişin ilk 0.5 sn'si (yarım sinüs); bas dalgası: güçlü basta
    let gl = 0, kal = 0;
    const drS = L.drops.length ? L.drops[L.drops.length - 1] : null;
    if (dOn && drS != null){ const x = T - drS; if (x >= 0 && x < .35) gl = 1 - x / .35; }
    if (dOn && cb && cb.chorus && T >= cb.t0 && T - cb.t0 < .5){ const pb = blocks[cb.li - 1]; if (!pb || !pb.chorus) kal = Math.sin((T - cb.t0) / .5 * Math.PI) * .85; }
    U.get('uGl').value = gl; U.get('uKal').value = kal; U.get('uT').value = nowS() % 1000;
    const rip = sm('uRip', dOn ? clamp((L.lowSlow - .5) * 2.2, 0, 1) * (.5 + .5 * energy()) : 0, 5);
    const vhs = sm('uVhs', S.filter === 'vhs' ? 1 : 0, 3), half = sm('uHalf', S.filter === 'yarimton' ? 1 : 0, 3);
    B3.pscr.enabled = gl + kal + rip + vhs + half > .004;
    if (gl > 0) B3.chroma.offset.x += gl * .012; // yırtılmayla birlikte renk kanalları da ayrılır
  }
  if (B3.bloom){
    const bg = pre().bg, tg = S.bloom && /^#[0-9a-f]{6}$/i.test(bg) && lum(bg) < .1 ? .55 + L.beat * .45 : 0;
    B3.bloomI = (B3.bloomI || 0) + (tg - (B3.bloomI || 0)) * Math.min(1, dt * 4);
    B3.bloom.intensity = B3.bloomI; B3.pbloom.enabled = B3.bloomI > .02;
  }
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
  // olay gelmeden kaybolan bağlam da yakalansın
  if (B3.r && !B3.lost && B3.r.getContext().isContextLost()) b3Lost(true);
  const el = $('bg3'), fx = !!(mode === 'lyrics' && bg3Init() && B3.fxOk && !B3.lost);
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
  if (B3.texW !== cv.width || B3.texH !== cv.height){ if (B3.texW || B3.texH) B3.tex.dispose(); B3.texW = cv.width; B3.texH = cv.height; }
  B3.tex.needsUpdate = true;
  B3.p3.enabled = B3.want; B3.pov.clearPass.enabled = !B3.want;
  B3.comp.render(dt);
}
