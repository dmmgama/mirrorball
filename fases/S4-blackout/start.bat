@echo off
title fase S4-blackout
REM Fase S4-blackout: arranca a bola v3 em modo musica e mostra o checklist desta fase.
call "%~dp0..\..\Mirror-V3-Start.bat"
echo.
echo ================= FASE S4-blackout — o que verificar =================
type "%~dp0README.md"
echo.
pause
