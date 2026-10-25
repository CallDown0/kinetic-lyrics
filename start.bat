@echo off
rem Kinetic Lyrics: sunucuyu başlatır ve oynatıcıyı tarayıcıda açar. Kapatmak için bu pencereyi kapat.
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Once kurulum gerekli: install.ps1 dosyasina sag tiklayip "PowerShell ile calistir" de.
  pause
  exit /b 1
)
set PORT=8778
if not "%KINETIC_PORT%"=="" set PORT=%KINETIC_PORT%
start "" /b cmd /c "timeout /t 2 >nul & start http://127.0.0.1:%PORT%/"
".venv\Scripts\python.exe" server\kinetic_server.py
pause
