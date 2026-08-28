@echo off
title Mirrors of Emotions - kill
REM Mata o audio-sidecar (:3739). Nota: o OS (tab /mirrors-emotions e bola M) tambem o usa;
REM se o OS estiver a correr, volta a arranca-lo com Mirrors-of-Emotions-Start ou start-agentic-os.
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3739 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Write-Host ('A terminar audio-sidecar (PID ' + $_ + ')'); Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
echo audio-sidecar parado. Fecha a janela da bola no browser.
ping -n 3 127.0.0.1 >nul
