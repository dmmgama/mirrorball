@echo off
title fase S2-estrelato
REM Fase S2-estrelato: arranca a bola v3 em modo musica e mostra o checklist desta fase.
call "%~dp0..\..\Mirror-V3-Start.bat" 
echo.
echo ================= FASE S2-estrelato — o que verificar =================
type "%~dp0README.md"
echo.
pause
