@echo off
title MirrorBall v2 server
cd /d "%~dp0web"
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
echo MirrorBall a correr em http://localhost:8080  (para fechar: MirrorBall Stop)
start "" http://localhost:8080/index-v2.html
python -m http.server 8080
