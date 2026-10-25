"""Kinetic Lyrics sunucusu (http://127.0.0.1:8778).

İki işi var:
  1) Tarayıcı oynatıcısını sunar (web/ + wallpaper/ içindeki motor dosyaları): YouTube'dan şarkı indirir ya da yüklenen
     ses dosyasını alır, sesi sayfaya akıtır (ileri/geri sarma için Range desteğiyle).
  2) Kelime senkronu: sayfa (ya da Wallpaper Engine duvar kâğıdı) çalan şarkının sözlerini yollar; sunucu vokali ayırır
     (Demucs), Whisper ile her kelimenin zamanını çıkarır (WhisperX + hizalama) ve sözlerin her kelimesine başlangıç/bitiş
     verir. Sözü olmayan şarkıda Whisper'ın duyduğu metin söz olur. Sonuçlar diske kaydedilir: ikinci kez anında gelir.
Modeller ilk istekte yüklenir, BOSTA_SN boyunca iş gelmezse ekran belleği boşaltılır (oyunlara yer kalsın).
Şarkı değişirse yarım iş bırakılır, yeni şarkıya geçilir.

Uçlar:
  GET  /                 tarayıcı oynatıcısı          GET /panel   izleme paneli (GET /panel.json veri)
  POST /api/youtube      {q: bağlantı ya da şarkı adı} -> {audio, title, artist, duration, thumb}
  POST /api/upload       ham dosya baytları (X-Filename başlığı) -> aynı biçim
  GET  /media/<audio>    ses akışı;  GET /api/thumb?u=<url>  kapak resmi (renk çıkarmak için aynı kaynaktan)
  POST /senkron          {key, title, artist, dur, lines | null, lt, lang, audio | null}
                         -> {state: 'done', wt, off, approx[, lines, asr]} | {state: 'working'} | {state: 'failed', reason}
"""
import os, sys, json, time, re, hashlib, difflib, threading, subprocess, traceback, statistics, mimetypes, urllib.parse, urllib.request

# pythonw ile (pencere yok) stdout/stderr yoktur; kütüphanelerin print'i çökmesin
if sys.stdout is None: sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None: sys.stderr = open(os.devnull, "w", encoding="utf-8")

from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

PORT = int(os.environ.get("KINETIC_PORT", "8778"))
BOSTA_SN = 600
MEDYA_SINIR = 3 * 2**30  # indirilen/yüklenen sesler en çok bu kadar yer kaplar (eskiler silinir)
KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB, DUVAR = os.path.join(KOK, "web"), os.path.join(KOK, "wallpaper")
VERI = os.environ.get("KINETIC_DATA", os.path.join(KOK, "data"))
ONBELLEK, SES, MEDYA = (os.path.join(VERI, x) for x in ("sync-cache", "tmp-audio", "media"))
KAYIT = os.path.join(VERI, "server.log")
for d in (ONBELLEK, SES, MEDYA): os.makedirs(d, exist_ok=True)
PANEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "panel.html")

# WhisperX'in kullandığı CTranslate2 4.4 cuDNN 8 ister; install.ps1 onu ayrı klasöre kurar (PyTorch'un cuDNN 9'una dokunmadan)
CUDNN8 = os.path.join(os.path.dirname(os.path.dirname(sys.executable)), "Lib", "site-packages", "cudnn8_compat", "nvidia", "cudnn", "bin")
if os.path.isdir(CUDNN8):
    os.environ["PATH"] = CUDNN8 + os.pathsep + os.environ.get("PATH", "")
    try: os.add_dll_directory(CUDNN8)
    except Exception: pass

def ffmpeg_yolu():
    # sistemde ffmpeg yoksa imageio-ffmpeg'in getirdiği kullanılır
    from shutil import which
    if which("ffmpeg"): return "ffmpeg"
    try:
        import imageio_ffmpeg; return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception: return "ffmpeg"
FFMPEG = ffmpeg_yolu()
GIZLI = 0x08000000 if os.name == "nt" else 0  # alt işlem konsol penceresi açmasın


SON_KAYIT = []  # izleme paneli için son satırlar (bellekte)
ASAMA = {"ad": "", "t": 0.0}

class Iptal(Exception): pass

def kontrol():
    # şarkı değiştiyse (daha yeni bir istek geldiyse) yarım iş bırakılır, işçi hemen yeni şarkıya geçer
    k = BUSY.get("k")
    if not k: return
    with QL:
        j = BEKLEYEN.get(k)
        if j and any(o["seq"] > j["seq"] for o in BEKLEYEN.values()): raise Iptal()

