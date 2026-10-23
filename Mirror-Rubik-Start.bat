@echo off
title start-Mirror-Rubik
REM Bola v3 — branch skin-rubik (worktree à parte): arranca audio-sidecar (:3739, partilhado com a V3)
REM + serve.py desta pasta em :8098 (a V3 continua em :8099) e abre o browser.
REM   Mirror-Rubik-Start.bat          -> modo MUSICA
REM   Mirror-Rubik-Start.bat manual   -> modo manual, sem motor
REM Atalho no Desktop: start-Mirror-Rubik.
set SPIKE=%~dp0spike-babylon
set SIDECAR=C:\Users\JSJ\David\AI\A-Os\AOS-ProfitRoom\agent-os\audio-sidecar

netstat -ano | findstr /i "LISTENING" | findstr /r /c:":3739[^0-9]" >nul 2>&1
if errorlevel 1 (
  echo   [+] audio-sidecar ^(:3739^)...
  start "Audio sidecar" /min cmd /c "cd /d "%SIDECAR%" && node server.js"
) else (
  echo   [=] audio-sidecar ja a correr
)

netstat -ano | findstr /i "LISTENING" | findstr /r /c:":8098[^0-9]" >nul 2>&1
if errorlevel 1 (
  echo   [+] Rubik serve.py ^(:8098^)...
  start "MirrorBall Rubik serve.py" /min cmd /c "cd /d "%SPIKE%" && python serve.py 8098"
  ping -n 3 127.0.0.1 >nul
) else (
  echo   [=] serve.py Rubik ja a correr
)

if /i "%~1"=="manual" (
  start "" "http://127.0.0.1:8098/v2/index.html"
) else (
  start "" "http://127.0.0.1:8098/app/spike/v2/index.html?src=music"
)
echo Bola Rubik aberta (:8098). Teclas: h HUD, k tuner do motor, d painel, w skin.
ping -n 3 127.0.0.1 >nul
