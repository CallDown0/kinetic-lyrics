# Kinetic Lyrics

Şarkı sözlerini **kinetik tipografiyle** oynatır: her kelime şarkıcı söylediği anda, müziğin ritmine göre hareket eden kamera,
3D yazılar ve sahne efektleriyle ekrana gelir. Tarayıcıda çalışır; Wallpaper Engine gerekmez (isteyen duvar kâğıdı olarak da kullanabilir).

- **YouTube bağlantısı, şarkı adı ya da kendi ses dosyan** (sürükle-bırak) ile çalar.
- **Sözler** [LRCLIB](https://lrclib.net)'ten gelir.
- **Kelime kelime senkron:** vokal müzikten ayrılır ([Demucs](https://github.com/facebookresearch/demucs)),
  [WhisperX](https://github.com/m-bain/whisperX) her kelimenin söylendiği anı bulur. Zamanlı sözü olmayan şarkılar da senkronlanır.
- **Sözü hiç olmayan şarkılarda** sözler sesten çıkarılır (Whisper'ın duyduğu metin).
- Sonuçlar diske kaydedilir: bir şarkı ikinci kez çalınınca senkron anında gelir.
- İzleme paneli: işlenen şarkı, aşamalar, ekran kartı belleği, son sonuçlar (`/panel`).

[English summary below](#english)

## Gereksinimler

- Windows 10/11, **NVIDIA ekran kartı** (en az 6 GB bellek önerilir; RTX 50 serisi dahil, CUDA 12.8)
- ~10 GB boş disk (Python ortamı ~6 GB + modeller ~4 GB)
- İnternet (ilk kurulum, model indirme, YouTube, LRCLIB)
- İsteğe bağlı ama önerilir: [deno](https://deno.com) — yt-dlp YouTube imzalarını çözmek için kullanır: `winget install DenoLand.Deno`

## Kurulum

```powershell
git clone https://github.com/CallDown0/kinetic-lyrics.git
cd kinetic-lyrics
powershell -ExecutionPolicy Bypass -File install.ps1
```

`install.ps1` bu klasörde bir Python ortamı (`.venv`) kurar: PyTorch (CUDA 12.8), WhisperX, Demucs, yt-dlp.
Sisteme başka bir şey kurmaz ([uv](https://docs.astral.sh/uv/) yoksa onu kurar). Modeller ilk şarkıda kendiliğinden iner.

## Kullanım

`start.bat`'a çift tıkla. Tarayıcıda `http://127.0.0.1:8778/` açılır.

| | |
|---|---|
| Şarkı çal | Üstteki kutuya YouTube bağlantısı ya da şarkı adı yaz → **Çal** |
| Kendi dosyan | **Dosya…** ya da dosyayı pencereye sürükle (mp3, m4a, flac, wav, ogg…) |
| Oynat / duraklat | `Boşluk` |
| 5 sn ileri / geri | `→` / `←` |
| Tam ekran | `F` |
| Ayarlar | ⚙ — tema, animasyon türü, arka plan, efektler… (tarayıcıda saklanır) |
| İzleme paneli | ◎ ya da `http://127.0.0.1:8778/panel` |

Fare durunca arayüz gizlenir. Bağlantıyla doğrudan açmak da olur: `http://127.0.0.1:8778/?q=şarkı adı`

**Ne kadar sürer?** Yeni bir şarkı için kelime senkronu ~10–15 sn (ilk şarkıda modeller yüklenirken +15–25 sn).
Sözler bu sırada satır satır görünür, kelime zamanları gelince kendiliğinden geçer. Şarkı değişirse yarım iş bırakılır.
Modeller 10 dk boşta kalınca ekran belleğinden atılır (oyunlara yer kalsın).

## Wallpaper Engine (isteğe bağlı)

`wallpaper/` klasörü aynı motorun duvar kâğıdı sürümüdür. Çalan şarkıyı Windows medya oturumundan alır (Spotify, tarayıcıda YouTube…).

1. Wallpaper Engine → **Duvar kâğıdı düzenleyicisi** → *Aç* → `wallpaper/index.html` (ya da klasörü `projects/myprojects/` altına kopyala).
2. Kelime senkronu için sunucu açık olmalı: `start.bat` (tarayıcı sekmesini kapatabilirsin) ya da pencere açmadan:
   `.venv\Scripts\pythonw.exe server\kinetic_server.py`
   Sunucu kapalıyken duvar kâğıdı satır zamanlı sözlerle çalışmaya devam eder.

## Proje yapısı

```
engine/src/      motorun kaynağı (Canvas 2D + three.js); `node engine/build.js` → wallpaper/kinetik.js
wallpaper/       Wallpaper Engine sürümü + ortak motor dosyaları (kinetik.js, three.bundle.js, gsap, fontlar)
web/             tarayıcı oynatıcısı: Wallpaper Engine API'lerini taklit eden player.js + arayüz
server/          kinetic_server.py: oynatıcıyı sunar, YouTube/dosya, kelime senkronu, izleme paneli
tools/           three.bundle.js ve fonts.js'i yeniden üretmek için (npm run paket / npm run fontlar)
data/            (oluşur) indirilen sesler, senkron sonuçları, sunucu kaydı
```

Ayarlar (ortam değişkeni): `KINETIC_PORT` (8778), `KINETIC_DATA` (veri klasörü), `KINETIC_WHISPER_DIR` (Whisper model klasörü).

## Bilinen sınırlar

- Yalnızca NVIDIA (CUDA) ekran kartıyla denendi. Ekran kartı yoksa kelime senkronu çalışmaz; sözler satır satır gösterilir.
- Whisper şarkıda konuşmadan zayıftır: yoğun düzenleme, efektli vokal ya da çok dilli şarkılarda bazı kelimeler kayabilir.
  Eşleşme %35'in altındaysa senkron uygulanmaz.
- YouTube indirmeleri yt-dlp'ye bağlıdır; YouTube değişince `.venv\Scripts\python.exe -m pip install -U yt-dlp` gerekebilir.
- İndirdiğin içeriğin kullanımından sen sorumlusun; araç kişisel kullanım için tasarlandı.

---

## English

**Kinetic Lyrics** plays song lyrics as kinetic typography in the browser — each word appears the moment it is sung,
with a beat-reactive camera, 3D text and scene effects. Play a **YouTube link, a song name or your own audio file**.
Lyrics come from LRCLIB; vocals are separated with Demucs and **WhisperX aligns every word** to the audio, so even songs
without time-synced lyrics get word-level sync, and songs with no lyrics at all get lyrics transcribed from the vocals.
Results are cached on disk. A monitoring panel lives at `/panel`. A Wallpaper Engine version of the same engine is in `wallpaper/`.

**Requirements:** Windows 10/11, NVIDIA GPU (6 GB+ VRAM recommended, CUDA 12.8), ~10 GB disk. Optional: `winget install DenoLand.Deno`.

**Install:** `powershell -ExecutionPolicy Bypass -File install.ps1` — creates a local `.venv` (PyTorch cu128, WhisperX, Demucs, yt-dlp).
**Run:** `start.bat`, then open `http://127.0.0.1:8778/`. Space = play/pause, ←/→ = seek, F = fullscreen, ⚙ = settings.
The UI is in Turkish.

License: MIT (bundled third-party files keep their own licenses, see `LICENSE`).