def asama(s):
    if s: kontrol()  # her aşama başı bir iptal noktası
    ASAMA["ad"] = s; ASAMA["t"] = time.time()

def log(*a):
    s = time.strftime("%H:%M:%S ") + " ".join(str(x) for x in a)
    SON_KAYIT.append(s); del SON_KAYIT[:-60]
    try:
        with open(KAYIT, "a", encoding="utf-8") as f: f.write(s + "\n")
    except Exception: pass


# ---------------- modeller (tembel yükleme, boşta boşaltma) ----------------
MD = {"demucs": None, "whisper": None, "align": None, "alang": None, "last": 0.0}
MLOCK = threading.Lock()

def modeller():
    import whisperx
    from demucs.pretrained import get_model
    if MD["demucs"] is None:
        t = time.time(); MD["demucs"] = get_model("htdemucs").to("cuda").eval(); log("demucs yüklendi", round(time.time() - t, 1))
    if MD["whisper"] is None:
        t = time.time()
        # dil sabitlenmez: her istekte verilir ya da Whisper tespit eder
        # float16: int8_float16 RTX 50 serisinde (sm_120, ctranslate2 4.4) CUBLAS_STATUS_NOT_SUPPORTED veriyor
        MD["whisper"] = whisperx.load_model("large-v3", "cuda", compute_type="float16", vad_method="silero",
                                            download_root=os.environ.get("KINETIC_WHISPER_DIR"))
        log("whisper yüklendi", round(time.time() - t, 1))
    MD["last"] = time.time()
    return MD

def hizalama(lang):
    # dil başına bir wav2vec2 modeli; bellekte yalnız sonuncusu tutulur
    import whisperx, torch
    if MD["alang"] != lang:
        MD["align"] = None; torch.cuda.empty_cache()
        t = time.time(); MD["align"] = whisperx.load_align_model(language_code=lang, device="cuda"); MD["alang"] = lang
        log("hizalama yüklendi", lang, round(time.time() - t, 1))
    return MD["align"]

def bosalt():
    if MD["demucs"] is None and MD["whisper"] is None and MD["align"] is None: return
    MD["demucs"] = MD["whisper"] = MD["align"] = MD["alang"] = None
    import gc; gc.collect()
    try:
        import torch; torch.cuda.empty_cache()
    except Exception: pass
    log("modeller boşaltıldı (boşta)")


