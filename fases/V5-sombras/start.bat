@echo off
title fase V5-sombras
REM Fase V5-sombras: arranca a bola v3 em modo musica e mostra o checklist desta fase.
call "%~dp0..\..\Mirror-V3-Start.bat" 
echo.
echo ================= FASE V5-sombras — o que verificar =================
type "%~dp0README.md"
echo.
pause
