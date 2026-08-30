@echo off
title MirrorBall Spike v2 (Babylon)
REM Arranca o spike v2 Babylon: serve.py (:8099) + audio-sidecar (:3739) se nao estiverem a correr, e abre a bola.
REM   MirrorBall-Spike-Start.bat          -> modo manual   http://127.0.0.1:8099/v2/index.html
REM   MirrorBall-Spike-Start.bat music    -> modo musica   http://127.0.0.1:8099/app/spike/v2/index.html?src=music
REM Atalho no Desktop com tecla Ctrl+Alt+B (criado por make-shortcut). Parar: MirrorBall-Spike-Stop.bat
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

if /i "%~1"=="music" (
  start "" "http://127.0.0.1:8099/app/spike/v2/index.html?src=music"
) else (
  start "" "http://127.0.0.1:8099/v2/index.html"
)
echo Spike aberto. Teclas: d painel, w skin, x explosao, m HUD motor ^(so em modo music^). Manual: v2/MANUAL.html
ping -n 3 127.0.0.1 >nul