# ---------------- şarkıyı bul ve indir (duvar kâğıdı: yalnız ad ve süre bilinir) ----------------
def ses_bul(title, artist, dur):
    import yt_dlp
    asama("YouTube'da aranıyor")
    q = (artist + " " + title).strip() if artist and artist.lower() not in title.lower() else title
    opts = {"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True}
    with yt_dlp.YoutubeDL(opts) as y:
        r = y.extract_info("ytsearch6:" + q, download=False)
    ents = [e for e in (r.get("entries") or []) if e and e.get("id") and e.get("duration")]
    if not ents: raise RuntimeError("YouTube'da bulunamadı: " + q)
    # çalan sürüm genelde aynı videodur: süresi en yakın olan (arama sırası eşitlik bozar)
    if dur:
        sira = sorted(enumerate(ents), key=lambda p: (abs(p[1]["duration"] - dur) > 2, abs(p[1]["duration"] - dur), p[0]))
        ents = [e for _, e in sira]
    e = ents[0]
    bul = lambda: next((os.path.join(SES, f) for f in os.listdir(SES) if f.startswith(e["id"] + ".") and not f.endswith(".part")), None)
    if not bul():
        asama("ses indiriliyor")
        dl = {"quiet": True, "no_warnings": True, "format": "bestaudio[ext=m4a]/bestaudio", "outtmpl": os.path.join(SES, "%(id)s.%(ext)s"),
              "progress_hooks": [lambda _: kontrol()]}  # indirme sürerken de iptal edilebilir
        with yt_dlp.YoutubeDL(dl) as y: y.download(["https://www.youtube.com/watch?v=" + e["id"]])
    yol = bul()
    if not yol: raise RuntimeError("indirilemedi: " + e["id"])
    return yol, e["id"], float(e["duration"]), e.get("title", "")


# ---------------- oynatıcı: YouTube'dan indir / dosya yükle ----------------
def medya_yolu(aid):
    if not re.fullmatch(r"[\w-]{6,64}", aid or ""): return None
    return next((os.path.join(MEDYA, f) for f in os.listdir(MEDYA) if f.startswith(aid + ".") and not f.endswith((".part", ".json", ".ytdl"))), None)

def medya_bilgi(aid):
    try:
        with open(os.path.join(MEDYA, aid + ".json"), encoding="utf-8") as f: return json.load(f)
    except Exception: return None

def medya_temizle():
    fs = [os.path.join(MEDYA, f) for f in os.listdir(MEDYA)]
    top = sum(os.path.getsize(f) for f in fs)
    for f in sorted(fs, key=os.path.getatime):
        if top <= MEDYA_SINIR: break
        try: top -= os.path.getsize(f); os.remove(f)
        except Exception: pass

def youtube_al(q):
    import yt_dlp
    q = q.strip()
    hedef = q if re.match(r"https?://", q) else "ytsearch1:" + q
    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "noplaylist": True}) as y:
        info = y.extract_info(hedef, download=False)
    if info.get("entries"): info = info["entries"][0]
    if not info or not info.get("id"): raise RuntimeError("bulunamadı")
    aid = "yt-" + info["id"]
    if not medya_yolu(aid):
        dl = {"quiet": True, "no_warnings": True, "noplaylist": True, "format": "bestaudio[ext=m4a]/bestaudio",
              "outtmpl": os.path.join(MEDYA, aid + ".%(ext)s")}
        with yt_dlp.YoutubeDL(dl) as y: y.download([info.get("webpage_url") or "https://www.youtube.com/watch?v=" + info["id"]])
    # duvar kâğıdındaki gibi: başlık videonun adı, sanatçı kanal (motor "Sanatçı - Şarkı" başlığını kendisi ayırır)
    bilgi = {"audio": aid, "title": info.get("title") or q, "artist": info.get("channel") or info.get("uploader") or "",
             "duration": info.get("duration") or 0, "thumb": info.get("thumbnail") or ""}
    with open(os.path.join(MEDYA, aid + ".json"), "w", encoding="utf-8") as f: json.dump(bilgi, f, ensure_ascii=False)
    medya_temizle()
    return bilgi

def dosya_al(ad, veri):
    aid = "up-" + hashlib.sha1(veri).hexdigest()[:16]
    uz = os.path.splitext(ad)[1].lower()
    if uz not in (".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus", ".webm", ".mp4"): uz = ".bin"
    yol = os.path.join(MEDYA, aid + uz)
    if not os.path.exists(yol):
        with open(yol, "wb") as f: f.write(veri)
    # etiketler ve süre ffmpeg'in çıktısından; etiket yoksa dosya adı ("Sanatçı - Şarkı.mp3")
    err = subprocess.run([FFMPEG, "-hide_banner", "-i", yol], capture_output=True, text=True, encoding="utf-8", errors="replace",
                         creationflags=GIZLI).stderr
    tag = lambda k: (re.search(r"^\s{4}" + k + r"\s*:\s*(.+)$", err, re.M | re.I) or [None, ""])[1].strip()
    m = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", err)
    dur = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else 0
    title, artist = tag("title"), tag("artist")
    if not title:
        base = os.path.splitext(os.path.basename(ad))[0]
        title = base  # "Sanatçı - Şarkı" biçimini motor ayırır
    bilgi = {"audio": aid, "title": title, "artist": artist, "duration": dur, "thumb": ""}
    with open(os.path.join(MEDYA, aid + ".json"), "w", encoding="utf-8") as f: json.dump(bilgi, f, ensure_ascii=False)
    medya_temizle()
    return bilgi


