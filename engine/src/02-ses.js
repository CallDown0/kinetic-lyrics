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
