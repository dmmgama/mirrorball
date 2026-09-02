@echo off
title fase V0b-perf-musica
REM Fase V0b-perf-musica: arranca a bola v3 em modo musica e mostra o checklist desta fase.
call "%~dp0..\..\Mirror-V3-Start.bat" 
echo.
echo ================= FASE V0b-perf-musica — o que verificar =================
type "%~dp0README.md"
echo.
pause