# ---------------- vokal + kelime zamanları ----------------
def kelime_zamanlari(yol, lang=None):
    import numpy as np, torch, torchaudio
    import whisperx
    from demucs.apply import apply_model
    asama("modeller yükleniyor" if MD["whisper"] is None else "vokal ayrılıyor")
    m = modeller()
    dm = m["demucs"]
    asama("vokal ayrılıyor")
    raw = subprocess.run([FFMPEG, "-v", "quiet", "-i", yol, "-f", "f32le", "-ac", "2", "-ar", str(dm.samplerate), "-"],
                         capture_output=True, check=True, creationflags=GIZLI).stdout
    wav = torch.from_numpy(np.frombuffer(raw, dtype=np.float32).copy()).view(-1, 2).T
    ref = wav.mean(0); mu, sd = ref.mean(), ref.std() + 1e-8
    with torch.inference_mode(), torch.autocast("cuda", dtype=torch.float16):
        src = apply_model(dm, ((wav - mu) / sd)[None].to("cuda"), split=True, overlap=0.1, progress=False)[0]
    voc = src[dm.sources.index("vocals")].float().mean(0) * sd.to("cuda") + mu.to("cuda")
    voc16 = torchaudio.functional.resample(voc, dm.samplerate, 16000).cpu().numpy().astype("float32")
    del src, voc; torch.cuda.empty_cache()
    asama("yazıya dökülüyor")
    res = m["whisper"].transcribe(voc16, batch_size=8, language=lang)  # lang None: Whisper dili kendisi bulur
    asama("kelimeler hizalanıyor (" + str(res.get("language") or lang) + ")")
    try: ma, meta = hizalama(res.get("language") or lang or "en")
    except Exception as e:  # bu dil için hizalama modeli yoksa İngilizceninkiyle (kaba zamanlar)
        log("hizalama modeli yok:", res.get("language"), e); ma, meta = hizalama("en")
    al = whisperx.align(res["segments"], ma, meta, voc16, "cuda", return_char_alignments=False)
    MD["last"] = time.time(); torch.cuda.empty_cache()
    return [[w for w in s.get("words", []) if "start" in w and "end" in w] for s in al["segments"]]


# ---------------- sözü olmayan şarkı: Whisper'ın duyduğu metin söz olur ----------------
# Whisper sessiz/enstrümantal yerlerde eğitim verisindeki altyazı kalıplarını uydurur; bunlar atılır
UYDURMA = re.compile(r"altyaz|abone ol|izlediğiniz için|teşekkürler|thanks for watching|subscribe|www\.|\.com|müzik\]|\[müzik|♪", re.I)

def asr_satirlari(segs):
    lines, wt = [], []
    for seg in segs:
        txt = " ".join(w["word"] for w in seg)
        if not seg or UYDURMA.search(txt): continue
        cur, ct = [], []
        for i, w in enumerate(seg):
            # satır sonu: noktalama ya da büyük harfle başlayan kelime (Whisper dize başlarını büyük yazar),
            # kelimeler arası 0.8 sn boşluk; en çok 8 kelime. Çok kısa satır olmasın diye noktalama/büyük harf en az 3 kelimede
            ww = w["word"].strip()
            yeni = cur and (len(cur) >= 8 or w["start"] - seg[i - 1]["end"] > .8 or
                            (len(cur) >= 3 and (re.search(r"[.,!?;:…]$", cur[-1]) or ww[:1].isupper())))
            if yeni:
                lines.append(cur); wt.append(ct); cur, ct = [], []
            cur.append(ww); ct.append([round(w["start"], 2), round(w["end"], 2)])
        if cur: lines.append(cur); wt.append(ct)
    # aynı kelimenin art arda onlarca kez tekrarı da uydurmadır (Whisper döngüsü)
    temiz = [(l, t) for l, t in zip(lines, wt) if not (len(l) >= 4 and len(set(norm(x) for x in l)) == 1)]
    return [l for l, _ in temiz], [t for _, t in temiz]


# ---------------- sözlerle eşleme ----------------
def norm(s):
    s = s.replace("I", "ı").replace("İ", "i").lower()
    return re.sub(r"[^\w]", "", s)

def esle(lines, asr):
    lyr = [(li, w) for li, l in enumerate(lines) for w in l]
    A = [norm(w["word"]) for w in asr]; B = [norm(w) for _, w in lyr]
    sm = difflib.SequenceMatcher(None, B, A, autojunk=False)
    tm = [None] * len(lyr); iyi = 0
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal" or (tag == "replace" and i2 - i1 == j2 - j1):
            for k in range(i2 - i1):
                w = asr[j1 + k]; tm[i1 + k] = [w["start"], w["end"]]
                if tag == "equal" or difflib.SequenceMatcher(None, B[i1 + k], A[j1 + k]).ratio() >= .6: iyi += 1
        elif tag == "replace" and j2 > j1:  # farklı sayıda kelime: aralık eşit bölünür
            s0, e0 = asr[j1]["start"], asr[j2 - 1]["end"]; n = i2 - i1
            for k in range(n): tm[i1 + k] = [s0 + (e0 - s0) * k / n, s0 + (e0 - s0) * (k + 1) / n]
    # eşleşmeyen kelimeler komşuların arasına
    for i in range(len(tm)):
        if tm[i] is None:
            p = next((tm[j] for j in range(i - 1, -1, -1) if tm[j]), None)
            n = next((tm[j] for j in range(i + 1, len(tm)) if tm[j]), None)
            if p and n: tm[i] = [p[1], max(p[1], n[0])]
            elif p: tm[i] = [p[1], p[1] + .3]
            elif n: tm[i] = [max(0., n[0] - .3), n[0]]
            else: tm[i] = [0., .3]
    # zaman geri gitmesin (yanlış eşleşen tekrar nakaratlar)
    for i in range(1, len(tm)):
        if tm[i][0] < tm[i - 1][0]: tm[i] = [tm[i - 1][0] + .03, max(tm[i][1], tm[i - 1][0] + .06)]
    out = [[] for _ in lines]
    for (li, _), t in zip(lyr, tm): out[li].append([round(t[0], 2), round(t[1], 2)])
    return out, iyi / max(1, len(lyr))


