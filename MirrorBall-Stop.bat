@echo off
title MirrorBall stop
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Write-Host ('A terminar MirrorBall (PID ' + $_ + ')'); Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
echo MirrorBall parado.
ping -n 3 127.0.0.1 >nul
