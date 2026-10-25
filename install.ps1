# Kinetic Lyrics kurulumu (Windows, NVIDIA ekran kartı)
# Python ortamını bu klasörde (.venv) kurar: PyTorch (CUDA 12.8), WhisperX, Demucs, yt-dlp.
# Kullanım: PowerShell'de  powershell -ExecutionPolicy Bypass -File install.ps1
# Modeller (Whisper large-v3 ~3 GB, hizalama ve vokal ayırma modelleri) ilk şarkıda kendiliğinden iner.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

function Need($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# 1) uv (hızlı Python paket yöneticisi): yoksa resmi kurulum betiğiyle
if (-not (Need 'uv')) {
    Write-Host 'uv bulunamadi, kuruluyor (https://astral.sh/uv)...'
    powershell -ExecutionPolicy Bypass -NoProfile -Command "irm https://astral.sh/uv/install.ps1 | iex"
    $env:PATH = "$env:USERPROFILE\.local\bin;$env:PATH"
    if (-not (Need 'uv')) { throw 'uv kurulamadi. https://docs.astral.sh/uv/ adresinden elle kurup tekrar deneyin.' }
}

# 2) Python 3.11 ortamı
if (-not (Test-Path "$root\.venv\Scripts\python.exe")) { uv venv "$root\.venv" --python 3.11 }
$py = "$root\.venv\Scripts\python.exe"

# 3) PyTorch (CUDA 12.8: RTX 50 serisi dahil)
uv pip install --python $py torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128

# 4) Ses tanıma, hizalama, vokal ayırma, YouTube
uv pip install --python $py -r "$root\server\requirements.txt"

# 5) WhisperX'in kullandığı CTranslate2 4.4 cuDNN 8 ister; PyTorch cuDNN 9 getirir.
#    cuDNN 8 ayrı klasöre kurulur, sunucu açılırken DLL yoluna eklenir (PyTorch'unkine dokunmaz).
$compat = "$root\.venv\Lib\site-packages\cudnn8_compat"
if (-not (Test-Path "$compat\nvidia\cudnn\bin\cudnn_ops_infer64_8.dll")) {
    uv pip install --python $py --target $compat nvidia-cudnn-cu12==8.9.7.29 --no-deps
}

# 6) yt-dlp YouTube'un şifreli imzalarını çözmek için bir JavaScript çalışma ortamı ister
if (-not (Need 'deno')) {
    Write-Host ''
    Write-Host 'Uyari: deno bulunamadi. YouTube indirmeleri icin onerilir:  winget install DenoLand.Deno' -ForegroundColor Yellow
}

& $py -c "import torch; print('CUDA:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
Write-Host ''
Write-Host 'Kurulum tamam. Baslatmak icin: start.bat' -ForegroundColor Green