# ---------------- iş kuyruğu ----------------
# Çalan şarkı önce: en son istenen iş alınır; sayfanın artık sormadığı iş (şarkı geçildi) atlanır.
BEKLEYEN = {}  # anahtar -> {"d": istek, "poll": son sorulma anı, "seq": sıra, "t0": geliş}
QL = threading.Lock(); QEV = threading.Event(); SEQ = [0]
TERK_SN = 60  # sayfa 4 sn'de bir sorar; WE başka pencere öndeyken duvar kâğıdını uyutur (sorma durur), o yüzden cömert
BUSY = {"v": False, "k": None}
GECIS_SN = 3  # yeni istek gelince ekran kartı işine bu kadar sonra başlanır: şarkı geçiş animasyonu takılmasın
DILLER = ("tr", "en", "az", "de", "fr", "es", "it", "ru", "ar", "pt", "nl", "ja", "zh")

def kuyruga(k, d):
    with QL:
        j = BEKLEYEN.get(k)
        if j: j["poll"] = time.time(); return False
        SEQ[0] += 1; BEKLEYEN[k] = {"d": d, "poll": time.time(), "seq": SEQ[0], "t0": time.time()}
    QEV.set(); return True

def sonraki():
    with QL:
        now = time.time()
        for k in [k for k, j in BEKLEYEN.items() if now - j["poll"] > TERK_SN]:
            log("atlandı (şarkı geçildi)", BEKLEYEN[k]["d"].get("title")); del BEKLEYEN[k]
        if not BEKLEYEN: QEV.clear(); return None, None
        k = max(BEKLEYEN, key=lambda k: BEKLEYEN[k]["seq"])
        return k, BEKLEYEN[k]["d"]

def anahtar(d):
    h = hashlib.sha1(json.dumps([d.get("key"), d.get("lines"), d.get("audio")], ensure_ascii=False).encode("utf-8")).hexdigest()
    return h[:20]

