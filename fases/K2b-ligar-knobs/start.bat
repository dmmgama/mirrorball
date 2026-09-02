@echo off
title fase K2b-ligar-knobs
REM Fase K2b: arranca a bola v3 em musica e mostra o checklist (tudo no tuner k).
call "%~dp0..\..\Mirror-V3-Start.bat"
echo.
echo ================= FASE K2b — o que verificar =================
type "%~dp0README.md"
echo.
pause
