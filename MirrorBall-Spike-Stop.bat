@echo off
title MirrorBall Spike v2 - stop
REM Para so o serve.py do spike (:8099). O audio-sidecar (:3739) fica (o OS tambem o usa) - usar Mirrors-of-Emotions-Kill.bat.
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8099 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Write-Host ('A terminar serve.py (PID ' + $_ + ')'); Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
echo serve.py parado. Fecha a janela da bola no browser.
ping -n 3 127.0.0.1 >nul
