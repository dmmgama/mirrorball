@echo off
title start-Mirror-Rubik
REM Bola 2D (Canvas, web/index-v2.html) da branch skin-rubik, em modo MUSICA.
REM Arranca o audio-sidecar (:3739, partilhado) e o serve.py DESTA pasta em :8099 -- a unica porta
REM (alem da 3739) que o sidecar deixa ligar ao audio. Se ja houver algo em :8099 (p.ex. a V3) e'
REM parado primeiro: a Rubik e a V3 nao correm ao mesmo tempo (decisao David 2026-10-23).
REM Atalho no Desktop: start-Mirror-Rubik. Parar: Mirror-V3-Kill.bat (mata :3739 e :8099).
set SPIKE=%~dp0spike-babylon
set SIDECAR=C:\Users\JSJ\David\AI\A-Os\AOS-ProfitRoom\agent-os\audio-sidecar

netstat -ano | findstr /i "LISTENING" | findstr /r /c:":3739[^0-9]" >nul 2>&1
if errorlevel 1 (
  echo   [+] audio-sidecar ^(:3739^)...
  start "Audio sidecar" /min cmd /c "cd /d "%SIDECAR%" && node server.js"
  ping -n 4 127.0.0.1 >nul
) else (
  echo   [=] audio-sidecar ja a correr
)

for /f "tokens=5" %%p in ('netstat -ano ^| findstr /i "LISTENING" ^| findstr /r /c:"127.0.0.1:8099[^0-9]"') do (
  echo   [-] a parar o que estava em :8099 ^(pid %%p^)...
  taskkill /F /PID %%p >nul 2>&1
)
echo   [+] Rubik serve.py ^(:8099^)...
start "MirrorBall Rubik serve.py" /min cmd /c "cd /d "%SPIKE%" && python serve.py 8099"
ping -n 3 127.0.0.1 >nul

start "" "http://127.0.0.1:8099/app/index-v2.html?src=music"
echo Bola 2D Rubik aberta (:8099). Teclas: m HUD do motor, p perfil, w skin, d sliders.
ping -n 3 127.0.0.1 >nul
