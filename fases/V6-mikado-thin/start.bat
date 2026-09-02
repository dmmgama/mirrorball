@echo off
title fase V6-mikado-thin
REM Fase V6-mikado-thin: arranca a bola v3 em modo musica e mostra o checklist desta fase.
call "%~dp0..\..\Mirror-V3-Start.bat" 
echo.
echo ================= FASE V6-mikado-thin — o que verificar =================
type "%~dp0README.md"
echo.
pause