def isci():
    # düşük öncelik: işlemci paylaşımında görüntü önde (BELOW_NORMAL_PRIORITY_CLASS)
    try:
        import ctypes; k32 = ctypes.windll.kernel32; k32.GetCurrentProcess.restype = ctypes.c_void_p  # 64 bit tanıtıcı kırpılmasın
        k32.SetPriorityClass(ctypes.c_void_p(k32.GetCurrentProcess()), 0x4000)
    except Exception: pass
    while True:
        k, d = sonraki()
        if k is not None:
            bekle = GECIS_SN - (time.time() - BEKLEYEN.get(k, {}).get("t0", 0))
            if bekle > 0: time.sleep(bekle); continue  # bu arada daha yeni bir istek gelmiş olabilir
        k, d = sonraki()
        if k is None:
            QEV.wait(30)
            if not BEKLEYEN and time.time() - MD["last"] > BOSTA_SN:
                with MLOCK: bosalt()
            continue
        BUSY["v"] = True; BUSY["k"] = k; BUSY["d"] = d; BUSY["t0"] = t0 = time.time()
        gecici = False
        try:
            with MLOCK:
                yerel = medya_yolu(d.get("audio")) if d.get("audio") else None
                if yerel:  # tarayıcı oynatıcısı: ses zaten burada, çalınan sürümün kendisi
                    yol, vid, vtitle = yerel, d["audio"], (medya_bilgi(d["audio"]) or {}).get("title", "")
                    vdur = d.get("dur") or 0
                else:
                    yol, vid, vdur, vtitle = ses_bul(d.get("title", ""), d.get("artist", ""), d.get("dur") or 0); gecici = True
                t1 = time.time()
                lang = d.get("lang") if d.get("lines") else None
                segs = kelime_zamanlari(yol, lang if lang in DILLER else None)
            dur = d.get("dur") or 0
            off, approx = 0.0, bool(dur and abs(vdur - dur) > 2)
            if not d.get("lines"):
                # söz yok: duyulan metin söz olur
                lines, wt = asr_satirlari(segs)
                n = sum(len(l) for l in lines)
                if n < 15: sonuc = {"state": "failed", "reason": "vokal bulunamadı (%d kelime)" % n, "vid": vid}
                else: sonuc = {"state": "done", "asr": True, "lines": lines, "wt": wt, "off": 0.0, "approx": approx, "match": None, "vid": vid}
                oran = None
            else:
                wt, oran = esle(d["lines"], [w for s in segs for w in s])
                lt = d.get("lt")
                # indirilen sürüm çalınandan farklıysa (süre farkı) satır zamanlarına göre kaydırma
                if approx and lt:
                    diffs = [lt[i] - wt[i][0][0] for i in range(len(wt)) if wt[i] and lt[i] is not None]
                    if diffs: off = round(statistics.median(diffs), 2)
                if oran < .35:
                    sonuc = {"state": "failed", "reason": "sözler sesle tutmadı (%d%%)" % round(oran * 100), "vid": vid}
                else:
                    sonuc = {"state": "done", "wt": wt, "off": off, "approx": approx, "match": round(oran, 3), "vid": vid}
            with open(os.path.join(ONBELLEK, k + ".json"), "w", encoding="utf-8") as f:
                json.dump(dict(sonuc, title=d.get("title"), artist=d.get("artist")), f, ensure_ascii=False)
            log("bitti", d.get("artist"), "-", d.get("title"), "| ses", vid, vtitle,
                "| eşleşme", round(oran, 2) if oran is not None else "sözsüz: %d satır" % len(sonuc.get("lines") or []),
                "| hazırlık", round(t1 - t0, 1), "sn, işlem", round(time.time() - t1, 1), "sn")
            if gecici:
                try: os.remove(yol)  # duvar kâğıdı için indirilen ses yalnız işlem içindi; sonuç kayıtlı
                except Exception: pass
        except Exception as e:
            # yt-dlp kancadan atılan hatayı kendi hatasına sarar: içinde Iptal varsa iptaldir
            if isinstance(e, Iptal) or isinstance(getattr(e, "exc_info", [None, None])[1], Iptal) or "Iptal" in repr(e):
                log("iptal (şarkı değişti):", d.get("title"), "| %.1f sn sonra" % (time.time() - t0))
                for f in os.listdir(SES):  # yarım indirmeler
                    if f.endswith(".part") or f.endswith(".ytdl"):
                        try: os.remove(os.path.join(SES, f))
                        except Exception: pass
                continue  # finally kuyruktan çıkarır; şarkıya dönülürse sayfa yeniden ister
            log("HATA", d.get("title"), repr(e)); log(traceback.format_exc())
            # kalıcı başarısızlık kaydedilmez: sunucu/ağ sorunu olabilir, sonra yeniden denenir
        finally:
            with QL: BEKLEYEN.pop(k, None)
            BUSY["v"] = False; BUSY["k"] = None; BUSY["d"] = None; asama(""); MD["last"] = time.time()


# ---------------- izleme paneli ----------------
BASLANGIC = time.time()
GPU = {"t": 0, "v": None}

def gpu_bilgisi():
    # nvidia-smi en çok 2 sn'de bir sorulur (panel sık yenilense de)
    if time.time() - GPU["t"] > 2:
        GPU["t"] = time.time()
        try:
            o = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu",
                                "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=3,
                               creationflags=GIZLI).stdout.strip().split(", ")
            GPU["v"] = {"ad": o[0], "kul": int(o[1]), "top": int(o[2]), "yuk": int(o[3]), "isi": int(o[4])}
        except Exception: GPU["v"] = None
    g = dict(GPU["v"] or {})
    try:
        import torch
        if torch.cuda.is_initialized(): g["servis"] = int(torch.cuda.memory_reserved() / 2**20)
    except Exception: pass
    return g

