@echo off
title start-Mirror-2D
REM Bola 2D (Canvas, web/index-v2.html) em modo musica: arranca o audio-sidecar (:3739) se nao estiver a correr
REM e abre a bola servida pelo proprio sidecar. Parar: Mirror-V3-Kill.bat (mata :3739 tambem).
set SIDECAR=C:\Users\JSJ\David\AI\A-Os\AOS-ProfitRoom\agent-os\audio-sidecar
netstat -ano | findstr /i "LISTENING" | findstr /r /c:":3739[^0-9]" >nul 2>&1
if errorlevel 1 (
  echo   [+] audio-sidecar ^(:3739^)...
  start "Audio sidecar" /min cmd /c "cd /d "%SIDECAR%" && node server.js"
  ping -n 4 127.0.0.1 >nul
) else (
  echo   [=] audio-sidecar ja a correr
)
start "" "http://127.0.0.1:3739/app/index-v2.html?src=music"
echo Bola 2D aberta. Teclas: m HUD do motor, p perfil, w skin, d sliders.
ping -n 3 127.0.0.1 >nul
