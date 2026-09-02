@echo off
title kill-Mirror-v3
REM Mata TUDO da bola v3: spike serve.py (:8099) + audio-sidecar (:3739), por PORTA (nunca por nome de imagem).
REM Para voltar a arrancar: Mirror-V3-Start.bat
powershell -NoProfile -Command "foreach ($p in 8099,3739) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Write-Host ('porta ' + $p + ': a terminar PID ' + $_); Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }"
echo Mirror v3 parado (serve.py :8099 + sidecar :3739). Fecha a janela da bola no browser.
ping -n 3 127.0.0.1 >nul