def panel_verisi():
    now = time.time()
    sonuclar = []
    for f in sorted(os.listdir(ONBELLEK), key=lambda f: -os.path.getmtime(os.path.join(ONBELLEK, f)))[:15]:
        try:
            with open(os.path.join(ONBELLEK, f), encoding="utf-8") as h: j = json.load(h)
        except Exception: continue
        sonuclar.append({"ad": j.get("title"), "sanatci": j.get("artist"), "durum": j.get("state"), "es": j.get("match"),
                         "sozsuz": bool(j.get("asr")), "satir": len(j.get("wt") or []), "neden": j.get("reason"),
                         "kaydirma": j.get("off"), "yaklasik": j.get("approx"), "t": os.path.getmtime(os.path.join(ONBELLEK, f))})
    with QL:
        sira = [{"ad": j["d"].get("title"), "sanatci": j["d"].get("artist"), "sozsuz": not j["d"].get("lines"),
                 "bekleme": round(now - j["t0"], 1), "sorulma": round(now - j["poll"], 1), "aktif": k == BUSY.get("k")}
                for k, j in sorted(BEKLEYEN.items(), key=lambda p: -p[1]["seq"])]
    d = BUSY.get("d") or {}
    return {"saat": now, "acik": round(now - BASLANGIC), "is": {"ad": d.get("title"), "sanatci": d.get("artist"), "sozsuz": not d.get("lines"),
            "asama": ASAMA["ad"], "asama_sn": round(now - ASAMA["t"], 1) if ASAMA["ad"] else 0,
            "toplam_sn": round(now - BUSY.get("t0", now), 1)} if BUSY["v"] else None,
            "sira": sira, "modeller": {"demucs": MD["demucs"] is not None, "whisper": MD["whisper"] is not None, "hizalama": MD["alang"]},
            "bosaltma_sn": max(0, round(BOSTA_SN - (now - MD["last"]))) if MD["whisper"] is not None and not BUSY["v"] else None,
            "gpu": gpu_bilgisi(), "sonuclar": sonuclar, "kayit": SON_KAYIT[-40:]}


