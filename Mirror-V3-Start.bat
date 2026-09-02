@echo off
title start-Mirror-v3
REM Bola v3 (spike Babylon): arranca audio-sidecar (:3739) + serve.py (:8099) se nao estiverem a correr e abre o browser.
REM   Mirror-V3-Start.bat          -> modo MUSICA  (o normal)
REM   Mirror-V3-Start.bat manual   -> modo manual, sem motor
REM Parar tudo: Mirror-V3-Kill.bat. Atalhos no Desktop: start-Mirror-v3 / kill-Mirror-v3.
set SPIKE=%~dp0spike-babylon
set SIDECAR=C:\Users\JSJ\David\AI\A-Os\AOS-ProfitRoom\agent-os\audio-sidecar

netstat -ano | findstr /i "LISTENING" | findstr /r /c:":3739[^0-9]" >nul 2>&1
if errorlevel 1 (
  echo   [+] audio-sidecar ^(:3739^)...
  start "Audio sidecar" /min cmd /c "cd /d "%SIDECAR%" && node server.js"
) else (
  echo   [=] audio-sidecar ja a correr
)

netstat -ano | findstr /i "LISTENING" | findstr /r /c:":8099[^0-9]" >nul 2>&1
if errorlevel 1 (
  echo   [+] spike serve.py ^(:8099^)...
  start "MirrorBall spike serve.py" /min cmd /c "cd /d "%SPIKE%" && python serve.py 8099"
  ping -n 3 127.0.0.1 >nul
) else (
  echo   [=] serve.py ja a correr
)

if /i "%~1"=="manual" (
  start "" "http://127.0.0.1:8099/v2/index.html"
) else (
  start "" "http://127.0.0.1:8099/app/spike/v2/index.html?src=music"
)
echo Bola v3 aberta. Teclas: h HUD, k tuner do motor, d painel, w skin. Manual: spike-babylon/v2/MANUAL.html
ping -n 3 127.0.0.1 >nul