# ---------------- HTTP ----------------
class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # ses akışında bağlantı açık kalsın (sarma istekleri hızlı)

    def _yaz(self, kod, o):
        b = json.dumps(o, ensure_ascii=False).encode("utf-8")
        self.send_response(kod)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")  # duvar kâğıdı file:// kaynağından sorar
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Filename")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers(); self.wfile.write(b)

    def _dosya(self, yol, tur=None, onbellek=True):
        try: boy = os.path.getsize(yol)
        except OSError: return self._yaz(404, {"error": "yok"})
        tur = tur or mimetypes.guess_type(yol)[0] or "application/octet-stream"
        if tur.startswith("text/") or tur in ("application/javascript", "application/json"): tur += "; charset=utf-8"
        bas, son, kod = 0, boy - 1, 200
        m = re.match(r"bytes=(\d*)-(\d*)", self.headers.get("Range") or "")
        if m and boy:  # sarma: tarayıcı sesin istenen parçasını ister
            if m[1]: bas = int(m[1]); son = int(m[2]) if m[2] else boy - 1
            else: bas = max(0, boy - int(m[2] or 0))
            son = min(son, boy - 1); kod = 206
            if bas > son: self.send_response(416); self.send_header("Content-Range", "bytes */%d" % boy); self.send_header("Content-Length", "0"); return self.end_headers()
        self.send_response(kod)
        self.send_header("Content-Type", tur); self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(son - bas + 1))
        if kod == 206: self.send_header("Content-Range", "bytes %d-%d/%d" % (bas, son, boy))
        self.send_header("Cache-Control", "max-age=86400" if onbellek else "no-store")
        self.end_headers()
        with open(yol, "rb") as f:
            f.seek(bas); kalan = son - bas + 1
            try:
                while kalan > 0:
                    parca = f.read(min(1 << 16, kalan))
                    if not parca: break
                    self.wfile.write(parca); kalan -= len(parca)
            except (ConnectionError, OSError): pass  # tarayıcı sarınca eski isteği keser

    def do_OPTIONS(self): self._yaz(204, {})

    def do_GET(self):
        yol = urllib.parse.urlparse(self.path)
        p = urllib.parse.unquote(yol.path)
        if p in ("/panel", "/panel.html"): return self._dosya(PANEL, "text/html", False)
        if p == "/panel.json": return self._yaz(200, panel_verisi())
        if p == "/durum": return self._yaz(200, {"ok": True, "busy": BUSY["v"], "queue": len(BEKLEYEN), "loaded": MD["whisper"] is not None})
        if p.startswith("/media/"):
            f = medya_yolu(p[7:])
            return self._dosya(f) if f else self._yaz(404, {"error": "yok"})
        if p == "/api/thumb":
            u = urllib.parse.parse_qs(yol.query).get("u", [""])[0]
            if not re.match(r"https://(i\d?\.ytimg\.com|yt\d\.ggpht\.com|lh\d\.googleusercontent\.com)/", u): return self._yaz(400, {"error": "izin yok"})
            try:
                b = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=8).read()
            except Exception: return self._yaz(502, {"error": "alınamadı"})
            self.send_response(200); self.send_header("Content-Type", "image/jpeg"); self.send_header("Content-Length", str(len(b)))
            self.send_header("Cache-Control", "max-age=86400"); self.end_headers(); return self.wfile.write(b)
        # statik: önce web/ (oynatıcı), yoksa wallpaper/ (ortak motor dosyaları)
        ad = "index.html" if p in ("", "/") else p.lstrip("/")
        if ".." in ad.replace("\\", "/").split("/"): return self._yaz(403, {"error": "yasak"})
        for kok in (WEB, DUVAR):
            f = os.path.join(kok, ad)
            if os.path.isfile(f): return self._dosya(f, onbellek=False)
        self._yaz(404, {"error": "yok"})

    def _govde(self, sinir=200 * 2**20):
        n = int(self.headers.get("Content-Length") or 0)
        if n > sinir: raise ValueError("çok büyük")
        return self.rfile.read(n)

    def do_POST(self):
        p = urllib.parse.urlparse(self.path).path
        if p == "/api/youtube":
            try: q = json.loads(self._govde(1 << 16).decode("utf-8")).get("q", "")
            except Exception: return self._yaz(400, {"error": "geçersiz istek"})
            if not q.strip(): return self._yaz(400, {"error": "boş"})
            try: return self._yaz(200, youtube_al(q))
            except Exception as e:
                log("YouTube hatası:", q, repr(e)[:200]); return self._yaz(502, {"error": "YouTube'dan alınamadı: " + str(e)[:160]})
        if p == "/api/upload":
            try: veri = self._govde()
            except Exception: return self._yaz(413, {"error": "dosya çok büyük (en çok 200 MB)"})
            ad = urllib.parse.unquote(self.headers.get("X-Filename") or "dosya.mp3")
            try: return self._yaz(200, dosya_al(ad, veri))
            except Exception as e:
                log("yükleme hatası:", ad, repr(e)[:200]); return self._yaz(500, {"error": "dosya okunamadı"})
        if p != "/senkron": return self._yaz(404, {"error": "yok"})
        try:
            d = json.loads(self._govde(4 << 20).decode("utf-8"))
            # lines boşsa (null) şarkının sözü yok demektir: sunucu sözleri sesten çıkarır
            assert d.get("lines") is None or (isinstance(d["lines"], list) and d["lines"])
            assert d.get("title")
        except Exception: return self._yaz(400, {"state": "failed", "reason": "geçersiz istek"})
        k = anahtar(d); f = os.path.join(ONBELLEK, k + ".json")
        if os.path.exists(f):
            with open(f, encoding="utf-8") as h: return self._yaz(200, json.load(h))
        if kuyruga(k, d): log("kuyrukta", d.get("artist"), "-", d.get("title"))
        self._yaz(200, {"state": "working"})

    def log_message(self, *a): pass


if __name__ == "__main__":
    # Windows'ta SO_REUSEADDR aynı portu iki kopyanın paylaşmasına izin verir (istekler rastgele dağılır):
    # özel bağlanma ile ikinci kopya açılamaz ve hemen çıkar
    class Sunucu(ThreadingHTTPServer):
        allow_reuse_address = False
        daemon_threads = True
        def server_bind(self):
            import socket
            if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            super().server_bind()
    try:
        srv = Sunucu(("127.0.0.1", PORT), H)
    except OSError as e:
        log("port dolu, sunucu zaten çalışıyor:", e); print("Sunucu zaten çalışıyor: http://127.0.0.1:%d/" % PORT); sys.exit(0)
    try:  # panel açılınca önceki oturumun son satırları da görünsün
        with open(KAYIT, encoding="utf-8") as f: SON_KAYIT.extend(l.rstrip("\n") for l in f.readlines()[-30:])
    except Exception: pass
    threading.Thread(target=isci, daemon=True).start()
    log("sunucu açıldı :%d" % PORT)
    print("Kinetic Lyrics: http://127.0.0.1:%d/   (izleme paneli: /panel)" % PORT)
    srv.serve_forever()
